import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Impit } from 'impit';

import { getMobileDeMakeName, normalizeMakeLookupKey } from './mobile-de-makes.js';
import { getProxyGroups, hasCustomProxyUrls, isProxyRequested } from './proxy-config.js';
import {
    buildBaseSearchUrlCandidates,
    getExactSearchFilterParameters,
    SEARCH_PAGE_HOST,
    withPageNumber,
} from './search-filters.js';

const MOBILE_DE_API_HOST = 'www.mobile.de';
const MOBILE_DE_API_SEARCH_URL = `https://${MOBILE_DE_API_HOST}/consumer/api/search/srp`;
const MOBILE_DE_CLIENT_HEADER = 'de.mobile.consumer-webapp';
const IMPIT_BROWSER = 'chrome124';
const FAIL_ON_EMPTY_RESULTS_INTERNAL = false;
const MAX_RESULTS_WANTED = 2000;
const MAX_PAGES = 50;
const DEFAULT_MAX_PAGES = 50;
const RUN_TIMEOUT_BUFFER_MS = 30000;
const REQUEST_TIMEOUT_MS = 30000;

const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

const clampInt = (value, minValue, maxValue) => Math.min(Math.max(value, minValue), maxValue);

const makeSoftWarningPayload = ({ warning, warnings = [], startUrl, resultsWanted, maxPages }) => ({
    warning,
    hints: ['Try a broader startUrl.', 'Retry later in case of temporary anti-bot challenge.'],
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

const loadFallbackInput = async () => {
    try {
        const raw = await readFile(new URL('../INPUT.json', import.meta.url), 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const getRemainingRunTimeMs = () => {
    const timeoutAtMs = Actor.getEnv().timeoutAt?.getTime();
    return Number.isFinite(timeoutAtMs) ? timeoutAtMs - Date.now() : Number.POSITIVE_INFINITY;
};

const makeRunTimeoutError = () => {
    const error = new Error('Actor timeout is approaching; stop before the platform aborts the run.');
    error.code = 'ACTOR_TIMEOUT_APPROACHING';
    return error;
};

const getErrorStatusCode = (error) => {
    const match = typeof error?.message === 'string' ? error.message.match(/status (\d+)/) : null;
    return match ? Number(match[1]) : undefined;
};

const isRetryableStatus = (statusCode) => {
    if (statusCode === undefined) return true;
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
};

const calculateBackoffMs = (attempt, statusCode) => {
    if (statusCode === 429) return Math.min(3000 * attempt, 30000);
    if (statusCode === 400 || statusCode === 403 || (statusCode >= 500 && statusCode < 600)) {
        return Math.min(2000 * attempt, 15000);
    }
    return 250 * attempt + Math.floor(Math.random() * 300);
};

const maybeNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return undefined;
    const normalized = value
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');
    if (!normalized) return undefined;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : undefined;
};

const maybeInteger = (value) => {
    const n = Number(value);
    return Number.isInteger(n) ? n : undefined;
};

const getLocalizedValue = (value) => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value?.localized === 'string' && value.localized.trim()) return value.localized.trim();
    return undefined;
};

const getContactPhone = (contact) => {
    if (!Array.isArray(contact?.phones)) return undefined;
    const phone = contact.phones.find((entry) => typeof entry?.uri === 'string' && entry.uri.startsWith('tel:'));
    return phone?.uri.replace(/^tel:/i, '');
};

const getItemTitle = (item) => {
    if (typeof item?.title === 'string' && item.title.trim()) return item.title.trim();
    const titleParts = [item?.shortTitle, item?.subTitle]
        .filter((part) => typeof part === 'string' && part.trim())
        .map((part) => part.trim());
    if (titleParts.length) return titleParts.join(' ');

    const localizedParts = [getLocalizedValue(item?.make), getLocalizedValue(item?.model)].filter(Boolean);
    return localizedParts.length ? localizedParts.join(' ') : undefined;
};

const isRealListingItem = (item) => {
    return Boolean(item && typeof item === 'object' && maybeInteger(item.id) !== undefined && getItemTitle(item));
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

const toImageUrl = (value, rule) => {
    if (typeof value !== 'string' || !value.trim()) return undefined;

    let url = value.trim();
    if (url.startsWith('//')) url = `https:${url}`;
    else if (url.startsWith('img.classistatic.de/')) url = `https://${url}`;
    else if (!/^https?:\/\//i.test(url)) return undefined;

    if (rule && !/[?&]rule=/i.test(url)) {
        url += `${url.includes('?') ? '&' : '?'}rule=${rule}`;
    }
    return url;
};

const collectImageUrls = (item) => {
    const urls = new Set();
    const addUrl = (value, rule) => {
        const url = toImageUrl(value, rule);
        if (url) urls.add(url);
    };

    addUrl(item?.previewImage?.src, 'mo-1024');
    for (const url of parseSrcSetUrls(item?.previewImage?.srcSet)) addUrl(url);

    if (Array.isArray(item?.previewThumbnails)) {
        for (const thumb of item.previewThumbnails) {
            addUrl(thumb?.src, 'mo-200');
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
        const cleaned = value.map((item) => compactValue(item)).filter((item) => item !== undefined);
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

const getSearchResultItems = (value) => {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.listings)) return value.listings;
    return null;
};

const normalizeSearchResults = (value) => {
    const items = getSearchResultItems(value);
    if (!items) return null;
    return Array.isArray(value.items) ? value : { ...value, items };
};

const isSearchResultsObject = (value) => {
    const items = getSearchResultItems(value);
    if (!items) return false;
    if (items.length === 0) return true;

    return items.some(
        (item) => isRealListingItem(item) || (item && typeof item === 'object' && getSearchResultItems(item)),
    );
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
        return `https://${SEARCH_PAGE_HOST}/fahrzeuge/details.html?id=${numericId}`;
    }

    if (typeof relativeUrl === 'string' && relativeUrl.trim()) {
        try {
            return new URL(relativeUrl, `https://${SEARCH_PAGE_HOST}`).toString();
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
    const registrationYear =
        typeof item?.attr?.fr === 'string' ? maybeInteger(item.attr.fr.split('/').at(-1)) : undefined;

    const mapped = {
        listing_id: item?.id,
        title: getItemTitle(item),
        make: getLocalizedValue(item?.make),
        model: getLocalizedValue(item?.model),
        category: item?.category,
        vehicle_type: item?.type,
        url: toListingUrl(item?.relativeUrl, item?.id),
        price_eur: item?.price?.grossAmount ?? item?.price?.grs?.amount,
        price_currency: item?.price?.grossCurrency ?? item?.price?.grs?.currency,
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
        seller_type: item?.contactInfo?.sellerType ?? item?.contact?.enumType,
        seller_phone: item?.contactInfo?.contactPhone ?? getContactPhone(item?.contact),
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
        record &&
            maybeInteger(record.listing_id) !== undefined &&
            typeof record.title === 'string' &&
            record.title.trim(),
    );
};

const getListingDedupeKey = ({ item, candidateIndex, pageNumber, position }) => {
    const listingId = maybeInteger(item?.id);
    if (listingId !== undefined) return `id:${listingId}`;

    const relativeUrl = typeof item?.relativeUrl === 'string' ? item.relativeUrl.trim() : '';
    if (relativeUrl) return `url:${relativeUrl}`;

    return `fallback:${candidateIndex}:${pageNumber}:${position}`;
};

const parseBounds = (value) => {
    if (!value) return {};
    const parts = value.split(':');
    const [minimum, maximum] = parts.length === 2 ? parts : [parts[0], parts[0]];
    return {
        minimum: minimum ? Number(minimum) : undefined,
        maximum: maximum ? Number(maximum) : undefined,
    };
};

const getResponseFilterMismatches = ({ items, searchUrl }) => {
    const filters = getExactSearchFilterParameters(searchUrl);
    const mismatches = [];

    if (filters.makeId) {
        const expectedMakeName = getMobileDeMakeName(filters.makeId);
        const expectedMakeKey = expectedMakeName ? normalizeMakeLookupKey(expectedMakeName) : undefined;
        const observedMakeKeys = items
            .map((item) => getLocalizedValue(item?.make))
            .filter(Boolean)
            .map((value) => normalizeMakeLookupKey(value));
        const makeMismatch =
            expectedMakeKey && observedMakeKeys.length && observedMakeKeys.some((value) => value !== expectedMakeKey);
        if (makeMismatch) {
            mismatches.push(`make=${expectedMakeName || filters.makeId}`);
        }
    }

    if (filters.country) {
        const observedCountries = items
            .map((item) => (typeof item?.attr?.cn === 'string' ? item.attr.cn.trim().toUpperCase() : undefined))
            .filter(Boolean);
        if (observedCountries.length && observedCountries.some((value) => value !== filters.country)) {
            mismatches.push(`country=${filters.country}`);
        }
    }

    const yearBounds = parseBounds(filters.fr);
    if (yearBounds.minimum !== undefined || yearBounds.maximum !== undefined) {
        const observedYears = items
            .map((item) =>
                typeof item?.attr?.fr === 'string' ? maybeInteger(item.attr.fr.split('/').at(-1)) : undefined,
            )
            .filter((value) => value !== undefined);
        const yearMismatch = observedYears.some(
            (value) =>
                (yearBounds.minimum !== undefined && value < yearBounds.minimum) ||
                (yearBounds.maximum !== undefined && value > yearBounds.maximum),
        );
        if (yearMismatch) mismatches.push(`year=${filters.fr}`);
    }

    const priceBounds = parseBounds(filters.price);
    if (priceBounds.minimum !== undefined || priceBounds.maximum !== undefined) {
        const observedPrices = items
            .map((item) => maybeNumber(item?.price?.grossAmount ?? item?.price?.grs?.amount))
            .filter((value) => value !== undefined);
        const priceMismatch = observedPrices.some(
            (value) =>
                (priceBounds.minimum !== undefined && value < priceBounds.minimum) ||
                (priceBounds.maximum !== undefined && value > priceBounds.maximum),
        );
        if (priceMismatch) mismatches.push(`price=${filters.price}`);
    }

    return mismatches;
};

const buildApiUrl = (searchUrl) => {
    const apiParams = new URLSearchParams();
    apiParams.set('url', searchUrl);
    return `${MOBILE_DE_API_SEARCH_URL}?${apiParams.toString()}`;
};

const fetchSearchPage = async ({ client, searchUrl }) => {
    const response = await client.fetch(buildApiUrl(searchUrl), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const responseBody = await response.text();

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${responseBody.slice(0, 200)}`);
    }

    try {
        return JSON.parse(responseBody);
    } catch {
        throw new Error(`API returned non-JSON response (status ${response.status}): ${responseBody.slice(0, 200)}`);
    }
};

const createImpitClient = (proxyUrl) => {
    const options = {
        browser: IMPIT_BROWSER,
        headers: {
            'x-mobile-client': MOBILE_DE_CLIENT_HEADER,
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        },
    };
    if (proxyUrl) {
        options.proxyUrl = proxyUrl;
    }
    return new Impit(options);
};

let activeImpitClient;
let activeSessionCounter = 0;

const getSearchClient = async ({ proxyConfiguration, sessionPrefix, usesUnblocker, rotate = false }) => {
    if (activeImpitClient && !rotate) return activeImpitClient;

    let proxyUrl;
    if (proxyConfiguration) {
        activeSessionCounter += 1;
        const sessionId = usesUnblocker ? undefined : `${sessionPrefix}_s${activeSessionCounter}`;
        proxyUrl = await proxyConfiguration.newUrl(sessionId);
        if (typeof proxyUrl !== 'string') {
            throw new Error('Proxy configuration did not return a usable request session.');
        }
    }

    activeImpitClient = createImpitClient(proxyUrl);
    return activeImpitClient;
};

const fetchSearchState = async ({
    searchUrl,
    proxyConfiguration,
    maxAttempts,
    sessionPrefix,
    usesUnblocker = false,
}) => {
    let lastError;
    let lastStatusCode;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (getRemainingRunTimeMs() <= RUN_TIMEOUT_BUFFER_MS) throw makeRunTimeoutError();

        try {
            const client = await getSearchClient({
                proxyConfiguration,
                sessionPrefix,
                usesUnblocker,
                rotate: attempt > 1,
            });
            const data = await fetchSearchPage({ client, searchUrl });

            const searchResults = data?.searchResults;
            if (!searchResults || !isSearchResultsObject(searchResults)) {
                throw new Error('API response does not contain valid search results.');
            }

            return {
                state: wrapSearchResultsState(normalizeSearchResults(searchResults)),
                mode: 'consumer BFF API via impit',
            };
        } catch (error) {
            if (error?.code === 'ACTOR_TIMEOUT_APPROACHING') throw error;

            lastError = error;
            lastStatusCode = getErrorStatusCode(error);

            if (attempt >= maxAttempts || !isRetryableStatus(lastStatusCode)) break;

            log.debug(`Fetch retry ${attempt}/${maxAttempts} | ${error.message}`);
            await sleep(calculateBackoffMs(attempt, lastStatusCode));
        }
    }

    const safeReason = lastError?.message || (lastStatusCode ? `last HTTP status ${lastStatusCode}` : 'request failed');
    throw new Error(`Unable to fetch search results via API. ${safeReason}`);
};

await Actor.main(async () => {
    const actorInput = await Actor.getInput();
    const actorInputObject = actorInput && typeof actorInput === 'object' ? actorInput : {};
    const fallbackInput = await loadFallbackInput();
    const hasRuntimeInput = actorInput !== null && actorInput !== undefined;
    const useLocalFallback = !hasRuntimeInput && !Actor.isAtHome();
    const input = useLocalFallback ? fallbackInput : actorInputObject;
    const {
        startUrl,
        location,
        make,
        model,
        year,
        price,
        country,
        results_wanted: resultsWantedInput = 20,
        max_pages: maxPagesInput = DEFAULT_MAX_PAGES,
        proxyConfiguration: proxyConfigInput,
    } = input;

    const resultsWanted = clampInt(toPositiveInt(resultsWantedInput, 20), 1, MAX_RESULTS_WANTED);
    const configuredMaxPages = clampInt(toPositiveInt(maxPagesInput, DEFAULT_MAX_PAGES), 1, MAX_PAGES);
    const minimumPagesForTarget = Math.ceil(resultsWanted / 20);
    const maxPages = Math.min(MAX_PAGES, Math.max(configuredMaxPages, minimumPagesForTarget));
    const fetchAttempts = 3;

    if (maxPages > configuredMaxPages) {
        log.debug(`Pagination cap expanded from ${configuredMaxPages} to ${maxPages} pages.`);
    }
    let baseSearchCandidates;
    try {
        baseSearchCandidates = buildBaseSearchUrlCandidates({
            startUrl,
            filters: { location, make, model, year, price, country },
        });
    } catch (error) {
        const warningMessage = `Input normalization failed: ${error.message}`;
        log.warning(warningMessage);
        await persistSoftWarning(
            makeSoftWarningPayload({
                warning: warningMessage,
                startUrl,
                resultsWanted,
                maxPages,
            }),
        );
        return;
    }

    const runWarnings = [];
    let stoppedForTimeout = false;
    const stopBeforeActorTimeout = () => {
        if (stoppedForTimeout) return;
        stoppedForTimeout = true;
        const warning = 'Actor timeout is approaching; stopping pagination to preserve extracted results.';
        runWarnings.push(warning);
        log.warning(warning);
    };
    const customProxyUrlsConfigured = hasCustomProxyUrls(proxyConfigInput);
    const proxyRequested = isProxyRequested(proxyConfigInput);
    const shouldIgnoreApifyProxyLocally = !Actor.isAtHome() && proxyRequested && !customProxyUrlsConfigured;
    const effectiveProxyConfig = shouldIgnoreApifyProxyLocally ? undefined : proxyConfigInput;

    if (proxyRequested && shouldIgnoreApifyProxyLocally) {
        log.debug('Local run detected | using direct connection.');
    } else if (proxyRequested) {
        log.debug('Proxy enabled.');
    }

    let proxyConfiguration;
    if (effectiveProxyConfig) {
        try {
            proxyConfiguration = await Actor.createProxyConfiguration(effectiveProxyConfig);
        } catch (error) {
            const message = customProxyUrlsConfigured
                ? 'Configured custom proxy could not be initialized.'
                : 'Configured Apify Proxy could not be initialized; check proxy access and credentials.';
            log.error(`${message} ${error.message}`);
            throw new Error(message, { cause: error });
        }
    }

    if (proxyRequested && effectiveProxyConfig && Actor.isAtHome() && !proxyConfiguration) {
        throw new Error('Configured proxy was not available on the Apify platform.');
    }

    const usesUnblocker = getProxyGroups(effectiveProxyConfig).includes('UNBLOCKER');
    const seenIds = new Set();
    const outputBatch = [];
    const outputBatchSize = 20;
    let totalSaved = 0;
    let duplicateCount = 0;
    let invalidRecordCount = 0;
    let pagesFetched = 0;
    let stopReason = 'not_started';

    const flushOutputBatch = async (flushRemainder = false) => {
        while (outputBatch.length >= outputBatchSize || (flushRemainder && outputBatch.length)) {
            const batchSize = flushRemainder ? outputBatch.length : outputBatchSize;
            const batch = outputBatch.slice(0, batchSize);
            await Actor.pushData(batch);
            outputBatch.splice(0, batch.length);
        }
    };

    for (let candidateIndex = 0; candidateIndex < baseSearchCandidates.length; candidateIndex++) {
        if (totalSaved >= resultsWanted) {
            stopReason = 'result_target_reached';
            break;
        }

        const candidate = baseSearchCandidates[candidateIndex];
        let discoveredTotalPages = Number.POSITIVE_INFINITY;
        const effectiveMaxPages = maxPages;
        const candidateLabel = `${candidateIndex + 1}/${baseSearchCandidates.length}`;

        let firstPageState;
        try {
            const fetched = await fetchSearchState({
                searchUrl: candidate.url,
                proxyConfiguration,
                maxAttempts: fetchAttempts,
                sessionPrefix: `mobilede_${candidateIndex + 1}`,
                usesUnblocker,
            });
            firstPageState = fetched.state;
        } catch (error) {
            if (error?.code === 'ACTOR_TIMEOUT_APPROACHING') {
                stopBeforeActorTimeout();
                stopReason = 'actor_timeout';
                break;
            }
            stopReason = 'page_fetch_failed';
            const warning = `Page fetch failed for candidate ${candidateLabel} page 1: ${error.message}`;
            runWarnings.push(warning);
            log.warning(warning);
            break;
        }

        const searchResults = firstPageState?.search?.srp?.data?.searchResults || {};
        const reportedPageNumber = maybeInteger(searchResults.page ?? searchResults.pageNumber);
        if (reportedPageNumber !== undefined && reportedPageNumber !== 1) {
            throw new Error(
                `Structured response page mismatch: requested page 1, received page ${reportedPageNumber}.`,
            );
        }
        const rawItems = Array.isArray(searchResults.items) ? searchResults.items : [];
        const items = collectListingsFromNodes(rawItems);
        const { searchId } = searchResults;
        const responseFilterMismatches = getResponseFilterMismatches({ items, searchUrl: candidate.url });
        if (responseFilterMismatches.length) {
            throw new Error(
                `Structured response does not match the exact search filters: ${responseFilterMismatches.join(', ')}.`,
            );
        }

        discoveredTotalPages = toPositiveInt(searchResults.numPages, discoveredTotalPages);
        if (!items.length) {
            const warning = `No listings parsed for candidate ${candidateLabel} page 1.`;
            runWarnings.push(warning);
            if (searchResults.hasNextPage !== false) {
                pagesFetched++;
            } else {
                stopReason = 'no_more_pages';
                break;
            }
        } else {
            pagesFetched++;
            const pageBatch = [];
            for (const item of items) {
                if (totalSaved + pageBatch.length >= resultsWanted) break;

                const dedupeKey = getListingDedupeKey({
                    item,
                    candidateIndex,
                    pageNumber: 1,
                    position: pageBatch.length,
                });
                if (seenIds.has(dedupeKey)) {
                    duplicateCount++;
                    continue;
                }

                try {
                    const mapped = mapSearchItem({
                        item,
                        pageNumber: 1,
                        searchId,
                    });

                    if (!isValidMappedRecord(mapped)) {
                        invalidRecordCount++;
                        continue;
                    }

                    seenIds.add(dedupeKey);
                    pageBatch.push(mapped);
                } catch {
                    invalidRecordCount++;
                }
            }

            if (pageBatch.length) {
                outputBatch.push(...pageBatch);
                totalSaved += pageBatch.length;
                await flushOutputBatch();
            }

            if (totalSaved >= resultsWanted) {
                stopReason = 'result_target_reached';
                break;
            }
            if (searchResults.hasNextPage === false) {
                stopReason = 'no_more_pages';
                break;
            }
        }

        for (let pageNumber = 2; pageNumber <= effectiveMaxPages && pageNumber <= discoveredTotalPages; pageNumber++) {
            if (totalSaved >= resultsWanted) {
                stopReason = 'result_target_reached';
                break;
            }
            if (getRemainingRunTimeMs() <= RUN_TIMEOUT_BUFFER_MS) {
                stopBeforeActorTimeout();
                stopReason = 'actor_timeout';
                break;
            }

            const searchUrl = withPageNumber(candidate.url, pageNumber);
            let state;
            try {
                const fetched = await fetchSearchState({
                    searchUrl,
                    proxyConfiguration,
                    maxAttempts: fetchAttempts,
                    sessionPrefix: `mobilede_${candidateIndex + 1}`,
                    usesUnblocker,
                });
                state = fetched.state;
            } catch (error) {
                if (error?.code === 'ACTOR_TIMEOUT_APPROACHING') {
                    stopBeforeActorTimeout();
                    stopReason = 'actor_timeout';
                    break;
                }
                stopReason = 'page_fetch_failed';
                const warning = `Page fetch failed for candidate ${candidateLabel} page ${pageNumber}: ${error.message}`;
                runWarnings.push(warning);
                log.warning(warning);
                if (totalSaved === 0) break;
                await flushOutputBatch(true);
                break;
            }

            const pageSearchResults = state?.search?.srp?.data?.searchResults || {};
            const pageReportedNumber = maybeInteger(pageSearchResults.page ?? pageSearchResults.pageNumber);
            if (pageReportedNumber !== undefined && pageReportedNumber !== pageNumber) {
                throw new Error(
                    `Structured response page mismatch: requested page ${pageNumber}, received page ${pageReportedNumber}.`,
                );
            }
            const pageRawItems = Array.isArray(pageSearchResults.items) ? pageSearchResults.items : [];
            const pageItems = collectListingsFromNodes(pageRawItems);
            const pageSearchId = pageSearchResults.searchId;
            const pageResponseFilterMismatches = getResponseFilterMismatches({ items: pageItems, searchUrl });
            if (pageResponseFilterMismatches.length) {
                throw new Error(
                    `Structured response does not match the exact search filters: ${pageResponseFilterMismatches.join(', ')}.`,
                );
            }

            discoveredTotalPages = toPositiveInt(pageSearchResults.numPages, discoveredTotalPages);
            if (!pageItems.length) {
                const warning = `No listings parsed for candidate ${candidateLabel} page ${pageNumber}.`;
                runWarnings.push(warning);
                if (pageSearchResults.hasNextPage !== false) continue;
                stopReason = 'no_more_pages';
                break;
            }

            pagesFetched++;
            const pageBatch = [];
            for (const item of pageItems) {
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
                        searchId: pageSearchId,
                    });

                    if (!isValidMappedRecord(mapped)) {
                        invalidRecordCount++;
                        continue;
                    }

                    seenIds.add(dedupeKey);
                    pageBatch.push(mapped);
                } catch {
                    invalidRecordCount++;
                }
            }

            if (pageBatch.length) {
                outputBatch.push(...pageBatch);
                totalSaved += pageBatch.length;
                await flushOutputBatch();
            }

            if (totalSaved >= resultsWanted) {
                stopReason = 'result_target_reached';
                break;
            }
            if (pageSearchResults.hasNextPage === false) {
                stopReason = 'no_more_pages';
                break;
            }

            await sleep(500 + Math.floor(Math.random() * 1000));
        }

        if (
            stopReason === 'not_started' &&
            Number.isFinite(discoveredTotalPages) &&
            pagesFetched >= discoveredTotalPages
        ) {
            stopReason = 'no_more_pages';
        }
        if (stoppedForTimeout) break;
        if (stopReason !== 'not_started') break;
    }

    await flushOutputBatch(true);

    if (stopReason === 'not_started') {
        if (totalSaved >= resultsWanted) stopReason = 'result_target_reached';
        else if (pagesFetched >= maxPages) stopReason = 'max_pages_reached';
        else stopReason = 'completed';
    }

    log.info(
        `Run summary | saved=${totalSaved}/${resultsWanted} | pages=${pagesFetched} | stop_reason=${stopReason} | duplicates_removed=${duplicateCount} | invalid_records_skipped=${invalidRecordCount}`,
    );

    if (!totalSaved) {
        const warningMessage =
            'No listings were extracted after all auto-healing strategies. Adjust the search URL or retry later.';
        if (FAIL_ON_EMPTY_RESULTS_INTERNAL || stopReason === 'page_fetch_failed' || stopReason === 'actor_timeout') {
            throw new Error(runWarnings.at(-1) || warningMessage);
        }
        log.warning(warningMessage);
        await persistSoftWarning(
            makeSoftWarningPayload({
                warning: warningMessage,
                warnings: runWarnings,
                startUrl,
                resultsWanted,
                maxPages,
            }),
        );
    }
});
