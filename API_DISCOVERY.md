## API discovery result

The live discovery process was completed before the rewrite. The target exposes rich listing objects in the server-rendered search response, but the candidate consumer JSON endpoints were not replayable reliably without a browser session.

### Selected source

- Endpoint: `https://suchen.mobile.de/fahrzeuge/search.html?...`
- Method: `GET`
- Auth: None for the structured search response
- Pagination: `pageNumber=<n>`; the response also includes `page`, `numPages`, and `hasNextPage`
- Response marker: `searchResults` containing an `items` array
- Fields available: listing ID, title parts, make, model, category, type, price, vehicle attributes, seller/contact data, financing, image metadata, and pagination metadata
- Current actor output: 45 non-empty listing fields across the BMW QA sample, with fields omitted when the source does not provide a value

The actor uses only the selected structured search-page method. It preserves the complete user-provided URL, tries the mobile host before the canonical host, and rotates a new residential proxy session for each retry on Apify. It does not switch to a keyword-only URL, call the rejected consumer endpoints, scrape DOM selectors, or infer values from rendered text.

For pagination, `results_wanted` drives the minimum page budget. An old or undersized `max_pages` value is expanded up to the 50-page safety ceiling when it cannot possibly satisfy the requested result count. If a later page is challenged after earlier pages succeeded, the actor continues with fresh sessions; if page 1 cannot be fetched, it stops promptly rather than spending the whole run on empty retries.

### Candidate matrix

| Candidate | Header profile | Result | Fields | Pagination | Decision |
|---|---|---:|---:|---|---|
| `m.mobile.de/consumer/api/search/srp` | Impit Chrome-style HTTP | HTTP 403 challenge | 0 | Unknown | Rejected; blocked |
| `m.mobile.de/consumer/api/search/srp/items` | Impit Chrome-style HTTP | HTTP 403 challenge | 0 | Unknown | Rejected; blocked |
| `www.mobile.de/consumer/api/search/srp` | Impit Chrome-style HTTP | HTTP 400 `ApiRequestFailed` | 0 | Unknown | Rejected; required server-side context unavailable |
| `www.mobile.de/consumer/api/search/srp/items` | Impit Chrome-style HTTP | HTTP 400 API error | 0 | Unknown | Rejected; required server-side context unavailable |
| Search-page structured `searchResults` | Desktop/iOS HTTP bootstrap | HTTP 200, rich payload | 117+ source fields | `pageNumber`, `numPages` | Selected |
| URLScan search-page scan | Public URLScan search | Latest matching scan was HTTP 403 | No usable body | Unknown | Rejected |
| Patchright browser capture | Local browser probe | Browser binary unavailable; download timed out | Not evaluated | Not evaluated | Not used |

### Discovery notes

1. URLScan public search was checked for `suchen.mobile.de`; the latest matching search-page scan was a 403 response and did not expose a usable JSON network response.
2. iOS Safari and Android app-style probes were run independently. The iOS page bootstrap returned a large response containing `searchResults`; the Android profile was rejected with 403.
3. Direct Impit probes of the consumer API candidates returned 403/400. The successful local actor run therefore came from the structured search response, not from the consumer JSON route.
4. Search response items include inline advertising nodes. The extractor keeps only numeric-ID listings with a usable title, canonicalizes IDs before deduplication, and removes null/empty values recursively.
5. No browser dependency is required for the current stable path. Patchright was not retained because the direct HTTP structured response already produces the required dataset and the local browser download was unavailable.
