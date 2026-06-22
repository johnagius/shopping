import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import type { CatalogItem } from "../lib/types";

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type Node = {
  item: CatalogItem;
  x: number;
  y: number;
  w: number;
  label: string;
};
type Branch = {
  cat: string;
  ax: number; // aisle node
  ay: number;
  aw: number;
  nodes: Node[];
};

export function WebMap({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
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

  // Build the radial layout.
  const { branches, size, center } = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const cat = it.category ?? "Other";
      groups.set(cat, [...(groups.get(cat) ?? []), it]);
    }
    const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
    const A = ordered.length || 1;

    // Canvas big enough for the longest branch; scrollable.
    const maxItems = Math.max(1, ...ordered.map(([, l]) => l.length));
    const R_AISLE = 190;
    const STEP = 46;
    const reach = R_AISLE + 110 + maxItems * STEP;
    const sz = Math.max(700, Math.ceil(reach * 2 + 120));
    const cx = sz / 2;
    const cy = sz / 2;

    const charW = 6.6;
    const pillW = (s: string) => Math.min(190, Math.max(44, s.length * charW + 18));

    const br: Branch[] = ordered.map(([cat, list], i) => {
      const ang = (-Math.PI / 2) + (2 * Math.PI * i) / A;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const px = -uy; // perpendicular
      const py = ux;
      const ax = cx + ux * R_AISLE;
      const ay = cy + uy * R_AISLE;
      const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      const nodes: Node[] = sorted.map((it, k) => {
        const dist = R_AISLE + 90 + k * STEP;
        const off = (k % 2 === 0 ? -1 : 1) * 16;
        const label = trunc(it.short_name || it.name, 22);
        return {
          item: it,
          x: cx + ux * dist + px * off,
          y: cy + uy * dist + py * off,
          w: pillW(label),
          label,
        };
      });
      return { cat, ax, ay, aw: pillW(cat), nodes };
    });

    return { branches: br, size: sz, center: { x: cx, y: cy } };
  }, [items, orderOf]);

  return (
    <div>
      <div className="card">
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>
            Tap a node to copy its name and mark it added (green). Pan around the web.
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
            overflow: "auto",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            maxHeight: "75vh",
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
            {/* spokes + branch lines */}
            {branches.map((b) => (
              <g key={`l-${b.cat}`}>
                <line
                  x1={center.x}
                  y1={center.y}
                  x2={b.ax}
                  y2={b.ay}
                  stroke="var(--accent-dim)"
                  strokeWidth={2}
                />
                {b.nodes.map((n, k) => {
                  const prev = k === 0 ? { x: b.ax, y: b.ay } : b.nodes[k - 1];
                  return (
                    <line
                      key={`bl-${n.item.id}`}
                      x1={prev.x}
                      y1={prev.y}
                      x2={n.x}
                      y2={n.y}
                      stroke="var(--border)"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            ))}

            {/* center hub */}
            <circle cx={center.x} cy={center.y} r={26} fill="var(--accent)" />
            <text
              x={center.x}
              y={center.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={800}
              fill="#06231a"
            >
              Items
            </text>

            {/* aisle nodes */}
            {branches.map((b) => (
              <g key={`a-${b.cat}`}>
                <rect
                  x={b.ax - b.aw / 2}
                  y={b.ay - 13}
                  width={b.aw}
                  height={26}
                  rx={13}
                  fill="var(--surface-2)"
                  stroke="var(--muted)"
                />
                <text
                  x={b.ax}
                  y={b.ay + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  fill="var(--text)"
                >
                  {trunc(b.cat, 18)}
                </text>
              </g>
            ))}

            {/* item nodes */}
            {branches.map((b) =>
              b.nodes.map((n) => {
                const on = marked.has(n.item.id);
                return (
                  <g
                    key={n.item.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => tap(n.item)}
                  >
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
        </div>
      )}
    </div>
  );
}
