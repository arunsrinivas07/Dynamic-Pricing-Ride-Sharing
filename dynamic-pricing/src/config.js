// Central config — no CloudFront, direct API Gateway
const isProd = process.env.NODE_ENV === "production";

export const API_BASE = isProd
  ? "https://yvzrqmj545.execute-api.ap-south-1.amazonaws.com/prod"
  : "http://localhost:8000";

export const TOMTOM_API_KEY = process.env.REACT_APP_TOMTOM_KEY || "AEHc0x6tS68gXO4SXNxJLJvSEYGiInVN";
export const POLL_INTERVAL = 20_000;
export const RADIUS_KM = 3;
