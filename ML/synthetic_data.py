import numpy as np
import pandas as pd

np.random.seed(42)
N = 3000

def rule_based_price_inr(row):
    # Uber Go India rates (metro cities)
    BASE_FARE   = 40.0   # flat booking fee
    PER_KM      = 13.0   # ₹13/km — matches Uber Go
    PER_MINUTE  = 1.25   # ₹1.25/min — Uber Go rate

    base = BASE_FARE + (row['distance_km'] * PER_KM) + (row['eta_minutes'] * PER_MINUTE)

    # Surge: capped at 2.0x — Uber India rarely exceeds this in practice
    surge = row['demand_ratio'] * row['weather_multiplier'] * row['traffic_multiplier']
    surge = min(surge, 2.0)

    # Peak hour: morning 7–10am, evening 5–8pm
    hour = row['hour_of_day']
    hour_factor = 1.15 if (7 <= hour <= 9) or (17 <= hour <= 19) else 1.0

    # Shared ride: Uber Pool ~30% cheaper
    shared_discount = 0.70 if row['is_shared'] else 1.0

    # Driver supply: more drivers than riders = slight discount
    supply_gap = row['drivers'] - row['riders']
    driver_factor = max(0.90, min(1.10, 1.0 - supply_gap * 0.005))

    price = base * surge * hour_factor * shared_discount * driver_factor

    # Noise inside formula so cap isn't broken
    noise = np.random.uniform(0.93, 1.07)
    price = price * noise

    # Uber India minimum and practical maximum
    price = max(price, 50.0)    # ₹50 minimum fare
    price = min(price, 1200.0)  # ₹1200 cap (~35km sedan with surge)

    return round(price, 0)


# Distance: 70% short city rides, 30% long rides — Indian urban pattern
short_rides = np.random.uniform(2, 15, int(N * 0.70))    # 2100 rows: local trips
long_rides  = np.random.uniform(15, 35, int(N * 0.30))   # 900 rows: airport/intercity
all_distances = np.concatenate([short_rides, long_rides])
np.random.shuffle(all_distances)

data = pd.DataFrame({
    # Distance: realistic Indian city ride lengths
    'distance_km': all_distances,

    # ETA: Indian traffic — rarely under 5min, rarely over 50min for app rides
    'eta_minutes': np.random.uniform(5, 50, N),

    # Drivers: metro cities have decent supply, not too sparse
    'drivers': np.random.randint(3, 35, N),

    # Riders: demand varies — busy areas have more concurrent requests
    'riders': np.random.randint(5, 60, N),

    # Demand ratio: weighted toward normal — spikes are rare events
    'demand_ratio': np.random.choice(
        [0.8, 1.0, 1.2, 1.5, 1.8, 2.0],
        size=N,
        p=[0.10, 0.35, 0.25, 0.15, 0.10, 0.05]   # 70% at or below 1.2x
    ),

    # Weather: India — mostly clear, monsoon season adds 1.3–1.5x
    'weather_multiplier': np.random.choice(
        [1.0, 1.1, 1.3, 1.5],
        size=N,
        p=[0.60, 0.20, 0.15, 0.05]   # 60% clear days
    ),

    # Traffic: Indian cities lean heavy — skew toward 1.2–1.4x
    'traffic_multiplier': np.random.choice(
        [1.0, 1.2, 1.4, 1.6],
        size=N,
        p=[0.15, 0.40, 0.30, 0.15]   # only 15% free-flowing traffic
    ),

    # Hour: uniform across 24hrs — night rides included
    'hour_of_day': np.random.randint(0, 24, N),

    # Day: uniform across week
    'day_of_week': np.random.randint(0, 7, N),

    # Shared: ~30% of Indian Uber rides are pooled
    'is_shared': np.random.choice([0, 1], size=N, p=[0.70, 0.30]),
})

# Apply INR formula — noise is handled inside rule_based_price_inr already
data['final_price'] = data.apply(rule_based_price_inr, axis=1)

# Verify
print(data.head())
print(data['final_price'].describe())
print(f"\nUnique distances: {data['distance_km'].nunique()}")
print(f"Rides ≤15km: {(data['distance_km'] <= 15).sum()} | Rides >15km: {(data['distance_km'] > 15).sum()}")

data.to_csv('training_data.csv', index=False)
print("\n✅ Saved to training_data.csv")
print(data.head())