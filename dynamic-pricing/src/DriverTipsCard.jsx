import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.REACT_APP_API_BASE;
const REFRESH_SEC = 300; // 5 minutes
const DRIVER_ID = "driver"; // in real app, from auth

export default function DriverTipsCard({ pickup }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [countdown, setCountdown] = useState(REFRESH_SEC);
    const [open, setOpen] = useState(true);
    const intervalRef = useRef(null);
    const countdownRef = useRef(null);

    const fetchTips = async (lat, lng) => {
        setLoading(true); setError(false);
        try {
            const res = await fetch(
                `${API_BASE}/driver-tips?driver_id=${DRIVER_ID}&lat=${lat}&lng=${lng}`
            );
            if (!res.ok) throw new Error();
            setData(await res.json());
            setCountdown(REFRESH_SEC);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!pickup) { setData(null); clearInterval(intervalRef.current); clearInterval(countdownRef.current); return; }
        fetchTips(pickup.lat, pickup.lng);
        intervalRef.current = setInterval(() => fetchTips(pickup.lat, pickup.lng), REFRESH_SEC * 1000);
        countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_SEC : c - 1), 1000);
        return () => { clearInterval(intervalRef.current); clearInterval(countdownRef.current); };
    }, [pickup?.lat, pickup?.lng]); // eslint-disable-line

    const fmtCountdown = (s) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

    return (
        <>
            <style>{`
        .dtc-wrap {
          margin: 0 18px;
          border-radius: 6px;
          border: 1px solid rgba(245,166,35,0.25);
          overflow: hidden;
        }
        .dtc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
          cursor: pointer; user-select: none;
        }
        .dtc-title {
          font-size: 8px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--amber); display: flex; align-items: center; gap: 7px;
        }
        .dtc-pulse {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--amber);
          animation: dtc-blink 2s ease-in-out infinite;
        }
        @keyframes dtc-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .dtc-right {
          display: flex; align-items: center; gap: 8px;
          font-size: 8px; color: var(--text-dim);
        }
        .dtc-chevron { font-size: 10px; color: var(--text-dim); transition: transform 0.2s; }
        .dtc-chevron.open { transform: rotate(180deg); }
        .dtc-ring {
          width: 11px; height: 11px; border-radius: 50%;
          border: 1.5px solid var(--border); border-top-color: var(--amber);
          animation: dtc-spin 1s linear infinite;
        }
        @keyframes dtc-spin { to { transform: rotate(360deg); } }

        .dtc-body { background: var(--surface2); padding: 14px; }
        .dtc-empty {
          padding: 14px 13px;
          font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); text-align: center; background: var(--surface2);
        }

        /* Session bar */
        .dtc-session {
          display: flex; gap: 0;
          padding: 10px 12px;
          background: rgba(245,166,35,0.06);
          border: 1px solid rgba(245,166,35,0.15);
          border-radius: 4px; margin-bottom: 14px;
        }
        .dtc-sess-stat { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .dtc-sess-stat:not(:first-child) { padding-left: 12px; border-left: 1px solid var(--border); }
        .dtc-sess-label { font-size: 7px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); }
        .dtc-sess-val {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700; font-size: 18px; color: var(--amber);
        }

        /* Tips */
        .dtc-tip {
          padding: 10px 12px;
          background: var(--surface3, #1a2235);
          border: 1px solid var(--border);
          border-radius: 4px; margin-bottom: 8px;
          font-size: 11px; line-height: 1.6;
          color: var(--text); font-family: var(--mono);
          border-left: 3px solid var(--amber);
          animation: dtc-fadein 0.3s ease forwards;
        }
        .dtc-tip:last-of-type { margin-bottom: 0; }
        @keyframes dtc-fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        /* Surge zone pills */
        .dtc-zones { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
        .dtc-zone {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 10px;
          background: var(--surface3, #1a2235);
          border: 1px solid var(--border); border-radius: 4px;
        }
        .dtc-zone-name {
          font-size: 10px; color: var(--text);
          font-family: 'Barlow Condensed', sans-serif; font-weight: 600;
        }
        .dtc-zone-stats { display: flex; align-items: center; gap: 8px; }
        .dtc-zone-ratio {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 14px;
        }
        .dtc-zone-pill {
          font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase;
          padding: 2px 6px; border-radius: 2px;
          font-family: var(--mono);
        }

        /* Heatmap circles on map are handled via TomTom overlays */
        .dtc-refresh-btn {
          width: 100%; margin-top: 12px; padding: 8px;
          background: transparent; border: 1px solid rgba(245,166,35,0.2);
          border-radius: 4px; font-family: var(--mono); font-size: 9px;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .dtc-refresh-btn:hover { border-color: var(--amber); color: var(--amber); }
        .dtc-zone-section-label {
          font-size: 8px; letter-spacing: 0.22em; text-transform: uppercase;
          color: var(--text-dim); margin: 12px 0 6px;
        }
      `}</style>

            <div className="dtc-wrap">
                {/* Header */}
                <div className="dtc-header" onClick={() => setOpen(o => !o)}>
                    <div className="dtc-title">
                        <span className="dtc-pulse" />
                        🚗 Driver Earnings Tips
                    </div>
                    <div className="dtc-right">
                        {loading
                            ? <span className="dtc-ring" />
                            : data && <span>refresh in {fmtCountdown(countdown)}</span>
                        }
                        <span className={`dtc-chevron ${open ? "open" : ""}`}>▼</span>
                    </div>
                </div>

                {open && (
                    <>
                        {!pickup ? (
                            <div className="dtc-empty">Set pickup location to see driver tips</div>
                        ) : error ? (
                            <div className="dtc-empty" style={{ color: "var(--red)" }}>
                                ⚠ Could not load tips — check Groq API key
                            </div>
                        ) : !data ? (
                            <div className="dtc-empty">Loading tips…</div>
                        ) : (
                            <div className="dtc-body">
                                {/* Session stats */}
                                <div className="dtc-session">
                                    <div className="dtc-sess-stat">
                                        <div className="dtc-sess-label">Online</div>
                                        <div className="dtc-sess-val">{data.hours_online}h</div>
                                    </div>
                                    <div className="dtc-sess-stat">
                                        <div className="dtc-sess-label">Earned today</div>
                                        <div className="dtc-sess-val">₹{data.earned}</div>
                                    </div>
                                    <div className="dtc-sess-stat">
                                        <div className="dtc-sess-label">Hour</div>
                                        <div className="dtc-sess-val">{String(data.hour).padStart(2, "0")}:00</div>
                                    </div>
                                </div>

                                {/* AI Tips */}
                                {data.tips.map((tip, i) => (
                                    <div
                                        key={i}
                                        className="dtc-tip"
                                        style={{ animationDelay: `${i * 0.08}s` }}
                                    >
                                        {tip}
                                    </div>
                                ))}

                                {/* Surge zones */}
                                {data.surge_grid?.length > 0 && (
                                    <>
                                        <div className="dtc-zone-section-label">Live Surge Zones</div>
                                        <div className="dtc-zones">
                                            {data.surge_grid.map((zone, i) => {
                                                const ratio = zone.demand_ratio;
                                                const color = ratio >= 2.0 ? "#ff4060"
                                                    : ratio >= 1.5 ? "#ff8c00"
                                                        : ratio >= 1.2 ? "#f5a623"
                                                            : "#00e87a";
                                                return (
                                                    <div className="dtc-zone" key={i}>
                                                        <div className="dtc-zone-name">
                                                            {zone.zone_name && !zone.zone_name.includes(".")
                                                                ? zone.zone_name
                                                                : `Zone ${i + 1}`}
                                                        </div>
                                                        <div className="dtc-zone-stats">
                                                            <span style={{ fontSize: 9, color: "var(--text-dim)" }}>
                                                                {zone.riders} riders
                                                            </span>
                                                            <span
                                                                className="dtc-zone-pill"
                                                                style={{
                                                                    color,
                                                                    background: `${color}18`,
                                                                    border: `1px solid ${color}44`,
                                                                }}
                                                            >
                                                                {ratio}×
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {/* Refresh */}
                                <button
                                    className="dtc-refresh-btn"
                                    onClick={() => fetchTips(pickup.lat, pickup.lng)}
                                    disabled={loading}
                                >
                                    {loading ? <><span className="dtc-ring" /> Refreshing…</> : "↺ Refresh tips"}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}