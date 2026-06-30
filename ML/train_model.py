import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score

df = pd.read_csv('training_data.csv')

FEATURES = ['distance_km', 'eta_minutes', 'drivers', 'riders',
            'demand_ratio', 'weather_multiplier', 'traffic_multiplier',
            'hour_of_day', 'day_of_week', 'is_shared']
TARGET = 'final_price'

X = df[FEATURES]
y = df[TARGET]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = xgb.XGBRegressor(
    n_estimators=1000,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    eval_metric='rmse',
    early_stopping_rounds=30   # ← moved here
)

model.fit(
    X_train,
    y_train,
    eval_set=[(X_test, y_test)],
    verbose=50
)

y_pred = model.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2   = r2_score(y_test, y_pred)

print(f"\n✅ Best iteration : {model.best_iteration}")
print(f"✅ RMSE           : ₹{rmse:.2f}")
print(f"✅ R²             : {r2:.4f}")

# Show worst predictions to spot any systematic errors
results = X_test.copy()
results['actual']    = y_test.values
results['predicted'] = y_pred.round(0)
results['error_pct'] = ((results['predicted'] - results['actual']).abs() / results['actual'] * 100).round(1)

print("\nTop 5 worst predictions:")
print(results.sort_values('error_pct', ascending=False).head()[
    ['distance_km', 'demand_ratio', 'actual', 'predicted', 'error_pct']
].to_string())

print("\nError distribution:")
print(f"  Within ₹20  : {(results['error_pct'] < 10).sum()} / {len(results)} rides")
print(f"  Within ₹50  : {(results['error_pct'] < 20).sum()} / {len(results)} rides")
print(f"  Over  ₹100  : {(results['error_pct'] > 30).sum()} / {len(results)} rides")

joblib.dump(model, 'pricing_model.pkl')
print("\n✅ Model saved to pricing_model.pkl")