import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useCategories, ADD_CATEGORY_VALUE } from "../lib/useCategories";
import { TIERS, TIER_LABELS } from "../lib/tiers";
import type { CatalogItem } from "../lib/types";

/**
 * Focused stepper that walks the "needs review" items one at a time so a fresh
 * import can be classified quickly. Each item: pick a tier (saves & advances),
 * optionally set aisle / star / price first, or skip.
 */
export function QuickClassify({
  items,
  onClose,
  onDone,
  showToast,
}: {
  items: CatalogItem[];
  onClose: () => void;
  onDone: () => void;
  showToast: (m: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [category, setCategory] = useState("Other");
  const [star, setStar] = useState(false);
  const [busy, setBusy] = useState(false);
  const { categories, addNew } = useCategories();

  const item = items[idx];

  // Reset per-item controls when advancing.
  useEffect(() => {
    if (item) {
      setCategory(item.category ?? "Other");
      setStar(!!item.is_cheapest);
    }
  }, [item]);

  const advance = () => {
    if (idx + 1 >= items.length) {
      onDone();
    } else {
      setIdx((i) => i + 1);
    }
  };

  const setTier = async (tier: string) => {
    if (!item) return;
    setBusy(true);
    try {
      await api.updateCatalogItem(item.id, { tier, category, is_cheapest: star });
      advance();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!item) {
    return (
      <div className="card">
        <div className="empty">
          🎉 All caught up — nothing to review.
          <br />
          <button className="btn secondary" style={{ marginTop: 12 }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <span className="muted">
          Reviewing {idx + 1} / {items.length}
        </span>
        <div className="spacer" />
        <button className="icon" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>

      <div style={{ textAlign: "center", padding: "14px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{item.name}</div>
        <div className="muted" style={{ marginTop: 4 }}>
          {item.last_price != null ? `€${item.last_price.toFixed(2)}` : "no price"}
          {item.last_shop ? ` · ${item.last_shop}` : ""}
        </div>
      </div>

      <div className="row" style={{ gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <select
          value={category}
          onChange={async (e) => {
            if (e.target.value === ADD_CATEGORY_VALUE) {
              const n = await addNew();
              if (n) setCategory(n);
              return;
            }
            setCategory(e.target.value);
          }}
          style={{ width: "auto", padding: "8px" }}
        >
          {categories.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          {category && !categories.includes(category) && <option value={category}>{category}</option>}
          <option value={ADD_CATEGORY_VALUE}>➕ Add aisle…</option>
        </select>
        <button
          className="tag"
          style={{ cursor: "pointer", color: star ? "#f0b429" : "var(--muted)", fontSize: 16 }}
          onClick={() => setStar((v) => !v)}
        >
          {star ? "★ cheapest" : "☆ cheapest"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {TIERS.map((t) => (
          <button key={t} className="btn" disabled={busy} onClick={() => setTier(t)}>
            {TIER_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn secondary" disabled={busy} onClick={advance}>
          Skip
        </button>
        <div className="spacer" />
      </div>
    </div>
  );
}
