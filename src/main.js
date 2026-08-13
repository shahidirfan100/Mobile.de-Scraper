import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Impit } from 'impit';

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0';
const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1';
const FAIL_ON_EMPTY_RESULTS_INTERNAL = false;
const START_URL_ALLOWED_HOST_SUFFIX = 'mobile.de';
const MAX_RESULTS_WANTED = 2000;
const MAX_PAGES = 50;
const DEFAULT_MAX_PAGES = 50;
const RESIDENTIAL_PROXY_GROUP = 'RESIDENTIAL';
const RESIDENTIAL_PROXY_COUNTRY = 'DE';

const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

const clampInt = (value, minValue, maxValue) => Math.min(Math.max(value, minValue), maxValue);

const isAllowedStartUrlHost = (hostname) => {
    if (typeof hostname !== 'string' || !hostname.trim()) return false;
    const normalized = hostname.trim().toLowerCase();
    return normalized === START_URL_ALLOWED_HOST_SUFFIX || normalized.endsWith(`.${START_URL_ALLOWED_HOST_SUFFIX}`);
};

const makeSoftWarningPayload = ({ warning, warnings = [], startUrl, resultsWanted, maxPages }) => ({
    warning,
    hints: [
        'Try enabling Apify Proxy with residential groups.',
        'Try a broader startUrl.',
        'Retry later in case of temporary anti-bot challenge.',
    ],
    warnings: warnings.slice(-10),
    inputSummary: {
        hasStartUrl: Boolean(startUrl),
        resultsWanted,
        maxPages,
    },
    generatedAt: new Date().toISOString(),
});

const persistSoftWarning = async (payload) => {
    try {
        await Actor.setValue('SOFT_WARNING', payload);
    } catch (error) {
        log.warning(`Failed to persist SOFT_WARNING: ${error.message}`);
    }
};

const tryDecodeUrlText = (value) => {
    if (typeof value !== 'string') return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const parseInputUrlLoosely = (rawUrl) => {
    if (typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    const variants = [trimmed, tryDecodeUrlText(trimmed)];
    const seen = new Set();

    for (const variant of variants) {
        if (typeof variant !== 'string') continue;
        const candidate = variant.trim();
        if (!candidate) continue;

        const prefixed = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate)
            ? [candidate]
            : [`https://${candidate.replace(/^\/+/, '')}`, `https:${candidate}`];

        for (const attempt of prefixed) {
            if (!attempt || seen.has(attempt)) continue;
            seen.add(attempt);
            try {
                return new URL(attempt);
            } catch {
                // continue trying other variants
            }
        }
    }

    return null;
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

const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const calculateBackoffMs = (attempt, statusCode) => {
    if (statusCode === 429) return Math.min(3000 * attempt, 30000);
    if (statusCode === 403 || (statusCode >= 500 && statusCode < 600)) return Math.min(2000 * attempt, 15000);
    return 250 * attempt + Math.floor(Math.random() * 300);
};

const maybeNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
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

const getItemTitle = (item) => {
    if (typeof item?.title === 'string' && item.title.trim()) return item.title.trim();
    const titleParts = [item?.shortTitle, item?.subTitle]
        .filter((part) => typeof part === 'string' && part.trim())
        .map((part) => part.trim());
    return titleParts.length ? titleParts.join(' ') : undefined;
};

const isRealListingItem = (item) => {
    return Boolean(
        item
        && typeof item === 'object'
        && maybeInteger(item.id) !== undefined
        && getItemTitle(item),
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
    const queue = Array.isArray(nodes) ? [...nodes] : [nodes];
    const visited = new WeakSet();

    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object' || visited.has(node)) continue;
        visited.add(node);

        if (isRealListingItem(node)) {
            out.push(node);
            continue;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                if (child && typeof child === 'object') queue.push(child);
            }
            continue;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') queue.push(value);
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
    const markerMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*/i);
    if (!markerMatch) return null;

    let jsonStart = markerMatch.index + markerMatch[0].length;
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

const parseJsonSafely = (raw) => {
    if (typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const extractBalancedJson = (source, startIndex) => {
    if (typeof source !== 'string') return null;
    const opening = source[startIndex];
    let closing = null;
    if (opening === '{') closing = '}';
    else if (opening === '[') closing = ']';
    if (!closing) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < source.length; i++) {
        const char = source[i];

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
        if (char === opening) depth++;
        if (char === closing) {
            depth--;
            if (depth === 0) return source.slice(startIndex, i + 1);
        }
    }

    return null;
};

const isSearchResultsObject = (value) => {
    if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return false;
    if (value.items.length === 0) return true;

    return value.items.some((item) => isRealListingItem(item)
        || (item && typeof item === 'object' && Array.isArray(item.items)));
};

const findSearchResultsInNode = (root) => {
    if (!root || typeof root !== 'object') return null;

    const queue = [root];
    const visited = new WeakSet();

    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object' || visited.has(node)) continue;
        visited.add(node);

        if (isSearchResultsObject(node)) return node;

        const nestedSearchResults = node?.search?.srp?.data?.searchResults;
        if (isSearchResultsObject(nestedSearchResults)) return nestedSearchResults;

        if (isSearchResultsObject(node.searchResults)) return node.searchResults;

        if (Array.isArray(node)) {
            for (const child of node) {
                if (child && typeof child === 'object') queue.push(child);
            }
            continue;
        }

        for (const child of Object.values(node)) {
            if (child && typeof child === 'object') queue.push(child);
        }
    }

    return null;
};

const extractSearchResultsFromStructuredPage = (body) => {
    if (typeof body !== 'string' || !body.trim() || !body.includes('searchResults')) return null;

    const initialState = extractInitialState(body);
    const initialStateSearchResults = findSearchResultsInNode(initialState);
    if (initialStateSearchResults) return initialStateSearchResults;

    const nextDataMatch = body.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    const nextData = parseJsonSafely(nextDataMatch?.[1]?.trim());
    const nextDataSearchResults = findSearchResultsInNode(nextData);
    if (nextDataSearchResults) return nextDataSearchResults;

    const markerRegex = /["']searchResults["']\s*:\s*/g;
    while (true) {
        const markerMatch = markerRegex.exec(body);
        if (markerMatch === null) break;

        let cursor = markerMatch.index + markerMatch[0].length;
        while (cursor < body.length && /\s/.test(body[cursor])) cursor++;
        if (body[cursor] !== '{') continue;

        const jsonFragment = extractBalancedJson(body, cursor);
        const candidate = parseJsonSafely(jsonFragment);
        if (isSearchResultsObject(candidate)) return candidate;

        const nestedSearchResults = findSearchResultsInNode(candidate);
        if (nestedSearchResults) return nestedSearchResults;
    }

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    while (true) {
        const scriptMatch = scriptRegex.exec(body);
        if (scriptMatch === null) break;

        const scriptContent = scriptMatch[1]?.trim();
        if (!scriptContent) continue;

        if (scriptContent.startsWith('{') || scriptContent.startsWith('[')) {
            const parsedScript = parseJsonSafely(scriptContent);
            const parsedScriptSearchResults = findSearchResultsInNode(parsedScript);
            if (parsedScriptSearchResults) return parsedScriptSearchResults;
            continue;
        }

        const markers = ['window.__init_state__', 'window.__preloaded_state__', 'window.__next_data__'];
        const lowerScript = scriptContent.toLowerCase();
        for (const marker of markers) {
            const markerIndex = lowerScript.indexOf(marker);
            if (markerIndex < 0) continue;

            const equalsIndex = scriptContent.indexOf('=', markerIndex);
            if (equalsIndex < 0) continue;

            let valueStart = equalsIndex + 1;
            while (valueStart < scriptContent.length && /\s/.test(scriptContent[valueStart])) valueStart++;
            if (scriptContent[valueStart] !== '{' && scriptContent[valueStart] !== '[') continue;

            const jsonFragment = extractBalancedJson(scriptContent, valueStart);
            const parsedScript = parseJsonSafely(jsonFragment);
            const parsedScriptSearchResults = findSearchResultsInNode(parsedScript);
            if (parsedScriptSearchResults) return parsedScriptSearchResults;
        }
    }

    return null;
};

const isLikelyBlockedResponse = ({ body, statusCode }) => {
    const text = typeof body === 'string' ? body.toLowerCase() : '';
    if (statusCode === 403 || statusCode === 429) return true;
    if (!text) return false;
    const markers = [
        'access denied',
        'captcha',
        'verify you are human',
        'security check',
        'bot challenge',
        'too many requests',
    ];
    return markers.some((marker) => text.includes(marker));
};

const normalizeSearchUrl = (rawUrl) => {
    try {
        const url = new URL(rawUrl);
        url.protocol = 'https:';
        url.searchParams.set('isSearchRequest', 'true');
        if (!url.searchParams.has('s')) url.searchParams.set('s', 'Car');
        if (!url.searchParams.has('vc')) url.searchParams.set('vc', 'Car');
        return url.toString();
    } catch {
        return rawUrl;
    }
};

const buildBaseSearchUrlCandidates = ({ startUrl }) => {
    const parsedStartUrl = parseInputUrlLoosely(startUrl);
    if (!parsedStartUrl) throw new Error('A valid Mobile.de startUrl is required.');
    if (!isAllowedStartUrlHost(parsedStartUrl.hostname)) {
        throw new Error(`startUrl host is not allowed: ${parsedStartUrl.hostname}`);
    }

    return [{
        url: normalizeSearchUrl(parsedStartUrl.toString()),
        source: 'user-start-url',
    }];
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

const wrapSearchResultsState = (searchResults) => ({
    search: {
        srp: {
            data: {
                searchResults,
            },
        },
    },
});

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
        title: getItemTitle(item),
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

const getListingDedupeKey = ({ item, candidateIndex, pageNumber, position }) => {
    const listingId = maybeInteger(item?.id);
    if (listingId !== undefined) return `id:${listingId}`;

    const relativeUrl = typeof item?.relativeUrl === 'string' ? item.relativeUrl.trim() : '';
    if (relativeUrl) return `url:${relativeUrl}`;

    return `fallback:${candidateIndex}:${pageNumber}:${position}`;
};

const fetchSearchState = async ({
    searchUrl,
    proxyConfiguration,
    maxAttempts,
    sessionPrefix,
}) => {
    const attempts = [
        { mode: 'structured-page-mobile', url: toMobileHostUrl(searchUrl), userAgent: MOBILE_USER_AGENT },
        { mode: 'structured-page-canonical', url: searchUrl, userAgent: DESKTOP_USER_AGENT },
    ];
    let lastError;
    let lastStatusCode;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Apify Proxy session IDs allow only word characters, dots, underscores, and tildes.
        const sessionId = `${sessionPrefix}_attempt_${attempt}`.replace(/[^\w.~]/g, '_');
        const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(sessionId) : undefined;
        const impit = proxyUrl
            ? new Impit({ browser: 'chrome', http3: true, ignoreTlsErrors: true, proxyUrl })
            : new Impit({ browser: 'chrome', http3: true, ignoreTlsErrors: true });

        for (const target of attempts) {
            try {
                const response = await impit.fetch(target.url, {
                    signal: AbortSignal.timeout(45000),
                    headers: {
                        'user-agent': target.userAgent,
                        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'accept-language': 'en-US,en;q=0.9,de;q=0.8',
                        'cache-control': 'no-cache',
                        pragma: 'no-cache',
                        referer: 'https://www.mobile.de/',
                    },
                });

                const responseBody = await response.text();
                lastStatusCode = response.status;

                if (isLikelyBlockedResponse({ body: responseBody, statusCode: response.status })) {
                    const sample = responseBody.slice(0, 140).replace(/\s+/g, ' ').trim();
                    lastError = new Error(
                        `Blocked/challenge response on ${target.mode} (attempt ${attempt}/${maxAttempts}, status ${response.status}${sample ? `, sample: ${sample}` : ''}).`,
                    );
                    continue;
                }

                const searchResults = extractSearchResultsFromStructuredPage(responseBody);
                if (searchResults && Array.isArray(searchResults.items)) {
                    return {
                        state: wrapSearchResultsState(searchResults),
                        mode: `${target.mode}${proxyUrl ? '-residential' : '-direct'}`,
                    };
                }

                const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                const sample = responseBody.slice(0, 140).replace(/\s+/g, ' ').trim();
                lastError = new Error(
                    `No structured search results on ${target.mode} (attempt ${attempt}/${maxAttempts}, status ${response.status}${contentType ? `, ${contentType}` : ''}${sample ? `, sample: ${sample}` : ''}).`,
                );
            } catch (error) {
                lastError = error;
                lastStatusCode = undefined;
            }
        }

        if (attempt < maxAttempts) {
            await sleep(calculateBackoffMs(attempt, lastStatusCode));
        }
    }

    throw new Error(`Unable to fetch structured search data: ${searchUrl}. ${lastError?.message || ''}`.trim());
};

await Actor.main(async () => {
    const actorInput = await Actor.getInput();
    const actorInputObject = actorInput && typeof actorInput === 'object' ? actorInput : {};
    const actorInputKeys = Object.keys(actorInputObject);
    const fallbackInput = await loadFallbackInput();
    const input = { ...fallbackInput, ...actorInputObject };

    if (!actorInputKeys.length) {
        // INPUT.json fallback is intentional for local/dev runs.
    }
    const {
        startUrl,
        results_wanted: resultsWantedInput = 20,
        max_pages: maxPagesInput = DEFAULT_MAX_PAGES,
        proxyConfiguration: proxyConfigInput,
    } = input;

    const resultsWanted = clampInt(toPositiveInt(resultsWantedInput, 20), 1, MAX_RESULTS_WANTED);
    const configuredMaxPages = clampInt(toPositiveInt(maxPagesInput, DEFAULT_MAX_PAGES), 1, MAX_PAGES);
    const minimumPagesForTarget = Math.ceil(resultsWanted / 20);
    const maxPages = Math.min(MAX_PAGES, Math.max(configuredMaxPages, minimumPagesForTarget));
    const fetchAttempts = 4;

    if (maxPages > configuredMaxPages) {
        log.info(`Pagination cap expanded from ${configuredMaxPages} to ${maxPages} pages for results_wanted=${resultsWanted}.`);
    }
    let baseSearchCandidates;
    try {
        baseSearchCandidates = buildBaseSearchUrlCandidates({ startUrl });
    } catch (error) {
        const warningMessage = `Input normalization failed: ${error.message}`;
        log.warning(warningMessage);
        await persistSoftWarning(makeSoftWarningPayload({
            warning: warningMessage,
            startUrl,
            resultsWanted,
            maxPages,
        }));
        return;
    }

    const runWarnings = [];
    const hasCustomProxyUrls = Array.isArray(proxyConfigInput?.proxyUrls) && proxyConfigInput.proxyUrls.length > 0;
    const shouldUseResidentialProxy = Actor.isAtHome() && !hasCustomProxyUrls;
    const shouldIgnoreApifyProxyLocally = !Actor.isAtHome() && !hasCustomProxyUrls && proxyConfigInput?.useApifyProxy;
    let effectiveProxyConfig;
    if (shouldUseResidentialProxy) {
        effectiveProxyConfig = {
            ...(proxyConfigInput || {}),
            useApifyProxy: true,
            apifyProxyGroups: [RESIDENTIAL_PROXY_GROUP],
            countryCode: proxyConfigInput?.countryCode || RESIDENTIAL_PROXY_COUNTRY,
        };
    } else if (!shouldIgnoreApifyProxyLocally) {
        effectiveProxyConfig = proxyConfigInput;
    }
    let proxyConfiguration;
    if (effectiveProxyConfig) {
        try {
            proxyConfiguration = await Actor.createProxyConfiguration(effectiveProxyConfig);
        } catch (error) {
            const warning = `Proxy initialization failed: ${error.message}`;
            runWarnings.push(warning);
            log.warning(warning);
            if (shouldUseResidentialProxy) throw error;
        }
    }

    if (shouldUseResidentialProxy) {
        log.info(`Proxy mode | Apify Residential | country=${effectiveProxyConfig.countryCode}`);
    } else if (shouldIgnoreApifyProxyLocally) {
        log.info('Proxy mode | local run without Apify Proxy');
    }

    let totalSaved = 0;
    const seenIds = new Set();
    let duplicateCount = 0;
    let invalidRecordCount = 0;

    for (let candidateIndex = 0; candidateIndex < baseSearchCandidates.length; candidateIndex++) {
        if (totalSaved >= resultsWanted) break;

        const candidate = baseSearchCandidates[candidateIndex];
        let discoveredTotalPages = Number.POSITIVE_INFINITY;
        let savedByCandidate = 0;
        const candidateLabel = `${candidateIndex + 1}/${baseSearchCandidates.length}`;
        for (let pageNumber = 1; pageNumber <= maxPages && pageNumber <= discoveredTotalPages; pageNumber++) {
            if (totalSaved >= resultsWanted) break;

            const searchUrl = withPageNumber(candidate.url, pageNumber);

            let state;
            try {
                const fetched = await fetchSearchState({
                    searchUrl,
                    proxyConfiguration,
                    maxAttempts: fetchAttempts,
                    sessionPrefix: `mobilede_${candidateIndex + 1}_page_${pageNumber}`,
                });
                state = fetched.state;
                if (pageNumber === 1) log.info(`Source selected | ${fetched.mode}`);
            } catch (error) {
                const warning = `Page fetch failed for candidate ${candidateLabel} page ${pageNumber}: ${error.message}`;
                runWarnings.push(warning);
                log.warning(warning);
                if (totalSaved === 0) {
                    log.warning('Initial page could not be fetched; stopping because no valid listings are available to continue from.');
                    break;
                }
                log.info(`Continuing to the next page after exhausting retries for page ${pageNumber}.`);
                continue;
            }

            const searchResults = state?.search?.srp?.data?.searchResults || {};
            const rawItems = Array.isArray(searchResults.items) ? searchResults.items : [];
            const items = collectListingsFromNodes(rawItems);
            const {searchId} = searchResults;

            discoveredTotalPages = toPositiveInt(searchResults.numPages, discoveredTotalPages);
            if (!items.length) {
                const warning = `No listings parsed for candidate ${candidateLabel} page ${pageNumber}; switching strategy if available.`;
                runWarnings.push(warning);
                log.warning(warning);
                break;
            }

            const pageBatch = [];
            for (const item of items) {
                if (totalSaved + pageBatch.length >= resultsWanted) break;

                const dedupeKey = getListingDedupeKey({
                    item,
                    candidateIndex,
                    pageNumber,
                    position: pageBatch.length,
                });
                if (seenIds.has(dedupeKey)) {
                    duplicateCount++;
                    continue;
                }

                try {
                    const mapped = mapSearchItem({
                        item,
                        pageNumber,
                        searchId,
                    });

                    if (!isValidMappedRecord(mapped)) {
                        invalidRecordCount++;
                        log.warning(`Skipping invalid record (key: ${dedupeKey})`);
                        continue;
                    }

                    seenIds.add(dedupeKey);
                    pageBatch.push(mapped);
                } catch (error) {
                    log.warning(`Skipping item due to mapping error (key: ${dedupeKey}): ${error.message}`);
                }
            }

            if (pageBatch.length) {
                await Actor.pushData(pageBatch);
                totalSaved += pageBatch.length;
                savedByCandidate += pageBatch.length;
                log.info(`Saved ${pageBatch.length} listings from page ${pageNumber}. Total: ${totalSaved}/${resultsWanted}`);
            }

            if (searchResults.hasNextPage === false) break;
        }

        if (savedByCandidate === 0 && candidateIndex < baseSearchCandidates.length - 1) {
            log.warning(`Candidate ${candidateLabel} produced no listings. Trying the same filtered URL on the next host.`);
        }
    }

    if (!totalSaved) {
        const warningMessage = 'No listings were extracted after all auto-healing strategies. Try enabling Apify Proxy or adjust the search URL.';
        if (FAIL_ON_EMPTY_RESULTS_INTERNAL) {
            throw new Error(warningMessage);
        }
        log.warning(warningMessage);
        await persistSoftWarning(makeSoftWarningPayload({
            warning: warningMessage,
            warnings: runWarnings,
            startUrl,
            resultsWanted,
            maxPages,
        }));
        return;
    }

    if (runWarnings.length) {
        log.warning(`Completed with ${runWarnings.length} warning(s). Last warning: ${runWarnings[runWarnings.length - 1]}`);
    }

    log.info(`Quality summary | saved=${totalSaved} | duplicates_removed=${duplicateCount} | invalid_records_skipped=${invalidRecordCount}`);
});
