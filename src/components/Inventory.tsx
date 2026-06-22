import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { AISLES, aisleOrder } from "../lib/categorize";
import type { CatalogItem } from "../lib/types";

function InventoryRow({
  item,
  onChanged,
  showToast,
}: {
  item: CatalogItem;
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category ?? "Other");
  const [price, setPrice] = useState(item.last_price != null ? String(item.last_price) : "");
  const [busy, setBusy] = useState(false);

  const dirty =
    name !== item.name ||
    category !== (item.category ?? "Other") ||
    price !== (item.last_price != null ? String(item.last_price) : "");

  const save = async () => {
    setBusy(true);
    try {
      await api.updateCatalogItem(item.id, {
        name,
        category,
        last_price: price === "" ? null : Number(price),
      });
      showToast("Saved");
      onChanged();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete "${item.name}" from your inventory?`)) return;
    setBusy(true);
    try {
      await api.deleteCatalogItem(item.id);
      showToast("Deleted");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="list-item" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 100%" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 600 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, width: "100%", alignItems: "center" }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ width: "auto", padding: "8px 8px", fontSize: 13 }}
        >
          {AISLES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div style={{ position: "relative", width: 96 }}>
          <span style={{ position: "absolute", left: 8, top: 9, color: "var(--muted)" }}>€</span>
          <input
            value={price}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            style={{ paddingLeft: 20 }}
            placeholder="price"
          />
        </div>
        <span className="tag" title="times ordered">
          ×{item.order_count}
        </span>
        <div className="spacer" />
        {dirty && (
          <button className="btn" disabled={busy} onClick={save} style={{ padding: "8px 12px" }}>
            Save
          </button>
        )}
        <button className="btn danger" disabled={busy} onClick={del} style={{ padding: "8px 12px" }}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function Inventory({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getCatalog());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => aisleOrder(a.category) - aisleOrder(b.category) || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="card">
        <h2 className="section" style={{ marginTop: 0 }}>
          Inventory ({items.length})
        </h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Every product the app remembers — these power autocomplete, suggestions,
          restock and “where to buy”. Edit a name, aisle or price, or delete anything
          that shouldn't be here.
        </p>
        <input placeholder="Search inventory…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          {items.length === 0
            ? "Nothing yet. Import an order and your inventory fills up."
            : "No matches."}
        </div>
      ) : (
        <div className="card">
          {filtered.map((it) => (
            <InventoryRow key={it.id} item={it} onChanged={load} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}
