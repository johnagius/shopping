import type {
  CatalogItem,
  Order,
  ParsedOrder,
  ShoppingListItem,
  StockFinderResponse,
} from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  // Shopping list
  getList: () => req<ShoppingListItem[]>("/list"),
  addToList: (name: string, quantity = 1, note?: string) =>
    req<{ id: number }>("/list", {
      method: "POST",
      body: JSON.stringify({ name, quantity, note }),
    }),
  updateListItem: (
    id: number,
    patch: { quantity?: number; checked?: boolean; note?: string },
  ) => req<{ ok: true }>(`/list/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteListItem: (id: number) => req<{ ok: true }>(`/list/${id}`, { method: "DELETE" }),
  clearChecked: () => req<{ deleted: number }>("/list/clear-checked", { method: "POST" }),
  reorder: (orderId: number) =>
    req<{ added: number }>("/list/reorder", {
      method: "POST",
      body: JSON.stringify({ orderId }),
    }),
  addItemsToList: (items: { name: string; quantity?: number }[]) =>
    req<{ added: number }>("/list/reorder", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),

  // Catalog
  getCatalog: (q?: string) =>
    req<CatalogItem[]>(`/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  // Orders
  getOrders: () => req<(Order & { item_count: number })[]>("/orders"),
  getOrder: (id: number) => req<Order>(`/orders/${id}`),
  importOrder: (order: ParsedOrder) =>
    req<{ id: number; items: number }>("/orders/import", {
      method: "POST",
      body: JSON.stringify(order),
    }),

  // Wolt stock finder
  findShops: (items: string[], lat?: number, lon?: number) =>
    req<StockFinderResponse>("/stock", {
      method: "POST",
      body: JSON.stringify({ items, lat, lon }),
    }),
};
