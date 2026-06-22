import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import { TIERS, TIER_LABELS } from "../lib/tiers";
import type { CatalogItem } from "../lib/types";

async function copyText(text: string, showToast: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied");
  } catch {
    showToast("Couldn't copy");
  }
}

export function Grouped({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [cheapestOnly, setCheapestOnly] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openCat, setOpenCat] = useState<string | null>(null); // accordion: one open at a time
  const { orderOf } = useCategories();

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

  const toggleStar = async (it: CatalogItem) => {
    const next = it.is_cheapest ? 0 : 1;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_cheapest: next } : x)));
    await api.updateCatalogItem(it.id, { is_cheapest: !it.is_cheapest });
  };

  const filtered = items
    .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((i) => tierFilter === "all" || (i.tier ?? "One off") === tierFilter)
    .filter((i) => !cheapestOnly || i.is_cheapest);

  const toggleSel = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const copySelected = () => {
    const names = items.filter((i) => selected.has(i.id)).map((i) => i.name);
    if (names.length) copyText(names.join("\n"), showToast);
  };

  const groups = new Map<string, CatalogItem[]>();
  for (const it of filtered) {
    const cat = it.category ?? "Other";
    groups.set(cat, [...(groups.get(cat) ?? []), it]);
  }
  const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));

  return (
    <div>
      <div className="card">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <button
            className={`tag ${cheapestOnly ? "ok" : ""}`}
            style={{ cursor: "pointer", color: cheapestOnly ? undefined : "#f0b429" }}
            onClick={() => setCheapestOnly((v) => !v)}
          >
            ★ Cheapest only
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : ordered.length === 0 ? (
        <div className="empty">Nothing here. Import an order or adjust the filter.</div>
      ) : (
        ordered.map(([cat, list]) => {
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="card">
              <div
                className="row"
                style={{ cursor: "pointer" }}
                onClick={() => setOpenCat((prev) => (prev === cat ? null : cat))}
              >
                <span style={{ width: 16, color: "var(--muted)" }}>{isOpen ? "▾" : "▸"}</span>
                <strong>{cat}</strong>
                <span className="muted" style={{ marginLeft: 6 }}>
                  ({list.length})
                </span>
                <div className="spacer" />
                <button
                  className="icon"
                  title="Copy whole aisle"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(
                      list.map((i) => i.name).join("\n"),
                      showToast,
                    );
                  }}
                >
                  ⧉
                </button>
              </div>

              {isOpen && (
                <div style={{ marginTop: 6 }}>
                  {list
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((it) => (
                      <div key={it.id} className="list-item">
                        <button
                          className={`check ${selected.has(it.id) ? "on" : ""}`}
                          onClick={() => toggleSel(it.id)}
                          aria-label="select"
                          style={{ width: 22, height: 22, flex: "0 0 auto" }}
                        >
                          {selected.has(it.id) ? "✓" : ""}
                        </button>
                        <button
                          className="icon"
                          title={it.is_cheapest ? "Cheapest — unstar" : "Mark as cheapest"}
                          onClick={() => toggleStar(it)}
                          style={{
                            color: it.is_cheapest ? "#f0b429" : "var(--muted)",
                            fontSize: 18,
                            padding: 4,
                          }}
                        >
                          {it.is_cheapest ? "★" : "☆"}
                        </button>
                        <div style={{ minWidth: 0 }}>
                          <div className="name">{it.name}</div>
                          <div className="sub">
                            {it.last_price != null ? `€${it.last_price.toFixed(2)}` : ""}
                            {it.tier ? ` · ${TIER_LABELS[it.tier] ?? it.tier}` : ""}
                            {it.last_shop ? ` · ${it.last_shop}` : ""}
                            {it.short_name ? ` · “${it.short_name}”` : ""}
                          </div>
                        </div>
                        <div className="spacer" />
                        {it.short_name && (
                          <button
                            className="tag"
                            title={`Copy generic: ${it.short_name}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => copyText(it.short_name!, showToast)}
                          >
                            ⧉ generic
                          </button>
                        )}
                        <button
                          className="icon"
                          title="Copy name"
                          onClick={() => copyText(it.name, showToast)}
                        >
                          ⧉
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {selected.size > 0 && (
        <div className="toast" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{selected.size} selected</span>
          <button className="btn" style={{ padding: "8px 12px" }} onClick={copySelected}>
            ⧉ Copy
          </button>
          <button
            className="btn secondary"
            style={{ padding: "8px 12px" }}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
