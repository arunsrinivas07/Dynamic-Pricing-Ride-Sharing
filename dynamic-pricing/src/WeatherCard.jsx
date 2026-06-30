import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.REACT_APP_API_BASE;
const POLL_INTERVAL = 60_000; // weather changes slowly, poll every 60s

export default function WeatherCard({ pickup, onData }) {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const intervalRef = useRef(null);
    const countdownRef = useRef(null);

    const fetchWeather = async (lat, lng) => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`${API_BASE}/weather?lat=${lat}&lng=${lng}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setWeather(data);
            if (onData) onData(data);
            setCountdown(POLL_INTERVAL / 1000);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!pickup) {
            setWeather(null);
            clearInterval(intervalRef.current);
            clearInterval(countdownRef.current);
            return;
        }
        fetchWeather(pickup.lat, pickup.lng);
        intervalRef.current = setInterval(() => fetchWeather(pickup.lat, pickup.lng), POLL_INTERVAL);
        countdownRef.current = setInterval(() => setCountdown((c) => c <= 1 ? POLL_INTERVAL / 1000 : c - 1), 1000);
        return () => { clearInterval(intervalRef.current); clearInterval(countdownRef.current); };
    }, [pickup?.lat, pickup?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

    const multColor = !weather ? "#4a6580"
        : weather.weather_multiplier >= 1.35 ? "#ff4060"
            : weather.weather_multiplier >= 1.15 ? "#f5a623"
                : weather.weather_multiplier >= 1.05 ? "#00c8ff"
                    : "#00e87a";

    return (
        <>
            <style>{`
        .weather-card {
          margin: 10px 18px 0;
          border-radius: 6px;
          border: 1px solid var(--border);
          overflow: hidden;
          transition: border-color 0.3s;
        }

        .wc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .wc-title {
          font-size: 8px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--cyan); display: flex; align-items: center; gap: 7px;
        }
        .wc-pulse {
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
          animation: wc-blink 2s ease-in-out infinite;
        }
        @keyframes wc-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .wc-countdown {
          font-size: 8px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;
        }
        .wc-countdown b { color: var(--cyan); }
        .wc-ring {
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid var(--border); border-top-color: var(--cyan);
          animation: wc-spin 1s linear infinite;
        }
        @keyframes wc-spin { to { transform: rotate(360deg); } }

        .wc-body { padding: 16px; background: var(--surface2); }
        .wc-empty {
          padding: 16px 13px; background: var(--surface2);
          font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim); text-align: center;
        }

        /* Main weather row */
        .wc-main {
          display: flex; align-items: center; gap: 14px; margin-bottom: 16px;
        }
        .wc-icon { font-size: 48px; line-height: 1; flex-shrink: 0; }
        .wc-main-info { flex: 1; }
        .wc-temp {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 42px; line-height: 1;
          color: var(--text); margin-bottom: 2px;
        }
        .wc-temp span { font-size: 18px; color: var(--text-dim); }
        .wc-desc {
          font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim);
        }

        /* Multiplier badge */
        .wc-multiplier-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .wc-mult-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 12px; border-radius: 4px;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800; font-size: 16px; letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .wc-mult-label {
          font-size: 8px; font-family: 'Space Mono', monospace;
          letter-spacing: 0.15em; text-transform: uppercase; color: var(--text-dim);
        }

        /* Stats grid */
        .wc-stats {
          display: flex; gap: 0;
          border-top: 1px solid var(--border); padding-top: 12px;
        }
        .wc-stat { flex: 1; display: flex; flex-direction: column; gap: 3px; padding-right: 10px; }
        .wc-stat:not(:first-child) { padding-left: 10px; border-left: 1px solid var(--border); padding-right: 0; }
        .wc-stat-label { font-size: 7px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); }
        .wc-stat-value {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700; font-size: 16px; color: var(--text);
        }
        .wc-stat-unit { font-size: 9px; color: var(--text-dim); margin-left: 2px; }
      `}</style>

            <div className="weather-card" style={{ borderColor: weather ? `${multColor}44` : "var(--border)" }}>
                {/* Header */}
                <div className="wc-header">
                    <div className="wc-title">
                        <span className="wc-pulse" style={{ color: weather ? multColor : "var(--text-dim)" }} />
                        Weather at Pickup
                    </div>
                    {loading
                        ? <span className="wc-ring" />
                        : pickup && weather && (
                            <div className="wc-countdown">
                                refresh in <b>{countdown}s</b>
                            </div>
                        )
                    }
                </div>

                {/* Body */}
                {!pickup ? (
                    <div className="wc-empty">Set pickup to load weather</div>
                ) : error ? (
                    <div className="wc-empty" style={{ color: "var(--red)" }}>
                        ⚠ Weather unavailable — check OWM API key in main.py
                    </div>
                ) : !weather ? (
                    <div className="wc-empty">Loading weather…</div>
                ) : (
                    <div className="wc-body">
                        {/* Icon + temp + description */}
                        <div className="wc-main">
                            <div className="wc-icon">{weather.icon}</div>
                            <div className="wc-main-info">
                                <div className="wc-temp">
                                    {weather.temp_c}<span>°C</span>
                                </div>
                                <div className="wc-desc">{weather.description}</div>
                            </div>
                        </div>

                        {/* Weather multiplier badge */}
                        <div className="wc-multiplier-row">
                            <div className="wc-mult-label">Weather pricing impact</div>
                            <div
                                className="wc-mult-badge"
                                style={{
                                    color: multColor,
                                    background: `${multColor}14`,
                                    border: `1px solid ${multColor}44`,
                                }}
                            >
                                {weather.weather_multiplier === 1.0 ? "✅" : "⚠️"} {weather.weather_multiplier}× multiplier
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="wc-stats">
                            <div className="wc-stat">
                                <div className="wc-stat-label">Feels like</div>
                                <div className="wc-stat-value">
                                    {weather.feels_like_c}<span className="wc-stat-unit">°C</span>
                                </div>
                            </div>
                            <div className="wc-stat">
                                <div className="wc-stat-label">Humidity</div>
                                <div className="wc-stat-value">
                                    {weather.humidity}<span className="wc-stat-unit">%</span>
                                </div>
                            </div>
                            <div className="wc-stat">
                                <div className="wc-stat-label">Wind</div>
                                <div className="wc-stat-value">
                                    {weather.wind_speed_kmh}<span className="wc-stat-unit">km/h</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}