import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories, ADD_CATEGORY_VALUE } from "../lib/useCategories";
import { TIERS, TIER_LABELS, tierOrder } from "../lib/tiers";
import type { CatalogItem } from "../lib/types";

function InventoryRow({
  item,
  categories,
  addCategory,
  onDeleted,
  showToast,
  selected,
  onToggleSelect,
}: {
  item: CatalogItem;
  categories: string[];
  addCategory: () => Promise<string | null>;
  onDeleted: () => void;
  showToast: (m: string) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category ?? "Other");
  const [tier, setTier] = useState(item.tier ?? "One off");
  const [price, setPrice] = useState(item.last_price != null ? String(item.last_price) : "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const orig = useRef({ name: item.name, price });

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1000);
  };
  const save = async (patch: Parameters<typeof api.updateCatalogItem>[1]) => {
    try {
      await api.updateCatalogItem(item.id, patch);
      flash();
    } catch (e) {
      showToast((e as Error).message);
    }
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
        flexWrap: "wrap",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <button
        className={`check ${selected ? "on" : ""}`}
        onClick={onToggleSelect}
        aria-label="select"
        style={{ width: 20, height: 20, fontSize: 12, flex: "0 0 auto" }}
      >
        {selected ? "✓" : ""}
      </button>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== orig.current.name) {
            orig.current.name = v;
            void save({ name: v });
          }
        }}
        style={{ flex: "1 1 140px", minWidth: 0, padding: "6px 8px", fontSize: 13 }}
      />
      <select
        value={tier}
        onChange={(e) => {
          setTier(e.target.value);
          void save({ tier: e.target.value });
        }}
        style={{ flex: "0 0 auto", width: "auto", padding: "6px 4px", fontSize: 12 }}
        title="Tier"
      >
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {TIER_LABELS[t]}
          </option>
        ))}
      </select>
      <select
        value={category}
        onChange={async (e) => {
          if (e.target.value === ADD_CATEGORY_VALUE) {
            const n = await addCategory();
            if (n) {
              setCategory(n);
              void save({ category: n });
            }
            return;
          }
          setCategory(e.target.value);
          void save({ category: e.target.value });
        }}
        style={{ flex: "0 0 auto", width: "auto", padding: "6px 4px", fontSize: 12 }}
        title="Aisle"
      >
        {categories.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        {category && !categories.includes(category) && <option value={category}>{category}</option>}
        <option value={ADD_CATEGORY_VALUE}>➕ Add aisle…</option>
      </select>
      <div style={{ position: "relative", flex: "0 0 60px" }}>
        <span style={{ position: "absolute", left: 5, top: 7, color: "var(--muted)", fontSize: 12 }}>€</span>
        <input
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            if (price !== orig.current.price) {
              orig.current.price = price;
              void save({ last_price: price === "" ? null : Number(price) });
            }
          }}
          style={{ padding: "6px 2px 6px 15px", fontSize: 13 }}
        />
      </div>
      <span style={{ flex: "0 0 12px", color: "var(--accent)", fontSize: 13 }}>{saved ? "✓" : ""}</span>
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
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { categories, addNew } = useCategories();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getCatalog());
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((i) => tierFilter === "all" || (i.tier ?? "One off") === tierFilter)
    .sort(
      (a, b) =>
        tierOrder(a.tier) - tierOrder(b.tier) || a.name.localeCompare(b.name),
    );

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"} from inventory?`)) return;
    const { deleted } = await api.bulkDeleteCatalog(ids);
    showToast(`Deleted ${deleted} item${deleted === 1 ? "" : "s"}`);
    await load();
  };

  return (
    <div>
      <div className="card">
        <div className="row">
          <h2 className="section" style={{ margin: 0 }}>
            Inventory ({items.length})
          </h2>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>
          Set each item's <strong>tier</strong> (Essential / Nice to have / One-off) and aisle.
          Edits save automatically. Use <strong>Quick add</strong> on the List to pull these into an
          order.
        </p>
        <input placeholder="Search inventory…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {["all", ...TIERS].map((t) => (
            <button
              key={t}
              className={`tag ${tierFilter === t ? "ok" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setTierFilter(t)}
            >
              {t === "all" ? "All" : TIER_LABELS[t]}
            </button>
          ))}
        </div>
        {filtered.length > 0 && (
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn secondary" onClick={toggleSelectAll}>
              {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
            </button>
            <div className="spacer" />
            {selected.size > 0 && (
              <button className="btn danger" onClick={bulkDelete}>
                Delete {selected.size} selected
              </button>
            )}
          </div>
        )}
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
            <InventoryRow
              key={it.id}
              item={it}
              categories={categories}
              addCategory={addNew}
              onDeleted={load}
              showToast={showToast}
              selected={selected.has(it.id)}
              onToggleSelect={() => toggleSelect(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
