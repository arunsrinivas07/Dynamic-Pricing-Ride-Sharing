"""
generate_dataset_and_train.py
==============================
Step 1: Generates a CSV dataset with correct pricing labels
Step 2: Trains XGBoost on that dataset
Step 3: Saves pricing_model.pkl

Run locally:
    pip install xgboost scikit-learn numpy pandas joblib
    python generate_dataset_and_train.py
"""

import numpy as np
import pandas as pd
import joblib
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

# ══════════════════════════════════════════════════════════════════
# PRICING CONSTANTS
# ══════════════════════════════════════════════════════════════════
PER_KM_RATE     = 13.00   # ₹ per km
PER_MIN_RATE    =  1.25   # ₹ per minute
MAX_SURGE_CAP   =  3.0    # hard cap on surge multiplier
SHARED_DISCOUNT =  0.65   # shared ride = 65% of price

# Weather multiplier → flat ₹ surcharge added to fare
WEATHER_FEE_TABLE = {
    1.00: 0,    # clear
    1.05: 8,    # cloudy
    1.10: 15,   # mist / fog
    1.15: 25,   # drizzle
    1.25: 40,   # rain
    1.35: 60,   # snow
    1.50: 80,   # thunderstorm / storm
}

# Traffic multiplier → flat ₹ surcharge added to fare
TRAFFIC_FEE_TABLE = {
    1.00: 0,    # free flow
    1.10: 20,   # moderate
    1.25: 35,   # heavy
    1.40: 55,   # severe / gridlock
}


# ══════════════════════════════════════════════════════════════════
# PRICING FORMULA  — the exact logic the model must learn
# ══════════════════════════════════════════════════════════════════
def compute_price(distance_km, eta_minutes, demand_ratio,
                  weather_mult, traffic_mult,
                  drivers, riders, is_shared):
    """
    Returns (final_price, full_breakdown_dict)

    Formula:
        distance_fee  = distance_km × 13
        time_fee      = eta_minutes × 1.25
        weather_fee   = lookup(weather_mult)      ← flat ₹
        traffic_fee   = lookup(traffic_mult)      ← flat ₹
        subtotal      = distance_fee + time_fee + weather_fee + traffic_fee
        surge_fee     = subtotal × (surge_mult - 1)
        total         = subtotal + surge_fee
        final         = total × 0.65  if shared,  else total
    """
    # ── Meter fare ────────────────────────────────────────────────
    distance_fee = round(distance_km * PER_KM_RATE,  2)
    time_fee     = round(eta_minutes  * PER_MIN_RATE, 2)

    # ── Condition surcharges (flat ₹) ─────────────────────────────
    w_fee = WEATHER_FEE_TABLE.get(round(weather_mult, 2),
                                   round((weather_mult - 1.0) * 200, 2))
    t_fee = TRAFFIC_FEE_TABLE.get(round(traffic_mult, 2),
                                   round((traffic_mult - 1.0) * 150, 2))

    # ── Subtotal ──────────────────────────────────────────────────
    subtotal = round(distance_fee + time_fee + w_fee + t_fee, 2)

    # ── Demand surge ──────────────────────────────────────────────
    # Base mode: more drivers than riders, mild weather & traffic
    is_base = (drivers >= riders
               and weather_mult <= 1.05
               and traffic_mult <= 1.05)

    if is_base:
        surge_mult = 1.0
    elif demand_ratio < 0.8:
        surge_mult = 1.0
    elif demand_ratio <= 1.2:
        surge_mult = 1.2
    else:
        surge_mult = min(demand_ratio, MAX_SURGE_CAP)

    surge_fee = round(subtotal * (surge_mult - 1.0), 2)
    total     = round(subtotal + surge_fee, 2)

    # ── Shared discount ───────────────────────────────────────────
    shared_saving = 0
    if is_shared:
        shared_saving = round(total * (1 - SHARED_DISCOUNT), 2)
        total         = round(total * SHARED_DISCOUNT, 2)

    return total, {
        "distance_fee":  distance_fee,
        "time_fee":      time_fee,
        "weather_fee":   w_fee,
        "traffic_fee":   t_fee,
        "subtotal":      subtotal,
        "surge_fee":     surge_fee,
        "shared_saving": shared_saving,
        "final_price":   total,
        "pricing_mode":  "base" if is_base else "surge",
    }


# ══════════════════════════════════════════════════════════════════
# SECTION 1 — SHOW FORMULA WITH EXAMPLES
# ══════════════════════════════════════════════════════════════════
print("=" * 72)
print("  PRICING FORMULA EXAMPLES")
print("  formula: (dist×13) + (time×1.25) + weather_fee + traffic_fee + surge")
print("=" * 72)

examples = [
    # dist   eta    dr    wm     tm     drv  rid  sh   description
    (3.73, 10.9, 2.00, 1.00, 1.00,  18,  65,  0, "Screenshot — surge 2x, clear"),
    (3.73, 10.9, 2.00, 1.25, 1.00,  18,  65,  0, "Surge 2x + RAIN    (+₹40)"),
    (3.73, 10.9, 2.00, 1.35, 1.00,  18,  65,  0, "Surge 2x + SNOW    (+₹60)"),
    (3.73, 10.9, 2.00, 1.50, 1.00,  18,  65,  0, "Surge 2x + STORM   (+₹80)"),
    (3.73, 10.9, 2.00, 1.10, 1.00,  18,  65,  0, "Surge 2x + FOG     (+₹15)"),
    (3.73, 10.9, 2.00, 1.00, 1.10,  18,  65,  0, "Surge 2x + MOD TRF (+₹20)"),
    (3.73, 10.9, 2.00, 1.00, 1.40,  18,  65,  0, "Surge 2x + SEV TRF (+₹55)"),
    (3.73, 10.9, 2.00, 1.25, 1.40,  18,  65,  0, "Rain + severe traffic + surge"),
    (3.73, 10.9, 0.50, 1.00, 1.00,  30,  10,  0, "BASE price — more drivers"),
    (3.73, 10.9, 2.00, 1.00, 1.00,  18,  65,  1, "Surge 2x — SHARED ride"),
]

print(f"\n  {'Description':<36} {'dist':>7} {'time':>6} {'wthr':>6} {'traf':>6} {'surg':>7}  {'FINAL':>8}")
print("  " + "─" * 82)
for d, e, dr, wm, tm, drv, rid, sh, lbl in examples:
    final, bd = compute_price(d, e, dr, wm, tm, drv, rid, sh)
    print(f"  {lbl:<36} ₹{bd['distance_fee']:>6} ₹{bd['time_fee']:>4}"
          f" ₹{bd['weather_fee']:>4} ₹{bd['traffic_fee']:>4}"
          f" ₹{bd['surge_fee']:>5}   ₹{final:>7.2f}")


# ══════════════════════════════════════════════════════════════════
# SECTION 2 — GENERATE DATASET
# ══════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("  GENERATING DATASET  (N = 12,000 rows)")
print("=" * 72)

np.random.seed(42)
N = 12000

distance_km   = np.random.uniform(0.5, 25.0, N)
# ETA correlated with distance (realistic)
eta_minutes   = distance_km * np.random.uniform(1.2, 3.8, N)

drivers       = np.random.randint(3, 45, N)
riders        = np.random.randint(3, 90, N)
demand_ratio  = np.clip(riders / np.maximum(drivers, 1), 0.1, 5.0)

# Weather multipliers with realistic distribution
weather_mults = np.random.choice(
    [1.00, 1.05, 1.10, 1.15, 1.25, 1.35, 1.50],
    N, p=[0.50, 0.10, 0.10, 0.10, 0.10, 0.06, 0.04]
)
# Traffic multipliers with realistic distribution
traffic_mults = np.random.choice(
    [1.00, 1.10, 1.25, 1.40],
    N, p=[0.50, 0.25, 0.15, 0.10]
)
hour_of_day = np.random.randint(0, 24, N)
day_of_week = np.random.randint(0, 7, N)
is_shared   = np.random.choice([0, 1], N, p=[0.65, 0.35])

# ── Compute labels ────────────────────────────────────────────────
print("  Computing price labels...")
labels = []
breakdowns = []
for i in range(N):
    price, bd = compute_price(
        float(distance_km[i]), float(eta_minutes[i]),
        float(demand_ratio[i]), float(weather_mults[i]),
        float(traffic_mults[i]), int(drivers[i]),
        int(riders[i]),          int(is_shared[i]),
    )
    labels.append(price)
    breakdowns.append(bd)

labels = np.array(labels)

# Add ±3% noise so model generalises (not just memorising)
noise  = np.random.uniform(0.97, 1.03, N)
labels = np.round(labels * noise, 2)

# ── Build DataFrame ───────────────────────────────────────────────
df = pd.DataFrame({
    # Features (model inputs)
    "distance_km":        distance_km,
    "eta_minutes":        np.round(eta_minutes, 2),
    "drivers":            drivers,
    "riders":             riders,
    "demand_ratio":       np.round(demand_ratio, 4),
    "weather_multiplier": weather_mults,
    "traffic_multiplier": traffic_mults,
    "hour_of_day":        hour_of_day,
    "day_of_week":        day_of_week,
    "is_shared":          is_shared,
    # Label (what model predicts)
    "final_price":        labels,
    # Breakdown columns (for reference / inspection)
    "distance_fee":       [b["distance_fee"]  for b in breakdowns],
    "time_fee":           [b["time_fee"]       for b in breakdowns],
    "weather_fee":        [b["weather_fee"]    for b in breakdowns],
    "traffic_fee":        [b["traffic_fee"]    for b in breakdowns],
    "surge_fee":          [b["surge_fee"]      for b in breakdowns],
    "pricing_mode":       [b["pricing_mode"]   for b in breakdowns],
})

df.to_csv("pricing_dataset.csv", index=False)
print(f"  ✅ Saved pricing_dataset.csv  ({N} rows × {len(df.columns)} columns)")

# ── Dataset statistics ────────────────────────────────────────────
print(f"\n  Label (final_price) statistics:")
print(f"    Min    : ₹{labels.min():.2f}")
print(f"    Max    : ₹{labels.max():.2f}")
print(f"    Mean   : ₹{labels.mean():.2f}")
print(f"    Median : ₹{np.median(labels):.2f}")
print(f"    Std    : ₹{labels.std():.2f}")

print(f"\n  Dataset breakdown:")
surge_pct = (df["pricing_mode"] == "surge").mean() * 100
base_pct  = 100 - surge_pct
shared_pct = df["is_shared"].mean() * 100
print(f"    Surge pricing  : {surge_pct:.1f}%")
print(f"    Base pricing   : {base_pct:.1f}%")
print(f"    Shared rides   : {shared_pct:.1f}%")

print(f"\n  Sample rows:")
print(df[["distance_km","eta_minutes","drivers","riders","demand_ratio",
          "weather_multiplier","traffic_multiplier","is_shared","final_price"]].head(8).to_string(index=False))

assert labels.mean() > 60,  "ERROR: mean too low — label formula wrong"
assert labels.max()  > 300, "ERROR: max too low  — surge not applying"
assert labels.min()  > 0,   "ERROR: negative prices"
print("\n  ✅ All label assertions passed")


# ══════════════════════════════════════════════════════════════════
# SECTION 3 — TRAIN XGBoost
# ══════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("  TRAINING XGBoost MODEL")
print("=" * 72)

FEATURE_NAMES = [
    "distance_km", "eta_minutes", "drivers", "riders", "demand_ratio",
    "weather_multiplier", "traffic_multiplier",
    "hour_of_day", "day_of_week", "is_shared",
]

X = df[FEATURE_NAMES].values
y = df["final_price"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.15, random_state=42
)
print(f"  Train: {len(X_train)} samples  |  Test: {len(X_test)} samples")

model = XGBRegressor(
    n_estimators     = 600,
    max_depth        = 7,
    learning_rate    = 0.04,
    subsample        = 0.85,
    colsample_bytree = 0.85,
    min_child_weight = 3,
    gamma            = 0.1,
    reg_alpha        = 0.05,
    random_state     = 42,
    n_jobs           = -1,
    eval_metric      = "mae",
)
print("  Fitting... (600 trees, max_depth=7)")
model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=100,
)

y_pred = model.predict(X_test)
mae    = mean_absolute_error(y_test, y_pred)
r2     = r2_score(y_test, y_pred)
print(f"\n  MAE  : ₹{mae:.2f}   (target < ₹5)")
print(f"  R²   : {r2:.4f}  (target > 0.995)")

print("\n  Feature importance:")
for name, imp in sorted(zip(FEATURE_NAMES, model.feature_importances_), key=lambda x: -x[1]):
    bar = "█" * int(imp * 40)
    print(f"    {name:<28} {bar:<40} {imp:.4f}")


# ══════════════════════════════════════════════════════════════════
# SECTION 4 — VERIFY: ML vs Rule-based
# ══════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("  VERIFICATION  |  ML Prediction  vs  Rule-based Formula")
print("=" * 72)
print(f"  {'Description':<36} {'Rule-based':>11}  {'ML Model':>9}  {'Diff':>7}  Status")
print("  " + "─" * 76)

for d, e, dr, wm, tm, drv, rid, sh, lbl in examples:
    rule, _ = compute_price(d, e, dr, wm, tm, drv, rid, sh)
    x       = np.array([[d, e, drv, rid, dr, wm, tm, 12, 1, sh]])
    ml      = round(float(model.predict(x)[0]), 2)
    diff    = ml - rule
    status  = "✅" if abs(diff) < 8 else "⚠️ "
    print(f"  {lbl:<36} ₹{rule:>10.2f}  ₹{ml:>8.2f}  {diff:>+6.2f}   {status}")


# ══════════════════════════════════════════════════════════════════
# SECTION 5 — SAVE
# ══════════════════════════════════════════════════════════════════
joblib.dump(model, "pricing_model.pkl")

print("\n" + "=" * 72)
print("  FILES SAVED")
print("=" * 72)
print("  pricing_dataset.csv  — full training dataset (open in Excel to inspect)")
print("  pricing_model.pkl    — trained XGBoost model")
print()
print("  Next steps:")
print("  1. aws s3 cp pricing_model.pkl s3://dynamic-price-models-ACCOUNT_ID/pricing_model.pkl")
print("  2. AWS Console → predict-price-lambda → Configuration → Environment variables")
print("       Add:  MODEL_VERSION = 2")
print("  3. Deploy updated utils_v2.py and explain_price_lambda.py")
