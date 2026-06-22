import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { TIER_LABELS, tierOrder } from "../lib/tiers";
import type { CatalogItem } from "../lib/types";

export function QuickAddPicker({
  existingNorms,
  onAdded,
  onClose,
  showToast,
}: {
  existingNorms: Set<string>;
  onAdded: () => void;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void api
      .getCatalog()
      .then((all) => setItems(all.filter((i) => !existingNorms.has(i.norm_name))))
      .finally(() => setLoading(false));
  }, [existingNorms]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Group by tier in fixed order.
  const groups = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const t = it.tier ?? "One off";
    groups.set(t, [...(groups.get(t) ?? []), it]);
  }
  const ordered = [...groups.entries()].sort((a, b) => tierOrder(a[0]) - tierOrder(b[0]));

  const toggleTier = (tierItems: CatalogItem[], allSelected: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      tierItems.forEach((i) => (allSelected ? next.delete(i.id) : next.add(i.id)));
      return next;
    });

  const addSelected = async () => {
    const names = items.filter((i) => selected.has(i.id)).map((i) => i.name);
    if (names.length === 0) return;
    setAdding(true);
    try {
      await api.addItemsToList(names.map((name) => ({ name })));
      showToast(`Added ${names.length} item${names.length === 1 ? "" : "s"}`);
      onAdded();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <h2 className="section" style={{ margin: 0 }}>
          Quick add
        </h2>
        <div className="spacer" />
        <button className="icon" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          Everything in your inventory is already on the list.
          <br />
          Set item tiers in <strong>Inventory</strong>.
        </div>
      ) : (
        ordered.map(([tier, tierItems]) => {
          const allSelected = tierItems.every((i) => selected.has(i.id));
          return (
            <div key={tier} style={{ marginTop: 10 }}>
              <div className="row">
                <h2 className="section" style={{ margin: 0 }}>
                  {TIER_LABELS[tier] ?? tier}
                </h2>
                <div className="spacer" />
                <button
                  className="tag"
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleTier(tierItems, allSelected)}
                >
                  {allSelected ? "Clear" : "Select all"}
                </button>
              </div>
              {tierItems.map((it) => {
                const on = selected.has(it.id);
                return (
                  <div
                    key={it.id}
                    className="list-item"
                    style={{ cursor: "pointer" }}
                    onClick={() => toggle(it.id)}
                  >
                    <button className={`check ${on ? "on" : ""}`} aria-label="select">
                      {on ? "✓" : ""}
                    </button>
                    <div className="name">{it.name}</div>
                    <div className="spacer" />
                    {it.last_price != null && (
                      <span className="muted">€{it.last_price.toFixed(2)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {items.length > 0 && (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button className="btn" disabled={selected.size === 0 || adding} onClick={addSelected}>
            {adding ? "Adding…" : `Add ${selected.size} selected`}
          </button>
        </div>
      )}
    </div>
  );
}
