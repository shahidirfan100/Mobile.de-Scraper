const getFirstNonEmptyArray = (...values) => {
    for (const value of values) {
        if (!Array.isArray(value)) continue;
        const entries = value.map((entry) => String(entry).trim()).filter(Boolean);
        if (entries.length) return entries;
    }
    return [];
};

export const getProxyGroups = (proxyConfig) =>
    getFirstNonEmptyArray(proxyConfig?.groups, proxyConfig?.apifyProxyGroups);

export const getProxyCountry = (proxyConfig) => {
    const country = proxyConfig?.countryCode || proxyConfig?.apifyProxyCountry;
    return typeof country === 'string' && country.trim() ? country.trim().toUpperCase() : undefined;
};

export const hasCustomProxyUrls = (proxyConfig) =>
    Array.isArray(proxyConfig?.proxyUrls) && proxyConfig.proxyUrls.some((url) => typeof url === 'string' && url.trim());

export const isProxyRequested = (proxyConfig) =>
    Boolean(proxyConfig && typeof proxyConfig === 'object' && proxyConfig.useApifyProxy !== false);


