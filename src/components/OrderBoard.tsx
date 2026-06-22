import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import { TIERS, TIER_LABELS, tierColor } from "../lib/tiers";
import type { CatalogItem, ItemShops } from "../lib/types";

/** Shorten a shop name for the chip badge, e.g. "MySupermarket Qormi" -> "Qormi". */
function shortShop(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

export function OrderBoard({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [shops, setShops] = useState<ItemShops>({});
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [cheapestOnly, setCheapestOnly] = useState(false);
  const [shopFilter, setShopFilter] = useState<string>("all");
  const { orderOf } = useCategories();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, sh, st] = await Promise.all([
        api.getCatalog(),
        api.getItemShops(),
        api.getBoardState(),
      ]);
      setItems(cat);
      setShops(sh);
      setMarked(new Set(st.marked));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tap = async (it: CatalogItem) => {
    const willMark = !marked.has(it.id);
    // optimistic
    setMarked((prev) => {
      const next = new Set(prev);
      willMark ? next.add(it.id) : next.delete(it.id);
      return next;
    });
    try {
      await navigator.clipboard.writeText(it.name);
      showToast(`Copied: ${it.name}`);
    } catch {
      showToast(willMark ? "Marked (copy blocked)" : "Unmarked");
    }
    try {
      await api.toggleBoardMark(it.id, willMark);
    } catch {
      /* keep optimistic state */
    }
  };

  const copyShort = async (e: React.MouseEvent, it: CatalogItem) => {
    e.stopPropagation();
    if (!it.short_name) return;
    setMarked((prev) => new Set(prev).add(it.id));
    try {
      await navigator.clipboard.writeText(it.short_name);
      showToast(`Copied: ${it.short_name}`);
    } catch {
      showToast("Marked (copy blocked)");
    }
    try {
      await api.toggleBoardMark(it.id, true);
    } catch {
      /* keep optimistic */
    }
  };

  const editShort = async (e: React.MouseEvent, it: CatalogItem) => {
    e.stopPropagation();
    const v = window.prompt(`Short / generic name for "${it.name}"`, it.short_name ?? "");
    if (v === null) return;
    const val = v.trim();
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, short_name: val || null } : x)));
    try {
      await api.updateCatalogItem(it.id, { short_name: val });
      showToast(val ? "Short name saved" : "Short name cleared");
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const reset = async () => {
    if (marked.size === 0) return;
    if (!window.confirm(`Reset ${marked.size} marked item${marked.size === 1 ? "" : "s"}?`)) return;
    setMarked(new Set());
    await api.resetBoard();
    showToast("Board reset");
  };

  const allShops = useMemo(() => {
    const s = new Set<string>();
    Object.values(shops).forEach((e) => e.shops.forEach((x) => s.add(x)));
    return [...s].sort();
  }, [shops]);

  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((i) => tierFilter === "all" || (i.tier ?? "One off") === tierFilter)
    .filter((i) => !cheapestOnly || i.is_cheapest)
    .filter((i) => shopFilter === "all" || (shops[i.norm_name]?.shops ?? []).includes(shopFilter));

  const groups = new Map<string, CatalogItem[]>();
  for (const it of filtered) {
    const cat = it.category ?? "Other";
    groups.set(cat, [...(groups.get(cat) ?? []), it]);
  }
  const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));

  const markedInView = filtered.filter((i) => marked.has(i.id)).length;

  return (
    <div>
      <div className="card">
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Tap a chip to copy its name and mark it added (green). Flip to Wolt, paste, add, come back —
          green shows what's done. The badge is where it's cheapest.
        </p>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
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
            className={`tag ${cheapestOnly ? "ok" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => setCheapestOnly((v) => !v)}
          >
            ★ Cheapest only
          </button>
          {allShops.length > 0 && (
            <select
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              style={{ width: "auto", padding: "6px 8px", fontSize: 12 }}
            >
              <option value="all">All shops</option>
              {allShops.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted">
            {markedInView} added{filtered.length ? ` / ${filtered.length} shown` : ""}
          </span>
          <div className="spacer" />
          {marked.size > 0 && (
            <button className="btn secondary" onClick={reset}>
              Reset ({marked.size})
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : ordered.length === 0 ? (
        <div className="empty">Nothing to show. Import an order or adjust filters.</div>
      ) : (
        ordered.map(([cat, list]) => (
          <div key={cat} className="card">
            <h2 className="section" style={{ marginTop: 0 }}>
              {cat} ({list.length})
            </h2>
            <div className="chips">
              {list
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((it) => {
                  const badge = shortShop(shops[it.norm_name]?.cheapestShop ?? it.last_shop);
                  return (
                    <button
                      key={it.id}
                      className={`chip ${marked.has(it.id) ? "added" : ""}`}
                      onClick={() => tap(it)}
                      style={
                        marked.has(it.id)
                          ? undefined
                          : { borderLeft: `3px solid ${tierColor(it.tier)}` }
                      }
                    >
                      <span>
                        {it.is_cheapest ? <span className="star">★ </span> : ""}
                        {it.name}
                      </span>
                      {(badge || it.last_price != null) && (
                        <span className="badge">
                          {badge}
                          {badge && it.last_price != null ? " · " : ""}
                          {it.last_price != null ? `€${it.last_price.toFixed(2)}` : ""}
                        </span>
                      )}
                      {it.short_name ? (
                        <span style={{ display: "flex", gap: 4, marginTop: 4, alignSelf: "stretch" }}>
                          <span
                            className="chip-short"
                            style={{ flex: 1, marginTop: 0 }}
                            title={`Copy generic: ${it.short_name}`}
                            onClick={(e) => copyShort(e, it)}
                          >
                            ⧉ {it.short_name}
                          </span>
                          <span
                            className="chip-short"
                            style={{ flex: "0 0 auto", marginTop: 0 }}
                            title="Edit short name"
                            onClick={(e) => editShort(e, it)}
                          >
                            ✎
                          </span>
                        </span>
                      ) : (
                        <span
                          className="chip-short"
                          title="Add short name"
                          onClick={(e) => editShort(e, it)}
                        >
                          + short
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
