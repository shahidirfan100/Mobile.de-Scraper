import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getProxyCountry,
    getProxyGroups,
    hasCustomProxyUrls,
    isProxyRequested,
} from '../src/proxy-config.js';

test('reads Apify input-editor proxy aliases without rewriting the input', () => {
    const config = {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
        apifyProxyCountry: 'de',
    };

    assert.deepEqual(getProxyGroups(config), ['RESIDENTIAL']);
    assert.equal(getProxyCountry(config), 'DE');
    assert.equal(isProxyRequested(config), true);
    assert.equal(hasCustomProxyUrls(config), false);
});

test('prefers runtime proxy keys when both forms are present', () => {
    const config = {
        groups: ['UNBLOCKER'],
        apifyProxyGroups: ['RESIDENTIAL'],
        countryCode: 'US',
        apifyProxyCountry: 'DE',
    };

    assert.deepEqual(getProxyGroups(config), ['UNBLOCKER']);
    assert.equal(getProxyCountry(config), 'US');
});

test('recognizes custom proxy URLs separately from Apify proxy settings', () => {
    assert.equal(hasCustomProxyUrls({ proxyUrls: ['http://proxy.example:8000'] }), true);
    assert.equal(hasCustomProxyUrls({ proxyUrls: [] }), false);
    assert.equal(hasCustomProxyUrls({ useApifyProxy: true }), false);
});

test('does not treat a disabled proxy as requested', () => {
    assert.equal(isProxyRequested({ useApifyProxy: false }), false);
    assert.equal(hasCustomProxyUrls({ proxyUrls: ['http://proxy.example:8000'] }), true);
});
