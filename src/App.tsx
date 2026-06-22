import { useState, useCallback } from "react";
import { ImportReceipt } from "./components/ImportReceipt";
import { OrderHistory } from "./components/OrderHistory";
import { Insights } from "./components/Insights";
import { Inventory } from "./components/Inventory";
import { Grouped } from "./components/Grouped";

type Tab = "grouped" | "import" | "history" | "insights" | "inventory";

const TABS: { id: Tab; label: string }[] = [
  { id: "grouped", label: "🗂️ Grouped" },
  { id: "inventory", label: "📦 Inventory" },
  { id: "import", label: "📥 Import" },
  { id: "history", label: "🧾 Orders" },
  { id: "insights", label: "📊 Insights" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("grouped");
  const [toast, setToast] = useState<string | null>(null);
  // Bumped to tell tabs to refetch after an import.
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((showToast as unknown as { t?: number }).t);
    (showToast as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="app">
      <header className="top">
        <h1>House &amp; Shopping</h1>
        <p>Your inventory, grouped by aisle — copy into Wolt.</p>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "grouped" && <Grouped key={`grouped-${refreshKey}`} showToast={showToast} />}
      {tab === "inventory" && <Inventory key={`inv-${refreshKey}`} showToast={showToast} />}
      {tab === "import" && (
        <ImportReceipt
          showToast={showToast}
          onImported={() => {
            refresh();
            setTab("inventory");
          }}
        />
      )}
      {tab === "history" && <OrderHistory key={`hist-${refreshKey}`} showToast={showToast} />}
      {tab === "insights" && <Insights key={`insights-${refreshKey}`} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
