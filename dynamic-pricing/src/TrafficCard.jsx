import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.REACT_APP_API_BASE;

const CONGESTION_META = {
    clear: { label: "CLEAR", color: "#00e87a", bg: "rgba(0,232,122,0.08)", border: "rgba(0,232,122,0.3)", icon: "🟢" },
    moderate: { label: "MODERATE", color: "#f5a623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.3)", icon: "🟡" },
    heavy: { label: "HEAVY", color: "#ff8c00", bg: "rgba(255,140,0,0.08)", border: "rgba(255,140,0,0.3)", icon: "🟠" },
    severe: { label: "SEVERE", color: "#ff4060", bg: "rgba(255,64,96,0.08)", border: "rgba(255,64,96,0.3)", icon: "🔴" },
    unknown: { label: "NO DATA", color: "#4a6580", bg: "rgba(74,101,128,0.08)", border: "rgba(74,101,128,0.2)", icon: "—" },
};

export default function TrafficCard({ pickup, destination, onData }) {
    const [traffic, setTraffic] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const intervalRef = useRef(null);

    const fetchTraffic = async (p, d) => {
        setLoading(true); setError(false);
        try {
            const url = `${API_BASE}/traffic?origin_lat=${p.lat}&origin_lng=${p.lng}&dest_lat=${d.lat}&dest_lng=${d.lng}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setTraffic(data);
            if (onData) onData(data);   // ← lift data to parent
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        clearInterval(intervalRef.current);
        if (!pickup || !destination) { setTraffic(null); return; }
        fetchTraffic(pickup, destination);
        // Refresh every 90s — traffic changes but not super fast
        intervalRef.current = setInterval(() => fetchTraffic(pickup, destination), 90_000);
        return () => clearInterval(intervalRef.current);
    }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]); // eslint-disable-line

    const meta = CONGESTION_META[traffic?.congestion_level ?? "unknown"];

    // Speed ratio bar width
    const speedPct = traffic?.speed_ratio != null
        ? Math.round(traffic.speed_ratio * 100)
        : null;

    return (
        <>
            <style>{`
        .traffic-card {
          margin: 10px 18px 0;
          border-radius: 6px;
          overflow: hidden;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .tc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .tc-title {
          font-size: 8px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--cyan); display: flex; align-items: center; gap: 7px;
        }
        .tc-pulse {
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor; animation: tc-blink 1.8s ease-in-out infinite;
        }
        @keyframes tc-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .tc-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 3px;
          font-size: 8px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;
        }
        .tc-ring {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid var(--border); border-top-color: var(--cyan);
          animation: tc-spin 1s linear infinite;
        }
        @keyframes tc-spin { to { transform: rotate(360deg); } }

        .tc-body { padding: 16px; background: var(--surface2); }
        .tc-empty {
          padding: 16px 13px; background: var(--surface2);
          font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); text-align: center;
        }

        /* ETA hero */
        .tc-eta-row {
          display: flex; align-items: flex-end; gap: 14px; margin-bottom: 16px;
        }
        .tc-eta-num {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 64px; line-height: 1;
          transition: color 0.4s;
        }
        .tc-eta-meta { padding-bottom: 8px; }
        .tc-eta-label {
          font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--text-dim); margin-bottom: 4px;
        }
        .tc-eta-delay {
          font-size: 10px; color: var(--text-dim);
        }
        .tc-eta-delay b { color: var(--amber); }

        /* Speed ratio bar */
        .tc-speed-wrap { margin-bottom: 16px; }
        .tc-speed-label {
          display: flex; justify-content: space-between;
          font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-dim); margin-bottom: 6px;
        }
        .tc-speed-track {
          height: 8px; background: var(--surface3, #1a2235);
          border-radius: 4px; overflow: hidden;
        }
        .tc-speed-fill {
          height: 100%; border-radius: 4px;
          transition: width 0.9s cubic-bezier(0.4,0,0.2,1);
        }

        /* Multiplier */
        .tc-mult-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px;
        }
        .tc-mult-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 12px; border-radius: 4px;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 16px; letter-spacing: 0.1em;
        }
        .tc-mult-label {
          font-size: 8px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim);
        }

        /* Stats */
        .tc-stats {
          display: flex; gap: 0;
          border-top: 1px solid var(--border); padding-top: 12px;
        }
        .tc-stat { flex: 1; display: flex; flex-direction: column; gap: 3px; padding-right: 10px; }
        .tc-stat:not(:first-child) { padding-left: 10px; border-left: 1px solid var(--border); padding-right: 0; }
        .tc-stat-label { font-size: 7px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); }
        .tc-stat-value {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700; font-size: 16px; color: var(--text);
        }
        .tc-stat-unit { font-size: 9px; color: var(--text-dim); margin-left: 2px; }
      `}</style>

            <div
                className="traffic-card"
                style={{ border: `1px solid ${traffic ? meta.border : "var(--border)"}` }}
            >
                {/* Header */}
                <div className="tc-header">
                    <div className="tc-title">
                        <span className="tc-pulse" style={{ color: traffic ? meta.color : "var(--text-dim)" }} />
                        Traffic & ETA
                    </div>
                    {loading
                        ? <span className="tc-ring" />
                        : traffic && (
                            <div
                                className="tc-badge"
                                style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
                            >
                                {meta.icon} {meta.label} TRAFFIC
                            </div>
                        )
                    }
                </div>

                {/* Body */}
                {!pickup || !destination ? (
                    <div className="tc-empty">Set pickup & destination to see traffic</div>
                ) : error ? (
                    <div className="tc-empty" style={{ color: "var(--red)" }}>
                        ⚠ Traffic data unavailable — check TomTom API key
                    </div>
                ) : !traffic ? (
                    <div className="tc-empty">Calculating route…</div>
                ) : (
                    <div className="tc-body">
                        {/* ETA hero number */}
                        <div className="tc-eta-row">
                            <div className="tc-eta-num" style={{ color: meta.color }}>
                                {traffic.eta_minutes < 60
                                    ? Math.round(traffic.eta_minutes)
                                    : `${Math.floor(traffic.eta_minutes / 60)}h${Math.round(traffic.eta_minutes % 60)}m`}
                            </div>
                            <div className="tc-eta-meta">
                                <div className="tc-eta-label">
                                    {traffic.eta_minutes < 60 ? "minutes ETA" : "ETA"}
                                </div>
                                {traffic.delay_seconds > 0 && (
                                    <div className="tc-eta-delay">
                                        +<b>{Math.round(traffic.delay_seconds / 60)} min</b> traffic delay
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Speed ratio bar */}
                        {speedPct !== null && (
                            <div className="tc-speed-wrap">
                                <div className="tc-speed-label">
                                    <span>Current vs free-flow speed</span>
                                    <span style={{ color: meta.color }}>{speedPct}%</span>
                                </div>
                                <div className="tc-speed-track">
                                    <div
                                        className="tc-speed-fill"
                                        style={{
                                            width: `${speedPct}%`,
                                            background: `linear-gradient(90deg, ${meta.color}66, ${meta.color})`,
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Traffic multiplier */}
                        <div className="tc-mult-row">
                            <div className="tc-mult-label">Traffic pricing impact</div>
                            <div
                                className="tc-mult-badge"
                                style={{
                                    color: meta.color,
                                    background: `${meta.color}14`,
                                    border: `1px solid ${meta.color}44`,
                                }}
                            >
                                {traffic.traffic_multiplier === 1.0 ? "✅" : "⚠️"} {traffic.traffic_multiplier}× multiplier
                            </div>
                        </div>

                        {/* Footer stats */}
                        <div className="tc-stats">
                            <div className="tc-stat">
                                <div className="tc-stat-label">Distance</div>
                                <div className="tc-stat-value">
                                    {traffic.distance_km}
                                    <span className="tc-stat-unit">km</span>
                                </div>
                            </div>
                            <div className="tc-stat">
                                <div className="tc-stat-label">Current speed</div>
                                <div className="tc-stat-value">
                                    {traffic.current_speed_kmh ?? "—"}
                                    <span className="tc-stat-unit">km/h</span>
                                </div>
                            </div>
                            <div className="tc-stat">
                                <div className="tc-stat-label">Free flow</div>
                                <div className="tc-stat-value">
                                    {traffic.free_flow_speed_kmh ?? "—"}
                                    <span className="tc-stat-unit">km/h</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}