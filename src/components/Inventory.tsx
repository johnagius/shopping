import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories, ADD_CATEGORY_VALUE } from "../lib/useCategories";
import { TIERS, TIER_LABELS, tierOrder } from "../lib/tiers";
import { QuickClassify } from "./QuickClassify";
import type { CatalogItem } from "../lib/types";

type SortKey = "added" | "name" | "tier" | "aisle" | "price" | "used";

function fmtShort(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

async function copyText(text: string, showToast: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied");
  } catch {
    showToast("Couldn't copy");
  }
}

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
  const [star, setStar] = useState(!!item.is_cheapest);
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
      <button
        className="icon"
        title={star ? "Cheapest — unstar" : "Mark as cheapest"}
        onClick={() => {
          const v = !star;
          setStar(v);
          void save({ is_cheapest: v });
        }}
        style={{ color: star ? "#f0b429" : "var(--muted)", fontSize: 16, padding: 2, flex: "0 0 auto" }}
      >
        {star ? "★" : "☆"}
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
      <div style={{ position: "relative", flex: "0 0 56px" }}>
        <span style={{ position: "absolute", left: 4, top: 7, color: "var(--muted)", fontSize: 12 }}>€</span>
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
          style={{ padding: "6px 2px 6px 14px", fontSize: 13 }}
        />
      </div>
      <span className="muted" style={{ flex: "0 0 auto", fontSize: 11 }} title="times ordered">
        ×{item.order_count}
      </span>
      <span className="muted" style={{ flex: "0 0 auto", fontSize: 11 }} title="added">
        {fmtShort(item.created_at)}
      </span>
      <span style={{ flex: "0 0 10px", color: "var(--accent)", fontSize: 12 }}>{saved ? "✓" : ""}</span>
      <button className="icon" title="Copy name" onClick={() => copyText(item.name, showToast)} style={{ padding: 3 }}>
        ⧉
      </button>
      <button className="icon" onClick={del} disabled={busy} aria-label="delete" style={{ padding: 3 }}>
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
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", tier: "One off", category: "Other", price: "" });
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

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "added" || key === "used" ? "desc" : "asc");
    }
  };

  const cmp = (a: CatalogItem, b: CatalogItem): number => {
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name);
      case "tier":
        return tierOrder(a.tier) - tierOrder(b.tier);
      case "aisle":
        return (a.category ?? "").localeCompare(b.category ?? "");
      case "price":
        return (a.last_price ?? -1) - (b.last_price ?? -1);
      case "used":
        return a.order_count - b.order_count;
      case "added":
      default:
        return a.created_at.localeCompare(b.created_at);
    }
  };

  const needsReview = items.filter((i) => !i.reviewed);
  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((i) => tierFilter === "all" || (i.tier ?? "One off") === tierFilter)
    .filter((i) => !reviewOnly || !i.reviewed)
    .sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));

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
    if (!window.confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"}?`)) return;
    const { deleted } = await api.bulkDeleteCatalog(ids);
    showToast(`Deleted ${deleted}`);
    await load();
  };

  const bulkSet = async (patch: { category?: string; tier?: string; is_cheapest?: boolean }) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    await api.bulkUpdateCatalog(ids, patch);
    showToast(`Updated ${ids.length}`);
    await load();
  };

  const mergeSelected = async () => {
    const chosen = items.filter((i) => selected.has(i.id));
    if (chosen.length < 2) return;
    // Keep the most-used item as the primary.
    const primary = chosen.reduce((a, b) => (b.order_count > a.order_count ? b : a));
    const others = chosen.filter((i) => i.id !== primary.id);
    if (
      !window.confirm(
        `Merge ${others.length} item${others.length === 1 ? "" : "s"} into "${primary.name}"? ` +
          `Their order history combines and the others are deleted.`,
      )
    )
      return;
    await api.mergeCatalog(primary.id, others.map((i) => i.id));
    showToast(`Merged into ${primary.name}`);
    await load();
  };

  const addItem = async () => {
    const name = newItem.name.trim();
    if (!name) return;
    await api.createCatalogItem({
      name,
      tier: newItem.tier,
      category: newItem.category,
      last_price: newItem.price === "" ? null : Number(newItem.price),
    });
    showToast(`Added ${name}`);
    setNewItem({ name: "", tier: "One off", category: "Other", price: "" });
    setAdding(false);
    await load();
  };

  const Header = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      className={`tag ${sortKey === k ? "ok" : ""}`}
      style={{ cursor: "pointer" }}
      onClick={() => sortBy(k)}
    >
      {label}
      {sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div>
      <div className="card">
        <div className="row" style={{ gap: 8 }}>
          <h2 className="section" style={{ margin: 0 }}>
            Inventory ({items.length})
          </h2>
          <div className="spacer" />
          {needsReview.length > 0 && (
            <button className="btn" style={{ padding: "8px 12px" }} onClick={() => setClassifying(true)}>
              ⚡ Quick classify ({needsReview.length})
            </button>
          )}
          <button
            className="btn secondary"
            style={{ padding: "8px 12px" }}
            onClick={() => setAdding((v) => !v)}
          >
            + Add item
          </button>
        </div>

        {adding && (
          <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
            <input
              placeholder="Item name"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              autoFocus
              style={{ flex: "1 1 160px" }}
            />
            <select
              value={newItem.tier}
              onChange={(e) => setNewItem({ ...newItem, tier: e.target.value })}
              style={{ width: "auto", padding: "8px" }}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              style={{ width: "auto", padding: "8px" }}
            >
              {categories.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div style={{ position: "relative", width: 80 }}>
              <span style={{ position: "absolute", left: 8, top: 9, color: "var(--muted)" }}>€</span>
              <input
                value={newItem.price}
                inputMode="decimal"
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                style={{ paddingLeft: 18 }}
              />
            </div>
            <button className="btn" onClick={addItem}>
              Add
            </button>
          </div>
        )}

        <input
          placeholder="Search inventory…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginTop: 8 }}
        />

        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11 }}>Tier:</span>
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
          <button
            className={`tag ${reviewOnly ? "warn" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => setReviewOnly((v) => !v)}
          >
            Needs review ({needsReview.length})
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11 }}>Sort:</span>
          <Header k="added" label="Added" />
          <Header k="name" label="Name" />
          <Header k="tier" label="Tier" />
          <Header k="aisle" label="Aisle" />
          <Header k="price" label="Price" />
          <Header k="used" label="Used" />
        </div>

        {filtered.length > 0 && (
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <button className="btn secondary" onClick={toggleSelectAll}>
              {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
            </button>
            {selected.size > 0 && (
              <>
                <select
                  value=""
                  onChange={(e) => e.target.value && bulkSet({ tier: e.target.value })}
                  style={{ width: "auto", padding: "8px", fontSize: 13 }}
                >
                  <option value="">Set tier… ({selected.size})</option>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
                <select
                  value=""
                  onChange={(e) => e.target.value && bulkSet({ category: e.target.value })}
                  style={{ width: "auto", padding: "8px", fontSize: 13 }}
                >
                  <option value="">Set aisle… ({selected.size})</option>
                  {categories.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <button className="btn secondary" onClick={() => bulkSet({ is_cheapest: true })} title="Star as cheapest">
                  ★
                </button>
                <button className="btn secondary" onClick={() => bulkSet({ is_cheapest: false })} title="Unstar">
                  ☆
                </button>
                {selected.size >= 2 && (
                  <button className="btn secondary" onClick={mergeSelected}>
                    Merge
                  </button>
                )}
                <div className="spacer" />
                <button className="btn danger" onClick={bulkDelete}>
                  Delete {selected.size}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {classifying && (
        <QuickClassify
          items={needsReview}
          showToast={showToast}
          onClose={() => setClassifying(false)}
          onDone={async () => {
            setClassifying(false);
            await load();
          }}
        />
      )}

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
