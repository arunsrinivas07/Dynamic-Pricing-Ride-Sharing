export default function SurgeCard({ demandData, loading, countdown }) {
  const meta = {
    surge: { label: "SURGE ACTIVE", color: "#ff4060", bg: "rgba(255,64,96,0.07)", border: "rgba(255,64,96,0.35)", icon: "🔥" },
    normal: { label: "NORMAL DEMAND", color: "#f5a623", bg: "rgba(245,166,35,0.07)", border: "rgba(245,166,35,0.35)", icon: "📊" },
    low: { label: "LOW DEMAND", color: "#00e87a", bg: "rgba(0,232,122,0.07)", border: "rgba(0,232,122,0.3)", icon: "✅" },
  }[demandData?.demand_level] ?? { label: "NO DATA", color: "#4a6580", bg: "rgba(74,101,128,0.07)", border: "rgba(74,101,128,0.2)", icon: "—" };

  const demandRatio = demandData?.demand_ratio ?? 0;
  const drivers = demandData?.drivers ?? 0;
  const riders = demandData?.riders ?? 0;
  const surgeMultiplier = demandData?.surge_multiplier ?? 1.0;
  const surgeLikely = demandData?.surge_likely ?? false;

  // Bar width — ratio capped at 3.0 for display
  const ratioPct = Math.min((demandRatio / 3.0) * 100, 100);

  return (
    <>
      <style>{`
        .surge-card {
          border-radius: 8px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          background: var(--surface2);
          border: 1px solid var(--border);
        }
        .surge-card[data-level="surge"] {
          border-color: rgba(255,64,96,0.5);
          box-shadow: 0 0 30px rgba(255,64,96,0.1);
        }
        .surge-card[data-level="normal"] {
          border-color: rgba(245,166,35,0.5);
          box-shadow: 0 0 30px rgba(245,166,35,0.1);
        }
        .surge-card[data-level="low"] {
          border-color: rgba(0,232,122,0.4);
        }

        .sc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid var(--border);
        }
        .sc-title {
          font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase;
          color: var(--cyan); display: flex; align-items: center; gap: 10px;
          font-weight: 700;
        }
        .sc-pulse {
          width: 8px; height: 8px; border-radius: 50%;
          background: currentColor; animation: sc-blink 2s ease-in-out infinite;
        }
        @keyframes sc-blink { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:.3; transform:scale(0.8)} }

        .sc-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 14px; border-radius: 4px;
          font-size: 11px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;
          transition: all 0.3s;
        }

        .sc-body { padding: 30px 24px; }

        .sc-empty {
          padding: 60px 20px; text-align: center;
          color: var(--text-dim); font-size: 11px;
          letter-spacing: 0.2em; text-transform: uppercase;
          display: flex; flex-direction: column; gap: 15px; align-items: center;
        }
        .sc-empty-icon { font-size: 24px; opacity: 0.5; }

        /* Ratio visualiser */
        .sc-ratio-row {
          display: flex; align-items: center; gap: 24px; margin-bottom: 28px;
        }
        .sc-ratio-number {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 72px; line-height: 1;
          min-width: 120px; transition: color 0.4s;
          letter-spacing: -0.02em;
        }
        .sc-ratio-meta { flex: 1; }
        .sc-ratio-label {
          font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--text-dim); margin-bottom: 10px; font-weight: 600;
        }
        .sc-ratio-track {
          height: 10px; background: var(--surface3, #1a2235);
          border-radius: 5px; overflow: hidden; position: relative;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
        }
        .sc-ratio-fill {
          height: 100%; border-radius: 5px;
          transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        /* threshold tick marks */
        .sc-ratio-ticks {
          position: relative; height: 18px; margin-top: 6px;
        }
        .sc-tick {
          position: absolute; top: 0;
          font-size: 10px; color: var(--text-dim); letter-spacing: 0.05em;
          transform: translateX(-50%); font-weight: 600;
          font-family: var(--mono);
        }
        .sc-tick::before {
          content: ''; display: block;
          width: 1px; height: 6px;
          background: var(--text-dim); margin: 0 auto 3px; opacity: 0.5;
        }

        /* Driver vs Rider bars */
        .sc-compare { margin-bottom: 28px; background: rgba(0,0,0,0.1); padding: 18px; border-radius: 8px; border: 1px solid var(--border); }
        .sc-compare-row {
          display: flex; align-items: center; gap: 14px; margin-bottom: 12px;
        }
        .sc-compare-row:last-child { margin-bottom: 0; }
        .sc-compare-label {
          font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--text-dim); width: 70px; flex-shrink: 0; font-weight: 600;
        }
        .sc-compare-track {
          flex: 1; height: 12px; background: var(--surface3, #1a2235);
          border-radius: 6px; overflow: hidden;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
        }
        .sc-compare-fill {
          height: 100%; border-radius: 6px;
          transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .sc-compare-val {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700; font-size: 20px; width: 40px;
          text-align: right; flex-shrink: 0;
        }

        /* Footer */
        .sc-footer {
          display: flex; gap: 0;
          border-top: 1px solid var(--border); padding-top: 20px;
        }
        .sc-stat { flex: 1; display: flex; flex-direction: column; gap: 6px; padding-right: 15px; }
        .sc-stat:not(:first-child) { padding-left: 15px; border-left: 1px solid var(--border); padding-right: 0; }
        .sc-stat-label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); font-weight: 600; }
        .sc-stat-value { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 24px; }
        .sc-refresh-hint {
          font-size: 9px; color: var(--text-dim); display: flex; align-items: center; gap: 6px;
          margin-left: auto; margin-right: 15px; font-family: var(--mono);
        }
        .sc-timer { color: var(--cyan); font-weight: 700; width: 14px; text-align: center; }
      `}</style>

      <div className="surge-card" data-level={demandData ? demandData.demand_level : "unknown"}>
        {/* Header */}
        <div className="sc-header">
          <div className="sc-title">
            <span className="sc-pulse" style={{ color: meta.color }} />
            Surge Analysis
          </div>
          {demandData && (
            <div className="sc-refresh-hint">
              REFRESH IN <span className="sc-timer">{countdown}</span>S
            </div>
          )}
          {demandData && (
            <div
              className="sc-badge"
              style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
            >
              {meta.icon} {meta.label}
            </div>
          )}
        </div>

        <div className="sc-body">
          {!demandData && !loading ? (
            <div className="sc-empty">
              <div className="sc-empty-icon">📍</div>
              Set pickup to analyze demand
            </div>
          ) : loading && !demandData ? (
            <div className="sc-empty">
              <div className="sc-empty-icon">🔄</div>
              Analyzing market data...
            </div>
          ) : (
            <>
              {/* Demand ratio big number + bar */}
              <div className="sc-ratio-row">
                <div className="sc-ratio-number" style={{ color: meta.color }}>
                  {demandRatio.toFixed(2)}
                </div>
                <div className="sc-ratio-meta">
                  <div className="sc-ratio-label">Demand ratio (riders ÷ drivers)</div>
                  <div className="sc-ratio-track">
                    <div
                      className="sc-ratio-fill"
                      style={{
                        width: `${ratioPct}%`,
                        background: `linear-gradient(90deg, ${meta.color}66, ${meta.color})`,
                      }}
                    />
                  </div>
                  {/* Threshold ticks */}
                  <div className="sc-ratio-ticks">
                    <span className="sc-tick" style={{ left: "26.6%" }}>0.8</span>
                    <span className="sc-tick" style={{ left: "40%" }}>1.2</span>
                    <span className="sc-tick" style={{ left: "100%" }}>3.0</span>
                  </div>
                </div>
              </div>

              {/* Driver vs Rider comparison bars */}
              <div className="sc-compare">
                <div className="sc-compare-row">
                  <div className="sc-compare-label">Drivers</div>
                  <div className="sc-compare-track" title={`${drivers} total available`}>
                    <div
                      className="sc-compare-fill"
                      style={{
                        width: `${Math.min((drivers / 20) * 100, 100)}%`,
                        background: "linear-gradient(90deg, #00e87a66, #00e87a)",
                      }}
                    />
                  </div>
                  <div className="sc-compare-val" style={{ color: "#00e87a" }}>{drivers}</div>
                </div>
                <div className="sc-compare-row">
                  <div className="sc-compare-label">Riders</div>
                  <div className="sc-compare-track" title={`${riders} active requests`}>
                    <div
                      className="sc-compare-fill"
                      style={{
                        width: `${Math.min((riders / 20) * 100, 100)}%`,
                        background: `linear-gradient(90deg, ${meta.color}66, ${meta.color})`,
                      }}
                    />
                  </div>
                  <div className="sc-compare-val" style={{ color: meta.color }}>{riders}</div>
                </div>
              </div>

              {/* Footer stats */}
              <div className="sc-footer">
                <div className="sc-stat">
                  <div className="sc-stat-label">Multiplier</div>
                  <div className="sc-stat-value" style={{ color: meta.color }}>
                    {surgeMultiplier}×
                  </div>
                </div>
                <div className="sc-stat">
                  <div className="sc-stat-label">Ratio zone</div>
                  <div className="sc-stat-value" style={{ color: meta.color }}>
                    {demandRatio < 0.8 ? "< 0.8" : demandRatio <= 1.2 ? "0.8–1.2" : "> 1.2"}
                  </div>
                </div>
                <div className="sc-stat">
                  <div className="sc-stat-label">Surge</div>
                  <div className="sc-stat-value" style={{ color: surgeLikely ? "#ff4060" : "#00e87a" }}>
                    {surgeLikely ? "YES 🔥" : "NO ✅"}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}