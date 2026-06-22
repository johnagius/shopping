import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { AISLES, aisleOrder } from "../lib/categorize";
import { parseWoltReceipt } from "../lib/woltParser";
import type { CatalogItem, RestockItem, ShoppingListItem } from "../lib/types";

/** Does pasted text look like a Wolt receipt rather than a plain item name? */
function looksLikeReceipt(text: string): boolean {
  if (!/\n/.test(text)) return false;
  if (/total sum/i.test(text) || /order id/i.test(text) || /included in the order/i.test(text)) {
    return true;
  }
  const products = parseWoltReceipt(text).items.filter((i) => !i.isFee);
  return products.length >= 2;
}

export function ShoppingList({
  showToast,
  onPasteReceipt,
}: {
  showToast: (m: string) => void;
  onPasteReceipt: (text: string) => void;
}) {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [usual, setUsual] = useState<CatalogItem[]>([]);
  const [restock, setRestock] = useState<RestockItem[]>([]);
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sugg, due] = await Promise.all([
        api.getList(),
        api.getSuggestions(),
        api.getRestock(),
      ]);
      setItems(list);
      setUsual(sugg);
      setRestock(due);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Autocomplete from the catalog of past products.
  useEffect(() => {
    const q = name.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const res = await api.getCatalog(q);
        if (active) setSuggestions(res.slice(0, 6));
      } catch {
        /* ignore */
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [name]);

  const add = async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setName("");
    setSuggestions([]);
    await api.addToList(v);
    await load();
  };

  // Pasting into the add box: if it's a receipt, send it to Import; if it's
  // several lines, add each as its own item; otherwise behave normally.
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/\n/.test(text)) return; // single line: default behaviour
    e.preventDefault();
    if (looksLikeReceipt(text)) {
      showToast("Looks like a receipt — opening Import");
      onPasteReceipt(text);
      setName("");
      return;
    }
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    void (async () => {
      await api.addItemsToList(lines.map((name) => ({ name })));
      showToast(`Added ${lines.length} items`);
      setName("");
      await load();
    })();
  };

  const setCategory = async (it: ShoppingListItem, category: string) => {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, category } : x)));
    setEditing(null);
    await api.updateListItem(it.id, { category });
    await load();
  };

  const addAllDue = async () => {
    const due = restock.filter((r) => r.status === "due");
    if (due.length === 0) return;
    await api.addItemsToList(due.map((r) => ({ name: r.name })));
    showToast(`Added ${due.length} restock item${due.length === 1 ? "" : "s"}`);
    await load();
  };

  const setChecked = async (it: ShoppingListItem, checked: boolean) => {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, checked: checked ? 1 : 0 } : x)));
    await api.updateListItem(it.id, { checked });
    await load();
  };

  const setQty = async (it: ShoppingListItem, qty: number) => {
    if (qty < 1) return;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, quantity: qty } : x)));
    await api.updateListItem(it.id, { quantity: qty });
  };

  const remove = async (it: ShoppingListItem) => {
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    await api.deleteListItem(it.id);
  };

  const clearChecked = async () => {
    const { deleted } = await api.clearChecked();
    showToast(deleted ? `Cleared ${deleted} bought item${deleted > 1 ? "s" : ""}` : "Nothing checked");
    await load();
  };

  const checkedCount = items.filter((i) => i.checked).length;
  const remaining = items.length - checkedCount;
  const estTotal = items
    .filter((i) => !i.checked && i.last_price != null)
    .reduce((s, i) => s + (i.last_price ?? 0) * i.quantity, 0);

  // Group unchecked items by aisle; checked go to a "Done" group at the bottom.
  const active = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const groups = new Map<string, ShoppingListItem[]>();
  for (const it of active) {
    const cat = it.category ?? "Other";
    groups.set(cat, [...(groups.get(cat) ?? []), it]);
  }
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => aisleOrder(a[0]) - aisleOrder(b[0]),
  );

  const renderItem = (it: ShoppingListItem) => (
    <div key={it.id} className={`list-item ${it.checked ? "checked" : ""}`}>
      <button
        className={`check ${it.checked ? "on" : ""}`}
        onClick={() => setChecked(it, !it.checked)}
        aria-label="toggle bought"
      >
        {it.checked ? "✓" : ""}
      </button>
      <div>
        <div className="name">{it.name}</div>
        <div className="sub">
          {it.last_price != null && `€${it.last_price.toFixed(2)} ea`}
          {it.last_shop ? ` · last from ${it.last_shop}` : ""}
          {it.note ? ` · ${it.note}` : ""}
        </div>
        {!it.checked &&
          (editing === it.id ? (
            <select
              autoFocus
              value={it.category ?? "Other"}
              onChange={(e) => setCategory(it, e.target.value)}
              onBlur={() => setEditing(null)}
              style={{ marginTop: 4, width: "auto", padding: "4px 6px", fontSize: 12 }}
            >
              {AISLES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <button
              className="tag"
              style={{ cursor: "pointer", marginTop: 4 }}
              onClick={() => setEditing(it.id)}
              title="Change aisle"
            >
              {it.category ?? "Other"} ▾
            </button>
          ))}
      </div>
      <div className="spacer" />
      <div className="qty">
        <button onClick={() => setQty(it, it.quantity - 1)}>−</button>
        <span>{it.quantity}</span>
        <button onClick={() => setQty(it, it.quantity + 1)}>+</button>
      </div>
      <button className="icon" onClick={() => remove(it)} aria-label="remove">
        ✕
      </button>
    </div>
  );

  return (
    <div>
      <div className="card">
        <div className="row">
          <input
            placeholder="Add an item, or paste a receipt…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add(name)}
            onPaste={onPaste}
            autoComplete="off"
          />
          <button className="btn" onClick={() => add(name)}>
            Add
          </button>
        </div>
        {suggestions.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((s) => (
              <button key={s.id} className="tag" style={{ cursor: "pointer" }} onClick={() => add(s.name)}>
                {s.name}
                {s.last_price != null ? ` · €${s.last_price.toFixed(2)}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {restock.some((r) => r.status === "due" || r.status === "soon") && (
        <div className="card">
          <div className="row">
            <h2 className="section" style={{ margin: 0 }}>
              Due to buy again
            </h2>
            <div className="spacer" />
            {restock.some((r) => r.status === "due") && (
              <button className="btn secondary" onClick={addAllDue}>
                Add all due
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {restock
              .filter((r) => r.status === "due" || r.status === "soon")
              .slice(0, 12)
              .map((r) => (
                <button
                  key={r.norm_name}
                  className={`tag ${r.status === "due" ? "warn" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => add(r.name)}
                  title={
                    r.avgIntervalDays
                      ? `Bought ~every ${r.avgIntervalDays}d · last ${r.daysSinceLast}d ago`
                      : undefined
                  }
                >
                  + {r.name}
                  {r.status === "due"
                    ? " · due"
                    : r.dueInDays != null
                      ? ` · ~${r.dueInDays}d`
                      : ""}
                </button>
              ))}
          </div>
        </div>
      )}

      {usual.length > 0 && (
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>
            You usually buy
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {usual.slice(0, 10).map((s) => (
              <button
                key={s.id}
                className="tag"
                style={{ cursor: "pointer" }}
                onClick={() => add(s.name)}
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          Your list is empty.
          <br />
          Add items above, or reorder from <strong>History</strong>.
        </div>
      ) : (
        <>
          {sortedGroups.map(([cat, group]) => (
            <div key={cat} className="card">
              <h2 className="section" style={{ marginTop: 0 }}>
                {cat}
              </h2>
              {group.map(renderItem)}
            </div>
          ))}

          {done.length > 0 && (
            <div className="card">
              <h2 className="section" style={{ marginTop: 0 }}>
                Done
              </h2>
              {done.map(renderItem)}
            </div>
          )}

          <div className="row">
            <span className="muted">
              {remaining} to buy · {checkedCount} done
              {estTotal > 0 ? ` · ~€${estTotal.toFixed(2)}` : ""}
            </span>
            <div className="spacer" />
            {checkedCount > 0 && (
              <button className="btn secondary" onClick={clearChecked}>
                Clear bought
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
