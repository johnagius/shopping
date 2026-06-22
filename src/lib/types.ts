// Shared types used by both the React frontend and the Cloudflare Worker.

export interface CatalogItem {
  id: number;
  name: string;
  norm_name: string;
  category: string | null;
  last_price: number | null;
  last_shop: string | null;
  last_ordered_at: string | null;
  order_count: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  id: number;
  name: string;
  norm_name: string;
  quantity: number;
  checked: number; // 0 | 1 (SQLite boolean)
  note: string | null;
  catalog_id: number | null;
  created_at: string;
  // Joined from catalog when available:
  last_price: number | null;
  last_shop: string | null;
}

export interface Order {
  id: number;
  shop_name: string | null;
  shop_address: string | null;
  order_number: string | null;
  wolt_order_id: string | null;
  placed_at: string | null;
  delivered_at: string | null;
  delivery_address: string | null;
  subtotal: number | null;
  service_fee: number | null;
  delivery_fee: number | null;
  bag_charge: number | null;
  total: number | null;
  currency: string;
  raw_text: string | null;
  created_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  name: string;
  norm_name: string;
  unit_price: number | null;
  quantity: number;
  line_total: number | null;
  substitution_for: string | null;
  is_fee: number; // 0 | 1
  catalog_id: number | null;
}

// ---- Wolt parsing ----

export interface ParsedLineItem {
  name: string;
  unitPrice: number | null;
  quantity: number;
  lineTotal: number | null;
  substitutionFor?: string | null;
  isFee?: boolean;
}

export interface ParsedOrder {
  shopName: string | null;
  shopAddress: string | null;
  orderNumber: string | null;
  woltOrderId: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  deliveryAddress: string | null;
  items: ParsedLineItem[];
  subtotal: number | null;
  serviceFee: number | null;
  deliveryFee: number | null;
  bagCharge: number | null;
  total: number | null;
  currency: string;
  rawText: string;
}

// ---- Wolt live stock finder ----

export interface StockShopResult {
  venueName: string;
  venueSlug: string | null;
  matchedItems: string[];
  missingItems: string[];
  coverage: number; // 0..1
  estimatedTotal: number | null;
}

export interface StockFinderResponse {
  status: "ok" | "unavailable" | "partial";
  message?: string;
  queriedItems: string[];
  shops: StockShopResult[];
}
