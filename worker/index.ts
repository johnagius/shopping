import { Hono } from "hono";
import { normalizeName } from "../src/lib/woltParser";
import { categorize } from "../src/lib/categorize";
import type { ParsedOrder } from "../src/lib/types";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const api = new Hono<{ Bindings: Env }>();

/** Find a catalog id for a normalised name, if one exists. */
async function findCatalogId(db: D1Database, normName: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM catalog_items WHERE norm_name = ?")
    .bind(normName)
    .first<{ id: number }>();
  return row?.id ?? null;
}

/** Add an item to the shopping list, merging quantity into an existing unchecked row. */
async function addToList(
  db: D1Database,
  name: string,
  quantity: number,
  note: string | null,
) {
  const norm = normalizeName(name);
  const catalogId = await findCatalogId(db, norm);
  const existing = await db
    .prepare("SELECT id, quantity FROM shopping_list WHERE norm_name = ? AND checked = 0 LIMIT 1")
    .bind(norm)
    .first<{ id: number; quantity: number }>();

  if (existing) {
    await db
      .prepare("UPDATE shopping_list SET quantity = ? WHERE id = ?")
      .bind(existing.quantity + quantity, existing.id)
      .run();
    return existing.id;
  }

  const res = await db
    .prepare(
      "INSERT INTO shopping_list (name, norm_name, quantity, note, catalog_id, category) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(name, norm, quantity, note, catalogId, categorize(name))
    .run();
  return res.meta.last_row_id;
}

// ---- Shopping list ----

api.get("/list", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, c.last_price AS last_price, c.last_shop AS last_shop
     FROM shopping_list s
     LEFT JOIN catalog_items c ON s.catalog_id = c.id
     ORDER BY s.checked ASC, s.created_at ASC`,
  ).all();
  return c.json(results);
});

api.post("/list", async (c) => {
  const body = await c.req.json<{ name: string; quantity?: number; note?: string }>();
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const id = await addToList(c.env.DB, body.name.trim(), body.quantity ?? 1, body.note ?? null);
  return c.json({ id }, 201);
});

api.patch("/list/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    quantity?: number;
    checked?: boolean;
    note?: string;
    category?: string;
  }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.quantity !== undefined) {
    sets.push("quantity = ?");
    vals.push(body.quantity);
  }
  if (body.checked !== undefined) {
    sets.push("checked = ?");
    vals.push(body.checked ? 1 : 0);
  }
  if (body.note !== undefined) {
    sets.push("note = ?");
    vals.push(body.note);
  }
  if (body.category !== undefined) {
    sets.push("category = ?");
    vals.push(body.category);
  }
  if (sets.length === 0) return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE shopping_list SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();

  // A category correction should stick for next time: update the catalog too.
  if (body.category !== undefined) {
    await c.env.DB.prepare(
      `UPDATE catalog_items SET category = ?, updated_at = datetime('now')
       WHERE norm_name = (SELECT norm_name FROM shopping_list WHERE id = ?)`,
    )
      .bind(body.category, id)
      .run();
  }
  return c.json({ ok: true });
});

api.delete("/list/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM shopping_list WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

api.post("/list/clear-checked", async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM shopping_list WHERE checked = 1").run();
  return c.json({ deleted: res.meta.changes ?? 0 });
});

api.post("/list/reorder", async (c) => {
  const body = await c.req.json<{
    orderId?: number;
    items?: { name: string; quantity?: number }[];
  }>();

  let items: { name: string; quantity: number }[] = [];
  if (body.orderId) {
    const { results } = await c.env.DB.prepare(
      "SELECT name, quantity FROM order_items WHERE order_id = ? AND is_fee = 0",
    )
      .bind(body.orderId)
      .all<{ name: string; quantity: number }>();
    items = results.map((r) => ({ name: r.name, quantity: r.quantity }));
  } else if (body.items) {
    items = body.items.map((i) => ({ name: i.name, quantity: i.quantity ?? 1 }));
  }

  for (const it of items) {
    await addToList(c.env.DB, it.name, it.quantity, null);
  }
  return c.json({ added: items.length });
});

// ---- Catalog (reselect past items) ----

api.get("/catalog", async (c) => {
  const q = c.req.query("q");
  if (q) {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM catalog_items WHERE norm_name LIKE ?
       ORDER BY order_count DESC, last_ordered_at DESC LIMIT 50`,
    )
      .bind(`%${normalizeName(q)}%`)
      .all();
    return c.json(results);
  }
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM catalog_items ORDER BY order_count DESC, last_ordered_at DESC LIMIT 200",
  ).all();
  return c.json(results);
});

// ---- Orders ----

api.get("/orders", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.*, SUM(CASE WHEN oi.is_fee = 0 THEN 1 ELSE 0 END) AS item_count
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     GROUP BY o.id ORDER BY o.created_at DESC`,
  ).all();
  return c.json(results);
});

api.get("/orders/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const order = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!order) return c.json({ error: "not found" }, 404);
  const { results: items } = await c.env.DB.prepare(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC",
  )
    .bind(id)
    .all();
  return c.json({ ...order, items });
});

api.post("/orders/import", async (c) => {
  const o = await c.req.json<ParsedOrder>();
  const db = c.env.DB;

  const orderRes = await db
    .prepare(
      `INSERT INTO orders
        (shop_name, shop_address, order_number, wolt_order_id, placed_at, ordered_on, delivered_at,
         delivery_address, subtotal, service_fee, delivery_fee, bag_charge, total, currency, raw_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      o.shopName,
      o.shopAddress,
      o.orderNumber,
      o.woltOrderId,
      o.placedAt,
      o.placedOn,
      o.deliveredAt,
      o.deliveryAddress,
      o.subtotal,
      o.serviceFee,
      o.deliveryFee,
      o.bagCharge,
      o.total,
      o.currency || "EUR",
      o.rawText ?? null,
    )
    .run();
  const orderId = orderRes.meta.last_row_id;

  for (const it of o.items) {
    // Skip items that were ordered but not delivered/charged.
    if (it.notIncluded) continue;
    const norm = normalizeName(it.name);
    let catalogId: number | null = null;

    if (!it.isFee) {
      // Upsert into the catalog so the item is reorderable later.
      await db
        .prepare(
          `INSERT INTO catalog_items (name, norm_name, category, last_price, last_shop, last_ordered_at, order_count)
           VALUES (?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(norm_name) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             last_price = excluded.last_price,
             last_shop = excluded.last_shop,
             last_ordered_at = excluded.last_ordered_at,
             order_count = catalog_items.order_count + 1,
             updated_at = datetime('now')`,
        )
        .bind(it.name, norm, categorize(it.name), it.unitPrice, o.shopName, o.placedAt ?? o.deliveredAt)
        .run();
      catalogId = await findCatalogId(db, norm);
    }

    await db
      .prepare(
        `INSERT INTO order_items
          (order_id, name, norm_name, unit_price, quantity, line_total, substitution_for, is_fee, catalog_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        orderId,
        it.name,
        norm,
        it.unitPrice,
        it.quantity,
        it.lineTotal,
        it.substitutionFor ?? null,
        it.isFee ? 1 : 0,
        catalogId,
      )
      .run();
  }

  const storedCount = o.items.filter((it) => !it.isFee && !it.notIncluded).length;
  return c.json({ id: orderId, items: storedCount }, 201);
});

// ---- "Where to buy": match the list against shops you've ordered from ----
//
// Reliable & offline: as you import receipts, each shop's assortment (and the
// price it charged per item) is learned. This ranks shops by how much of your
// current list they've historically carried.

api.get("/where-to-buy", async (c) => {
  const db = c.env.DB;

  // Current unchecked list.
  const { results: list } = await db
    .prepare("SELECT name, norm_name, quantity FROM shopping_list WHERE checked = 0")
    .all<{ name: string; norm_name: string; quantity: number }>();

  if (list.length === 0) {
    return c.json({ queriedItems: [], shops: [] });
  }
  const qtyByNorm = new Map(list.map((l) => [l.norm_name, l.quantity]));

  // Every (shop, item, latest price) we've ever seen.
  const { results: rows } = await db
    .prepare(
      `SELECT o.shop_name AS shop, oi.norm_name AS norm, oi.name AS name,
              oi.unit_price AS price, o.created_at AS at
       FROM order_items oi JOIN orders o ON oi.order_id = o.id
       WHERE oi.is_fee = 0 AND o.shop_name IS NOT NULL`,
    )
    .all<{ shop: string; norm: string; name: string; price: number | null; at: string }>();

  // shop -> norm -> { price, at }
  const shops = new Map<string, Map<string, { price: number | null; at: string }>>();
  for (const r of rows) {
    const m = shops.get(r.shop) ?? new Map();
    const prev = m.get(r.norm);
    if (!prev || r.at > prev.at) m.set(r.norm, { price: r.price, at: r.at });
    shops.set(r.shop, m);
  }

  const listNorms = list.map((l) => l.norm_name);
  const result = [...shops.entries()]
    .map(([shop, items]) => {
      const matched = listNorms.filter((n) => items.has(n));
      const missing = list.filter((l) => !items.has(l.norm_name)).map((l) => l.name);
      const estimatedTotal = matched.reduce((sum, n) => {
        const p = items.get(n)?.price ?? 0;
        return sum + p * (qtyByNorm.get(n) ?? 1);
      }, 0);
      return {
        venueName: shop,
        matchedItems: matched,
        missingItems: missing,
        coverage: matched.length / listNorms.length,
        estimatedTotal: estimatedTotal > 0 ? Math.round(estimatedTotal * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.coverage - a.coverage || (a.estimatedTotal ?? 1e9) - (b.estimatedTotal ?? 1e9));

  return c.json({ queriedItems: list.map((l) => l.name), shops: result });
});

// ---- "You usually buy these" suggestions ----

api.get("/suggestions", async (c) => {
  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT c.* FROM catalog_items c
       WHERE c.norm_name NOT IN (SELECT norm_name FROM shopping_list WHERE checked = 0)
       ORDER BY c.order_count DESC, c.last_ordered_at DESC
       LIMIT 12`,
    )
    .all();
  return c.json(results);
});

// ---- Restock predictions (learns how often you buy each item) ----

api.get("/restock", async (c) => {
  const db = c.env.DB;
  const today = new Date().toISOString().slice(0, 10);

  // All purchase dates per item, excluding anything already on the list.
  const { results } = await db
    .prepare(
      `SELECT oi.norm_name AS norm, oi.name AS name, c.category AS category,
              c.last_price AS price, c.last_shop AS shop, o.ordered_on AS on_date
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN catalog_items c ON c.norm_name = oi.norm_name
       WHERE oi.is_fee = 0 AND o.ordered_on IS NOT NULL
         AND oi.norm_name NOT IN (SELECT norm_name FROM shopping_list WHERE checked = 0)`,
    )
    .all<{
      norm: string;
      name: string;
      category: string | null;
      price: number | null;
      shop: string | null;
      on_date: string;
    }>();

  // Group by item.
  const byItem = new Map<
    string,
    { name: string; category: string | null; price: number | null; shop: string | null; dates: Set<string> }
  >();
  for (const r of results) {
    const e =
      byItem.get(r.norm) ??
      { name: r.name, category: r.category, price: r.price, shop: r.shop, dates: new Set<string>() };
    e.dates.add(r.on_date);
    byItem.set(r.norm, e);
  }

  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

  const items = [...byItem.entries()]
    .map(([norm, e]) => {
      const dates = [...e.dates].sort();
      const timesOrdered = dates.length;
      const lastOrdered = dates[dates.length - 1];
      const daysSinceLast = daysBetween(lastOrdered, today);

      // Average interval needs at least two distinct purchase dates.
      let avgIntervalDays: number | null = null;
      if (timesOrdered >= 2) {
        let sum = 0;
        for (let i = 1; i < dates.length; i++) sum += daysBetween(dates[i - 1], dates[i]);
        avgIntervalDays = Math.max(1, Math.round(sum / (dates.length - 1)));
      }

      const dueInDays = avgIntervalDays != null ? avgIntervalDays - daysSinceLast : null;
      // status: due (overdue/now), soon (within a quarter of the cycle), ok.
      let status: "due" | "soon" | "ok" = "ok";
      if (dueInDays != null) {
        if (dueInDays <= 0) status = "due";
        else if (dueInDays <= Math.ceil((avgIntervalDays ?? 0) / 4)) status = "soon";
      }

      return {
        name: e.name,
        norm_name: norm,
        category: e.category,
        last_price: e.price,
        last_shop: e.shop,
        timesOrdered,
        avgIntervalDays,
        daysSinceLast,
        dueInDays,
        status,
      };
    })
    // Only items with a real cadence are useful for prediction.
    .filter((i) => i.avgIntervalDays != null)
    .sort((a, b) => (a.dueInDays ?? 0) - (b.dueInDays ?? 0));

  return c.json(items);
});

// ---- Spending insights ----

api.get("/insights", async (c) => {
  const db = c.env.DB;

  const totals = await db
    .prepare(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS spend FROM orders",
    )
    .first<{ orders: number; spend: number }>();

  const { results: perShop } = await db
    .prepare(
      `SELECT shop_name AS shop, COUNT(*) AS orders, COALESCE(SUM(total),0) AS spend
       FROM orders WHERE shop_name IS NOT NULL
       GROUP BY shop_name ORDER BY spend DESC`,
    )
    .all();

  const { results: topItems } = await db
    .prepare(
      `SELECT name, COALESCE(SUM(line_total),0) AS spend, SUM(quantity) AS qty,
              COUNT(DISTINCT order_id) AS times
       FROM order_items WHERE is_fee = 0
       GROUP BY norm_name ORDER BY spend DESC LIMIT 12`,
    )
    .all();

  const { results: monthly } = await db
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month, COALESCE(SUM(total),0) AS spend, COUNT(*) AS orders
       FROM orders GROUP BY month ORDER BY month ASC`,
    )
    .all();

  return c.json({
    orders: totals?.orders ?? 0,
    totalSpend: Math.round((totals?.spend ?? 0) * 100) / 100,
    perShop,
    topItems,
    monthly,
  });
});

// ---- App wiring: /api/* -> Hono, everything else -> static assets ----

const app = new Hono<{ Bindings: Env }>();
app.route("/api", api);
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
