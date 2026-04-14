// env.js — runtime environment configuration
//
// PRODUCTION (Netlify):
//   This file is regenerated on every deploy by the build command in netlify.toml:
//     printf 'window.ENV={API_URL:"%s"};' "${API_URL:-}" > frontend/env.js
//   When API_URL is blank (the default), all /api/* calls are relative and
//   Netlify's proxy rule forwards them to the BACKEND_URL set in the dashboard.
//
// LOCAL DEVELOPMENT:
//   Set API_URL below to your local backend, e.g. http://localhost:4000
//   or run the backend on port 4000 and leave it blank (config.js falls back).
//
window.ENV = {
  API_URL: ''   // leave blank to use Netlify proxy; set to http://localhost:4000 for local dev
};
