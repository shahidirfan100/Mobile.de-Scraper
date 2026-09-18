import { getMobileDeMakeId, requireMobileDeMakeId } from './mobile-de-makes.js';

export const SEARCH_PAGE_HOST = 'suchen.mobile.de';

const DEFAULT_SEARCH_URL = `https://${SEARCH_PAGE_HOST}/fahrzeuge/search.html?isSearchRequest=true&s=Car&vc=Car`;
const START_URL_ALLOWED_HOST_SUFFIX = 'mobile.de';
const SUPPORTED_COUNTRY_CODES = new Set([
    'DE',
    'EG',
    'AL',
    'AD',
    'ET',
    'BE',
    'BA',
    'BR',
    'BG',
    'DK',
    'EE',
    'FO',
    'FI',
    'FR',
    'GR',
    'GB',
    'IE',
    'IS',
    'IL',
    'IT',
    'JP',
    'JO',
    'CA',
    'HR',
    'KW',
    'LV',
    'LB',
    'LI',
    'LT',
    'LU',
    'MT',
    'MA',
    'MK',
    'MX',
    'MD',
    'MC',
    'ME',
    'NZ',
    'NL',
    'NG',
    'NO',
    'OM',
    'AT',
    'PL',
    'PT',
    'RO',
    'RU',
    'SM',
    'SA',
    'SE',
    'CH',
    'RS',
    'SK',
    'SI',
    'ES',
    'ZA',
    'KR',
    'TW',
    'CZ',
    'TN',
    'TR',
    'UA',
    'HU',
    'US',
    'AE',
    'BY',
    'CY',
]);

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

const isAllowedStartUrlHost = (hostname) => {
    if (typeof hostname !== 'string' || !hostname.trim()) return false;
    const normalized = hostname.trim().toLowerCase();
    return normalized === START_URL_ALLOWED_HOST_SUFFIX || normalized.endsWith(`.${START_URL_ALLOWED_HOST_SUFFIX}`);
};

const normalizeRangeFilter = (value, name, validatePart) => {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;

    const raw = String(value).trim().replace(/\s+/g, '');
    const parts = raw.split(':');
    if (parts.length > 2 || !raw) {
        throw new Error(`${name} must be a value or range in the form MIN:MAX.`);
    }

    const [minimum, maximum] = parts.length === 2 ? parts : [parts[0], parts[0]];
    if (!minimum && !maximum) throw new Error(`${name} must contain at least one value.`);
    if ((minimum && !validatePart(minimum)) || (maximum && !validatePart(maximum))) {
        throw new Error(`${name} contains an invalid value: ${value}.`);
    }

    return parts.length === 2 ? `${minimum}:${maximum}` : minimum;
};

const normalizeYearFilter = (value) => normalizeRangeFilter(value, 'year', (part) => /^(?:19|20)\d{2}$/.test(part));

const normalizePriceFilter = (value) => normalizeRangeFilter(value, 'price', (part) => /^\d+$/.test(part));

const normalizeCountryCode = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const countryCode = String(value).trim().toUpperCase();
    if (!SUPPORTED_COUNTRY_CODES.has(countryCode)) {
        throw new Error(
            `country must be one of Mobile.de's supported ISO country codes: ${[...SUPPORTED_COUNTRY_CODES].join(', ')}.`,
        );
    }
    return countryCode;
};

const isNumericId = (value) => typeof value === 'string' && /^\d+$/.test(value);

const getMakeAndModelFromSearchUrl = (url) => {
    const makeModelFilter = url.searchParams.get('ms')?.trim();
    if (!makeModelFilter) return {};

    const [makeId, modelId] = makeModelFilter.split(';');
    return {
        makeId: isNumericId(makeId) ? makeId : undefined,
        modelId: isNumericId(modelId) ? modelId : undefined,
    };
};

const applyMakeModelFilters = (url, { make, model }) => {
    const rawMakeValue = make === undefined || make === null ? '' : String(make).trim();
    const modelValue = model === undefined || model === null ? '' : String(model).trim();
    const existingMakeModel = getMakeAndModelFromSearchUrl(url);
    const makeValue = rawMakeValue ? requireMobileDeMakeId(rawMakeValue) : existingMakeModel.makeId || '';

    if (!makeValue && !modelValue) {
        const existingUserInput = url.searchParams.get('userInput')?.trim();
        const existingMakeId = getMobileDeMakeId(existingUserInput);
        const existingMakeModelFilter = url.searchParams.get('ms')?.trim();

        if (existingMakeId && !existingMakeModelFilter) {
            url.searchParams.set('ms', `${existingMakeId};;;`);
        }
        if (existingMakeId || existingMakeModelFilter) {
            // userInput is broad text search and can counteract an exact ms filter.
            url.searchParams.delete('userInput');
        }
        return;
    }

    if (modelValue && !isNumericId(modelValue)) {
        throw new Error('model must be a Mobile.de numeric model ID so the URL remains an exact filtered search.');
    }
    if (!makeValue && modelValue) {
        throw new Error('model requires a Mobile.de numeric make ID or a startUrl containing an exact ms make ID.');
    }

    const selectedModelValue = modelValue || (rawMakeValue ? '' : existingMakeModel.modelId || '');
    url.searchParams.set('ms', `${makeValue};${selectedModelValue};;`);
    // userInput is a broad text search and can counteract an exact ms filter.
    url.searchParams.delete('userInput');
};

export const normalizeSearchUrl = (rawUrl, filters = {}) => {
    try {
        const url = new URL(rawUrl);
        url.protocol = 'https:';
        url.hostname = SEARCH_PAGE_HOST;
        // Build one immutable filtered base URL; pagination adds only pageNumber.
        url.searchParams.delete('pageNumber');
        url.searchParams.set('isSearchRequest', 'true');
        if (!url.searchParams.has('s')) url.searchParams.set('s', 'Car');
        if (!url.searchParams.has('vc')) url.searchParams.set('vc', 'Car');

        applyMakeModelFilters(url, filters);

        const optionalFilters = [
            ['location', 'gn', (value) => String(value).trim()],
            ['year', 'fr', normalizeYearFilter],
            ['price', 'p', normalizePriceFilter],
            ['country', 'cn', normalizeCountryCode],
        ];
        for (const [inputName, queryParameter, normalize] of optionalFilters) {
            const inputValue = filters[inputName];
            if (inputValue === undefined || inputValue === null || String(inputValue).trim() === '') continue;
            const normalizedValue = normalize(inputValue);
            if (normalizedValue) url.searchParams.set(queryParameter, normalizedValue);
        }

        return url.toString();
    } catch (error) {
        if (error instanceof TypeError) return rawUrl;
        throw error;
    }
};

export const buildBaseSearchUrlCandidates = ({ startUrl, filters }) => {
    const hasStartUrl = typeof startUrl === 'string' && startUrl.trim();
    const hasStructuredFilter = Object.values(filters || {}).some(
        (value) => value !== undefined && value !== null && String(value).trim() !== '',
    );
    if (!hasStartUrl && !hasStructuredFilter) {
        throw new Error('Provide startUrl or at least one structured Mobile.de filter.');
    }

    const parsedStartUrl = parseInputUrlLoosely(hasStartUrl ? startUrl : DEFAULT_SEARCH_URL);
    if (!parsedStartUrl) {
        throw new Error('A valid Mobile.de startUrl is required when the supplied URL is not empty.');
    }
    if (!isAllowedStartUrlHost(parsedStartUrl.hostname)) {
        throw new Error(`startUrl host is not allowed: ${parsedStartUrl.hostname}`);
    }

    return [
        {
            url: normalizeSearchUrl(parsedStartUrl.toString(), filters),
            source: hasStartUrl ? 'user-start-url' : 'generated-from-filters',
        },
    ];
};

export const withPageNumber = (rawUrl, pageNumber) => {
    const url = new URL(rawUrl);
    url.searchParams.set('pageNumber', String(pageNumber));
    return url.toString();
};

export const getExactSearchFilterParameters = (rawUrl) => {
    const url = new URL(rawUrl);
    const makeModel = getMakeAndModelFromSearchUrl(url);
    return {
        ms: url.searchParams.get('ms') || undefined,
        makeId: makeModel.makeId,
        modelId: makeModel.modelId,
        gn: url.searchParams.get('gn') || undefined,
        fr: url.searchParams.get('fr') || undefined,
        price: url.searchParams.get('p') || undefined,
        country: url.searchParams.get('cn') || undefined,
    };
};

export const assertSearchUrlFiltersPreserved = ({ requestedUrl, actualUrl }) => {
    const requested = getExactSearchFilterParameters(requestedUrl);
    const actual = getExactSearchFilterParameters(actualUrl);
    const requestedPage = new URL(requestedUrl).searchParams.get('pageNumber');
    const actualPage = new URL(actualUrl).searchParams.get('pageNumber');
    const mismatches = [];

    for (const parameter of ['ms', 'gn', 'fr', 'price', 'country']) {
        if (requested[parameter] !== undefined && requested[parameter] !== actual[parameter]) {
            mismatches.push(`${parameter}=${requested[parameter]} (actual: ${actual[parameter] || 'missing'})`);
        }
    }
    if (requestedPage && requestedPage !== '1' && requestedPage !== actualPage) {
        mismatches.push(`pageNumber=${requestedPage} (actual: ${actualPage || 'missing'})`);
    }

    if (mismatches.length) {
        throw new Error(`Mobile.de redirected away from the filtered search URL: ${mismatches.join(', ')}.`);
    }
};
