import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { Order, OrderItem } from "../lib/types";

export function OrderHistory({
  showToast,
  onReordered,
}: {
  showToast: (m: string) => void;
  onReordered: () => void;
}) {
  const [orders, setOrders] = useState<(Order & { item_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, OrderItem[]>>({});

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

  const toggle = async (id: number) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    if (!detail[id]) {
      const o = await api.getOrder(id);
      setDetail((d) => ({ ...d, [id]: o.items ?? [] }));
    }
  };

  const reorderAll = async (o: Order) => {
    const res = await api.reorder(o.id);
    showToast(`Added ${res.added} items to your list`);
    onReordered();
  };

  const reorderOne = async (it: OrderItem) => {
    await api.addItemsToList([{ name: it.name, quantity: it.quantity }]);
    showToast(`Added ${it.name}`);
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

  return (
    <div>
      {orders.map((o) => (
        <div key={o.id} className="card">
          <div className="row" onClick={() => toggle(o.id)} style={{ cursor: "pointer" }}>
            <div>
              <div className="name" style={{ fontWeight: 700 }}>
                {o.shop_name ?? "Order"}
              </div>
              <div className="sub">
                {(o.placed_at ?? o.created_at)?.slice(0, 16)} · {o.item_count} items
                {o.total != null ? ` · €${o.total.toFixed(2)}` : ""}
              </div>
            </div>
            <div className="spacer" />
            <button
              className="btn"
              onClick={(e) => {
                e.stopPropagation();
                void reorderAll(o);
              }}
            >
              Reorder all
            </button>
          </div>

          {open === o.id && (
            <div style={{ marginTop: 10 }}>
              {(detail[o.id] ?? []).map((it) => (
                <div key={it.id} className="list-item">
                  <div>
                    <div className="name">
                      {it.quantity > 1 ? `${it.quantity}× ` : ""}
                      {it.name}
                      {it.is_fee ? <span className="tag" style={{ marginLeft: 6 }}>fee</span> : null}
                    </div>
                    {it.substitution_for && (
                      <div className="sub">↪ was “{it.substitution_for}”</div>
                    )}
                  </div>
                  <div className="spacer" />
                  <span className="muted" style={{ marginRight: 8 }}>
                    {it.line_total != null ? `€${it.line_total.toFixed(2)}` : ""}
                  </span>
                  {!it.is_fee && (
                    <button className="btn secondary" onClick={() => reorderOne(it)}>
                      + Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
