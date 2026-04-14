// api.js — base fetch wrapper with auth headers, 401 refresh, and error toasts

/**
 * Attach a loading spinner to a button and disable it.
 * Returns a restore function that re-enables the button.
 */
function setButtonLoading(btn, loadingText) {
  if (!btn) return () => {};
  const original = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${loadingText || ''}`;
  return function restore() {
    btn.innerHTML = original;
    btn.disabled = originalDisabled;
  };
}

/**
 * Core fetch wrapper.
 * - Attaches Authorization header from localStorage accessToken
 * - On 401: attempts token refresh once, retries
 * - On network / API error: shows error toast and throws
 */
async function apiFetch(path, options = {}, _isRetry = false) {
  // In demo mode, skip all real API calls and let callers use their fallback data
  if (localStorage.getItem('demoMode')) {
    throw Object.assign(new Error('Demo mode — no backend'), { isNetworkError: true });
  }

  const url = API_BASE + path;
  const accessToken = localStorage.getItem('accessToken');

  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (accessToken) {
    headers['Authorization'] = 'Bearer ' + accessToken;
  }

  let response;
  try {
    response = await fetch(url, Object.assign({}, options, { headers }));
  } catch (networkErr) {
    // Network / CORS failure — caller can choose to fall back to demo data
    throw Object.assign(new Error('Network error: ' + networkErr.message), { isNetworkError: true });
  }

  // Token expired — attempt refresh once
  if (response.status === 401 && !_isRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return apiFetch(path, options, true);
    }
    // Refresh failed — force logout
    clearAuthTokens();
    showScreen('login');
    showToast('Your session has expired. Please sign in again.', 'error');
    throw new Error('Session expired');
  }

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      errMsg = errBody.message || errBody.error || errMsg;
    } catch (_) { /* ignore */ }
    showToast(errMsg, 'error');
    throw Object.assign(new Error(errMsg), { status: response.status });
  }

  // 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true on success, false on failure.
 */
async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  try {
    const res = await fetch(API_BASE + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      if (data.idToken) localStorage.setItem('idToken', data.idToken);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/** Clear all stored auth tokens */
function clearAuthTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('idToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('demoMode');
  localStorage.removeItem('fromPortal');
}

/**
 * Show/hide auth screens
 */
function showScreen(screenName) {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screenName);
  if (el) el.classList.add('active');
  document.getElementById('auth-wrapper').style.display = 'flex';
  const app = document.getElementById('app-wrapper');
  app.style.display = 'none';
  app.classList.remove('active');
}

// ============================================================
// TOAST (shared utility used by all modules)
// ============================================================
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${msg}`;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ============================================================
// SHARED VALIDATION HELPERS
// ============================================================
function setError(groupId) {
  const el = document.getElementById(groupId);
  if (el) el.classList.add('error');
}
function clearError(groupId) {
  const el = document.getElementById(groupId);
  if (el) el.classList.remove('error');
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isValidPassword(p) { return p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p); }

// ============================================================
// SHARED UTILS
// ============================================================
function generateRef() {
  const d = new Date();
  const ds = d.toISOString().slice(0, 10).replace(/-/g, '');
  return 'CPE-' + ds + '-' + randStr(6).toUpperCase();
}
function randStr(n) {
  return Math.random().toString(36).substr(2, n).toUpperCase();
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function statusBadge(s) {
  const map = {
    'Pending': 'badge-amber',
    'Complete': 'badge-green',
    'Completed': 'badge-green',
    'Rejected': 'badge-red',
    'Active': 'badge-green',
    'Inactive': 'badge-gray',
  };
  return `<span class="badge ${map[s] || 'badge-gray'}">${s}</span>`;
}
function formatCurrency(input) {
  let v = input.value.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
  if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
  input.value = v ? '$' + v : '';
}
