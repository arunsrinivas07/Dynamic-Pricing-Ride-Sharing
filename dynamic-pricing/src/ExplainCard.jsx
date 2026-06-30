import { useState, useEffect } from "react";

const API_BASE = process.env.REACT_APP_API_BASE;

export default function ExplainCard({ priceData, demandData, weatherData, trafficData, rideType }) {
    const [explanation, setExplanation] = useState(null);
    const [breakdown, setBreakdown] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(true);
    const [breakOpen, setBreakOpen] = useState(false);

    const fetchExplanation = async () => {
        // Accept either predicted_price or final_price
        const price = priceData?.predicted_price ?? priceData?.final_price;
        if (!price) return;

        setLoading(true); setError(false);
        try {
            const payload = {
                predicted_price: price,
                distance_km: priceData.inputs_used?.distance_km ?? priceData.distance_km ?? trafficData?.distance_km ?? 5,
                eta_minutes: priceData.inputs_used?.eta_minutes ?? priceData.eta_minutes ?? trafficData?.eta_minutes ?? 15,
                drivers: priceData.inputs_used?.drivers ?? priceData.signals?.drivers ?? demandData?.drivers ?? 10,
                riders: priceData.inputs_used?.riders ?? priceData.signals?.riders ?? demandData?.riders ?? 10,
                demand_ratio: priceData.inputs_used?.demand_ratio ?? priceData.signals?.demand_ratio ?? priceData.demand_multiplier ?? demandData?.demand_ratio ?? 1.0,
                weather_condition: weatherData?.condition ?? priceData.signals?.weather_label ?? "clear",
                weather_multiplier: priceData.inputs_used?.weather_multiplier ?? priceData.signals?.weather_mult ?? priceData.weather_multiplier ?? weatherData?.weather_multiplier ?? 1.0,
                traffic_condition: trafficData?.congestion_level ?? priceData.signals?.traffic_label ?? "clear",
                traffic_multiplier: priceData.inputs_used?.traffic_multiplier ?? priceData.signals?.traffic_mult ?? priceData.traffic_multiplier ?? trafficData?.traffic_multiplier ?? 1.0,
                ride_type: rideType ?? "single",
            };

            const res = await fetch(`${API_BASE}/explain-price`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setExplanation(data.explanation);
            setBreakdown(data.breakdown);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const price = priceData?.predicted_price ?? priceData?.final_price;
        if (price) fetchExplanation();
    }, [priceData?.predicted_price, priceData?.final_price]); // eslint-disable-line

    // ── Format helper ─────────────────────────────────────────────
    const fmt = (v, sign = true) => {
        if (v === undefined || v === null || v === 0) return null;
        const abs = Math.abs(v).toFixed(2);
        if (!sign) return `₹${abs}`;
        return `${v > 0 ? "+" : "−"}₹${abs}`;
    };

    // ── Breakdown rows — new additive formula ─────────────────────
    const rows = breakdown ? [
        { label: "Distance fee", val: breakdown.distance_fee, color: "var(--cyan)", sign: false, always: true },
        { label: "Time fee", val: breakdown.time_fee, color: "var(--cyan)", sign: false, always: true },
        { label: "Weather fee", val: breakdown.weather_fee, color: "#4cc9f0", sign: true, always: false },
        { label: "Traffic fee", val: breakdown.traffic_fee, color: "#ff8c00", sign: true, always: false },
        { label: "Demand surge", val: breakdown.surge_fee, color: "#f5a623", sign: true, always: false },
        { label: "Shared discount", val: breakdown.shared_saving, color: "#00e87a", sign: true, always: false },
    ].filter(r => r.always || (r.val && r.val !== 0)) : [];

    const maxVal = breakdown?.subtotal ?? breakdown?.base_total ?? breakdown?.final_price ?? 100;

    return (
        <>
            <style>{`
        .explain-card {
          margin: 10px 18px 0;
          border-radius: 6px;
          border: 1px solid rgba(0,200,255,0.2);
          overflow: hidden;
        }
        .ec-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
          cursor: pointer; user-select: none;
        }
        .ec-title {
          font-size: 8px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--cyan); display: flex; align-items: center; gap: 7px;
        }
        .ec-chevron { font-size: 10px; color: var(--text-dim); transition: transform 0.2s; }
        .ec-chevron.open { transform: rotate(180deg); }
        .ec-body { padding: 14px; background: var(--surface2); }
        .ec-text {
          font-size: 12px; line-height: 1.7; color: var(--text);
          margin-bottom: 14px; font-family: var(--mono);
          border-left: 3px solid var(--cyan); padding-left: 12px;
        }
        .ec-fetch-btn {
          width: 100%; padding: 10px;
          background: rgba(0,200,255,0.07);
          border: 1px solid rgba(0,200,255,0.25); border-radius: 4px;
          font-family: var(--mono); font-size: 10px;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--cyan); cursor: pointer; transition: all 0.15s; margin-bottom: 12px;
        }
        .ec-fetch-btn:hover { background: rgba(0,200,255,0.13); }
        .ec-fetch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ec-break-toggle {
          width: 100%; padding: 8px; background: transparent;
          border: 1px solid var(--border); border-radius: 4px;
          font-family: var(--mono); font-size: 9px;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); cursor: pointer; transition: all 0.15s;
          margin-bottom: 10px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .ec-break-toggle:hover { border-color: var(--amber); color: var(--amber); }
        .ec-row {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 0; border-bottom: 1px solid var(--border);
        }
        .ec-row:last-child { border-bottom: none; }
        .ec-row-label {
          flex: 1; font-size: 9px; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--text-dim);
        }
        .ec-row-bar-wrap {
          width: 80px; height: 5px;
          background: var(--surface3, #1a2235); border-radius: 3px; overflow: hidden;
        }
        .ec-row-bar { height: 100%; border-radius: 3px; }
        .ec-row-val {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700; font-size: 14px;
          min-width: 70px; text-align: right;
        }
        .ec-total {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 0 0; margin-top: 4px;
          border-top: 1px solid var(--border);
        }
        .ec-total-label {
          font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--cyan);
        }
        .ec-total-val {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 22px; color: var(--amber);
        }
        .ec-ring {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid var(--border); border-top-color: var(--cyan);
          animation: ec-spin 1s linear infinite; display: inline-block;
        }
        @keyframes ec-spin { to { transform: rotate(360deg); } }
      `}</style>

            <div className="explain-card">
                <div className="ec-header" onClick={() => setOpen(o => !o)}>
                    <div className="ec-title">💡 Why this price?</div>
                    <span className={`ec-chevron ${open ? "open" : ""}`}>▼</span>
                </div>

                {open && (
                    <div className="ec-body">
                        {explanation ? (
                            <div className="ec-text">{explanation}</div>
                        ) : error ? (
                            <div style={{
                                fontSize: 9, color: "var(--red)", marginBottom: 12,
                                letterSpacing: "0.1em", textTransform: "uppercase"
                            }}>
                                ⚠ Could not load explanation — check Groq API key
                            </div>
                        ) : null}

                        <button className="ec-fetch-btn" disabled={loading} onClick={fetchExplanation}>
                            {loading
                                ? <><span className="ec-ring" /> &nbsp; Generating explanation…</>
                                : explanation ? "↺ Regenerate explanation" : "✨ Explain this price"
                            }
                        </button>

                        {breakdown && (
                            <button className="ec-break-toggle" onClick={() => setBreakOpen(o => !o)}>
                                {breakOpen ? "▲ Hide" : "▼ Show"} price breakdown
                            </button>
                        )}

                        {breakOpen && breakdown && (
                            <div className="ec-breakdown">
                                {rows.map(({ label, val, color, sign }) => {
                                    const display = fmt(val, sign);
                                    const pct = maxVal > 0
                                        ? Math.min((Math.abs(val) / maxVal) * 100, 100)
                                        : 0;
                                    return (
                                        <div className="ec-row" key={label}>
                                            <div className="ec-row-label">{label}</div>
                                            <div className="ec-row-bar-wrap">
                                                <div className="ec-row-bar" style={{
                                                    width: `${pct}%`,
                                                    background: `linear-gradient(90deg, ${color}66, ${color})`,
                                                }} />
                                            </div>
                                            <div className="ec-row-val" style={{ color }}>{display}</div>
                                        </div>
                                    );
                                })}

                                <div className="ec-total">
                                    <div className="ec-total-label">Final price</div>
                                    <div className="ec-total-val">
                                        ₹{Number(breakdown.final_price ?? 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
