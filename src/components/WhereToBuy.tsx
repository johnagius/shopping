import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { WhereToBuyResponse } from "../lib/types";

export function WhereToBuy() {
  const [data, setData] = useState<WhereToBuyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .whereToBuy()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty">Crunching your order history…</div>;

  if (!data || data.queriedItems.length === 0)
    return (
      <div className="empty">
        Add items to your list first.
        <br />
        Then I'll show which shop carries the most of them.
      </div>
    );

  return (
    <div>
      <div className="card">
        <h2 className="section" style={{ marginTop: 0 }}>
          Best shop for your list
        </h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Ranked by how much of your {data.queriedItems.length}-item list each shop has
          carried in your past orders, with an estimated total from the prices they
          charged you. Import more receipts to make this sharper.
        </p>
      </div>

      {data.shops.length === 0 ? (
        <div className="empty">
          No history yet. Import a couple of orders and this will light up.
        </div>
      ) : (
        data.shops.map((s) => (
          <div key={s.venueName} className="card">
            <div className="row">
              <strong>{s.venueName}</strong>
              <div className="spacer" />
              <span className={`tag ${s.coverage >= 0.999 ? "ok" : ""}`}>
                {Math.round(s.coverage * 100)}% match
              </span>
            </div>
            <div className="bar" style={{ margin: "8px 0" }}>
              <div style={{ width: `${Math.round(s.coverage * 100)}%` }} />
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {s.matchedItems.length}/{data.queriedItems.length} items
              {s.estimatedTotal != null ? ` · ~€${s.estimatedTotal.toFixed(2)}` : ""}
            </div>
            {s.missingItems.length > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Not seen here: {s.missingItems.slice(0, 6).join(", ")}
                {s.missingItems.length > 6 ? `, +${s.missingItems.length - 6} more` : ""}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
