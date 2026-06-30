import { useState, useEffect } from "react";

const RADIUS_KM = 3;

export default function DriverPanel({ demandData, loading }) {
  const driverCount = demandData?.drivers ?? null;
  const demandLevel = demandData?.demand_level ?? "unknown";
  const SURGE_META = {
    surge: { label: "HIGH SURGE", color: "#ff4060", bg: "rgba(255,64,96,0.08)", border: "rgba(255,64,96,0.3)" },
    normal: { label: "MILD SURGE", color: "#f5a623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.3)" },
    low: { label: "NORMAL", color: "#00e87a", bg: "rgba(0,232,122,0.08)", border: "rgba(0,232,122,0.3)" },
    unknown: { label: "NO DATA", color: "#4a6580", bg: "rgba(74,101,128,0.08)", border: "rgba(74,101,128,0.2)" },
  };
  const meta = SURGE_META[demandLevel] ?? SURGE_META.unknown;
  const pct = driverCount !== null ? Math.min((driverCount / 30) * 100, 100) : 0;
  return (
    <>
      <style>{`
        .driver-panel {
          margin: 0 18px;
          border-radius: 6px;
          border: 1px solid var(--border);
          overflow: hidden;
          transition: border-color 0.3s;
        }
        .dp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .dp-header-left {
          font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--cyan); display: flex; align-items: center; gap: 8px;
        }
        .dp-pulse {
          width: 8px; height: 8px; border-radius: 50%;
          background: currentColor;
          animation: dp-blink 1.8s ease-in-out infinite;
        }
        @keyframes dp-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .dp-refresh-ring {
          width: 14px; height: 14px; border-radius: 50%;
          border: 1.5px solid var(--border);
          border-top-color: var(--cyan);
          animation: dp-spin 1s linear infinite;
        }
        @keyframes dp-spin { to { transform: rotate(360deg); } }

        .dp-body { padding: 24px; background: var(--surface2); }

        .dp-count-row {
          display: flex; align-items: flex-end; gap: 16px; margin-bottom: 22px;
        }
        .dp-count {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 84px; line-height: 1;
          transition: color 0.4s;
          min-width: 100px;
        }
        .dp-count-meta { padding-bottom: 8px; }
        .dp-count-label { font-size: 13px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 6px; }
        .dp-count-radius { font-size: 12px; color: var(--text-dim); }

        .dp-surge-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 4px;
          font-size: 11px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.15em; text-transform: uppercase;
          font-weight: 700; margin-bottom: 16px;
          transition: all 0.3s;
        }
        .dp-surge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .dp-bar-wrap {
          height: 6px; background: var(--surface3, #1a2235);
          border-radius: 3px; overflow: hidden; margin-bottom: 18px;
        }
        .dp-bar {
          height: 100%; border-radius: 3px;
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s;
        }

        .dp-stats {
          display: flex; gap: 0;
          border-top: 1px solid var(--border); padding-top: 16px;
        }
        .dp-stat {
          flex: 1; display: flex; flex-direction: column; gap: 4px;
          padding-right: 14px;
        }
        .dp-stat:not(:first-child) { padding-left: 14px; border-left: 1px solid var(--border); padding-right: 0; }
        .dp-stat-label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); }
        .dp-stat-value { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 18px; color: var(--text); }

        .dp-empty {
          padding: 24px 18px;
          background: var(--surface2);
          font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); text-align: center;
        }
      `}</style>

      <div className="driver-panel" style={{ borderColor: meta.border }}>
        <div className="dp-header">
          <div className="dp-header-left">
            <span className="dp-pulse" style={{ color: meta.color }} />
            Nearby Drivers
          </div>
          {loading && <span className="dp-refresh-ring" />}
        </div>

        {!demandData && !loading ? (
          <div className="dp-empty">Set pickup to see nearby drivers</div>
        ) : (
          <div className="dp-body">
            <div className="dp-count-row">
              <div className="dp-count" style={{ color: meta.color }}>
                {driverCount ?? "—"}
              </div>
              <div className="dp-count-meta">
                <div className="dp-count-label">Drivers available</div>
                <div className="dp-count-radius">within {RADIUS_KM} km</div>
              </div>
            </div>

            <div
              className="dp-surge-badge"
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
            >
              <span className="dp-surge-dot" />
              {meta.label} · {demandData?.surge_multiplier ?? "1.0"}× multiplier
            </div>

            <div className="dp-bar-wrap">
              <div
                className="dp-bar"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${meta.color}88, ${meta.color})` }}
              />
            </div>

            <div className="dp-stats">
              <div className="dp-stat">
                <div className="dp-stat-label">Riders</div>
                <div className="dp-stat-value" style={{ color: "var(--amber)" }}>
                  {demandData?.riders ?? "—"}
                </div>
              </div>
              <div className="dp-stat">
                <div className="dp-stat-label">Ratio</div>
                <div className="dp-stat-value">
                  {demandData?.demand_ratio ?? "—"}
                </div>
              </div>
              <div className="dp-stat">
                <div className="dp-stat-label">Surge</div>
                <div className="dp-stat-value" style={{ color: demandData?.surge_likely ? "var(--red)" : "var(--green)" }}>
                  {demandData?.surge_likely ? "YES" : "NO"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
