import type { StockFinderResponse, StockShopResult } from "../src/lib/types";
import { normalizeName } from "../src/lib/woltParser";

// Best-effort "which Wolt shops stock my list" finder.
//
// IMPORTANT: this talks to Wolt's private consumer API. Wolt gates it by
// `client-version`, rate-limits aggressively, and can change it without notice.
// Everything here degrades gracefully: on any failure we return a clear
// `status: "unavailable"` rather than throwing, so the core app is never
// blocked. All the Wolt-specific request details live in this one file so they
// are easy to update when Wolt changes things.

const WOLT_SEARCH_URL = "https://consumer-api.wolt.com/v1/pages/search";

// Default location: central Malta. The frontend can override with the user's
// real delivery coordinates.
const DEFAULT_LAT = 35.8989;
const DEFAULT_LON = 14.5146;

// Tweak these in one place if Wolt starts rejecting requests.
function woltHeaders(): HeadersInit {
  return {
    accept: "application/json",
    "accept-language": "en",
    "app-language": "en",
    platform: "Web",
    "client-version": "1.13.0",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "w-wolt-session-id": crypto.randomUUID(),
  };
}

interface VenueHit {
  name: string;
  slug: string | null;
  price: number | null;
}

/**
 * Search Wolt for a single query string and return the venues that surfaced a
 * matching item. The response shape from Wolt varies, so we walk it defensively.
 */
async function searchItem(query: string, lat: number, lon: number): Promise<VenueHit[]> {
  const url = `${WOLT_SEARCH_URL}?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: woltHeaders() });
  if (!res.ok) {
    throw new Error(`wolt search ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  return extractVenueHits(data);
}

/** Walk an arbitrary Wolt response and pull out (venue name, slug, price) hits. */
function extractVenueHits(data: unknown): VenueHit[] {
  const hits: VenueHit[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;

    // Venue-shaped object?
    const venue = (obj.venue ?? obj) as Record<string, unknown>;
    const name = typeof venue.name === "string" ? venue.name : undefined;
    const slug = typeof venue.slug === "string" ? venue.slug : null;
    const hasVenueSignal = "slug" in venue || "venue" in obj || "venue_id" in obj;

    if (name && hasVenueSignal && !seen.has(name)) {
      seen.add(name);
      const price =
        typeof obj.price === "number"
          ? obj.price / 100 // Wolt prices are often in cents
          : typeof (obj.baseprice as number) === "number"
            ? (obj.baseprice as number) / 100
            : null;
      hits.push({ name, slug, price });
    }

    for (const v of Object.values(obj)) visit(v);
  };

  visit(data);
  return hits;
}

export async function findShopsForList(
  itemNames: string[],
  lat = DEFAULT_LAT,
  lon = DEFAULT_LON,
): Promise<StockFinderResponse> {
  const items = itemNames.map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) {
    return { status: "ok", queriedItems: [], shops: [] };
  }

  // venueName -> { matched items, summed price }
  const byVenue = new Map<string, { matched: Set<string>; slug: string | null; total: number }>();
  let failures = 0;

  // Sequential with a small delay to be gentle on Wolt's rate limiter.
  for (const item of items) {
    try {
      const hits = await searchItem(item, lat, lon);
      for (const hit of hits) {
        const entry = byVenue.get(hit.name) ?? { matched: new Set(), slug: hit.slug, total: 0 };
        entry.matched.add(normalizeName(item));
        if (hit.price) entry.total += hit.price;
        byVenue.set(hit.name, entry);
      }
    } catch {
      failures += 1;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (failures === items.length) {
    return {
      status: "unavailable",
      message:
        "Couldn't reach Wolt right now (it rate-limits/guards this). The rest of the app is unaffected — try again in a bit.",
      queriedItems: items,
      shops: [],
    };
  }

  const normItems = items.map(normalizeName);
  const shops: StockShopResult[] = [...byVenue.entries()]
    .map(([venueName, e]): StockShopResult => {
      const matchedItems = [...e.matched];
      const missingItems = normItems.filter((n) => !e.matched.has(n));
      return {
        venueName,
        venueSlug: e.slug,
        matchedItems,
        missingItems,
        coverage: matchedItems.length / normItems.length,
        estimatedTotal: e.total > 0 ? Math.round(e.total * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, 15);

  return {
    status: failures > 0 ? "partial" : "ok",
    message:
      failures > 0
        ? `${failures} of ${items.length} item lookups failed (Wolt throttling). Results are partial.`
        : undefined,
    queriedItems: items,
    shops,
  };
}
