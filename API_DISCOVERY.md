## API discovery result

The live discovery process was completed before the rewrite. The target exposes rich listing objects in the server-rendered search response, but the candidate consumer JSON endpoints were not replayable reliably without a browser session.

### Selected source

- Endpoint: `https://suchen.mobile.de/fahrzeuge/search.html?...`
- Method: `GET`
- Auth: None for the structured search response
- Pagination: `pageNumber=<n>`; the response also includes `page`, `numPages`, and `hasNextPage`
- Response marker: `searchResults` containing an `items` array in the legacy payload or a `listings` array in the current Next.js Flight payload
- Fields available: listing ID, title parts, make, model, category, type, price, vehicle attributes, seller/contact data, financing, image metadata, and pagination metadata
- Image URL location: current `searchResults.listings` objects expose `numImages`, while matching Next.js Flight `top-result-listing-*`, `base-result-listing-*`, or `tic-result-listing-*` components expose a primary image and, for some cards, up to three `thumbnail-*` `src` props keyed by the same `listingId`
- Image URL format: search-page primary images use `https://img.classistatic.de/api/v1/mo-prod/images/<prefix>/<uuid>?rule=mo-1024`; preview thumbnails use `?rule=mo-200`. Detail-page galleries may use `mo-1600`, but the actor does not fetch detail pages automatically.
- Current actor output: 45 non-empty listing fields across the BMW QA sample, with fields omitted when the source does not provide a value

### Confirmed search filters

The current Mobile.de search UI exposes these query parameters, verified against live filtered search pages:

| Actor input | Mobile.de parameter | Value format | Evidence |
|---|---|---|---|
| `location` | `gn` | City or postal code, for example `Berlin` | Live page displayed `DE, Berlin` |
| `make` and `model` | `ms` | `makeId;modelId;;`, for example `3500;10;;` | Live page displayed `BMW 320` |
| `year` | `fr` | `YYYY`, `YYYY:YYYY`, `:YYYY`, or `YYYY:` | Live page accepted `2020:2024` |
| `price` | `p` | EUR value or `MIN:MAX` range | Live page accepted `10000:30000` |
| `country` | `cn` | ISO country code from Mobile.de's selector | Live selector exposed the full code list used by the schema |

The actor applies an explicit input filter over the same URL parameter and leaves the URL value unchanged when that input is omitted. Exact make/model matching requires Mobile.de numeric IDs; text values use the service's full-text `userInput` fallback.

The actor uses only the selected structured search-page method. It preserves the complete user-provided URL, tries the validated mobile host before the canonical host, and rotates a new residential proxy session for each retry on Apify. Impit uses the validated `ios18` profile with its generated, internally consistent browser headers and TLS fingerprint. Temporary challenges are recovered with bounded retries and fresh residential sessions; the actor does not use browser automation, call the rejected consumer endpoints, scrape DOM selectors, or infer values from rendered text.

The selected request profile is Impit's supported `ios18` browser emulation. Direct tests on 2026-09-01 returned the full `searchResults` payload from both `suchen.mobile.de` and `m.mobile.de` with HTTP 200. Chrome emulation returned the same 403 challenge seen in the failed actor run, while Firefox returned a small challenge body without `searchResults`. The actor therefore does not mix a mobile user-agent with Chrome TLS, and it does not override Impit's generated browser headers.

For pagination, `results_wanted` drives the minimum page budget. An old or undersized `max_pages` value is expanded up to the 50-page safety ceiling when it cannot possibly satisfy the requested result count. Pages are requested sequentially in normal browser order, with one Impit client reused across successful pages for connection pooling. A fresh residential proxy session and client are created only after a failed/challenged attempt; successful requests are not artificially delayed. If a later page is challenged after earlier pages succeeded, the actor continues with fresh sessions; if page 1 cannot be fetched, it stops promptly rather than spending the whole run on empty retries.

The successful direct profile did not require an explicit `Origin`, `Referer`, or `Cookie` header. Mobile.de does set cookies on the HTML response, but direct tests fetched pages 1-3 successfully without an explicit cookie jar. Omitting those headers also avoids sending a referrer for `www.mobile.de` when the requested origin is `suchen.mobile.de` or `m.mobile.de`.

### Candidate matrix

| Candidate | Header profile | Result | Fields | Pagination | Decision |
|---|---|---:|---:|---|---|
| `m.mobile.de/consumer/api/search/srp` | Impit Chrome-style HTTP | HTTP 403 challenge | 0 | Unknown | Rejected; blocked |
| `m.mobile.de/consumer/api/search/srp/items` | Impit Chrome-style HTTP | HTTP 403 challenge | 0 | Unknown | Rejected; blocked |
| `www.mobile.de/consumer/api/search/srp` | Impit Chrome-style HTTP | HTTP 400 `ApiRequestFailed` | 0 | Unknown | Rejected; required server-side context unavailable |
| `www.mobile.de/consumer/api/search/srp/items` | Impit Chrome-style HTTP | HTTP 400 API error | 0 | Unknown | Rejected; required server-side context unavailable |
| Search-page structured `searchResults` | Impit `ios18`, no manual browser headers | HTTP 200, rich payload | 117+ source fields | `pageNumber`, `numPages` | Selected |
| Search-page Next.js Flight payload | Browser document GET, escaped `self.__next_f.push` state | HTTP 200, `searchResults.listings` | 117+ source fields | `pageNumber` in state | Selected compatibility parser |
| Search-page structured `searchResults` | Impit `chrome`, no manual overrides | HTTP 403 challenge | 0 | Unknown | Rejected; same block as actor log |
| Search-page structured `searchResults` | Impit `firefox`, no manual overrides | HTTP 200 challenge body | 0 | Unknown | Rejected; no marker |
| Search-page structured pages 1-3 | One Impit `ios18` client, no explicit cookies | HTTP 200, rich payload on all pages | 117+ source fields | `pageNumber`, `numPages` | Validated; cookie jar not required |
| Search-page via proxy + HTTP/3 | Impit proxy mode with `http3: true` | Unsupported by Impit | Not evaluated | Not evaluated | Rejected; Impit does not support proxies with HTTP/3 |
| URLScan search-page scan | Public URLScan search | Latest matching scan was HTTP 403 | No usable body | Unknown | Rejected |
| Search-page Impit `ios18` retry profile | Fresh residential session after challenge | Reuses the validated structured-page flow | 117+ source fields | `pageNumber`, `numPages` | Selected bounded recovery |
| Search-page Impit `chrome` | Chrome TLS/header profile | HTTP 403 challenge in direct testing | 0 | Unknown | Rejected for this target |
| Search-page Impit `firefox` | Firefox TLS/header profile | HTTP 200 challenge body without marker | 0 | Unknown | Rejected for this target |
| Search-page Impit `okhttp` profiles | App-style TLS/header profile | Not a valid profile for the browser structured page | Not evaluated | Not evaluated | Rejected; no app endpoint was selected |

### Discovery notes

1. URLScan public search was checked for `suchen.mobile.de`; the latest matching search-page scan was a 403 response and did not expose a usable JSON network response.
2. iOS Safari and Android app-style probes were run independently. The iOS page bootstrap returned a large response containing `searchResults`; the Android profile was rejected with 403.
3. Direct Impit probes of the consumer API candidates returned 403/400. The successful actor path therefore comes from the structured search response, not from the consumer JSON route.
4. The current response embeds the structured state in escaped Next.js Flight chunks. The parser decodes `self.__next_f.push` payloads, accepts `searchResults.listings`, and normalizes them to the existing `items` contract. Current listing objects expose localized make/model values, `price.grs.amount`, and `contact.phones`; the mapper supports these alongside the legacy fields.
5. Search response items include inline advertising nodes. The extractor keeps only numeric-ID listings with a usable title, canonicalizes IDs before deduplication, and removes null/empty values recursively.
6. The actor is HTTP-only and uses Impit's supported `ios18` profile. On a temporary challenge it retries the same filtered URL with a fresh residential session; it does not mix browser profiles or add manually forged browser headers.
7. The current Flight image props are not part of the listing object itself. The parser associates `top-result-listing-<position>-image-*`, `base-result-listing-<position>-image-*`, and `tic-result-listing-<position>-image` component props with the nearest listing component `listingId`, converts Mobile.de's scheme-relative image source to HTTPS, and adds the appropriate search-page image transformation rule without requesting extra detail pages. Search-page image availability varies by card, so `images_count` can be higher than `collected_images_count`.
