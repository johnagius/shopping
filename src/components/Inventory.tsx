import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { AISLES, aisleOrder } from "../lib/categorize";
import type { CatalogItem } from "../lib/types";

function InventoryRow({
  item,
  onDeleted,
  showToast,
}: {
  item: CatalogItem;
  onDeleted: () => void;
  showToast: (m: string) => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category ?? "Other");
  const [price, setPrice] = useState(item.last_price != null ? String(item.last_price) : "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const orig = useRef({ name: item.name, category: item.category ?? "Other", price });

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1000);
  };

  const save = async (patch: { name?: string; category?: string; last_price?: number | null }) => {
    try {
      await api.updateCatalogItem(item.id, patch);
      flash();
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const onNameBlur = () => {
    const v = name.trim();
    if (v && v !== orig.current.name) {
      orig.current.name = v;
      void save({ name: v });
    }
  };
  const onPriceBlur = () => {
    if (price !== orig.current.price) {
      orig.current.price = price;
      void save({ last_price: price === "" ? null : Number(price) });
    }
  };
  const onCat = (v: string) => {
    setCategory(v);
    orig.current.category = v;
    void save({ category: v });
  };

  const del = async () => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setBusy(true);
    try {
      await api.deleteCatalogItem(item.id);
      onDeleted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 0",
        borderBottom: "1px solid var(--border)",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={onNameBlur}
        style={{ flex: "1 1 120px", minWidth: 0, padding: "6px 8px", fontSize: 13 }}
      />
      <select
        value={category}
        onChange={(e) => onCat(e.target.value)}
        style={{ flex: "0 0 auto", width: "auto", padding: "6px 4px", fontSize: 12 }}
      >
        {AISLES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <div style={{ position: "relative", flex: "0 0 64px" }}>
        <span style={{ position: "absolute", left: 6, top: 7, color: "var(--muted)", fontSize: 12 }}>€</span>
        <input
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={onPriceBlur}
          style={{ padding: "6px 4px 6px 16px", fontSize: 13 }}
        />
      </div>
      <span
        className="tag"
        title="times ordered"
        style={{ flex: "0 0 auto", padding: "2px 6px", fontSize: 11 }}
      >
        ×{item.order_count}
      </span>
      <span style={{ flex: "0 0 14px", color: "var(--accent)", fontSize: 13 }}>{saved ? "✓" : ""}</span>
      <button className="icon" onClick={del} disabled={busy} aria-label="delete" style={{ padding: 4 }}>
        ✕
      </button>
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
        <div className="row">
          <h2 className="section" style={{ margin: 0 }}>
            Inventory ({items.length})
          </h2>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>
          Edits save automatically. These items power autocomplete, suggestions, restock &amp;
          “where to buy”.
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
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {filtered.map((it) => (
            <InventoryRow key={it.id} item={it} onDeleted={load} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}
