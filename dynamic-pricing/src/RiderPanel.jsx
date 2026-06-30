import { useState, useEffect } from "react";

const RADIUS_KM = 3;

const DEMAND_META = {
  surge: { label: "HIGH DEMAND", color: "#ff4060", bg: "rgba(255,64,96,0.08)", border: "rgba(255,64,96,0.3)", icon: "🔥" },
  normal: { label: "MEDIUM DEMAND", color: "#f5a623", bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.3)", icon: "📈" },
  low: { label: "LOW DEMAND", color: "#00e87a", bg: "rgba(0,232,122,0.08)", border: "rgba(0,232,122,0.3)", icon: "🟢" },
  unknown: { label: "NO DATA", color: "#4a6580", bg: "rgba(74,101,128,0.08)", border: "rgba(74,101,128,0.2)", icon: "—" },
};

export default function RiderPanel({ demandData, loading }) {
  const riderCount = demandData?.riders ?? null;
  const demandLevel = demandData?.demand_level ?? "unknown";
  const meta = DEMAND_META[demandLevel] || DEMAND_META.unknown;
  const pct = riderCount !== null ? Math.min((riderCount / 30) * 100, 100) : 0;

  const fmtWait = (s) => s == null ? "—" : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;

  return (
    <>
      <style>{`
        .rider-panel {
          margin: 12px 18px;
          border-radius: 6px;
          border: 1px solid var(--border);
          overflow: hidden;
          transition: border-color 0.3s;
        }

        .rp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .rp-header-left {
          font-size: 8px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--amber); display: flex; align-items: center; gap: 7px;
        }
        .rp-refresh-ring {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid var(--border);
          border-top-color: var(--amber);
          animation: rp-spin 1s linear infinite;
        }
        @keyframes rp-spin { to { transform: rotate(360deg); } }

        .rp-body { padding: 20px; background: var(--surface2); }

        .rp-count-row {
          display: flex; align-items: flex-end; gap: 14px; margin-bottom: 18px;
        }
        .rp-count {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 72px; line-height: 1;
          transition: color 0.4s; min-width: 90px;
        }
        .rp-count-meta { padding-bottom: 6px; }
        .rp-count-label { font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 6px; }
        .rp-count-radius { font-size: 11px; color: var(--text-dim); }

        .rp-demand-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 9px; border-radius: 3px;
          font-size: 9px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.15em; text-transform: uppercase;
          font-weight: 700; margin-bottom: 12px;
          transition: all 0.3s;
        }

        .rp-bar-wrap {
          height: 4px; background: var(--surface3, #1a2235);
          border-radius: 2px; overflow: hidden; margin-bottom: 10px;
        }
        .rp-bar {
          height: 100%; border-radius: 2px;
          background: var(--amber);
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .rp-stats {
          display: flex; gap: 0;
          border-top: 1px solid var(--border); padding-top: 10px;
        }
        .rp-stat {
          flex: 1; display: flex; flex-direction: column; gap: 2px;
          padding-right: 12px;
        }
        .rp-stat:not(:first-child) { padding-left: 12px; border-left: 1px solid var(--border); padding-right: 0; }
        .rp-stat-label { font-size: 7px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); }
        .rp-stat-value { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 15px; color: var(--text); }

        .rp-empty {
          padding: 16px 13px;
          background: var(--surface2);
          font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); text-align: center;
        }
      `}</style>

      <div className="rider-panel" style={{ borderColor: meta.border }}>
        <div className="rp-header">
          <div className="rp-header-left">
            <span>{meta.icon}</span>
            Nearby Riders
          </div>
          {loading && <span className="rp-refresh-ring" />}
        </div>

        {!demandData && !loading ? (
          <div className="rp-empty">Set pickup to see nearby riders</div>
        ) : (
          <div className="rp-body">
            <div className="rp-count-row">
              <div className="rp-count">
                {riderCount ?? "—"}
              </div>
              <div className="rp-count-meta">
                <div className="rp-count-label">Active Requests</div>
                <div className="rp-count-radius">within {RADIUS_KM} km</div>
              </div>
            </div>

            {/* <div
              className="rp-demand-badge"
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
            >
              {meta.label}
            </div> */}

            <div className="rp-bar-wrap">
              <div className="rp-bar" style={{ width: `${pct}%` }} />
            </div>

            <div className="rp-stats">
              <div className="rp-stat">
                <div className="rp-stat-label">Avg Wait</div>
                <div className="rp-stat-value" style={{ color: "var(--cyan)" }}>
                  {fmtWait(demandData?.avg_wait_sec)}
                </div>
              </div>
              <div className="rp-stat">
                <div className="rp-stat-label">Ratio</div>
                <div className="rp-stat-value">
                  {demandData?.demand_ratio ?? "—"}
                </div>
              </div>
              <div className="rp-stat">
                <div className="rp-stat-label">Surge</div>
                <div className="rp-stat-value" style={{ color: "var(--amber)" }}>
                  {demandData?.surge_multiplier ?? "1.0"}×
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
