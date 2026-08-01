/**
 * Land Portal Saved List pager → CSV
 *
 * For LAND OWNERS / SELLERS outreach (not builders).
 * Opens https://landportal.com/saved_lists/, you pick the list, then this
 * scrapes the free on-screen parcel/owner table across all pages.
 *
 * Expected columns (what the list shows):
 *   ACRES, MLS ACRES, PARCEL ID, PARCEL ADDRESS, PARCEL ADDRESS CITY,
 *   PARCEL ADDRESS ZIP CODE, OWNER NAME, MAILING ADDRESS,
 *   MAILING ADDRESS CITY, MAILING ADDRESS STATE, MAILING ADDRESS ZIP CODE,
 *   LAND USE CODE, ZONING CODE, BUILDING COUNT, BUILDING SQFT, PARCEL SQFT,
 *   NUMBER OF ROOMS, STRUCTURE YEAR BUILT, IMPROVEMENT VALUE
 *
 * Usage:
 *   cd internal/landportal-scrape
 *   npm install
 *   npm run scrape
 *   npm run scrape -- --out ../land-owners.csv --max-pages 40
 *   npm run scrape -- --url 'https://landportal.com/saved_lists/...'
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Canonical List View columns (output CSV header order). */
export const LIST_COLUMNS = [
  "ACRES",
  "MLS ACRES",
  "PARCEL ID",
  "PARCEL ADDRESS",
  "PARCEL ADDRESS CITY",
  "PARCEL ADDRESS ZIP CODE",
  "OWNER NAME",
  "MAILING ADDRESS",
  "MAILING ADDRESS CITY",
  "MAILING ADDRESS STATE",
  "MAILING ADDRESS ZIP CODE",
  "LAND USE CODE",
  "ZONING CODE",
  "BUILDING COUNT",
  "BUILDING SQFT",
  "PARCEL SQFT",
  "NUMBER OF ROOMS",
  "STRUCTURE YEAR BUILT",
  "IMPROVEMENT VALUE",
];

/** Common API / alternate header aliases → canonical column. */
const HEADER_ALIASES = {
  acres: "ACRES",
  mlsacres: "MLS ACRES",
  "mlsacres": "MLS ACRES",
  parcelid: "PARCEL ID",
  apn: "PARCEL ID",
  parcelnumb: "PARCEL ID",
  parcelnumber: "PARCEL ID",
  parceladdress: "PARCEL ADDRESS",
  situsfullstreetaddress: "PARCEL ADDRESS",
  situsaddress: "PARCEL ADDRESS",
  parceladdresscity: "PARCEL ADDRESS CITY",
  situscity: "PARCEL ADDRESS CITY",
  parceladdresszipcode: "PARCEL ADDRESS ZIP CODE",
  parceladdresszip: "PARCEL ADDRESS ZIP CODE",
  situszip: "PARCEL ADDRESS ZIP CODE",
  ownername: "OWNER NAME",
  ownername1full: "OWNER NAME",
  owner: "OWNER NAME",
  mailingaddress: "MAILING ADDRESS",
  mailingfullstreetaddress: "MAILING ADDRESS",
  mailingaddresscity: "MAILING ADDRESS CITY",
  mailingcity: "MAILING ADDRESS CITY",
  mailingaddressstate: "MAILING ADDRESS STATE",
  mailingstate: "MAILING ADDRESS STATE",
  mailingaddresszipcode: "MAILING ADDRESS ZIP CODE",
  mailingaddresszip: "MAILING ADDRESS ZIP CODE",
  mailingzip: "MAILING ADDRESS ZIP CODE",
  landusecode: "LAND USE CODE",
  landuse: "LAND USE CODE",
  usecode: "LAND USE CODE",
  zoningcode: "ZONING CODE",
  zoning: "ZONING CODE",
  buildingcount: "BUILDING COUNT",
  buildingsqft: "BUILDING SQFT",
  parcelsqft: "PARCEL SQFT",
  lotsizeacres: "ACRES",
  numberofrooms: "NUMBER OF ROOMS",
  structureyearbuilt: "STRUCTURE YEAR BUILT",
  yearbuilt: "STRUCTURE YEAR BUILT",
  improvementvalue: "IMPROVEMENT VALUE",
};

function parseArgs(argv) {
  const args = {
    out: path.join(__dirname, "..", `landportal-list-${stamp()}.csv`),
    maxPages: 40,
    headed: true,
    profile: path.join(__dirname, ".browser-profile"),
    // Saved Lists hub — open the specific list inside the browser after login
    url: "https://landportal.com/saved_lists/",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = path.resolve(argv[++i]);
    else if (a === "--max-pages") args.maxPages = Number(argv[++i]) || 100;
    else if (a === "--headless") args.headed = false;
    else if (a === "--profile") args.profile = path.resolve(argv[++i]);
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scrape-list.mjs [--out file.csv] [--max-pages N] [--url URL] [--profile DIR]

1. Browser opens on Saved Lists (https://landportal.com/saved_lists/).
2. Log in if needed, open the saved list you want (~32 pages), List View.
3. Return here and press Enter — scraping starts on the current page.

Pass --url if you have a deep link to one saved list.`);
      process.exit(0);
    }
  }
  return args;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function normKey(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function aliasKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Map a raw header label to a canonical LIST_COLUMNS name when possible. */
function canonicalizeHeader(raw) {
  const spaced = normKey(raw);
  const exact = LIST_COLUMNS.find((c) => normKey(c) === spaced);
  if (exact) return exact;
  const aliased = HEADER_ALIASES[aliasKey(raw)];
  if (aliased) return aliased;
  return spaced || raw;
}

/** Remap a row's keys onto LIST_COLUMNS (+ any extras appended). */
function normalizeRow(row) {
  const out = {};
  for (const col of LIST_COLUMNS) out[col] = "";
  const extras = {};
  for (const [k, v] of Object.entries(row)) {
    const canon = canonicalizeHeader(k);
    if (LIST_COLUMNS.includes(canon)) out[canon] = v ?? "";
    else extras[canon] = v ?? "";
  }
  return { ...out, ...extras };
}

function outputHeaders(rows) {
  const extras = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!LIST_COLUMNS.includes(k)) extras.add(k);
    }
  }
  return [...LIST_COLUMNS, ...extras];
}

function rowKey(row) {
  const id = row["PARCEL ID"] || "";
  if (id) return `id:${id}`;
  return [
    row["PARCEL ADDRESS"],
    row["OWNER NAME"],
    row["MAILING ADDRESS"],
    row["STRUCTURE YEAR BUILT"],
  ].join("|");
}

/** Extract Saved List rows from Land Portal's list-view-grid markup. */
async function extractPageRows(page) {
  return page.evaluate((listColumns) => {
    const normalize = (t) => (t || "").replace(/\s+/g, " ").trim();
    const normKey = (s) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

    const expectedSet = new Set(listColumns.map(normKey));
    const headerScore = (headers) =>
      headers.reduce((n, h) => n + (expectedSet.has(normKey(h)) ? 1 : 0), 0);

    const rowToObj = (headers, cells) => {
      const obj = {};
      const width = Math.max(headers.length, cells.length);
      for (let i = 0; i < width; i++) {
        const h = headers[i] || listColumns[i] || `col_${i + 1}`;
        obj[h] = cells[i] ?? "";
      }
      return obj;
    };

    // Land Portal Saved Lists: <p class="list-view-row"> + <span class="list-view-cell">
    const grid =
      document.querySelector(".saved-lists__properties-data.list-view-grid-wr") ||
      document.querySelector(".list-view-grid-wr") ||
      document.querySelector(".saved-lists__properties-data");

    if (grid) {
      const rowEls = [...grid.querySelectorAll("p.list-view-row, .list-view-row")];
      let headers = null;
      const dataCells = [];

      for (const row of rowEls) {
        // Skip checkbox column (first cell is usually export checkbox)
        const rawCells = [...row.querySelectorAll(".list-view-cell")].map((c) =>
          normalize(c.innerText)
        );
        if (!rawCells.length) continue;

        let cells = rawCells;
        // Drop leading empty checkbox column when present
        if (cells.length === listColumns.length + 1 && cells[0] === "") {
          cells = cells.slice(1);
        } else if (
          cells.length > listColumns.length &&
          row.querySelector(".export-checkbox, input[type='checkbox']")
        ) {
          cells = cells.slice(1);
        }

        if (row.classList.contains("row-header") || headerScore(cells) >= 8) {
          headers = cells;
          continue;
        }
        if (!cells.some(Boolean)) continue;
        dataCells.push(cells);
      }

      if (dataCells.length) {
        const useHeaders =
          headers && headerScore(headers) >= 8 ? headers : listColumns;
        return {
          headers: useHeaders,
          rows: dataCells.map((cells) => rowToObj(useHeaders, cells)),
          score: headerScore(useHeaders),
          source: "list-view-grid",
        };
      }

      return {
        headers: [],
        rows: [],
        score: 0,
        source: "list-view-grid-empty",
        debug: {
          gridFound: true,
          rowEls: rowEls.length,
        },
      };
    }

    return {
      headers: [],
      rows: [],
      score: 0,
      source: "none",
      debug: {
        gridFound: false,
        listViewRows: document.querySelectorAll(".list-view-row").length,
        tables: document.querySelectorAll("table").length,
      },
    };
  }, LIST_COLUMNS);
}

async function clickNext(page) {
  // Land Portal: <span class="arrow arrow-next">Next</span>
  const next = page.locator("span.arrow-next, .arrow.arrow-next").first();
  if (await next.count()) {
    const visible = await next.isVisible().catch(() => false);
    const visStyle = await next.evaluate((n) => {
      const s = window.getComputedStyle(n);
      return {
        visibility: s.visibility,
        display: s.display,
        pointerEvents: s.pointerEvents,
      };
    }).catch(() => ({}));

    if (visStyle.visibility === "hidden" || visStyle.display === "none") {
      return { clicked: false, reason: "next-hidden" };
    }

    await next.scrollIntoViewIfNeeded().catch(() => null);
    await next.click({ timeout: 5000 }).catch(async () => {
      await next.click({ force: true, timeout: 5000 });
    });
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null);
    return { clicked: true, via: "arrow-next" };
  }

  // Fallback: click next page number in .list-view-pagination / ul pages
  const pageClicked = await page.evaluate(() => {
    const norm = (t) => (t || "").replace(/\s+/g, " ").trim();
    const pages = [
      ...document.querySelectorAll(
        ".list-view-pagination li.page, .list-view-pag li.page, li.page"
      ),
    ];
    let current = null;
    for (const el of pages) {
      const cls = (el.className || "").toString().toLowerCase();
      if (/active|selected|current/.test(cls)) {
        current = parseInt(norm(el.textContent), 10);
        break;
      }
    }
    if (current == null) return null;
    const target = pages.find((el) => norm(el.textContent) === String(current + 1));
    if (!target) return null;
    target.click();
    return current + 1;
  });

  if (pageClicked) {
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null);
    return { clicked: true, via: `page-${pageClicked}` };
  }

  return { clicked: false, reason: "no-next-control" };
}

function mapNetworkItem(item) {
  const flat = flatten(item);
  const raw = {};
  for (const [k, v] of Object.entries(flat)) {
    raw[k] = v == null ? "" : String(v);
  }
  return normalizeRow(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.profile, { recursive: true });

  const context = await chromium.launchPersistentContext(args.profile, {
    headless: !args.headed,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });
  const page = context.pages()[0] || (await context.newPage());

  const networkRows = [];
  page.on("response", async (res) => {
    try {
      const url = res.url();
      if (!/landportal\.com/i.test(url)) return;
      if (!/filter|list|propert|search|saved|parcel|owner/i.test(url)) return;
      const ct = res.headers()["content-type"] || "";
      if (!ct.includes("json")) return;
      const json = await res.json().catch(() => null);
      if (!json) return;
      const maybe =
        json?.data?.properties ||
        json?.properties ||
        json?.data?.results ||
        json?.results ||
        json?.data?.items ||
        json?.items ||
        (Array.isArray(json?.data) ? json.data : null);
      if (Array.isArray(maybe) && maybe.length && typeof maybe[0] === "object") {
        for (const item of maybe) networkRows.push(item);
      }
    } catch {
      /* ignore */
    }
  });

  await page.goto(args.url, { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input, output });
  console.log(`
Land Portal saved-list scraper — LAND OWNERS / SELLERS (not builders)
--------------------------------------------------------------------
Opened: ${args.url}

Columns: OWNER NAME, PARCEL / MAILING ADDRESS, YEAR BUILT, etc.
(No phones/emails — mailing addresses for seller outreach.)

1. Log in if needed.
2. Open the saved list you want (e.g. Gastonia — ~32 pages).
3. Wait until you see the table headers (Acres, Parcel ID, Owner Name…).
4. Scroll to the bottom once so pagination (1 2 … 32 Next) is visible.
5. Press Enter here to scrape all pages.
`);
  await rl.question("Press Enter when that saved list table is ready… ");

  // Ensure grid is present before first extract
  await page.locator(".list-view-row").first().waitFor({ timeout: 20000 }).catch(() => null);
  await page.locator(".arrow-next").first().scrollIntoViewIfNeeded().catch(() => null);
  await page.waitForTimeout(500);

  const allRows = [];
  const seen = new Set();
  let pages = 0;
  let stagnant = 0;

  while (pages < args.maxPages) {
    pages += 1;
    const extracted = await extractPageRows(page);
    const { rows, source, score, debug } = extracted;
    console.log(
      `Page ${pages}: ${rows.length} row(s) via ${source}` +
        (score != null ? ` (header match ${score}/${LIST_COLUMNS.length})` : "")
    );
    if (debug && !rows.length) {
      console.log("  debug:", JSON.stringify(debug));
    }

    if (!rows.length) {
      stagnant += 1;
      if (stagnant >= 2) {
        console.log("No rows found twice in a row — stopping.");
        break;
      }
    } else {
      stagnant = 0;
      let added = 0;
      for (const raw of rows) {
        const row = normalizeRow(raw);
        const k = rowKey(row);
        if (seen.has(k)) continue;
        seen.add(k);
        allRows.push(row);
        added += 1;
      }
      console.log(`  +${added} new (total ${allRows.length})`);
      if (added === 0) {
        stagnant += 1;
        if (stagnant >= 2) {
          console.log("Duplicate pages — likely finished.");
          break;
        }
      }
    }

    const next = await clickNext(page);
    if (!next.clicked) {
      console.log(`Stop: ${next.reason || "end of list"}`);
      break;
    }
    if (next.via) console.log(`  advanced via ${next.via}`);
    // Wait for table to refresh
    await page.waitForTimeout(800);
  }

  let rows = allRows;

  if (!rows.length && networkRows.length) {
    console.log(`DOM empty — mapping ${networkRows.length} network JSON objects.`);
    const uniq = new Map();
    for (const item of networkRows) {
      const row = mapNetworkItem(item);
      uniq.set(rowKey(row), row);
    }
    rows = [...uniq.values()];
  }

  if (!rows.length) {
    const dumpPath = args.out.replace(/\.csv$/i, ".debug.html");
    const html = await page.content();
    fs.writeFileSync(dumpPath, html, "utf8");
    console.error(`
No rows captured. Saved page HTML → ${dumpPath}
Tips:
- Confirm the Gastonia (or target) list table is open with Owner Name visible.
- Scroll so pagination shows: 1 2 … 32 Next
- Re-run after the table fully loads.
`);
    await rl.question("Press Enter to close the browser… ");
    rl.close();
    await context.close();
    process.exit(1);
  }

  const headers = outputHeaders(rows);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, rowsToCsv(headers, rows), "utf8");
  console.log(`\nWrote ${rows.length} rows → ${args.out}`);
  console.log(
    `Unique owners (approx): ${new Set(rows.map((r) => r["OWNER NAME"]).filter(Boolean)).size}`
  );

  if (networkRows.length) {
    const netPath = args.out.replace(/\.csv$/i, ".network.json");
    fs.writeFileSync(netPath, JSON.stringify(networkRows, null, 2));
    console.log(`Also saved raw network hits → ${netPath}`);
  }

  await rl.question("Press Enter to close the browser… ");
  rl.close();
  await context.close();
}

function flatten(obj, prefix = "", out = {}) {
  if (obj == null) return out;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix || "value"] = Array.isArray(obj) ? JSON.stringify(obj) : obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
