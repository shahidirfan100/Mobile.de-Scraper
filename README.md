## What does Mobile.de Vehicle Scraper do?

Mobile.de Vehicle Scraper is a Mobile.de scraper that collects public vehicle listings from a Mobile.de search results URL or structured vehicle filters. Paste a complete filtered search URL into `startUrl`, or provide filters such as make and country, choose the number of listings and pages to process, and receive structured records with vehicle specifications, prices, seller details, images, financing information, locations, and direct listing URLs.

Use the dataset for automotive market research, price comparison, dealer inventory monitoring, vehicle sourcing, lead generation, and recurring market snapshots. The filters saved in your Mobile.de search URL, plus any structured options supplied to the actor, are written into the request before listings are fetched.

## Why use Mobile.de Vehicle Scraper?

- **Search URL workflow** - Build the exact search on Mobile.de, copy the results URL, and run it without recreating a long list of marketplace filters.
- **Vehicle market data** - Collect make, model, price, registration, mileage, power, fuel type, transmission, body type, emissions, dimensions, and other published specifications.
- **Seller and location information** - Capture dealer or private-seller labels, seller names, ratings, phone numbers when published, city, postal code, and country code.
- **Inventory monitoring** - Schedule repeat runs and compare prices, mileage, seller information, and available listings over time.
- **Clean records** - Duplicate listings are removed, and fields that Mobile.de does not publish are omitted from the corresponding record.
- **Automation-ready exports** - Download JSON, CSV, Excel, or XML files, or connect the dataset to the Apify API, webhooks, Google Sheets, Airtable, Make, or Zapier.

## What data can you extract from Mobile.de?

Each dataset item represents one vehicle listing. The actor keeps a field when Mobile.de provides a usable value.

| Field | Type | Description |
|-------|------|-------------|
| `listing_id` | Number | Unique Mobile.de listing identifier. |
| `title` | String | Full vehicle listing title. |
| `make` | String | Vehicle manufacturer. |
| `model` | String | Vehicle model. |
| `category` | String | Vehicle category or body-style label. |
| `vehicle_type` | String | Listing placement or result type when provided. |
| `url` | String | Canonical Mobile.de detail page URL. |
| `price_eur` | Number | Gross listing price as a number. |
| `price_currency` | String | Currency reported by the listing. |
| `first_registration` | String | First-registration value, such as `01/2019`. |
| `registration_year` | Number | Parsed registration year. |
| `mileage_km` | Number | Mileage in kilometres. |
| `power_kw` | Number | Engine power in kilowatts. |
| `power_ps` | Number | Engine power in PS. |
| `displacement_ccm` | Number | Engine displacement in cubic centimetres. |
| `fuel_type` | String | Fuel type. |
| `transmission` | String | Transmission type. |
| `body_type_code` | String | Mobile.de body-type classification. |
| `condition_label` | String | Condition or subcategory label. |
| `color` | String | Exterior colour. |
| `doors` | String | Door configuration. |
| `seats_count` | Number | Number of seats. |
| `inspection_valid_until` | String | Inspection status or validity. |
| `euro_emission_class` | String | Euro emission class. |
| `co2_class` | String | CO₂ efficiency class. |
| `fuel_consumption_l_100km` | Number | Combined fuel consumption. |
| `co2_emission_g_km` | Number | CO₂ emissions per kilometre. |
| `vehicle_weight_kg` | Number | Vehicle weight in kilograms. |
| `city` | String | Listing location city. |
| `postal_code` | String | Listing postal code. |
| `country_code` | String | Listing country code. |
| `seller_id` | Number | Seller identifier when published. |
| `seller_name` | String | Seller or dealer display name. |
| `seller_type` | String | Seller category, such as dealer or private seller. |
| `seller_phone` | String | Seller phone number when published. |
| `seller_rating_score` | Number | Seller rating score. |
| `seller_rating_count` | Number | Number of seller ratings. |
| `image_url` | String | Primary listing image URL. |
| `image_urls` | Array | Collected image URLs for the listing. |
| `collected_images_count` | Number | Number of image URLs collected. |
| `images_count` | Number | Image count announced for the listing. |
| `has_video` | Boolean | Whether a video is available. |
| `has_electric_engine` | Boolean | Whether the listing has an electric engine. |
| `is_eye_catcher` | Boolean | Whether the listing is highlighted. |
| `financing_monthly_eur` | Number | Monthly financing instalment when available. |
| `financing_term_months` | Number | Financing term in months. |
| `financing_down_payment_eur` | Number | Financing down payment. |
| `search_id` | String | Search-result batch identifier. |
| `page_number` | Number | Result page where the listing was found. |
| `fetched_at` | String | UTC timestamp for the collected record. |

## How to scrape Mobile.de data

1. Open Mobile.de and create a search with the filters you need, or use the structured filter fields below.
2. Optionally copy a public Mobile.de search results URL into `startUrl`. If omitted, the actor starts from the canonical Mobile.de vehicle search page.
3. Fill in `location`, `make`, `model`, `year`, `price`, and `country` when you want the actor to build the filtered URL.
4. Set `results_wanted` and `max_pages` for the size of the collection.
5. Run the Actor and review the dataset preview.
6. Download the results or connect the dataset to your workflow.

The actor accepts Mobile.de hosts such as `suchen.mobile.de`, `www.mobile.de`, and `m.mobile.de`, then normalizes the request to the canonical `suchen.mobile.de` search page. If `startUrl` is omitted, it starts from the canonical vehicle search page and builds one filtered search URL before the first request, including location, make, model, year, price, and country options. Make names are matched case-insensitively, accents and punctuation are normalized, and every current make exposed by Mobile.de's selector is converted to its numeric `ms` ID before fetching. For example, BMW becomes `ms=3500;;;`, Ford `ms=9000;;;`, Audi `ms=1900;;;`, Mercedes-Benz `ms=17200;;;`, Volkswagen `ms=25200;;;`, and Toyota `ms=24100;;;`. Numeric make and model IDs remain supported. Unknown text makes are rejected instead of becoming a broad text search. The same filtered URL is reused for pagination, with only `pageNumber` changing; the actor does not fetch broad pages and filter listings afterward. The structured result payload is read from each filtered search page while the same residential proxy session is reused across successful pages. If a page returns a challenge instead of structured results, the actor starts a fresh session, retries that page, and stops safely if it still cannot be fetched. The local `INPUT.json` file only provides a development fallback.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | Canonical vehicle search page | Optional public Mobile.de search results URL. Existing URL filters are preserved unless the corresponding option below is provided. If omitted, the actor builds the URL from the structured filters. |
| `location` | String | No | - | City or postal code, such as `Berlin` or `10115`. Uses Mobile.de's `gn` location filter. |
| `make` | String | No | `BMW` in the QA prefill | Any current Mobile.de make name or its numeric ID. Names are normalized and converted to exact `ms` filters; for example, BMW is `3500`, Ford is `9000`, Audi is `1900`, Mercedes-Benz is `17200`, Volkswagen is `25200`, and Toyota is `24100`. |
| `model` | String | No | - | Numeric Mobile.de model ID used with a numeric make ID, such as `10` for BMW 320. |
| `year` | String | No | - | First-registration year or range: `2020`, `2020:2024`, `:2024`, or `2020:`. |
| `price` | String | No | - | Gross price in EUR or range: `10000`, `10000:30000`, `:30000`, or `10000:`. |
| `country` | String | No | `DE` in the QA prefill | Seller country ISO code from Mobile.de's supported country selector (`DE` means Germany), such as `DE`, `AT`, `FR`, `GB`, or `US`. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to save. Accepted values range from `1` to `2000`. |
| `max_pages` | Integer | No | `50` | Maximum number of result pages to process. Accepted values range from `1` to `50`; the actor may raise a smaller value when more pages are needed for the requested result count. |
| `proxyConfiguration` | Object | No | Apify Residential Proxy in Germany on Apify runs | Optional proxy settings. A Germany residential configuration is recommended for larger or repeated collections. |

The `country` selector supports all country codes currently exposed by Mobile.de: `DE`, `EG`, `AL`, `AD`, `ET`, `BE`, `BA`, `BR`, `BG`, `DK`, `EE`, `FO`, `FI`, `FR`, `GR`, `GB`, `IE`, `IS`, `IL`, `IT`, `JP`, `JO`, `CA`, `HR`, `KW`, `LV`, `LB`, `LI`, `LT`, `LU`, `MT`, `MA`, `MK`, `MX`, `MD`, `MC`, `ME`, `NZ`, `NL`, `NG`, `NO`, `OM`, `AT`, `PL`, `PT`, `RO`, `RU`, `SM`, `SA`, `SE`, `CH`, `RS`, `SK`, `SI`, `ES`, `ZA`, `KR`, `TW`, `CZ`, `TN`, `TR`, `UA`, `HU`, `US`, `AE`, `BY`, and `CY`.

## Usage Examples

### Filtered BMW listing collection

Collect BMW 320 listings near Berlin, from selected registration years and price range, using Mobile.de's exact make/model IDs.

```json
{
  "startUrl": "https://suchen.mobile.de/fahrzeuge/search.html?isSearchRequest=true&s=Car&vc=Car",
  "location": "Berlin",
  "make": "3500",
  "model": "10",
  "year": "2020:2024",
  "price": "10000:30000",
  "country": "DE",
  "results_wanted": 20,
  "max_pages": 3
}
```

For exact results, use a make name or numeric ID; both produce the same exact filter. For example, `"make": "BMW"` and `"make": "3500"` produce `ms=3500;;;`, while `"make": "Mercedes Benz"` produces `ms=17200;;;`. For an exact BMW 320 search, use `"make": "BMW"` and `"model": "10"`. Mobile.de's exact model selector uses numeric IDs, while make names are resolved automatically from the current make catalog.

### Larger multi-page collection

Increase both limits when building a larger inventory dataset from the same saved search.

```json
{
  "startUrl": "https://suchen.mobile.de/fahrzeuge/search.html?dam=false&isSearchRequest=true&ms=3500%3B%3B%3B&ref=homeAISearch&s=Car&vc=Car",
  "results_wanted": 100,
  "max_pages": 10,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "DE"
  }
}
```

### Scheduled inventory monitoring

Create the model, price, mileage, and location filters on Mobile.de first, then use the resulting saved-search URL for a recurring monitoring run.

```json
{
  "startUrl": "https://suchen.mobile.de/fahrzeuge/search.html?dam=false&isSearchRequest=true&ms=3500%3B20%3B%3B&ref=srp&s=Car&vc=Car",
  "results_wanted": 200,
  "max_pages": 10,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "DE"
  }
}
```

## Sample Output

The following example shows one representative dataset item. Fields that are not published for a particular listing are omitted from that item.

```json
{
  "listing_id": 449843092,
  "title": "BMW M850 8 Coupe M850 i xDrive",
  "make": "BMW",
  "model": "M850",
  "category": "Sportwagen/Coupe",
  "vehicle_type": "topAd",
  "url": "https://suchen.mobile.de/fahrzeuge/details.html?id=449843092",
  "price_eur": 63611,
  "price_currency": "EUR",
  "first_registration": "01/2019",
  "registration_year": 2019,
  "mileage_km": 57211,
  "power_kw": 390,
  "power_ps": 530,
  "displacement_ccm": 4395,
  "fuel_type": "Benzin",
  "transmission": "Automatik",
  "body_type_code": "COUPE",
  "seller_name": "BMW AG Niederlassung Saar-Pfalz",
  "seller_type": "DEALER",
  "seller_rating_score": 4.8,
  "seller_rating_count": 126,
  "city": "Kirkel",
  "postal_code": "66459",
  "country_code": "DE",
  "image_url": "https://img.classistatic.de/api/v1/mo-prod/images/a1/a1111111-1111-1111-1111-111111111111?rule=mo-1024",
  "image_urls": [
    "https://img.classistatic.de/api/v1/mo-prod/images/a1/a1111111-1111-1111-1111-111111111111?rule=mo-1024",
    "https://img.classistatic.de/api/v1/mo-prod/images/b2/b2222222-2222-2222-2222-222222222222?rule=mo-200",
    "https://img.classistatic.de/api/v1/mo-prod/images/c3/c3333333-3333-3333-3333-333333333333?rule=mo-200",
    "https://img.classistatic.de/api/v1/mo-prod/images/d4/d4444444-4444-4444-4444-444444444444?rule=mo-200"
  ],
  "collected_images_count": 4,
  "images_count": 15,
  "has_video": false,
  "has_electric_engine": false,
  "is_eye_catcher": false,
  "financing_monthly_eur": 799,
  "financing_term_months": 48,
  "financing_down_payment_eur": 12722,
  "search_id": "740cb811-df7f-3499-033d-96e4b7f79fb7",
  "page_number": 1,
  "fetched_at": "2026-03-17T11:10:21.000Z"
}
```

## Tips for Best Results

- **Use a complete search URL** - Apply all important filters on Mobile.de before copying the results URL.
- **Start with a small run** - Test 20 listings and a few pages before increasing the collection size.
- **Preserve the URL** - Keep the same language, category, and filter parameters when comparing scheduled runs.
- **Use direct filter options** - Omit an option to keep its URL value, or provide `location`, `make`, `model`, `year`, `price`, or `country` to override that filter.
- **Use residential proxy settings** - Germany residential sessions are recommended for larger collections and repeated monitoring.
- **Match the limits to the goal** - `results_wanted` controls saved records, while `max_pages` controls how far the search is traversed.
- **Review source availability** - Seller phones, ratings, financing values, technical fields, and search-page preview images vary by listing. `images_count` is Mobile.de's announced total; `collected_images_count` is the number exposed in the search response.
- **Report changes** - Public marketplace pages can change. Use the Actor Issues tab when a field that was previously available stops appearing.

## Integrations and Export Formats

| Integration or format | Use |
|-----------------------|-----|
| Google Sheets | Review prices, inventory, sellers, and regional comparisons in a spreadsheet. |
| Airtable | Maintain a searchable vehicle and dealer database. |
| Webhooks | Notify another service when a run completes. |
| Make or Zapier | Trigger alerts, reports, enrichment, or follow-up workflows. |
| Apify API | Retrieve datasets programmatically for applications and scheduled jobs. |
| JSON | Feed structured records into applications, scripts, or AI workflows. |
| CSV | Analyze listings in spreadsheet software. |
| Excel | Share formatted vehicle research and inventory reports. |
| XML | Connect results to systems that require XML data. |

## Frequently Asked Questions

### Can I scrape a filtered Mobile.de search?

Yes. Create the filtered search on Mobile.de and provide the complete public results URL in `startUrl`. The actor keeps the URL filters while collecting the matching listings.

### How many listings can I collect?

You can request up to 2,000 saved listings per run. The result count is also limited by the listings available in the supplied search and the 50-page safety ceiling.

### Can I collect dealer and private-seller listings?

Yes. The dataset includes seller information when Mobile.de publishes it, including seller type, name, ratings, and phone number when available.

### Why are some fields missing?

Fields are missing when a listing or seller does not publish the corresponding information. The actor omits unavailable values instead of filling them with guesses.

### Why is a Germany residential proxy recommended?

Mobile.de can challenge repeated access, especially during larger or later-page collections. Germany residential sessions can improve run stability for recurring workflows.

### Can I run this Actor on a schedule?

Yes. Create an Apify schedule for hourly, daily, weekly, or another interval, then compare saved datasets for price and inventory changes.

### Can I export Mobile.de data to CSV or Excel?

Yes. Apify datasets can be downloaded as CSV, Excel, JSON, XML, and other supported formats.

### Is it legal to collect Mobile.de listings?

You are responsible for complying with Mobile.de terms, applicable laws, privacy requirements, and restrictions connected to your use of the data. Use public listing information responsibly, especially when seller contact details are included.

## Related Actors

- [Autotrader.ca Scraper](https://apify.com/shahidirfan/autotrader-scraper) - Collect vehicle listings, prices, mileage, seller details, VIN information, and images from Autotrader Canada.
- [IAAI Vehicles Scraper](https://apify.com/shahidirfan/iaai-vehicles-scraper) - Collect vehicle auction listings, lot information, condition data, damage details, and pricing from IAAI.
- [Bid.cars Scraper](https://apify.com/shahidirfan/bid-cars-scraper) - Collect vehicle auction details, current bids, sale timers, VINs, and seller information from Bid.cars.
- [Gumtree Scraper](https://apify.com/shahidirfan/gumtree-scraper) - Collect classified listings, including motors listings, with prices, locations, seller labels, descriptions, and media links.

## Support

For issues, field requests, or feature suggestions, use the Issues tab on the Actor page in Apify Console.

## Legal Notice

This Actor is intended for legitimate collection and analysis of publicly available vehicle listing information. Users are responsible for their search inputs, data use, privacy practices, compliance with applicable laws, and compliance with Mobile.de terms.
