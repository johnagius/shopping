import type {
  CatalogItem,
  Insights,
  Order,
  ParsedOrder,
  RestockItem,
  ShoppingListItem,
  WhereToBuyResponse,
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
    patch: { name?: string; quantity?: number; checked?: boolean; note?: string; category?: string },
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

  // Catalog ("system inventory")
  getCatalog: (q?: string) =>
    req<CatalogItem[]>(`/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  updateCatalogItem: (
    id: number,
    patch: { name?: string; category?: string; last_price?: number | null },
  ) => req<{ ok: true }>(`/catalog/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCatalogItem: (id: number) =>
    req<{ ok: true }>(`/catalog/${id}`, { method: "DELETE" }),

  // Orders
  getOrders: () => req<(Order & { item_count: number })[]>("/orders"),
  getOrder: (id: number) => req<Order>(`/orders/${id}`),
  deleteOrder: (id: number) => req<{ ok: true }>(`/orders/${id}`, { method: "DELETE" }),
  updateOrderItem: (
    id: number,
    patch: { name?: string; quantity?: number; unit_price?: number | null },
  ) => req<{ ok: true }>(`/order-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteOrderItem: (id: number) =>
    req<{ ok: true }>(`/order-items/${id}`, { method: "DELETE" }),
  importOrder: (order: ParsedOrder) =>
    req<{ id: number; items: number }>("/orders/import", {
      method: "POST",
      body: JSON.stringify(order),
    }),

  // Where to buy (import-based shop matcher)
  whereToBuy: () => req<WhereToBuyResponse>("/where-to-buy"),

  // Suggestions ("you usually buy these")
  getSuggestions: () => req<CatalogItem[]>("/suggestions"),

  // Restock predictions ("due to buy again")
  getRestock: () => req<RestockItem[]>("/restock"),

  // Spending insights
  getInsights: () => req<Insights>("/insights"),
};
