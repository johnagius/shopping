import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import type { CatalogItem } from "../lib/types";

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type Node = { item: CatalogItem; x: number; y: number; w: number; label: string };
type Branch = { cat: string; ax: number; ay: number; aw: number; nodes: Node[] };

export function WebMap({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(null); // null = all collapsed
  const { orderOf } = useCategories();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, st] = await Promise.all([api.getCatalog(), api.getBoardState()]);
      setItems(cat);
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
    setMarked((prev) => {
      const next = new Set(prev);
      willMark ? next.add(it.id) : next.delete(it.id);
      return next;
    });
    try {
      await navigator.clipboard.writeText(it.name);
      showToast(`Copied: ${it.name}`);
    } catch {
      showToast(willMark ? "Marked" : "Unmarked");
    }
    try {
      await api.toggleBoardMark(it.id, willMark);
    } catch {
      /* keep optimistic */
    }
  };

  const reset = async () => {
    if (marked.size === 0) return;
    if (!window.confirm(`Reset ${marked.size} marked?`)) return;
    setMarked(new Set());
    await api.resetBoard();
    showToast("Web reset");
  };

  // Radial layout. Only the open category's items are laid out (collapsed by default).
  const { branches, view } = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const cat = it.category ?? "Other";
      groups.set(cat, [...(groups.get(cat) ?? []), it]);
    }
    const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
    const A = ordered.length || 1;

    const cx = 0;
    const cy = 0;
    const R_AISLE = 200;
    const charW = 6.6;
    const pillW = (s: string) => Math.min(200, Math.max(46, s.length * charW + 18));

    const br: Branch[] = ordered.map(([cat, list], i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / A;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const px = -uy;
      const py = ux;
      const ax = cx + ux * R_AISLE;
      const ay = cy + uy * R_AISLE;

      let nodes: Node[] = [];
      if (cat === openCat) {
        const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
        const cols = Math.min(sorted.length, 3) || 1;
        const COL = 150;
        const ROW = 56;
        nodes = sorted.map((it, k) => {
          const col = k % cols;
          const row = Math.floor(k / cols);
          const along = 80 + row * ROW;
          const across = (col - (cols - 1) / 2) * COL;
          const label = trunc(it.short_name || it.name, 22);
          return {
            item: it,
            x: ax + ux * along + px * across,
            y: ay + uy * along + py * across,
            w: pillW(label),
            label,
          };
        });
      }
      return { cat, ax, ay, aw: pillW(cat), nodes };
    });

    // Bounding box over visible elements (hub + aisle nodes + open items).
    let minX = cx - 30;
    let minY = cy - 30;
    let maxX = cx + 30;
    let maxY = cy + 30;
    const grow = (x: number, y: number, hw: number, hh: number) => {
      minX = Math.min(minX, x - hw);
      minY = Math.min(minY, y - hh);
      maxX = Math.max(maxX, x + hw);
      maxY = Math.max(maxY, y + hh);
    };
    for (const b of br) {
      grow(b.ax, b.ay, b.aw / 2, 13);
      for (const n of b.nodes) grow(n.x, n.y, n.w / 2, 12);
    }
    const M = 36;
    return {
      branches: br,
      view: { x: minX - M, y: minY - M, w: maxX - minX + 2 * M, h: maxY - minY + 2 * M },
    };
  }, [items, orderOf, openCat]);

  return (
    <div>
      <div className="card">
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>
            Tap a category to open it. Tap an item to copy its name and mark it added (green).
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
      ) : items.length === 0 ? (
        <div className="empty">Nothing yet. Import an order to fill the web.</div>
      ) : (
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
          }}
        >
          <svg
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block", width: "100%", height: "78vh" }}
          >
            {/* hub -> aisle spokes, and aisle -> item lines for the open category */}
            {branches.map((b) => (
              <g key={`l-${b.cat}`}>
                <line
                  x1={0}
                  y1={0}
                  x2={b.ax}
                  y2={b.ay}
                  stroke={b.cat === openCat ? "var(--accent)" : "var(--accent-dim)"}
                  strokeWidth={2}
                />
                {b.nodes.map((n) => (
                  <line
                    key={`bl-${n.item.id}`}
                    x1={b.ax}
                    y1={b.ay}
                    x2={n.x}
                    y2={n.y}
                    stroke="var(--border)"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            ))}

            {/* center hub (tap to collapse all) */}
            <g style={{ cursor: "pointer" }} onClick={() => setOpenCat(null)}>
              <circle cx={0} cy={0} r={28} fill="var(--accent)" />
              <text x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#06231a">
                Items
              </text>
            </g>

            {/* aisle nodes (tap to open/close) */}
            {branches.map((b) => {
              const active = b.cat === openCat;
              return (
                <g
                  key={`a-${b.cat}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setOpenCat(active ? null : b.cat)}
                >
                  <rect
                    x={b.ax - b.aw / 2}
                    y={b.ay - 14}
                    width={b.aw}
                    height={28}
                    rx={14}
                    fill={active ? "var(--accent-dim)" : "var(--surface-2)"}
                    stroke={active ? "var(--accent)" : "var(--muted)"}
                  />
                  <text
                    x={b.ax}
                    y={b.ay + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={800}
                    fill={active ? "#fff" : "var(--text)"}
                  >
                    {trunc(b.cat, 18)}
                  </text>
                </g>
              );
            })}

            {/* item nodes (only for the open category) */}
            {branches.map((b) =>
              b.nodes.map((n) => {
                const on = marked.has(n.item.id);
                return (
                  <g key={n.item.id} style={{ cursor: "pointer" }} onClick={() => tap(n.item)}>
                    <rect
                      x={n.x - n.w / 2}
                      y={n.y - 12}
                      width={n.w}
                      height={24}
                      rx={12}
                      fill={on ? "var(--accent-dim)" : "var(--surface-2)"}
                      stroke={on ? "var(--accent)" : "var(--border)"}
                    />
                    <text
                      x={n.x}
                      y={n.y + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={on ? "#fff" : "var(--text)"}
                    >
                      {n.item.is_cheapest ? "★ " : ""}
                      {n.label}
                    </text>
                  </g>
                );
              }),
            )}
          </svg>

          {/* bottom-left collapse chip for the open category */}
          {openCat && (
            <button
              onClick={() => setOpenCat(null)}
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--accent-dim)",
                border: "1px solid var(--accent)",
                color: "#fff",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
              }}
            >
              {openCat} ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
