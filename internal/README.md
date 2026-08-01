# Internal ops tools (not the marketing site)

Leave `index.html`, `styles.css`, `script.js`, and `terms.html` alone.

---

## Builder / agent buyers list

Paste an address in Cursor chat, e.g.:

`4521 Willow Creek Dr, Midlothian, VA 23112 — who built it?`

The **builder-lookup** skill finds the home builder + phone when possible; otherwise listing / local RE agents + phone. Confirmed contacts with a phone are appended to [`buyers-list.csv`](buyers-list.csv) (deduped by phone or company+zip).

### Reply shape

```
Address: 4521 Willow Creek Dr, Midlothian, VA 23112
ZIP: 23112
Type: builder
Name: —
Company: Example Homes LLC
Phone: (804) 555-0142
Source: https://…
Confidence: high
Notes: …
Ledger: appended
```

### Ledger

[`buyers-list.csv`](buyers-list.csv) columns:

`added_at, zip, address, contact_type, name, company, phone, source, confidence, notes`

Ask in chat to filter by zip (e.g. “show everyone in 23112”) when you want the aggregated list.

---

## Land Portal: land owners / sellers (not builders)

Separate workflow. Use Land Portal Saved Lists to pull **parcel owners / potential land sellers** (mailing addresses), not home builders.

Paid export is expensive; Saved Lists already show owner/parcel rows you can copy page by page. [`landportal-scrape/`](landportal-scrape/) opens [Saved Lists](https://landportal.com/saved_lists/), you pick the list, it pages through and saves the table.

**What the list has (no phones/emails):** acres, MLS acres, parcel id/address/city/zip, owner name, mailing address/city/state/zip, land use, zoning, building count/sqft, parcel sqft, rooms, structure year built, improvement value.

```bash
cd /Users/joel/Developer/ke-realty/internal/landportal-scrape
npm install
npm run scrape
```

1. Browser opens on `https://landportal.com/saved_lists/` (login stays in `.browser-profile/`).
2. Log in → open your saved list (~32 pages) → confirm the parcel table is visible.
3. Press Enter in the terminal — writes `internal/landportal-list-*.csv`.

Options:
```bash
npm run scrape -- --max-pages 40 --out ../land-owners.csv
npm run scrape -- --url 'https://landportal.com/saved_lists/...'   # deep link if you have one
```

**Note:** This only reads what your logged-in session already shows. Confirm it fits Land Portal’s terms for your account. Skip-trace phones still cost money on their side.
