import { useState, useCallback } from "react";
import { ShoppingList } from "./components/ShoppingList";
import { ImportReceipt } from "./components/ImportReceipt";
import { OrderHistory } from "./components/OrderHistory";
import { WhereToBuy } from "./components/WhereToBuy";
import { Insights } from "./components/Insights";
import { Inventory } from "./components/Inventory";

type Tab = "list" | "import" | "history" | "shops" | "insights" | "inventory";

const TABS: { id: Tab; label: string }[] = [
  { id: "list", label: "🛒 List" },
  { id: "import", label: "📥 Import" },
  { id: "history", label: "🧾 Orders" },
  { id: "inventory", label: "📦 Inventory" },
  { id: "shops", label: "📍 Where to buy" },
  { id: "insights", label: "📊 Insights" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("list");
  const [toast, setToast] = useState<string | null>(null);
  // Text handed to the Import tab when a receipt is pasted somewhere else.
  const [importSeed, setImportSeed] = useState("");
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

  // Called when a Wolt receipt is pasted into the wrong place (e.g. the add box).
  const startImport = useCallback((text: string) => {
    setImportSeed(text);
    setTab("import");
  }, []);

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
        <ShoppingList
          key={`list-${refreshKey}`}
          showToast={showToast}
          onPasteReceipt={startImport}
        />
      )}
      {tab === "import" && (
        <ImportReceipt
          showToast={showToast}
          initialText={importSeed}
          onImported={() => {
            setImportSeed("");
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
      {tab === "inventory" && <Inventory key={`inv-${refreshKey}`} showToast={showToast} />}
      {tab === "shops" && <WhereToBuy key={`shops-${refreshKey}`} />}
      {tab === "insights" && <Insights key={`insights-${refreshKey}`} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
