import { Hono } from "hono";
import { normalizeName } from "../src/lib/woltParser";
import type { ParsedOrder } from "../src/lib/types";
import { findShopsForList } from "./wolt";

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
      "INSERT INTO shopping_list (name, norm_name, quantity, note, catalog_id) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(name, norm, quantity, note, catalogId)
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
  const body = await c.req.json<{ quantity?: number; checked?: boolean; note?: string }>();
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
  if (sets.length === 0) return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE shopping_list SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();
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
        (shop_name, shop_address, order_number, wolt_order_id, placed_at, delivered_at,
         delivery_address, subtotal, service_fee, delivery_fee, bag_charge, total, currency, raw_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      o.shopName,
      o.shopAddress,
      o.orderNumber,
      o.woltOrderId,
      o.placedAt,
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
    const norm = normalizeName(it.name);
    let catalogId: number | null = null;

    if (!it.isFee) {
      // Upsert into the catalog so the item is reorderable later.
      await db
        .prepare(
          `INSERT INTO catalog_items (name, norm_name, last_price, last_shop, last_ordered_at, order_count)
           VALUES (?, ?, ?, ?, ?, 1)
           ON CONFLICT(norm_name) DO UPDATE SET
             name = excluded.name,
             last_price = excluded.last_price,
             last_shop = excluded.last_shop,
             last_ordered_at = excluded.last_ordered_at,
             order_count = catalog_items.order_count + 1,
             updated_at = datetime('now')`,
        )
        .bind(it.name, norm, it.unitPrice, o.shopName, o.placedAt ?? o.deliveredAt)
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

  return c.json({ id: orderId, items: o.items.length }, 201);
});

// ---- Wolt live stock finder (experimental, best-effort) ----

api.post("/stock", async (c) => {
  const body = await c.req.json<{ items: string[]; lat?: number; lon?: number }>();
  const result = await findShopsForList(body.items ?? [], body.lat, body.lon);
  return c.json(result);
});

// ---- App wiring: /api/* -> Hono, everything else -> static assets ----

const app = new Hono<{ Bindings: Env }>();
app.route("/api", api);
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
