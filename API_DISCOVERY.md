## Selected API

- Endpoint: `https://suchen.mobile.de/fahrzeuge/search.html?...` (also works via `https://m.mobile.de/fahrzeuge/search.html?...`)
- Method: `GET`
- Auth: None
- Pagination: `pageNumber=<n>` query parameter
- Primary data source: `window.__INITIAL_STATE__.search.srp.data.searchResults.items`
- Field availability: 117 discovered fields in the first listing object sample
- Current actor output target: listing-level vehicle, pricing, location, seller, and metadata fields

## Discovery Notes

1. URLScan public search was used to inspect known scans for `suchen.mobile.de`.
2. No consistently richer public JSON endpoint for full listing payloads was identified from scan network data.
3. The embedded initial state contains the richest stable listing objects and includes pagination metadata:
   - `searchResults.page`
   - `searchResults.numPages`
   - `searchResults.hasNextPage`
4. Detail pages frequently returned anti-bot challenge pages during direct HTTP fetches, while search pages remained extractable.

## Candidate Comparison

| Source | Richness | Stability | Decision |
|---|---:|---:|---|
| `window.__INITIAL_STATE__` on search page | High (117+ fields) | High | Selected |
| `m.mobile.de/consumer/api/search/hit-count` | Very low | High | Rejected |
| Detail page HTML fetch | Medium to high (when accessible) | Low (challenge pages) | Rejected for default flow |

## Missing Fields vs Previous Actor

The previous project scraped Remote.co jobs and did not produce vehicle data. The updated actor now returns significantly richer automotive listing fields, including:

- Listing identifiers and URLs
- Make, model, category, segment
- Price amounts and formatted price text
- Registration, mileage, fuel, transmission
- Seller profile and seller rating info
- Pagination and extraction metadata
