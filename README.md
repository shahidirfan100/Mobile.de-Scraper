# Mobile.de Vehicle Scraper

Extract vehicle listing data from Mobile.de search result pages at scale. Collect core listing details like title, make, model, price, mileage, seller info, and listing URLs in a clean dataset. Built for research, monitoring, lead generation, and market analysis workflows.

## Features

- **Search URL support** - Start directly from a prepared Mobile.de search URL.
- **Keyword-based search** - Build a search from keyword when no start URL is provided.
- **Pagination handling** - Automatically collects across multiple result pages.
- **Clean output records** - Removes null and empty values from dataset items.
- **Rich listing details** - Includes pricing, specs, seller profile, full image URL list, and metadata.

## Use Cases

### Market Price Tracking
Monitor asking prices over time for specific brands, models, and trims. Build historical datasets for pricing trends and valuation benchmarks.

### Deal Discovery
Find listings with target criteria such as mileage, fuel type, or seller type. Use structured outputs to filter and rank opportunities quickly.

### Competitor Monitoring
Track inventory and offer positioning across dealers and private sellers. Compare listing quality, pricing, and changes across pages.

### Automotive Research
Create datasets for analytics, dashboards, and reporting pipelines. Export clean records ready for BI tools and custom workflows.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | Mobile.de BMW search URL | Mobile.de search URL to scrape directly. |
| `keyword` | String | No | `"bmw"` | Search keyword used when `startUrl` is not provided. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to collect. |
| `max_pages` | Integer | No | `3` | Maximum number of pages to process. |
| `proxyConfiguration` | Object | No | `{"useApifyProxy": true}` | Proxy setup for improved reliability. |

---

## Output Data

Each dataset item contains listing details such as:

| Field | Type | Description |
|-------|------|-------------|
| `listing_id` | Number | Unique listing identifier. |
| `title` | String | Full listing title. |
| `make` | String | Vehicle make. |
| `model` | String | Vehicle model. |
| `price_eur` | Number | Numeric gross price in EUR. |
| `first_registration` | String | First registration value. |
| `mileage_km` | Number | Parsed mileage value. |
| `power_ps` | Number | Engine power in PS. |
| `fuel_type` | String | Fuel type. |
| `transmission` | String | Transmission type. |
| `seller_name` | String | Seller display name. |
| `seller_type` | String | Seller category. |
| `seller_rating_score` | Number | Seller rating score. |
| `collected_images_count` | Number | Number of image URLs collected from search payload. |
| `images_count` | Number | Number of images announced for the listing. |
| `image_url` | String | Primary image URL. |
| `image_urls` | Array | All collected image URLs for the listing. |
| `city` | String | Listing location city. |
| `url` | String | Detail page URL. |
| `page_number` | Number | Result page where listing was found. |
| `fetched_at` | String | Extraction timestamp. |

---

## Usage Examples

### Basic Run With Start URL

```json
{
    "startUrl": "https://suchen.mobile.de/fahrzeuge/search.html?dam=false&isSearchRequest=true&ms=3500%3B%3B%3B&ref=homeAISearch&s=Car&userInput=bmw&vc=Car",
    "results_wanted": 20,
    "max_pages": 3
}
```

### Keyword-Based Collection

```json
{
    "keyword": "bmw",
    "results_wanted": 50,
    "max_pages": 5
}
```

---

## Sample Output

```json
{
    "listing_id": 449843092,
    "title": "BMW M850 8 Coupe M850 i xDrive",
    "make": "BMW",
    "model": "M850",
    "category": "Sportwagen/Coupe",
    "vehicle_type": "topAd",
    "price_eur": 63611,
    "first_registration": "01/2019",
    "mileage_km": 57211,
    "power_ps": 530,
    "fuel_type": "Benzin",
    "transmission": "Automatik",
    "seller_name": "BMW AG Niederlassung Saar-Pfalz",
    "seller_type": "DEALER",
    "seller_rating_score": 4.8,
    "collected_images_count": 16,
    "images_count": 50,
    "image_url": "https://img.classistatic.de/api/v1/mo-prod/images/a1/a1111111-1111-1111-1111-111111111111?rule=mo-160w",
    "image_urls": [
        "https://img.classistatic.de/api/v1/mo-prod/images/a1/a1111111-1111-1111-1111-111111111111?rule=mo-160w",
        "https://img.classistatic.de/api/v1/mo-prod/images/a1/a1111111-1111-1111-1111-111111111111?rule=mo-360w"
    ],
    "city": "Kirkel",
    "url": "https://suchen.mobile.de/fahrzeuge/details.html?id=449843092",
    "page_number": 1,
    "fetched_at": "2026-03-17T11:10:21.000Z"
}
```

---

## Tips for Best Results

### Use Strong Search URLs
- Start from a tested search URL that already reflects your filters.
- Keep language and category parameters consistent across runs.

### Control Run Size
- Start with `results_wanted: 20` for quick checks.
- Increase page and result limits only after validating output quality.

### Improve Stability
- Use proxy configuration for larger runs.
- Schedule smaller frequent runs instead of one very large collection.

---

## Integrations

Connect your data with:

- **Google Sheets** - Build quick reports and live tracking tables.
- **Airtable** - Create searchable listing databases.
- **Make** - Automate enrichment and notifications.
- **Zapier** - Trigger downstream actions from fresh listings.
- **Webhooks** - Send data to custom services and APIs.

### Export Formats

- **JSON** - Best for developers and automation pipelines.
- **CSV** - Easy spreadsheet analysis.
- **Excel** - Business reporting and sharing.
- **XML** - Legacy system integration.

---

## Frequently Asked Questions

### How many listings can I collect?
You can collect as many as available in search results, limited by your `results_wanted` and `max_pages` settings.

### Can I scrape multiple brands?
Yes. Run separate searches per brand or pass different search URLs for each run.

### Why are some fields missing in some items?
Not every listing provides every field. The actor keeps only values that exist for each record.

### Does this support dealer and private listings?
Yes. Output includes seller information where available.

### Can I run this on a schedule?
Yes. Use Apify scheduling to run hourly, daily, or weekly based on your monitoring needs.

---

## Support

For issues or feature requests, use your Apify actor issue workflow.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Schedules](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for lawful data collection and analysis. You are responsible for complying with website terms, local regulations, and applicable privacy laws. Use extracted data responsibly.
