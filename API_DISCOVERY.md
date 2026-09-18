## API discovery result

The actor needs the server-rendered Mobile.de search response because the consumer JSON endpoints were not replayable reliably. The selected flow uses Impit's verified `ios18` request profile and extracts the structured `searchResults`/Next.js Flight payload instead of scraping visible card text.

### Selected source

- Endpoint: `https://suchen.mobile.de/fahrzeuge/search.html?...`
- Method: `GET` through Impit `browser: 'ios18'`
- Auth: None for the structured search response
- Request targets: `m.mobile.de` first, then canonical `suchen.mobile.de` when the first host is challenged or unavailable
- Proxy: Apify Residential with `DE` routing by default on Apify runs; one Impit client and proxy session are reused across successful sequential pages
- Retry policy: bounded page-local retries; a challenged page creates a fresh Impit client and residential proxy session before retrying the same filtered URL
- Pagination: `pageNumber=<n>`; the response also includes `page`, `numPages`, and `hasNextPage`
- Response marker: `searchResults` containing an `items` array in the legacy payload or a `listings` array in the current Next.js Flight payload
- Fields available: listing ID, title parts, make, model, category, type, price, vehicle attributes, seller/contact data, financing, image metadata, and pagination metadata
- Image URL location: current `searchResults.listings` objects expose `numImages`, while matching Next.js Flight `top-result-listing-*`, `base-result-listing-*`, or `tic-result-listing-*` components expose a primary image and, for some cards, up to three `thumbnail-*` `src` props keyed by the same `listingId`
- Current actor output: the existing 45-field listing contract is preserved; null and empty values are omitted

### Confirmed search filters

The current Mobile.de search UI exposes these query parameters, verified against live filtered search pages:

| Actor input | Mobile.de parameter | Value format | Evidence |
|---|---|---|---|
| `location` | `gn` | City or postal code, for example `Berlin` | Live page displayed `DE, Berlin` |
| `make` and `model` | `ms` | `makeId;modelId;;`, for example `3500;10;;` | Live page displayed `BMW 320` |
| `year` | `fr` | `YYYY`, `YYYY:YYYY`, `:YYYY`, or `YYYY:` | Live page accepted `2020:2024` |
| `price` | `p` | EUR value or `MIN:MAX` range | Live page accepted `10000:30000` |
| `country` | `cn` | ISO country code from Mobile.de's selector | Live selector exposed the full code list used by the schema |

### Verified make catalog

The live search page was inspected on 2026-09-18 with the browser session that successfully rendered the search UI. Its `select[name="mk"]` control exposed the complete current make catalog with numeric values, including `Mercedes-Benz=17200`, `Volkswagen=25200`, `BMW=3500`, `Audi=1900`, `Ford=9000`, `Toyota=24100`, `Citroën=5900`, `Kia=13200`, and the remaining selector makes. The exact catalog is stored in `src/mobile-de-makes.js` rather than discovered during every listing page request, so a run does not spend time searching broad pages or depend on a second make-lookup request.

The resolver accepts selector names case-insensitively, removes accents, and treats punctuation and spacing variants consistently. It also accepts numeric IDs unchanged and a small set of unambiguous common names such as `Mercedes`, `VW`, `Citroen`, `DS`, and `Ssang Yong`. An unknown text value fails input normalization; it never falls back to `userInput`.

A live browser verification with `ms=17200;;;&gn=Berlin&fr=2020:2024&p=10000:30000&cn=DE` displayed `Mercedes-Benz`, `DE, Berlin`, and `14,210 Angebote passend zu deinem Filter`; listing links retained all five parameters. This confirms that the exact make and every structured filter currently exposed by the actor are accepted together by the search page.

The actor creates one canonical filtered base URL before the first request. When `startUrl` is omitted, it uses the canonical vehicle search page as the base and applies the structured filters there. Pagination adds only `pageNumber`; it does not rebuild the query, fetch an unfiltered page, or filter broad results locally. Numeric make/model IDs remain supported for other makes and models.

A critical discovery was that `userInput=ford` is not an exact make filter. The live page reported about 1.28 million offers and page 2 contained Mercedes and BMW listings. The exact URL `ms=9000;;;` reported about 82 thousand Ford offers, and browser page 1, page 2, and page 3 each returned Ford-only cards. The actor therefore never uses `userInput` for a structured make. Legacy URLs with `userInput` are converted only when the value matches the verified make catalog; unknown text makes are rejected when supplied through the structured `make` input.

### Browser and pagination decision

The Impit path is selected because the original `ios18` profile produced structured Mobile.de responses in the actor environment while the Patchright Chrome path repeatedly returned HTTP 200 challenge pages. Each filtered page is requested through the same Impit client and proxy session while it succeeds. A failed or challenged page receives a fresh client and proxy session; the actor does not jump over a failed page.

The actor validates the response body and waits for `searchResults` rather than treating HTTP 200 alone as success. It also checks that redirects preserve every requested URL filter before parsing listings.

### Candidate matrix

| Candidate | Profile | Result | Fields | Pagination | Decision |
|---|---|---:|---:|---|---|
| `m.mobile.de/consumer/api/search/srp` | Direct Impit request | HTTP 403 challenge | 0 | Unknown | Rejected |
| `m.mobile.de/consumer/api/search/srp/items` | Direct Impit request | HTTP 403 challenge | 0 | Unknown | Rejected |
| `www.mobile.de/consumer/api/search/srp` | Direct Impit request | HTTP 400 `ApiRequestFailed` | 0 | Unknown | Rejected |
| `www.mobile.de/consumer/api/search/srp/items` | Direct Impit request | HTTP 400 API error | 0 | Unknown | Rejected |
| Search page with `userInput=ford` | Chromium browser | HTTP 200, but broad mixed inventory | Structured data present | Page numbers work but make filter is not exact | Rejected for make filtering |
| Search page with `ms=9000;;;` | Chromium browser | HTTP 200, Ford-only cards on pages 1–3 | 117+ source fields | `pageNumber`, `numPages`, `hasNextPage` | Selected |
| Search page with `ms=3500;;;` | Chromium browser | HTTP 200 structured BMW results | 117+ source fields | `pageNumber`, `numPages`, `hasNextPage` | Selected baseline |
| Search-page structured response | Impit `ios18` | Structured response from the verified actor profile; m.mobile.de and canonical fallback | 117+ source fields | `pageNumber`, `numPages`, `hasNextPage` | Selected |
| Search-page structured response | Impit `chrome` | HTTP 403 challenge | 0 | Unknown | Rejected |
| Search-page structured response | Impit `firefox` | HTTP 200 challenge body without marker | 0 | Unknown | Rejected |
| Search-page structured response | Patchright Chromium | Repeated HTTP 200 challenge pages in the actor runs | 0 on challenge | Unreliable | Rejected |
| `pageSize=200` URL variation | Chromium browser | Page size remained limited; Mobile.de ignored the value | Normal page fields | Normal pagination still required | Rejected as a shortcut |

### Discovery notes

1. Public URLScan search was checked for `suchen.mobile.de`; it did not expose a usable replayable JSON endpoint.
2. The consumer JSON candidates returned 403/400 responses. The usable data is in the search document's structured state, not the rejected consumer endpoints.
3. The current response embeds state in escaped `self.__next_f.push` chunks. The parser decodes those chunks, accepts `searchResults.listings`, and normalizes them to the existing `items` contract.
4. Search response items include inline advertising nodes. The extractor keeps only numeric-ID listings with a usable title, canonicalizes IDs before deduplication, and removes null/empty values recursively.
5. Flight image props are associated with the nearest listing component by `listingId`; no detail-page request is needed for the existing image fields.
6. The selected request method is browser navigation, not DOM card scraping. The page is considered usable only when structured data is present and produces valid listing records.
7. A final Apify run with the actor's residential proxy is still required to confirm the Impit `ios18` path in the production container. Local Windows runs do not reproduce Apify residential proxy access.
8. The actor now verifies that redirects preserve `ms`, `gn`, `fr`, `p`, and `cn`, and checks returned listing make, country, year, and price values when those response fields are present. A mismatch is treated as a failed page rather than saved as filtered data.
