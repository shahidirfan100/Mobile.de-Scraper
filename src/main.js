import { Actor, log } from 'apify';
import { readFile } from 'node:fs/promises';
import { gotScraping } from 'got-scraping';

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0';
const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1';

const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

const loadFallbackInput = async () => {
    try {
        const raw = await readFile(new URL('../INPUT.json', import.meta.url), 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const maybeNumber = (value) => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    if (!normalized) return undefined;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : undefined;
};

const maybeInteger = (value) => {
    const n = Number(value);
    return Number.isInteger(n) ? n : undefined;
};

const isRealListingItem = (item) => {
    return Boolean(
        item
        && typeof item === 'object'
        && maybeInteger(item.id) !== undefined
        && typeof item.title === 'string'
        && item.title.trim(),
    );
};

const parsePower = (value) => {
    if (typeof value !== 'string') return {};
    const kwMatch = value.match(/(\d+)\s*kW/i);
    const psMatch = value.match(/(\d+)\s*PS/i);
    return {
        power_kw: kwMatch ? Number(kwMatch[1]) : undefined,
        power_ps: psMatch ? Number(psMatch[1]) : undefined,
    };
};

const parseSrcSetUrls = (srcSet) => {
    if (typeof srcSet !== 'string' || !srcSet.trim()) return [];
    return srcSet
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean);
};

const collectImageUrls = (item) => {
    const urls = new Set();
    const addUrl = (value) => {
        if (typeof value === 'string' && value.trim()) urls.add(value.trim());
    };

    addUrl(item?.previewImage?.src);
    for (const url of parseSrcSetUrls(item?.previewImage?.srcSet)) addUrl(url);

    if (Array.isArray(item?.previewThumbnails)) {
        for (const thumb of item.previewThumbnails) {
            addUrl(thumb?.src);
            for (const url of parseSrcSetUrls(thumb?.srcSet)) addUrl(url);
        }
    }

    return [...urls];
};

const collectListingsFromNodes = (nodes, out = []) => {
    if (!Array.isArray(nodes)) return out;

    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;

        if (isRealListingItem(node)) {
            out.push(node);
            continue;
        }

        if (Array.isArray(node.items)) {
            collectListingsFromNodes(node.items, out);
        }
    }

    return out;
};

const compactValue = (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    if (Array.isArray(value)) {
        const cleaned = value
            .map((item) => compactValue(item))
            .filter((item) => item !== undefined);
        return cleaned.length ? cleaned : undefined;
    }
    if (typeof value === 'object') {
        const cleaned = {};
        for (const [key, nested] of Object.entries(value)) {
            const nestedValue = compactValue(nested);
            if (nestedValue !== undefined) cleaned[key] = nestedValue;
        }
        return Object.keys(cleaned).length ? cleaned : undefined;
    }
    return value;
};

const extractInitialState = (html) => {
    const marker = 'window.__INITIAL_STATE__ = ';
    const startIndex = html.indexOf(marker);
    if (startIndex < 0) return null;

    let jsonStart = startIndex + marker.length;
    while (jsonStart < html.length && /\s/.test(html[jsonStart])) jsonStart++;
    if (html[jsonStart] !== '{') return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = jsonStart; i < html.length; i++) {
        const char = html[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth++;
        if (char === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(jsonStart, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }

    return null;
};

const buildSearchUrlFromKeyword = ({ keyword }) => {
    const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
    if (!normalizedKeyword) {
        throw new Error('Provide either "startUrl" or "keyword".');
    }

    const url = new URL('https://suchen.mobile.de/fahrzeuge/search.html');
    url.searchParams.set('dam', 'false');
    url.searchParams.set('isSearchRequest', 'true');
    url.searchParams.set('ref', 'homeAISearch');
    url.searchParams.set('s', 'Car');
    url.searchParams.set('vc', 'Car');
    url.searchParams.set('userInput', normalizedKeyword);

    return url.toString();
};

const normalizeSearchUrl = (rawUrl) => {
    const url = new URL(rawUrl);
    url.searchParams.set('isSearchRequest', 'true');
    if (!url.searchParams.has('s')) url.searchParams.set('s', 'Car');
    if (!url.searchParams.has('vc')) url.searchParams.set('vc', 'Car');
    return url.toString();
};

const withPageNumber = (rawUrl, pageNumber) => {
    const url = new URL(rawUrl);
    url.searchParams.set('pageNumber', String(pageNumber));
    return url.toString();
};

const toMobileHostUrl = (rawUrl) => {
    const url = new URL(rawUrl);
    url.hostname = 'm.mobile.de';
    return url.toString();
};

const toListingUrl = (relativeUrl, listingId) => {
    const numericId = maybeInteger(listingId);
    if (numericId) {
        return `https://suchen.mobile.de/fahrzeuge/details.html?id=${numericId}`;
    }

    if (typeof relativeUrl === 'string' && relativeUrl.trim()) {
        try {
            return new URL(relativeUrl, 'https://suchen.mobile.de').toString();
        } catch {
            // ignored
        }
    }
    return undefined;
};

const mapSearchItem = ({ item, pageNumber, searchId }) => {
    const power = parsePower(item?.attr?.pw);
    const firstFinancePlan = Array.isArray(item?.financePlans) ? item.financePlans[0] : undefined;
    const imageUrls = collectImageUrls(item);
    const registrationYear = typeof item?.attr?.fr === 'string'
        ? maybeInteger(item.attr.fr.split('/').at(-1))
        : undefined;

    const mapped = {
        listing_id: item?.id,
        title: item?.title,
        make: item?.make,
        model: item?.model,
        category: item?.category,
        vehicle_type: item?.type,
        url: toListingUrl(item?.relativeUrl, item?.id),
        price_eur: item?.price?.grossAmount,
        price_currency: item?.price?.grossCurrency,
        first_registration: item?.attr?.fr,
        registration_year: registrationYear,
        mileage_km: maybeNumber(item?.attr?.ml),
        power_kw: power.power_kw,
        power_ps: power.power_ps,
        displacement_ccm: maybeNumber(item?.attr?.cc),
        fuel_type: item?.attr?.ft,
        transmission: item?.attr?.tr,
        body_type_code: item?.attr?.c,
        condition_label: item?.attr?.subc,
        color: item?.attr?.ecol,
        doors: item?.attr?.door,
        seats_count: maybeInteger(item?.attr?.sc),
        inspection_valid_until: item?.attr?.gi,
        euro_emission_class: item?.attr?.emc,
        co2_class: item?.attr?.co2class,
        fuel_consumption_l_100km: maybeNumber(item?.attr?.csmpt),
        co2_emission_g_km: maybeNumber(item?.attr?.emiss),
        vehicle_weight_kg: maybeNumber(item?.attr?.nw),
        city: item?.attr?.loc,
        postal_code: item?.attr?.z,
        country_code: item?.attr?.cn,
        seller_id: item?.sellerId,
        seller_name: item?.contactInfo?.name,
        seller_type: item?.contactInfo?.sellerType,
        seller_phone: item?.contactInfo?.contactPhone,
        seller_rating_score: item?.contactInfo?.rating?.score,
        seller_rating_count: item?.contactInfo?.rating?.count,
        image_url: imageUrls[0],
        image_urls: imageUrls,
        collected_images_count: imageUrls.length,
        images_count: item?.numImages,
        has_video: item?.isVideoEnabled,
        has_electric_engine: item?.hasElectricEngine,
        is_eye_catcher: item?.isEyeCatcher,
        financing_monthly_eur: firstFinancePlan?.offer?.monthlyInstallment,
        financing_term_months: firstFinancePlan?.offer?.creditTerm,
        financing_down_payment_eur: firstFinancePlan?.offer?.downPayment,
        search_id: searchId,
        page_number: pageNumber,
        fetched_at: new Date().toISOString(),
    };

    return compactValue(mapped);
};

const isValidMappedRecord = (record) => {
    return Boolean(
        record
        && maybeInteger(record.listing_id) !== undefined
        && typeof record.title === 'string'
        && record.title.trim(),
    );
};

const fetchSearchState = async ({ searchUrl, proxyConfiguration, maxAttempts }) => {
    const attempts = [
        { mode: 'desktop', url: searchUrl, userAgent: DESKTOP_USER_AGENT },
        { mode: 'mobile-fallback', url: toMobileHostUrl(searchUrl), userAgent: MOBILE_USER_AGENT },
    ];
    let lastError;

    for (const target of attempts) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
                const response = await gotScraping.get(target.url, {
                    proxyUrl,
                    timeout: { request: 45000 },
                    headers: {
                        'user-agent': target.userAgent,
                        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'accept-language': 'en-US,en;q=0.9,de;q=0.8',
                        'cache-control': 'no-cache',
                        pragma: 'no-cache',
                        referer: 'https://www.mobile.de/',
                    },
                });

                const state = extractInitialState(response.body);
                const searchResults = state?.search?.srp?.data?.searchResults;
                if (searchResults && Array.isArray(searchResults.items)) {
                    return { state, mode: target.mode };
                }
                lastError = new Error(`No parsable state on ${target.mode} response (attempt ${attempt}/${maxAttempts}).`);
            } catch (error) {
                lastError = error;
            }

            if (attempt < maxAttempts) {
                await sleep(700 + Math.floor(Math.random() * 900));
            }
        }
    }

    throw new Error(`Unable to fetch a valid search page: ${searchUrl}. ${lastError?.message || ''}`.trim());
};

await Actor.main(async () => {
    const actorInput = await Actor.getInput();
    const actorInputObject = actorInput && typeof actorInput === 'object' ? actorInput : {};
    const actorInputKeys = Object.keys(actorInputObject);
    const fallbackInput = await loadFallbackInput();
    const input = { ...fallbackInput, ...actorInputObject };

    if (!actorInputKeys.length) {
        log.info('No Actor input received, using INPUT.json fallback.');
    }
    const {
        startUrl,
        keyword,
        results_wanted = 20,
        max_pages = 3,
        proxyConfiguration: proxyConfigInput,
    } = input;

    const resultsWanted = toPositiveInt(results_wanted, 20);
    const maxPages = toPositiveInt(max_pages, 3);
    const fetchAttempts = 3;

    const baseSearchUrl = startUrl
        ? normalizeSearchUrl(startUrl)
        : buildSearchUrlFromKeyword({ keyword });

    const proxyConfiguration = proxyConfigInput
        ? await Actor.createProxyConfiguration(proxyConfigInput)
        : undefined;

    log.info(`Starting Mobile.de scrape (target ${resultsWanted} listings, max ${maxPages} pages).`);

    let totalSaved = 0;
    const seenIds = new Set();
    let discoveredTotalPages = Number.POSITIVE_INFINITY;

    for (let pageNumber = 1; pageNumber <= maxPages && pageNumber <= discoveredTotalPages; pageNumber++) {
        if (totalSaved >= resultsWanted) break;

        const searchUrl = withPageNumber(baseSearchUrl, pageNumber);
        log.info(`Fetching page ${pageNumber}: ${searchUrl}`);

        let state;
        let mode;
        try {
            const fetched = await fetchSearchState({
                searchUrl,
                proxyConfiguration,
                maxAttempts: fetchAttempts,
            });
            state = fetched.state;
            mode = fetched.mode;
        } catch (error) {
            if (totalSaved > 0) {
                log.warning(`Stopping pagination early on page ${pageNumber}: ${error.message}`);
                break;
            }
            throw error;
        }

        const searchResults = state?.search?.srp?.data?.searchResults || {};
        const rawItems = Array.isArray(searchResults.items) ? searchResults.items : [];
        const items = collectListingsFromNodes(rawItems);
        const searchId = searchResults.searchId;

        discoveredTotalPages = toPositiveInt(searchResults.numPages, discoveredTotalPages);
        log.info(`Parsed ${items.length} listings from page ${pageNumber}${mode === 'mobile-fallback' ? ' (fallback mode)' : ''}.`);

        if (!items.length) break;

        const pageBatch = [];
        for (const item of items) {
            if (totalSaved + pageBatch.length >= resultsWanted) break;

            const dedupeKey = item?.id ?? item?.relativeUrl ?? `${pageNumber}-${totalSaved + pageBatch.length}`;
            if (seenIds.has(dedupeKey)) continue;

            const mapped = mapSearchItem({
                item,
                pageNumber,
                searchId,
            });

            if (!isValidMappedRecord(mapped)) continue;

            seenIds.add(dedupeKey);
            pageBatch.push(mapped);
        }

        if (pageBatch.length) {
            await Actor.pushData(pageBatch);
            totalSaved += pageBatch.length;
            log.info(`Saved ${pageBatch.length} listings from page ${pageNumber}. Total: ${totalSaved}/${resultsWanted}`);
        }

        if (searchResults.hasNextPage === false) break;
        await sleep(600 + Math.floor(Math.random() * 900));
    }

    if (!totalSaved) {
        throw new Error('No listings were extracted. Try enabling Apify Proxy or adjust the search URL.');
    }
    log.info(`Finished. Total saved: ${totalSaved}.`);
});
