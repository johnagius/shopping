import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import type { CatalogItem } from "../lib/types";

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type Node = { item: CatalogItem; x: number; y: number; w: number; label: string };
type AisleNode = { cat: string; x: number; y: number; w: number };

const charW = 6.6;
const pillW = (s: string) => Math.min(220, Math.max(46, s.length * charW + 20));

export function WebMap({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(null); // null = show all categories
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

  const layout = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const cat = it.category ?? "Other";
      groups.set(cat, [...(groups.get(cat) ?? []), it]);
    }
    const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number, hw: number, hh: number) => {
      minX = Math.min(minX, x - hw);
      minY = Math.min(minY, y - hh);
      maxX = Math.max(maxX, x + hw);
      maxY = Math.max(maxY, y + hh);
    };

    if (openCat === null) {
      // Collapsed: hub + all category nodes on a ring.
      const A = ordered.length || 1;
      const R = 200;
      const aisles: AisleNode[] = ordered.map(([cat], i) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * i) / A;
        return { cat, x: Math.cos(ang) * R, y: Math.sin(ang) * R, w: pillW(cat) };
      });
      grow(0, 0, 30, 30);
      for (const a of aisles) grow(a.x, a.y, a.w / 2, 14);
      const M = 36;
      return {
        mode: "collapsed" as const,
        aisles,
        anchor: null,
        nodes: [] as Node[],
        view: { x: minX - M, y: minY - M, w: maxX - minX + 2 * M, h: maxY - minY + 2 * M },
      };
    }

    // Expanded: the chosen category docks bottom-left; its items fan across the rest.
    const list = (groups.get(openCat) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const n = list.length || 1;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
    const CW = 180;
    const CH = 64;
    const nodes: Node[] = list.map((it, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const label = trunc(it.short_name || it.name, 24);
      return { item: it, x: col * CW, y: row * CH, w: pillW(label), label };
    });
    const rows = Math.ceil(n / cols);
    const anchor: AisleNode = { cat: openCat, x: -10, y: (rows - 1) * CH + 110, w: pillW(openCat) };

    for (const nd of nodes) grow(nd.x, nd.y, nd.w / 2, 12);
    grow(anchor.x, anchor.y, anchor.w / 2, 16);
    const M = 36;
    return {
      mode: "expanded" as const,
      aisles: [] as AisleNode[],
      anchor,
      nodes,
      view: { x: minX - M, y: minY - M, w: maxX - minX + 2 * M, h: maxY - minY + 2 * M },
    };
  }, [items, orderOf, openCat]);

  const { mode, aisles, anchor, nodes, view } = layout;

  return (
    <div>
      <div className="card">
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>
            {mode === "collapsed"
              ? "Tap a category to open it."
              : "Tap an item to copy + mark it. Tap the category (bottom-left) to go back."}
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
            overflow: "hidden",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
          }}
        >
          <svg
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block", width: "100%", height: "80vh" }}
          >
            {mode === "collapsed" ? (
              <>
                {aisles.map((a) => (
                  <line
                    key={`l-${a.cat}`}
                    x1={0}
                    y1={0}
                    x2={a.x}
                    y2={a.y}
                    stroke="var(--accent-dim)"
                    strokeWidth={2}
                  />
                ))}
                <circle cx={0} cy={0} r={28} fill="var(--accent)" />
                <text x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#06231a">
                  Items
                </text>
                {aisles.map((a) => (
                  <g
                    key={`a-${a.cat}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setOpenCat(a.cat)}
                  >
                    <rect
                      x={a.x - a.w / 2}
                      y={a.y - 14}
                      width={a.w}
                      height={28}
                      rx={14}
                      fill="var(--surface-2)"
                      stroke="var(--muted)"
                    />
                    <text
                      x={a.x}
                      y={a.y + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={800}
                      fill="var(--text)"
                    >
                      {trunc(a.cat, 18)}
                    </text>
                  </g>
                ))}
              </>
            ) : (
              <>
                {/* lines from the docked category to every item */}
                {anchor &&
                  nodes.map((nd) => (
                    <line
                      key={`l-${nd.item.id}`}
                      x1={anchor.x}
                      y1={anchor.y}
                      x2={nd.x}
                      y2={nd.y}
                      stroke="var(--border)"
                      strokeWidth={1.5}
                    />
                  ))}

                {/* item nodes */}
                {nodes.map((nd) => {
                  const on = marked.has(nd.item.id);
                  return (
                    <g key={nd.item.id} style={{ cursor: "pointer" }} onClick={() => tap(nd.item)}>
                      <rect
                        x={nd.x - nd.w / 2}
                        y={nd.y - 13}
                        width={nd.w}
                        height={26}
                        rx={13}
                        fill={on ? "var(--accent-dim)" : "var(--surface-2)"}
                        stroke={on ? "var(--accent)" : "var(--border)"}
                      />
                      <text
                        x={nd.x}
                        y={nd.y + 4}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={600}
                        fill={on ? "#fff" : "var(--text)"}
                      >
                        {nd.item.is_cheapest ? "★ " : ""}
                        {nd.label}
                      </text>
                    </g>
                  );
                })}

                {/* docked category (bottom-left) = tap to go back */}
                {anchor && (
                  <g style={{ cursor: "pointer" }} onClick={() => setOpenCat(null)}>
                    <rect
                      x={anchor.x - anchor.w / 2}
                      y={anchor.y - 16}
                      width={anchor.w}
                      height={32}
                      rx={16}
                      fill="var(--accent)"
                      stroke="var(--accent)"
                    />
                    <text
                      x={anchor.x}
                      y={anchor.y + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={800}
                      fill="#06231a"
                    >
                      {trunc(anchor.cat, 20)} ✕
                    </text>
                  </g>
                )}
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
