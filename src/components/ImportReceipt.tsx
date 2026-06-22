import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { parseWoltReceipt } from "../lib/woltParser";
import type { ParsedOrder } from "../lib/types";

const SAMPLE = `MySupermarket Qormi
8 Triq Ħal Luqa, Qormi, QRM 9072, Malta
Order placed: 21/06/2026, 11:14
Your order number: 889
Delivered to: 67 Triq ir-Rebbiegħa
Items
Goodfellas Pizza Pockets Triple Cheese 250g
4.69
×1
4.69
Service fee
2.31
Total sum
€7.00`;

export function ImportReceipt({
  showToast,
  onImported,
  initialText = "",
}: {
  showToast: (m: string) => void;
  onImported: () => void;
  initialText?: string;
}) {
  const [raw, setRaw] = useState(initialText);
  const [saving, setSaving] = useState(false);

  // When a receipt is pasted elsewhere and routed here, seed the textarea.
  useEffect(() => {
    if (initialText) setRaw(initialText);
  }, [initialText]);

  const parsed: ParsedOrder | null = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return parseWoltReceipt(raw);
    } catch {
      return null;
    }
  }, [raw]);

  const products = parsed?.items.filter((i) => !i.isFee && !i.notIncluded) ?? [];
  const notIncluded = parsed?.items.filter((i) => i.notIncluded) ?? [];

  const save = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const res = await api.importOrder(parsed);
      showToast(`Imported ${res.items} items from ${parsed.shopName ?? "order"}`);
      setRaw("");
      onImported();
    } catch (e) {
      showToast(`Import failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card">
        <h2 className="section" style={{ marginTop: 0 }}>
          Paste a Wolt receipt
        </h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Open your order in Wolt, select &amp; copy the receipt text, and paste it
          here. The app figures out items, quantities, prices, substitutions and the
          shop — then adds everything to your order history &amp; catalog. Items that
          weren't delivered are detected and left out.
        </p>
        <textarea
          placeholder="Paste the copied Wolt order text here…"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn secondary" onClick={() => setRaw(SAMPLE)}>
            Try sample
          </button>
          <div className="spacer" />
          <button
            className="btn"
            disabled={!parsed || products.length === 0 || saving}
            onClick={save}
          >
            {saving ? "Saving…" : `Import ${products.length} item${products.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {parsed && (
        <div className="card">
          <div className="row">
            <strong>{parsed.shopName ?? "Unknown shop"}</strong>
            <div className="spacer" />
            {parsed.total != null && <span className="tag ok">€{parsed.total.toFixed(2)}</span>}
          </div>
          {parsed.placedAt && <div className="muted" style={{ fontSize: 12 }}>{parsed.placedAt}</div>}

          <div style={{ marginTop: 10 }}>
            {products.map((it, idx) => (
              <div key={idx} className="list-item">
                <div>
                  <div className="name">
                    {it.quantity > 1 ? `${it.quantity}× ` : ""}
                    {it.name}
                  </div>
                  {it.substitutionFor && (
                    <div className="sub">↪ substituted for “{it.substitutionFor}”</div>
                  )}
                </div>
                <div className="spacer" />
                <span className="muted">
                  {it.lineTotal != null
                    ? `€${it.lineTotal.toFixed(2)}`
                    : it.unitPrice != null
                      ? `€${it.unitPrice.toFixed(2)}`
                      : "—"}
                </span>
              </div>
            ))}
          </div>

          {notIncluded.length > 0 && (
            <>
              <h2 className="section">Not delivered (not charged)</h2>
              {notIncluded.map((it, idx) => (
                <div key={idx} className="list-item" style={{ opacity: 0.55 }}>
                  <div className="name" style={{ textDecoration: "line-through" }}>
                    {it.quantity > 1 ? `${it.quantity}× ` : ""}
                    {it.name}
                  </div>
                  <div className="spacer" />
                  <span className="muted">
                    {it.lineTotal != null ? `€${it.lineTotal.toFixed(2)}` : "—"}
                  </span>
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Subtotal €{(parsed.subtotal ?? 0).toFixed(2)}
              {parsed.serviceFee ? ` · service €${parsed.serviceFee.toFixed(2)}` : ""}
              {parsed.bagCharge ? ` · bag €${parsed.bagCharge.toFixed(2)}` : ""}
              {parsed.deliveryFee != null ? ` · delivery €${parsed.deliveryFee.toFixed(2)}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
