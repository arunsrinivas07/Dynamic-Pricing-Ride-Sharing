# DynamicPrice | AI-Powered Dispatch Engine

A sophisticated ride-sharing dispatch and pricing simulation platform. This application leverages real-time demand signals, weather data, and traffic conditions to predict optimal ride prices using Machine Learning and provides contextual explanations via GenAI.

## 🚀 System Architecture

### 1. Frontend (React)
- **Interactive Map**: TomTom Maps SDK integration for location picking and route visualization.
- **Dynamic Panels**: Real-time visualization of driver availability, rider demand, and surge zones.
- **AI Analysis Sidebar**: Contextual breakdown of pricing factors and earnings tips for drivers.

### 2. Backend (FastAPI)
- **Pricing Engine**: Multi-signal logic combining demand-supply ratio, weather multipliers, and traffic delays.
- **ML Inference**: XGBoost-powered model for price prediction with confidence intervals.
- **GenAI Integration**: Groq (Llama 3.3) for generating human-readable price explanations and driver coaching.

### 3. ML Pipeline (Python)
- **Synthetic Data**: Custom generator for realistic ride-sharing histories.
- **Model Training**: Regression model trained on distance, time, demand, and environmental factors.

## 🛠️ Tech Stack
- **Frontend**: React, CSS (Grid/Flexbox), TomTom Maps API.
- **Backend**: FastAPI, Uvicorn, AsyncIO, Groq Cloud API.
- **ML**: Scikit-Learn, Joblib, NumPy, Pandas.

## ⚙️ Setup & Installation

### Backend
1. Navigate to `Backend/`.
2. Install dependencies: `pip install -r requirements.txt` (ensure `fastapi`, `uvicorn`, `groq`, `httpx`, `joblib`, `numpy` are installed).
3. Run: `uvicorn main:app --reload --port 8000`.

### Frontend
1. Navigate to `dynamic-pricing/`.
2. Install dependencies: `npm install`.
3. Run: `npm start`.

---
*Developed as a high-performance simulation for dynamic pricing optimization.*
