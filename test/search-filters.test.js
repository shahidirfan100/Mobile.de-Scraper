import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getMobileDeMakeId,
    MOBILE_DE_MAKE_IDS,
    normalizeMakeLookupKey,
    requireMobileDeMakeId,
} from '../src/mobile-de-makes.js';
import {
    assertSearchUrlFiltersPreserved,
    buildBaseSearchUrlCandidates,
    normalizeSearchUrl,
    withPageNumber,
} from '../src/search-filters.js';

test('contains the complete make catalog discovered from the Mobile.de selector', () => {
    assert.ok(MOBILE_DE_MAKE_IDS.size >= 180);
    assert.equal(getMobileDeMakeId('BMW'), '3500');
    assert.equal(getMobileDeMakeId('ford'), '9000');
    assert.equal(getMobileDeMakeId('Mercedes-Benz'), '17200');
    assert.equal(getMobileDeMakeId('Audi'), '1900');
    assert.equal(getMobileDeMakeId('Volkswagen'), '25200');
    assert.equal(getMobileDeMakeId('Toyota'), '24100');
});

test('normalizes case, accents, punctuation, spacing, and common aliases', () => {
    assert.equal(normalizeMakeLookupKey('Citroën'), 'CITROEN');
    assert.equal(getMobileDeMakeId('citroen'), '5900');
    assert.equal(getMobileDeMakeId('Mercedes Benz'), '17200');
    assert.equal(getMobileDeMakeId('Lynk & Co'), '31934');
    assert.equal(getMobileDeMakeId('VW'), '25200');
    assert.equal(getMobileDeMakeId('SSANG YONG'), '23100');
    assert.equal(getMobileDeMakeId('3500'), '3500');
});

test('rejects unknown text instead of creating a broad userInput search', () => {
    assert.equal(getMobileDeMakeId('not-a-mobile-de-make'), undefined);
    assert.throws(() => requireMobileDeMakeId('not-a-mobile-de-make'), /Unknown Mobile\.de make/);
});

test('builds one exact URL from all structured filters without startUrl', () => {
    const [{ url }] = buildBaseSearchUrlCandidates({
        filters: {
            make: 'BMW',
            model: '10',
            location: 'Berlin',
            year: '2020:2024',
            price: '10000:30000',
            country: 'DE',
        },
    });
    const parsed = new URL(url);

    assert.equal(parsed.hostname, 'suchen.mobile.de');
    assert.equal(parsed.searchParams.get('ms'), '3500;10;;');
    assert.equal(parsed.searchParams.get('gn'), 'Berlin');
    assert.equal(parsed.searchParams.get('fr'), '2020:2024');
    assert.equal(parsed.searchParams.get('p'), '10000:30000');
    assert.equal(parsed.searchParams.get('cn'), 'DE');
    assert.equal(parsed.searchParams.get('userInput'), null);
    assert.equal(parsed.searchParams.get('pageNumber'), null);
});

test('converts a legacy exact text URL into the numeric make filter', () => {
    const normalized = normalizeSearchUrl(
        'https://www.mobile.de/fahrzeuge/search.html?userInput=ford&s=Car&vc=Car&pageNumber=4',
    );
    const parsed = new URL(normalized);

    assert.equal(parsed.hostname, 'suchen.mobile.de');
    assert.equal(parsed.searchParams.get('ms'), '9000;;;');
    assert.equal(parsed.searchParams.get('userInput'), null);
    assert.equal(parsed.searchParams.get('pageNumber'), null);
});

test('keeps an exact make from startUrl when only model is supplied', () => {
    const normalized = normalizeSearchUrl(
        'https://suchen.mobile.de/fahrzeuge/search.html?ms=3500%3B%3B%3B&s=Car&vc=Car',
        { model: '10' },
    );
    assert.equal(new URL(normalized).searchParams.get('ms'), '3500;10;;');
});

test('adds only pageNumber during pagination', () => {
    const baseUrl = 'https://suchen.mobile.de/fahrzeuge/search.html?ms=3500%3B%3B%3B&gn=Berlin&cn=DE';
    const pageUrl = new URL(withPageNumber(baseUrl, 2));

    assert.equal(pageUrl.searchParams.get('ms'), '3500;;;');
    assert.equal(pageUrl.searchParams.get('gn'), 'Berlin');
    assert.equal(pageUrl.searchParams.get('cn'), 'DE');
    assert.equal(pageUrl.searchParams.get('pageNumber'), '2');
});

test('detects a redirect that drops exact filters', () => {
    assert.throws(
        () =>
            assertSearchUrlFiltersPreserved({
                requestedUrl:
                    'https://suchen.mobile.de/fahrzeuge/search.html?ms=3500%3B%3B%3B&gn=Berlin&fr=2020%3A2024&p=10000%3A30000&cn=DE',
                actualUrl: 'https://suchen.mobile.de/fahrzeuge/search.html?s=Car&vc=Car',
            }),
        /redirected away from the filtered search URL/,
    );
});

test('detects a pagination redirect to the wrong page', () => {
    assert.throws(
        () =>
            assertSearchUrlFiltersPreserved({
                requestedUrl: 'https://suchen.mobile.de/fahrzeuge/search.html?ms=3500%3B%3B%3B&pageNumber=2',
                actualUrl: 'https://suchen.mobile.de/fahrzeuge/search.html?ms=3500%3B%3B%3B&pageNumber=1',
            }),
        /pageNumber=2/,
    );
});
