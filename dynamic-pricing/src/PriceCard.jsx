const MODE_META = {
    base: { label: "BASE PRICE", color: "#00e87a", bg: "rgba(0,232,122,0.07)", border: "rgba(0,232,122,0.3)", icon: "✅" },
    surge: { label: "SURGE PRICE", color: "#ff4060", bg: "rgba(255,64,96,0.07)", border: "rgba(255,64,96,0.35)", icon: "🔥" },
};

function MultiplierRow({ label, value, color }) {
    const isNeutral = value <= 1.0;
    const c = isNeutral ? "#00e87a" : color ?? "#f5a623";
    return (
        <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "7px 0", borderBottom: "1px solid var(--border)"
        }}>
            <span style={{
                fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
                color: "var(--text-dim)", fontFamily: "var(--mono)"
            }}>{label}</span>
            <span style={{
                fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700,
                fontSize: 16, color: c
            }}>
                {isNeutral ? "✅" : "⚠️"} {value}×
            </span>
        </div>
    );
}

export default function PriceCard({ priceData, loading, error }) {
    if (loading) return (
        <div style={wrapStyle("#4a6580")}>
            <div style={headerStyle}>
                <span style={titleStyle}>Price Estimate</span>
                <span style={spinnerStyle} />
            </div>
            <div style={emptyStyle}>Computing price…</div>
        </div>
    );

    if (error || !priceData) return (
        <div style={wrapStyle("#4a6580")}>
            <div style={headerStyle}>
                <span style={titleStyle}>Price Estimate</span>
            </div>
            <div style={{ ...emptyStyle, color: error ? "var(--red)" : "var(--text-dim)" }}>
                {error ? "⚠ Could not compute price — check backend" : "Set pickup & destination, then click Get Price"}
            </div>
        </div>
    );

    const combinedMult = priceData.final_multiplier
        ?? (priceData.inputs_used
            ? (priceData.inputs_used.demand_ratio * priceData.inputs_used.weather_multiplier * priceData.inputs_used.traffic_multiplier).toFixed(2)
            : 1.0);

    const mode = priceData.pricing_mode
        ?? (priceData.predicted_price > (30 + priceData.inputs_used?.distance_km * 12 + priceData.inputs_used?.eta_minutes * 1.5) ? "surge" : "base");
    const meta = MODE_META[mode] ?? MODE_META.base;

    return (
        <>
            <style>{`
        @keyframes pc-pop { from{transform:scale(0.96);opacity:0} to{transform:scale(1);opacity:1} }
        .price-card-inner { animation: pc-pop 0.35s cubic-bezier(.34,1.56,.64,1); }
        .pc-price-num {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; line-height: 1;
          transition: color 0.4s;
        }
      `}</style>

            <div style={wrapStyle(meta.border)}>
                {/* Header */}
                <div style={headerStyle}>
                    <span style={titleStyle}>Price Estimate</span>
                    <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 10px", borderRadius: 3,
                        fontSize: 8, fontFamily: "var(--mono)", letterSpacing: "0.15em",
                        textTransform: "uppercase", fontWeight: 700,
                        background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                    }}>
                        {meta.icon} {meta.label}
                    </span>
                </div>

                <div className="price-card-inner" style={{ padding: "20px 24px", background: "var(--surface2)" }}>

                    {/* Big price section — redesigned to avoid cut-off */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span className="pc-price-num" style={{ fontSize: 72, color: meta.color }}>
                                ₹{priceData.predicted_price ?? priceData.final_price}
                            </span>
                            <span style={{
                                fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                                color: "var(--text-dim)", fontWeight: 700
                            }}>
                                {priceData.ride_type === "shared" ? "shared ride" : "private ride"}
                            </span>
                        </div>

                        {priceData.confidence_interval && (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 15,
                                padding: "8px 12px", background: "rgba(0,0,0,0.1)", borderRadius: 4
                            }}>
                                <div style={{
                                    fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.2em",
                                    textTransform: "uppercase", fontWeight: 700
                                }}>Confidence Range</div>
                                <div style={{
                                    fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18,
                                    color: "var(--text-dim)", fontWeight: 700
                                }}>
                                    ₹{priceData.confidence_interval.low}
                                    <span style={{ margin: "0 6px", opacity: 0.5 }}>–</span>
                                    ₹{priceData.confidence_interval.high}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Surge cap warning */}
                    {priceData.surge_capped === true && (
                        <div style={{
                            padding: "8px 12px", borderRadius: 4, marginBottom: 16,
                            background: "rgba(255,64,96,0.08)", border: "1px solid rgba(255,64,96,0.25)",
                            fontSize: 9, color: "#ff4060", letterSpacing: "0.1em", textTransform: "uppercase",
                            fontWeight: 600
                        }}>
                            🔒 Surge capped at 3.0× — consumer protection active
                        </div>
                    )}

                    {/* Shared discount note */}
                    {priceData.ride_type === "shared" && (
                        <div style={{
                            padding: "8px 12px", borderRadius: 4, marginBottom: 16,
                            background: "rgba(0,200,255,0.07)", border: "1px solid rgba(0,200,255,0.15)",
                            fontSize: 9, color: "var(--cyan)", letterSpacing: "0.1em", textTransform: "uppercase",
                            fontWeight: 600
                        }}>
                            🚌 35% shared ride discount applied
                        </div>
                    )}

                    {/* Multiplier breakdown */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{
                            fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase",
                            color: "var(--cyan)", marginBottom: 12, fontWeight: 700
                        }}>Signal Multipliers</div>
                        <MultiplierRow label="Demand" value={priceData.inputs_used?.demand_ratio?.toFixed(2) ?? priceData.demand_multiplier} color="#f5a623" />
                        <MultiplierRow label="Weather" value={priceData.inputs_used?.weather_multiplier ?? priceData.weather_multiplier} color="#00c8ff" />
                        <MultiplierRow label="Traffic" value={priceData.inputs_used?.traffic_multiplier ?? priceData.traffic_multiplier} color="#ff8c00" />
                        <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", paddingTop: 12
                        }}>
                            <span style={{
                                fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
                                color: "var(--text-dim)", fontFamily: "var(--mono)", fontWeight: 700
                            }}>Combined Factor</span>
                            <span style={{
                                fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800,
                                fontSize: 24, color: meta.color
                            }}>
                                {combinedMult}×
                            </span>
                        </div>
                    </div>

                    {/* Base Fare Breakdown */}
                    {priceData.inputs_used && (
                        <div style={{
                            background: "var(--surface3, #1a2235)", borderRadius: 6,
                            padding: "16px", marginBottom: 20, border: "1px solid var(--border)"
                        }}>
                            <div style={{
                                fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase",
                                color: "var(--cyan)", marginBottom: 12, fontWeight: 700
                            }}>Estimate Components</div>
                            {[
                                ["Base rate", `₹30.00`],
                                [`Distance (${priceData.inputs_used.distance_km} km)`, `₹${(priceData.inputs_used.distance_km * 12).toFixed(2)}`],
                                [`Time (${priceData.inputs_used.eta_minutes} min)`, `₹${(priceData.inputs_used.eta_minutes * 1.5).toFixed(2)}`],
                            ].map(([label, val]) => (
                                <div key={label} style={{
                                    display: "flex", justifyContent: "space-between",
                                    marginBottom: 8, fontSize: 11
                                }}>
                                    <span style={{ color: "var(--text-dim)" }}>{label}</span>
                                    <span style={{
                                        color: "var(--text)", fontFamily: "'Barlow Condensed',sans-serif",
                                        fontWeight: 600, fontSize: 15
                                    }}>{val}</span>
                                </div>
                            ))}
                            <div style={{
                                borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 6,
                                display: "flex", justifyContent: "space-between"
                            }}>
                                <span style={{
                                    fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.1em",
                                    textTransform: "uppercase", fontWeight: 700
                                }}>ML Final Model output</span>
                                <span style={{
                                    fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800,
                                    fontSize: 20, color: "var(--text)"
                                }}>
                                    ₹{priceData.predicted_price ?? priceData.final_price}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Raw signals footer */}
                    <div style={{
                        display: "flex", gap: 0, borderTop: "1px solid var(--border)",
                        paddingTop: 16, paddingBottom: 4
                    }}>
                        {[
                            ["Drivers", priceData.inputs_used?.drivers ?? priceData.signals?.drivers ?? "—", "var(--green)"],
                            ["Riders", priceData.inputs_used?.riders ?? priceData.signals?.riders ?? "—", "var(--red)"],
                            ["D/R Ratio", priceData.inputs_used?.demand_ratio?.toFixed(2) ?? priceData.signals?.demand_ratio ?? "—", "var(--amber)"],
                        ].map(([label, val, color], i) => (
                            <div key={label} style={{
                                flex: 1, display: "flex", flexDirection: "column", gap: 4,
                                paddingRight: i < 2 ? 12 : 0,
                                paddingLeft: i > 0 ? 12 : 0,
                                borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                            }}>
                                <div style={{
                                    fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase",
                                    color: "var(--text-dim)", fontWeight: 700
                                }}>{label}</div>
                                <div style={{
                                    fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700,
                                    fontSize: 18, color
                                }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Shared inline styles ───────────────────────────────────────────────────────
const wrapStyle = (borderColor) => ({
    margin: "10px 18px 0", borderRadius: 6, overflow: "hidden",
    border: `1px solid ${borderColor}`, transition: "border-color 0.3s",
});
const headerStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 13px", background: "var(--surface2)",
    borderBottom: "1px solid var(--border)",
};
const titleStyle = {
    fontSize: 8, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--cyan)",
};
const emptyStyle = {
    padding: "20px 13px", background: "var(--surface2)",
    fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
    color: "var(--text-dim)", textAlign: "center",
};
const spinnerStyle = {
    display: "inline-block", width: 12, height: 12, borderRadius: "50%",
    border: "1.5px solid var(--border)", borderTopColor: "var(--cyan)",
    animation: "tc-spin 1s linear infinite",
};