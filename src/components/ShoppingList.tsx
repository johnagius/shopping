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
  return parseWoltReceipt(text).items.filter((i) => !i.isFee).length >= 2;
}

async function copyText(text: string, showToast: (m: string) => void, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
  } catch {
    showToast("Couldn't copy");
  }
}

type EditState = { id: number; name: string; note: string; category: string };

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
  const [edit, setEdit] = useState<EditState | null>(null);

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

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/\n/.test(text)) return;
    e.preventDefault();
    if (looksLikeReceipt(text)) {
      showToast("Looks like a receipt — opening Import");
      onPasteReceipt(text);
      setName("");
      return;
    }
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    void (async () => {
      await api.addItemsToList(lines.map((n) => ({ name: n })));
      showToast(`Added ${lines.length} items`);
      setName("");
      await load();
    })();
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
    await load();
  };

  const saveEdit = async () => {
    if (!edit) return;
    await api.updateListItem(edit.id, {
      name: edit.name,
      note: edit.note,
      category: edit.category,
    });
    setEdit(null);
    await load();
  };

  const clearChecked = async () => {
    const { deleted } = await api.clearChecked();
    showToast(deleted ? `Cleared ${deleted} bought` : "Nothing checked");
    await load();
  };

  const clearAll = async () => {
    if (!window.confirm("Clear the entire list?")) return;
    await Promise.all(items.map((i) => api.deleteListItem(i.id)));
    showToast("List cleared");
    await load();
  };

  const buildWeekly = async () => {
    const onList = new Set(items.filter((i) => !i.checked).map((i) => i.norm_name));
    const names = new Set<string>();
    restock.filter((r) => r.status === "due" || r.status === "soon").forEach((r) => {
      if (!onList.has(r.norm_name)) names.add(r.name);
    });
    usual.forEach((u) => {
      if (!onList.has(u.norm_name)) names.add(u.name);
    });
    const list = [...names];
    if (list.length === 0) {
      showToast("Nothing to add — list already has your usuals");
      return;
    }
    await api.addItemsToList(list.map((n) => ({ name: n })));
    showToast(`Added ${list.length} items to your list`);
    await load();
  };

  const copyList = () => {
    const active = items.filter((i) => !i.checked);
    if (active.length === 0) return showToast("List is empty");
    copyText(active.map((i) => i.name).join("\n"), showToast, `Copied ${active.length} items`);
  };

  const checkedCount = items.filter((i) => i.checked).length;
  const remaining = items.length - checkedCount;
  const estTotal = items
    .filter((i) => !i.checked && i.last_price != null)
    .reduce((s, i) => s + (i.last_price ?? 0) * i.quantity, 0);

  const active = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const groups = new Map<string, ShoppingListItem[]>();
  for (const it of active) {
    const cat = it.category ?? "Other";
    groups.set(cat, [...(groups.get(cat) ?? []), it]);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => aisleOrder(a[0]) - aisleOrder(b[0]));

  const renderItem = (it: ShoppingListItem) => {
    if (edit && edit.id === it.id) {
      return (
        <div key={it.id} className="list-item" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            style={{ flex: "1 1 100%", fontWeight: 600 }}
            autoFocus
          />
          <input
            value={edit.note}
            placeholder="Note (e.g. brand, size)"
            onChange={(e) => setEdit({ ...edit, note: e.target.value })}
            style={{ flex: "1 1 60%" }}
          />
          <select
            value={edit.category}
            onChange={(e) => setEdit({ ...edit, category: e.target.value })}
            style={{ width: "auto", padding: "8px", fontSize: 13 }}
          >
            {AISLES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <button className="btn secondary" onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button className="btn" onClick={saveEdit}>
            Save
          </button>
        </div>
      );
    }
    return (
      <div key={it.id} className={`list-item ${it.checked ? "checked" : ""}`}>
        <button
          className={`check ${it.checked ? "on" : ""}`}
          onClick={() => setChecked(it, !it.checked)}
          aria-label="toggle bought"
        >
          {it.checked ? "✓" : ""}
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="name">{it.name}</div>
          <div className="sub">
            {it.last_price != null && `€${it.last_price.toFixed(2)} ea`}
            {it.last_shop ? ` · ${it.last_shop}` : ""}
            {it.note ? ` · ${it.note}` : ""}
          </div>
        </div>
        <div className="spacer" />
        <button
          className="icon"
          title="Copy name (to paste into Wolt)"
          onClick={() => copyText(it.name, showToast, "Copied")}
        >
          ⧉
        </button>
        {!it.checked && (
          <button
            className="icon"
            title="Edit"
            onClick={() =>
              setEdit({ id: it.id, name: it.name, note: it.note ?? "", category: it.category ?? "Other" })
            }
          >
            ✎
          </button>
        )}
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
  };

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
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn secondary" onClick={buildWeekly}>
            ⚡ Build weekly shop
          </button>
          {active.length > 0 && (
            <button className="btn secondary" onClick={copyList}>
              ⧉ Copy list
            </button>
          )}
        </div>
      </div>

      {restock.some((r) => r.status === "due" || r.status === "soon") && (
        <div className="card">
          <div className="row">
            <h2 className="section" style={{ margin: 0 }}>
              Due to buy again
            </h2>
            <div className="spacer" />
            {restock.some((r) => r.status === "due") && (
              <button
                className="btn secondary"
                onClick={async () => {
                  const due = restock.filter((r) => r.status === "due");
                  await api.addItemsToList(due.map((r) => ({ name: r.name })));
                  showToast(`Added ${due.length} restock items`);
                  await load();
                }}
              >
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
                >
                  + {r.name}
                  {r.status === "due" ? " · due" : r.dueInDays != null ? ` · ~${r.dueInDays}d` : ""}
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
              <button key={s.id} className="tag" style={{ cursor: "pointer" }} onClick={() => add(s.name)}>
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
          Add items, hit <strong>Build weekly shop</strong>, or reorder from <strong>Orders</strong>.
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
            <button className="btn danger" onClick={clearAll} style={{ marginLeft: 8 }}>
              Clear all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
