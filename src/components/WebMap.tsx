import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import type { CatalogItem } from "../lib/types";

/** Greedily wrap into up to 2 lines of ~maxChars; ellipsize overflow. */
function wrapLabel(name: string, maxChars: number): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === 1) break;
    }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  // leftover words beyond 2 lines: append + ellipsis on the 2nd
  const used = lines.join(" ").length;
  if (used < name.length) {
    let second = lines[1] ?? "";
    if (second.length > maxChars - 1) second = second.slice(0, maxChars - 1);
    lines[1] = (second + "…").trim();
  }
  return lines.slice(0, 2);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Push apart any overlapping rectangles and keep them inside `bounds`, treating
 * `obstacles` as fixed. Mutates the rects' centres in place.
 */
function resolveCollisions(
  rects: Rect[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  obstacles: Rect[],
  iters = 140,
  gap = 10,
) {
  const clampRect = (r: Rect) => {
    const minx = bounds.minX + r.w / 2;
    const maxx = bounds.maxX - r.w / 2;
    const miny = bounds.minY + r.h / 2;
    const maxy = bounds.maxY - r.h / 2;
    r.x = maxx >= minx ? clamp(r.x, minx, maxx) : (bounds.minX + bounds.maxX) / 2;
    r.y = maxy >= miny ? clamp(r.y, miny, maxy) : (bounds.minY + bounds.maxY) / 2;
  };
  const sep = (a: Rect, b: Rect, moveA: boolean) => {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const ox = a.w / 2 + b.w / 2 + gap - Math.abs(dx);
    const oy = a.h / 2 + b.h / 2 + gap - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return;
    if (ox < oy) {
      if (dx === 0) dx = 1;
      const s = ox * (dx < 0 ? -1 : 1);
      if (moveA) {
        a.x -= s / 2;
        b.x += s / 2;
      } else {
        b.x += s;
      }
    } else {
      if (dy === 0) dy = 1;
      const s = oy * (dy < 0 ? -1 : 1);
      if (moveA) {
        a.y -= s / 2;
        b.y += s / 2;
      } else {
        b.y += s;
      }
    }
  };
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) sep(rects[i], rects[j], true);
    for (const o of obstacles) for (const r of rects) sep(o, r, false);
    for (const r of rects) clampRect(r);
  }
}

type Node = {
  item: CatalogItem;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
};
type AisleNode = { cat: string; x: number; y: number; w: number; h: number };

export function WebMap({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 900, h: 620 });
  const wrapRef = useRef<HTMLDivElement>(null);
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

  // Measure the canvas so the layout is aware of the real space available.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

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
    const { w, h } = size;
    const groups = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const cat = it.category ?? "Other";
      groups.set(cat, [...(groups.get(cat) ?? []), it]);
    }
    const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));

    // Pill sizing helpers given a font size.
    const sizePill = (lines: string[], font: number) => {
      const ch = font * 0.6;
      const longest = Math.max(1, ...lines.map((l) => l.length));
      return { w: longest * ch + font * 1.4, h: lines.length * (font * 1.25) + font * 0.9 };
    };

    if (openCat === null) {
      // Collapsed: hub + category ring, sized to the canvas.
      const A = ordered.length || 1;
      const R = Math.min(w, h) * 0.38;
      const font = clamp(Math.sqrt((w * h) / Math.max(8, A)) * 0.16, 12, 26);
      const cx = w / 2;
      const cy = h / 2;
      const aisles: AisleNode[] = ordered.map(([cat], i) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * i) / A;
        const p = sizePill([cat], font);
        return { cat, x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R, w: p.w, h: p.h };
      });
      const hubR = font * 1.6;
      resolveCollisions(
        aisles,
        { minX: 8, minY: 8, maxX: w - 8, maxY: h - 8 },
        [{ x: cx, y: cy, w: hubR * 2 + 16, h: hubR * 2 + 16 }],
      );
      return { mode: "collapsed" as const, aisles, nodes: [] as Node[], anchor: null, font, hub: { cx, cy } };
    }

    // Expanded: bottom-left category + items filling the rectangle.
    const list = (groups.get(openCat) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const n = list.length || 1;
    const pad = 26;
    const area = (w - 2 * pad) * (h - 2 * pad) * 0.82;
    const cell = Math.sqrt(area / n);
    const font = clamp(cell * 0.3, 9, 30);
    const maxChars = clamp(Math.round(cell / (font * 0.6)), 8, 22);

    // Normalised quarter-fan coords in [0,1], then stretch to the box.
    const A0 = (6 * Math.PI) / 180;
    const A1 = (84 * Math.PI) / 180;
    const r0n = 0.16;
    const drn = 0.13;
    const SPn = 0.16; // normalised chord spacing
    const raw: { fx: number; fy: number; it: CatalogItem }[] = [];
    let placed = 0;
    let ring = 0;
    while (placed < n) {
      const r = r0n + ring * drn;
      const cap = Math.max(1, Math.floor(((A1 - A0) * r) / SPn));
      const take = Math.min(cap, n - placed);
      for (let j = 0; j < take; j++) {
        const a = take === 1 ? (A0 + A1) / 2 : A0 + ((A1 - A0) * j) / (take - 1);
        raw.push({ fx: r * Math.cos(a), fy: r * Math.sin(a), it: list[placed + j] });
      }
      placed += take;
      ring++;
    }
    // Normalise to [0,1] then map to the box (anchor at bottom-left).
    const maxF = Math.max(...raw.map((p) => Math.max(p.fx, p.fy)), 0.001);
    const nodes: Node[] = raw.map(({ fx, fy, it }) => {
      const lines = wrapLabel(it.short_name || it.name, maxChars);
      const p = sizePill(lines, font);
      return {
        item: it,
        x: pad + (fx / maxF) * (w - 2 * pad),
        y: h - pad - (fy / maxF) * (h - 2 * pad),
        w: p.w,
        h: p.h,
        lines,
      };
    });
    const ap = sizePill([openCat], clamp(font * 1.05, 11, 26));
    const anchor: AisleNode = { cat: openCat, x: pad + ap.w / 2, y: h - pad - ap.h / 2, w: ap.w, h: ap.h };

    resolveCollisions(nodes, { minX: pad, minY: pad, maxX: w - pad, maxY: h - pad }, [anchor]);

    return { mode: "expanded" as const, aisles: [] as AisleNode[], nodes, anchor, font, hub: { cx: 0, cy: 0 } };
  }, [items, orderOf, openCat, size]);

  const { mode, aisles, nodes, anchor, font, hub } = layout;
  const anchorFont = clamp(font * 1.05, 11, 26);

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
          ref={wrapRef}
          style={{
            overflow: "hidden",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            height: "82vh",
          }}
        >
          <svg
            viewBox={`0 0 ${size.w} ${size.h}`}
            width={size.w}
            height={size.h}
            style={{ display: "block" }}
          >
            {mode === "collapsed" ? (
              <>
                {aisles.map((a) => (
                  <line key={`l-${a.cat}`} x1={hub.cx} y1={hub.cy} x2={a.x} y2={a.y} stroke="var(--accent-dim)" strokeWidth={2} />
                ))}
                <circle cx={hub.cx} cy={hub.cy} r={font * 1.6} fill="var(--accent)" />
                <text x={hub.cx} y={hub.cy + font * 0.35} textAnchor="middle" fontSize={font} fontWeight={800} fill="#06231a">
                  Items
                </text>
                {aisles.map((a) => (
                  <g key={`a-${a.cat}`} style={{ cursor: "pointer" }} onClick={() => setOpenCat(a.cat)}>
                    <rect x={a.x - a.w / 2} y={a.y - a.h / 2} width={a.w} height={a.h} rx={a.h / 2} fill="var(--surface-2)" stroke="var(--muted)" />
                    <text x={a.x} y={a.y + font * 0.35} textAnchor="middle" fontSize={font} fontWeight={800} fill="var(--text)">
                      {a.cat}
                    </text>
                  </g>
                ))}
              </>
            ) : (
              <>
                {anchor &&
                  nodes.map((nd) => (
                    <line key={`l-${nd.item.id}`} x1={anchor.x} y1={anchor.y} x2={nd.x} y2={nd.y} stroke="var(--border)" strokeWidth={1.5} />
                  ))}

                {nodes.map((nd) => {
                  const on = marked.has(nd.item.id);
                  return (
                    <g key={nd.item.id} style={{ cursor: "pointer" }} onClick={() => tap(nd.item)}>
                      <rect
                        x={nd.x - nd.w / 2}
                        y={nd.y - nd.h / 2}
                        width={nd.w}
                        height={nd.h}
                        rx={Math.min(16, nd.h / 2)}
                        fill={on ? "var(--accent-dim)" : "var(--surface-2)"}
                        stroke={on ? "var(--accent)" : "var(--border)"}
                      />
                      <text textAnchor="middle" fontSize={font} fontWeight={600} fill={on ? "#fff" : "var(--text)"}>
                        {nd.lines.map((ln, li) => (
                          <tspan
                            key={li}
                            x={nd.x}
                            y={nd.y - nd.h / 2 + font * 1.15 + li * font * 1.25}
                          >
                            {li === 0 && nd.item.is_cheapest ? "★ " : ""}
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}

                {anchor && (
                  <g style={{ cursor: "pointer" }} onClick={() => setOpenCat(null)}>
                    <rect
                      x={anchor.x - anchor.w / 2}
                      y={anchor.y - anchor.h / 2}
                      width={anchor.w}
                      height={anchor.h}
                      rx={anchor.h / 2}
                      fill="var(--accent)"
                      stroke="var(--accent)"
                    />
                    <text x={anchor.x} y={anchor.y + anchorFont * 0.35} textAnchor="middle" fontSize={anchorFont} fontWeight={800} fill="#06231a">
                      {anchor.cat} ✕
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
