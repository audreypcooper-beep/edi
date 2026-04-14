// config.js — API base URL
//
// Priority:
//   1. window.ENV.API_URL (set by env.js / Netlify build)
//   2. Empty string  → relative /api/* paths, proxied by Netlify to BACKEND_URL
//   3. Localhost     → only used when ENV is missing entirely (raw file open, no server)
//
const _envUrl = (window.ENV && window.ENV.API_URL !== undefined) ? window.ENV.API_URL : null;
const API_BASE = _envUrl !== null
  ? _envUrl                    // '' (proxy) or full URL (direct)
  : 'http://localhost:4000';   // fallback for local dev without env.js
