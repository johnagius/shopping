import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Insights as InsightsData } from "../lib/types";

export function Insights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .getInsights()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty">Loading insights…</div>;
  if (!data || data.orders === 0)
    return (
      <div className="empty">
        No spending data yet.
        <br />
        Import some orders to see insights.
      </div>
    );

  const maxMonth = Math.max(...data.monthly.map((m) => m.spend), 1);
  const maxItem = Math.max(...data.topItems.map((t) => t.spend), 1);

  return (
    <div>
      <div className="card">
        <div className="row">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Total spent
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>€{data.totalSpend.toFixed(2)}</div>
          </div>
          <div className="spacer" />
          <div style={{ textAlign: "right" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Orders
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{data.orders}</div>
          </div>
        </div>
      </div>

      {data.monthly.length > 0 && (
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>
            Spend by month
          </h2>
          {data.monthly.map((m) => (
            <div key={m.month} style={{ marginBottom: 8 }}>
              <div className="row" style={{ fontSize: 13 }}>
                <span>{m.month}</span>
                <div className="spacer" />
                <span className="muted">
                  €{m.spend.toFixed(2)} · {m.orders} order{m.orders === 1 ? "" : "s"}
                </span>
              </div>
              <div className="bar" style={{ marginTop: 3 }}>
                <div style={{ width: `${(m.spend / maxMonth) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {data.perShop.length > 0 && (
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>
            By shop
          </h2>
          {data.perShop.map((s) => (
            <div key={s.shop} className="list-item">
              <div className="name">{s.shop}</div>
              <div className="spacer" />
              <span className="muted">
                €{s.spend.toFixed(2)} · {s.orders} order{s.orders === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="section" style={{ marginTop: 0 }}>
          Top items by spend
        </h2>
        {data.topItems.map((t) => (
          <div key={t.name} style={{ marginBottom: 8 }}>
            <div className="row" style={{ fontSize: 13 }}>
              <span>{t.name}</span>
              <div className="spacer" />
              <span className="muted">
                €{t.spend.toFixed(2)} · {t.qty}× over {t.times} order{t.times === 1 ? "" : "s"}
              </span>
            </div>
            <div className="bar" style={{ marginTop: 3 }}>
              <div style={{ width: `${(t.spend / maxItem) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
