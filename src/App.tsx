import { useState, useCallback } from "react";
import { ShoppingList } from "./components/ShoppingList";
import { ImportReceipt } from "./components/ImportReceipt";
import { OrderHistory } from "./components/OrderHistory";
import { StockFinder } from "./components/StockFinder";

type Tab = "list" | "import" | "history" | "shops";

const TABS: { id: Tab; label: string }[] = [
  { id: "list", label: "🛒 List" },
  { id: "import", label: "📥 Import" },
  { id: "history", label: "🧾 History" },
  { id: "shops", label: "📍 Find shops" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("list");
  const [toast, setToast] = useState<string | null>(null);
  // Bumped to tell the list/finder to refetch after an import or reorder.
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((showToast as unknown as { t?: number }).t);
    (showToast as unknown as { t?: number }).t = window.setTimeout(
      () => setToast(null),
      2600,
    );
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const goToList = useCallback(() => setTab("list"), []);

  return (
    <div className="app">
      <header className="top">
        <h1>House &amp; Shopping</h1>
        <p>Your list, your past orders, one tap to reorder.</p>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "list" && (
        <ShoppingList key={`list-${refreshKey}`} showToast={showToast} />
      )}
      {tab === "import" && (
        <ImportReceipt
          showToast={showToast}
          onImported={() => {
            refresh();
            setTab("history");
          }}
        />
      )}
      {tab === "history" && (
        <OrderHistory
          showToast={showToast}
          onReordered={() => {
            refresh();
            goToList();
          }}
        />
      )}
      {tab === "shops" && <StockFinder showToast={showToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
