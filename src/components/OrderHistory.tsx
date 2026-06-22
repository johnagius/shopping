import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { Order, OrderItem } from "../lib/types";

function fmtDate(o: Order & { item_count?: number }): string {
  const iso = o.ordered_on ?? (o.created_at ? o.created_at.slice(0, 10) : null);
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

type LineEdit = { id: number; name: string; quantity: number; unit_price: string };

async function copyText(text: string, showToast: (m: string) => void, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
  } catch {
    showToast("Couldn't copy");
  }
}

export function OrderHistory({ showToast }: { showToast: (m: string) => void }) {
  const [orders, setOrders] = useState<(Order & { item_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, OrderItem[]>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [lineEdit, setLineEdit] = useState<LineEdit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await api.getOrders());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = async (id: number) => {
    const o = await api.getOrder(id);
    setDetail((d) => ({ ...d, [id]: o.items ?? [] }));
  };

  const toggle = async (id: number) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (!detail[id]) await loadDetail(id);
  };

  const copyAll = (id: number) => {
    const names = (detail[id] ?? []).filter((i) => !i.is_fee).map((i) => i.name);
    if (names.length === 0) return;
    copyText(names.join("\n"), showToast, `Copied ${names.length} items`);
  };

  const deleteOrder = async (o: Order & { item_count: number }) => {
    if (!window.confirm(`Delete the ${o.shop_name ?? "order"} order (${o.item_count} items)? This can't be undone.`))
      return;
    setBusy(o.id);
    try {
      await api.deleteOrder(o.id);
      showToast("Order deleted");
      setOpen(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const saveLine = async (orderId: number) => {
    if (!lineEdit) return;
    await api.updateOrderItem(lineEdit.id, {
      name: lineEdit.name,
      quantity: lineEdit.quantity,
      unit_price: lineEdit.unit_price === "" ? null : Number(lineEdit.unit_price),
    });
    setLineEdit(null);
    await Promise.all([loadDetail(orderId), load()]);
  };

  const deleteLine = async (orderId: number, it: OrderItem) => {
    if (!window.confirm(`Remove "${it.name}" from this order?`)) return;
    await api.deleteOrderItem(it.id);
    showToast("Item removed");
    await Promise.all([loadDetail(orderId), load()]);
  };

  if (loading) return <div className="empty">Loading…</div>;
  if (orders.length === 0)
    return (
      <div className="empty">
        No orders yet.
        <br />
        Import a Wolt receipt to build your history.
      </div>
    );

  const totalSpend = orders.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <div>
      <div className="card">
        <div className="row">
          <span className="muted">
            {orders.length} order{orders.length === 1 ? "" : "s"}
          </span>
          <div className="spacer" />
          <span className="muted">€{totalSpend.toFixed(2)} total</span>
        </div>
      </div>

      {orders.map((o) => (
        <div key={o.id} className="card">
          <div className="row" onClick={() => toggle(o.id)} style={{ cursor: "pointer" }}>
            <div style={{ minWidth: 0 }}>
              <div className="name" style={{ fontWeight: 700 }}>
                {o.shop_name ?? "Order"}
              </div>
              <div className="sub">
                {fmtDate(o)} · {o.item_count} item{o.item_count === 1 ? "" : "s"}
                {o.total != null ? ` · €${o.total.toFixed(2)}` : ""}
              </div>
            </div>
            <div className="spacer" />
            <span className="muted" style={{ fontSize: 18 }}>
              {open === o.id ? "▴" : "▾"}
            </span>
          </div>

          {open === o.id && (
            <div style={{ marginTop: 10 }}>
              {(detail[o.id] ?? []).map((it) =>
                lineEdit && lineEdit.id === it.id ? (
                  <div key={it.id} className="list-item" style={{ flexWrap: "wrap", gap: 8 }}>
                    <input
                      value={lineEdit.name}
                      onChange={(e) => setLineEdit({ ...lineEdit, name: e.target.value })}
                      style={{ flex: "1 1 100%", fontWeight: 600 }}
                      autoFocus
                    />
                    <div className="qty">
                      <button
                        onClick={() =>
                          setLineEdit({ ...lineEdit, quantity: Math.max(1, lineEdit.quantity - 1) })
                        }
                      >
                        −
                      </button>
                      <span>{lineEdit.quantity}</span>
                      <button onClick={() => setLineEdit({ ...lineEdit, quantity: lineEdit.quantity + 1 })}>
                        +
                      </button>
                    </div>
                    <div style={{ position: "relative", width: 90 }}>
                      <span style={{ position: "absolute", left: 8, top: 9, color: "var(--muted)" }}>€</span>
                      <input
                        value={lineEdit.unit_price}
                        inputMode="decimal"
                        onChange={(e) => setLineEdit({ ...lineEdit, unit_price: e.target.value })}
                        style={{ paddingLeft: 20 }}
                      />
                    </div>
                    <div className="spacer" />
                    <button className="btn secondary" onClick={() => setLineEdit(null)}>
                      Cancel
                    </button>
                    <button className="btn" onClick={() => saveLine(o.id)}>
                      Save
                    </button>
                  </div>
                ) : (
                  <div key={it.id} className="list-item">
                    <div style={{ minWidth: 0 }}>
                      <div className="name">
                        {it.quantity > 1 ? `${it.quantity}× ` : ""}
                        {it.name}
                        {it.is_fee ? <span className="tag" style={{ marginLeft: 6 }}>fee</span> : null}
                      </div>
                      {it.substitution_for && <div className="sub">↪ was “{it.substitution_for}”</div>}
                    </div>
                    <div className="spacer" />
                    <span className="muted" style={{ marginRight: 6 }}>
                      {it.line_total != null ? `€${it.line_total.toFixed(2)}` : ""}
                    </span>
                    {!it.is_fee && (
                      <>
                        <button
                          className="icon"
                          title="Copy name"
                          onClick={() => copyText(it.name, showToast, "Copied")}
                        >
                          ⧉
                        </button>
                        <button
                          className="icon"
                          title="Edit"
                          onClick={() =>
                            setLineEdit({
                              id: it.id,
                              name: it.name,
                              quantity: it.quantity,
                              unit_price: it.unit_price != null ? String(it.unit_price) : "",
                            })
                          }
                        >
                          ✎
                        </button>
                      </>
                    )}
                    <button className="icon" title="Remove" onClick={() => deleteLine(o.id, it)}>
                      ✕
                    </button>
                  </div>
                ),
              )}

              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn" onClick={() => copyAll(o.id)}>
                  ⧉ Copy all
                </button>
                <div className="spacer" />
                <button className="btn danger" disabled={busy === o.id} onClick={() => deleteOrder(o)}>
                  Delete order
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
