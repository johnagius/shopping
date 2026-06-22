import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { StockFinderResponse } from "../lib/types";

const LS_KEY = "shopping.location";

function loadLocation(): { lat: string; lon: string } {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v) return JSON.parse(v);
  } catch {
    /* ignore */
  }
  return { lat: "35.8989", lon: "14.5146" }; // central Malta default
}

export function StockFinder({ showToast }: { showToast: (m: string) => void }) {
  const [loc, setLoc] = useState(loadLocation);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StockFinderResponse | null>(null);
  const [listCount, setListCount] = useState<number>(0);

  useEffect(() => {
    void api.getList().then((items) => setListCount(items.filter((i) => !i.checked).length));
  }, []);

  const saveLoc = (next: { lat: string; lon: string }) => {
    setLoc(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const items = (await api.getList()).filter((i) => !i.checked).map((i) => i.name);
      if (items.length === 0) {
        showToast("Your list is empty");
        setRunning(false);
        return;
      }
      const res = await api.findShops(items, Number(loc.lat), Number(loc.lon));
      setResult(res);
    } catch (e) {
      setResult({
        status: "unavailable",
        message: (e as Error).message,
        queriedItems: [],
        shops: [],
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="row">
          <h2 className="section" style={{ margin: 0 }}>
            Find shops on Wolt
          </h2>
          <div className="spacer" />
          <span className="tag warn">experimental</span>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Checks which Wolt shops near you currently stock the items on your list, so
          you can see where to get the whole order (or most of it) in one go.
        </p>
        <div className="grid-2">
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              Latitude
            </label>
            <input value={loc.lat} onChange={(e) => saveLoc({ ...loc, lat: e.target.value })} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>
              Longitude
            </label>
            <input value={loc.lon} onChange={(e) => saveLoc({ ...loc, lon: e.target.value })} />
          </div>
        </div>
        <button
          className="btn secondary"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (!navigator.geolocation) return showToast("Geolocation unavailable");
            navigator.geolocation.getCurrentPosition(
              (p) =>
                saveLoc({
                  lat: p.coords.latitude.toFixed(4),
                  lon: p.coords.longitude.toFixed(4),
                }),
              () => showToast("Couldn't get location"),
            );
          }}
        >
          Use my location
        </button>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="muted">{listCount} items on list</span>
          <div className="spacer" />
          <button className="btn" onClick={run} disabled={running}>
            {running ? "Checking Wolt…" : "Find shops"}
          </button>
        </div>
      </div>

      {result?.status === "unavailable" && (
        <div className="card">
          <span className="tag warn">Wolt unavailable</span>
          <p className="muted" style={{ marginBottom: 0 }}>{result.message}</p>
        </div>
      )}

      {result && result.shops.length > 0 && (
        <>
          {result.message && (
            <p className="muted" style={{ fontSize: 13 }}>
              {result.message}
            </p>
          )}
          {result.shops.map((s) => (
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
                {s.matchedItems.length}/{result.queriedItems.length} items
                {s.estimatedTotal != null ? ` · ~€${s.estimatedTotal.toFixed(2)}` : ""}
                {s.missingItems.length > 0 && (
                  <> · missing: {s.missingItems.slice(0, 4).join(", ")}{s.missingItems.length > 4 ? "…" : ""}</>
                )}
              </div>
              {s.venueSlug && (
                <a
                  href={`https://wolt.com/en/mlt/venue/${s.venueSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 13 }}
                >
                  Open in Wolt →
                </a>
              )}
            </div>
          ))}
        </>
      )}

      {result && result.status !== "unavailable" && result.shops.length === 0 && (
        <div className="empty">No matching shops found for your list.</div>
      )}
    </div>
  );
}
