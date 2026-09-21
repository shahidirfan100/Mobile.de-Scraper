## API discovery result

The actor now uses mobile.de's **consumer BFF JSON API** instead of scraping the HTML page. This approach bypasses Akamai Bot Manager entirely because the BFF endpoint is not protected by the WAF.

### Selected source

- **Endpoint:** `https://www.mobile.de/consumer/api/search/srp`
- **Method:** `GET`
- **Auth:** None
- **Required Header:** `x-mobile-client: de.mobile.consumer-webapp`
- **Request format:** Query parameter `url` containing the search URL, optional `pageNumber` parameter
- **Response format:** JSON with `searchResults.{numResultsTotal, page, numPages, hasNextPage, items}`
- **Proxy:** Optional; residential proxy recommended for high-volume scraping
- **Pagination:** `pageNumber=<n>` parameter; mobile.de caps deep pagination at ~50 pages (~1300 listings) per search

### Key discovery

The consumer BFF JSON API at `https://www.mobile.de/consumer/api/search/srp` is **NOT protected by Akamai Bot Manager** and requires **no cookie warmup**. The only gate is an API-contract header:

```
x-mobile-client: de.mobile.consumer-webapp
```

Without this header, the API returns `400 {"errors":[{"key":"400","args":["Missing or invalid client header"]}]}`.

### TLS profile

The BFF is not JA3-sensitive. The following profiles all work:

- `chrome124`
- `chrome131`
- `safari17_0`
- `edge101`

The header, not the fingerprint, is what unlocks the endpoint.

### Why this approach works

1. **No Akamai protection:** The BFF endpoint is not behind Akamai Bot Manager
2. **No browser required:** Plain HTTP requests work with the correct header
3. **No cookie management:** No need to warm up cookies or solve challenges
4. **Faster:** Direct API calls are much faster than browser automation
5. **More reliable:** No dependency on browser fingerprinting or stealth techniques

### Previous approach (deprecated)

The previous approach used:

- `impit` with `chrome136` browser profile for HTTP requests
- Playwright with Chrome for browser recovery when HTTP requests were blocked
- Complex HTML parsing to extract structured data from the search page

This approach failed because:

- mobile.de's Akamai Bot Manager blocks HTTP requests with 403 status
- Browser recovery also fails because the browser fingerprint is detected
- The HTML page contains complex Next.js Flight payloads that are difficult to parse

### API response structure

The API returns JSON with the following structure:

```json
{
    "searchResults": {
        "numResultsTotal": 82000,
        "page": 1,
        "numPages": 4100,
        "hasNextPage": true,
        "items": [
            {
                "id": 123456789,
                "title": "Ford Fiesta",
                "make": { "localized": "Ford" },
                "model": { "localized": "Fiesta" },
                "price": { "grossAmount": 15000, "grossCurrency": "EUR" },
                "attr": {
                    "fr": "01/2020",
                    "ml": "50000",
                    "pw": "75 kW (102 PS)",
                    "ft": "Benzin",
                    "tr": "Manuell",
                    "cn": "DE"
                },
                "contactInfo": {
                    "name": "Autohaus Berlin",
                    "sellerType": "dealer"
                },
                "previewImage": {
                    "src": "https://img.classistatic.de/..."
                }
            }
        ]
    }
}
```

### Confirmed search filters

The current Mobile.de search UI exposes these query parameters, verified against live filtered search pages:

| Actor input        | Mobile.de parameter | Value format                                | Evidence                                                    |
| ------------------ | ------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `location`         | `gn`                | City or postal code, for example `Berlin`   | Live page displayed `DE, Berlin`                            |
| `make` and `model` | `ms`                | `makeId;modelId;;`, for example `3500;10;;` | Live page displayed `BMW 320`                               |
| `year`             | `fr`                | `YYYY`, `YYYY:YYYY`, `:YYYY`, or `YYYY:`    | Live page accepted `2020:2024`                              |
| `price`            | `p`                 | EUR value or `MIN:MAX` range                | Live page accepted `10000:30000`                            |
| `country`          | `cn`                | ISO country code from Mobile.de's selector  | Live selector exposed the full code list used by the schema |

### Verified make catalog

The live search page was inspected on 2026-09-18 with the browser session that successfully rendered the search UI. Its `select[name="mk"]` control exposed the complete current make catalog with numeric values, including `Mercedes-Benz=17200`, `Volkswagen=25200`, `BMW=3500`, `Audi=1900`, `Ford=9000`, `Toyota=24100`, `Citroën=5900`, `Kia=13200`, and the remaining selector makes. The exact catalog is stored in `src/mobile-de-makes.js` rather than discovered during every listing page request, so a run does not spend time searching broad pages or depend on a second make-lookup request.

The resolver accepts selector names case-insensitively, removes accents, and treats punctuation and spacing variants consistently. It also accepts numeric IDs unchanged and a small set of unambiguous common names such as `Mercedes`, `VW`, `Citroen`, `DS`, and `Ssang Yong`. An unknown text value fails input normalization; it never falls back to `userInput`.

### Discovery notes

1. The consumer BFF JSON API was discovered by analyzing the xtracto/mobilede-listings actor on Apify.
2. The API endpoint `https://www.mobile.de/consumer/api/search/srp` was verified to work with the `x-mobile-client` header.
3. The API does not require any authentication or cookie management.
4. The API is not protected by Akamai Bot Manager, unlike the HTML pages.
5. The API accepts any TLS fingerprint - the header is the only requirement.
6. The previous approach using impit and Playwright was abandoned because mobile.de's Akamai protection blocked all attempts.
7. The new approach is significantly faster and more reliable than browser automation.
