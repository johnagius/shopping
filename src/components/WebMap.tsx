import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useCategories } from "../lib/useCategories";
import { tierColor } from "../lib/tiers";
import type { CatalogItem } from "../lib/types";

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

function resolveCollisions(
  rects: Rect[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  obstacles: Rect[],
  iters = 220,
  gap = 12,
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
      } else b.x += s;
    } else {
      if (dy === 0) dy = 1;
      const s = oy * (dy < 0 ? -1 : 1);
      if (moveA) {
        a.y -= s / 2;
        b.y += s / 2;
      } else b.y += s;
    }
  };
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) sep(rects[i], rects[j], true);
    for (const o of obstacles) for (const r of rects) sep(o, r, false);
    for (const r of rects) clampRect(r);
  }
}

function hasOverlap(rects: Rect[], gap = 4): boolean {
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap)
        return true;
    }
  return false;
}

type Node = {
  item: CatalogItem;
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
  lines: string[];
  pinned: boolean;
};
type AisleNode = { cat: string; x: number; y: number; w: number; h: number };

export function WebMap({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [positions, setPositions] = useState<Map<number, { nx: number; ny: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 900, h: 620 });
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; sx: number; sy: number; moved: boolean; item: CatalogItem } | null>(null);
  const { orderOf } = useCategories();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, st, pos] = await Promise.all([
        api.getCatalog(),
        api.getBoardState(),
        api.getNodePositions(),
      ]);
      setItems(cat);
      setMarked(new Set(st.marked));
      setPositions(new Map(pos.map((p) => [p.catalog_id, { nx: p.nx, ny: p.ny }])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const pad = 30;

  const layout = useMemo(() => {
    const { w, h } = size;
    const groups = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const cat = it.category ?? "Other";
      groups.set(cat, [...(groups.get(cat) ?? []), it]);
    }
    const ordered = [...groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));

    const sizePill = (lines: string[], font: number) => {
      const ch = font * 0.6;
      const longest = Math.max(1, ...lines.map((l) => l.length));
      return { w: longest * ch + font * 1.4, h: lines.length * (font * 1.25) + font * 0.9 };
    };

    if (openCat === null) {
      const A = ordered.length || 1;
      const R = Math.min(w, h) * 0.38;
      const cx = w / 2;
      const cy = h / 2;
      const startFont = clamp(Math.sqrt((w * h) / Math.max(8, A)) * 0.16, 12, 28);
      let chosen: { aisles: AisleNode[]; font: number } | null = null;
      for (let step = 0; step < 14; step++) {
        const font = Math.max(9, startFont * Math.pow(0.9, step));
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
          180,
          12,
        );
        chosen = { aisles, font };
        if (!hasOverlap(aisles, 6)) break;
      }
      return {
        mode: "collapsed" as const,
        aisles: chosen!.aisles,
        nodes: [] as Node[],
        anchor: null,
        font: chosen!.font,
        hub: { cx, cy },
      };
    }

    // Expanded
    const list = (groups.get(openCat) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const n = list.length || 1;
    const area = (w - 2 * pad) * (h - 2 * pad) * 0.82;
    const cell = Math.sqrt(area / n);
    const startFont = clamp(cell * 0.34, 9, 30);

    // frequency hierarchy
    const counts = list.map((i) => i.order_count);
    const maxC = Math.max(1, ...counts);
    const minC = Math.min(...counts);
    const freqScale = (c: number) => (maxC === minC ? 1 : 0.85 + ((c - minC) / (maxC - minC)) * 0.55);

    const A0 = (6 * Math.PI) / 180;
    const A1 = (84 * Math.PI) / 180;
    const r0n = 0.16;
    const drn = 0.13;
    const SPn = 0.16;

    const buildExpanded = (baseFont: number) => {
      const mkNode = (it: CatalogItem, x: number, y: number, pinned: boolean): Node => {
        const font = clamp(baseFont * freqScale(it.order_count), 9, 34);
        const maxChars = clamp(Math.round((cell * 1.4) / (font * 0.6)), 10, 24);
        const lines = wrapLabel(it.short_name || it.name, maxChars);
        const p = sizePill(lines, font);
        return { item: it, x, y, w: p.w, h: p.h, font, lines, pinned };
      };

      const pinnedNodes: Node[] = [];
      const unpinnedItems: CatalogItem[] = [];
      for (const it of list) {
        const pos = positions.get(it.id);
        if (pos) {
          pinnedNodes.push(
            mkNode(it, pad + pos.nx * (w - 2 * pad), pad + pos.ny * (h - 2 * pad), true),
          );
        } else unpinnedItems.push(it);
      }

      // fan-seed the unpinned items
      const m = unpinnedItems.length;
      const raw: { fx: number; fy: number; it: CatalogItem }[] = [];
      let placed = 0;
      let ring = 0;
      while (placed < m) {
        const r = r0n + ring * drn;
        const cap = Math.max(1, Math.floor(((A1 - A0) * r) / SPn));
        const take = Math.min(cap, m - placed);
        for (let j = 0; j < take; j++) {
          const a = take === 1 ? (A0 + A1) / 2 : A0 + ((A1 - A0) * j) / (take - 1);
          raw.push({ fx: r * Math.cos(a), fy: r * Math.sin(a), it: unpinnedItems[placed + j] });
        }
        placed += take;
        ring++;
      }
      const maxF = Math.max(...raw.map((p) => Math.max(p.fx, p.fy)), 0.001);
      const unpinnedNodes: Node[] = raw.map(({ fx, fy, it }) =>
        mkNode(it, pad + (fx / maxF) * (w - 2 * pad), h - pad - (fy / maxF) * (h - 2 * pad), false),
      );

      const ap = sizePill([openCat], clamp(baseFont * 1.05, 12, 26));
      const anchor: AisleNode = {
        cat: openCat,
        x: pad + ap.w / 2,
        y: h - pad - ap.h / 2,
        w: ap.w,
        h: ap.h,
      };

      // resolve only the unpinned, avoiding the anchor + pinned nodes
      resolveCollisions(
        unpinnedNodes,
        { minX: pad, minY: pad, maxX: w - pad, maxY: h - pad },
        [anchor, ...pinnedNodes],
      );
      return { nodes: [...pinnedNodes, ...unpinnedNodes], anchor };
    };

    let result = buildExpanded(startFont);
    let font = startFont;
    for (let step = 0; step < 14; step++) {
      font = Math.max(9, startFont * Math.pow(0.88, step));
      result = buildExpanded(font);
      if (!hasOverlap(result.nodes, 6)) break;
    }

    return {
      mode: "expanded" as const,
      aisles: [] as AisleNode[],
      nodes: result.nodes,
      anchor: result.anchor,
      font,
      hub: { cx: 0, cy: 0 },
    };
  }, [items, orderOf, openCat, size, positions]);

  const { mode, aisles, nodes, anchor, font, hub } = layout;
  const anchorFont = clamp(font * 1.05, 12, 26);
  const openHasPins = mode === "expanded" && nodes.some((n) => n.pinned);

  // ---- drag handling (expanded item nodes) ----
  const svgPoint = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent, nd: Node) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: nd.item.id, sx: e.clientX, sy: e.clientY, moved: false, item: nd.item };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    d.moved = true;
    const { x, y } = svgPoint(e);
    setDrag({ id: d.id, x: clamp(x, pad, size.w - pad), y: clamp(y, pad, size.h - pad) });
  };
  const onPointerUp = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      setDrag(null);
      await tap(d.item);
      return;
    }
    const { x, y } = svgPoint(e);
    const nx = clamp((clamp(x, pad, size.w - pad) - pad) / (size.w - 2 * pad), 0, 1);
    const ny = clamp((clamp(y, pad, size.h - pad) - pad) / (size.h - 2 * pad), 0, 1);
    setPositions((prev) => new Map(prev).set(d.id, { nx, ny }));
    setDrag(null);
    try {
      await api.saveNodePosition(d.id, nx, ny);
    } catch {
      /* ignore */
    }
  };

  const resetLayout = async () => {
    const ids = nodes.map((n) => n.item.id);
    setPositions((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    try {
      await api.clearNodePositions(ids);
      showToast("Layout reset");
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="card">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {mode === "collapsed"
              ? "Tap a category to open it."
              : "Tap to copy + mark · drag to arrange · ✎ short name · tap the category (bottom-left) to go back."}
          </span>
          <div className="spacer" />
          {openHasPins && (
            <button className="btn secondary" onClick={resetLayout}>
              Reset layout
            </button>
          )}
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
            touchAction: "none",
          }}
        >
          <svg
            viewBox={`0 0 ${size.w} ${size.h}`}
            width={size.w}
            height={size.h}
            style={{ display: "block" }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
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
                  <g
                    key={`a-${a.cat}`}
                    className="web-node"
                    style={{ cursor: "pointer", transform: `translate(${a.x}px, ${a.y}px)` }}
                    onClick={() => setOpenCat(a.cat)}
                  >
                    <rect x={-a.w / 2} y={-a.h / 2} width={a.w} height={a.h} rx={a.h / 2} fill="var(--surface-2)" stroke="var(--muted)" />
                    <text x={0} y={font * 0.35} textAnchor="middle" fontSize={font} fontWeight={800} fill="var(--text)">
                      {a.cat}
                    </text>
                  </g>
                ))}
              </>
            ) : (
              <>
                {anchor &&
                  nodes.map((nd) => {
                    const dp = drag && drag.id === nd.item.id ? drag : null;
                    return (
                      <line
                        key={`l-${nd.item.id}`}
                        x1={anchor.x}
                        y1={anchor.y}
                        x2={dp ? dp.x : nd.x}
                        y2={dp ? dp.y : nd.y}
                        stroke="var(--border)"
                        strokeWidth={1.5}
                      />
                    );
                  })}

                {nodes.map((nd) => {
                  const on = marked.has(nd.item.id);
                  const dp = drag && drag.id === nd.item.id ? drag : null;
                  const tc = tierColor(nd.item.tier);
                  const x = dp ? dp.x : nd.x;
                  const y = dp ? dp.y : nd.y;
                  return (
                    <g
                      key={nd.item.id}
                      className={`web-node${dp ? " dragging" : ""}`}
                      style={{ cursor: "grab", transform: `translate(${x}px, ${y}px)` }}
                      onPointerDown={(e) => onPointerDown(e, nd)}
                    >
                      <rect
                        x={-nd.w / 2}
                        y={-nd.h / 2}
                        width={nd.w}
                        height={nd.h}
                        rx={Math.min(16, nd.h / 2)}
                        fill={on ? "var(--accent-dim)" : "var(--surface-2)"}
                        stroke={on ? "var(--accent)" : tc}
                        strokeWidth={on ? 2 : 1.5}
                      />
                      <text textAnchor="middle" fontSize={nd.font} fontWeight={600} fill={on ? "#fff" : "var(--text)"}>
                        {nd.lines.map((ln, li) => (
                          <tspan key={li} x={0} y={-nd.h / 2 + nd.font * 1.15 + li * nd.font * 1.25}>
                            {li === 0 && nd.item.is_cheapest ? "★ " : ""}
                            {ln}
                          </tspan>
                        ))}
                      </text>
                      <g onClick={(e) => editShort(e, nd.item)} onPointerDown={(e) => e.stopPropagation()} style={{ cursor: "pointer" }}>
                        <circle cx={nd.w / 2 - nd.font * 0.8} cy={-nd.h / 2 + nd.font * 0.8} r={nd.font * 0.78} fill="var(--surface)" stroke={on ? "var(--accent)" : "var(--border)"} />
                        <text x={nd.w / 2 - nd.font * 0.8} y={-nd.h / 2 + nd.font * 0.8 + nd.font * 0.3} textAnchor="middle" fontSize={nd.font * 0.72} fill="var(--muted)">
                          ✎
                        </text>
                      </g>
                    </g>
                  );
                })}

                {anchor && (
                  <g
                    className="web-node"
                    style={{ cursor: "pointer", transform: `translate(${anchor.x}px, ${anchor.y}px)` }}
                    onClick={() => setOpenCat(null)}
                  >
                    <rect x={-anchor.w / 2} y={-anchor.h / 2} width={anchor.w} height={anchor.h} rx={anchor.h / 2} fill="var(--accent)" stroke="var(--accent)" />
                    <text x={0} y={anchorFont * 0.35} textAnchor="middle" fontSize={anchorFont} fontWeight={800} fill="#06231a">
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
