// auth.js — login, register, logout, token refresh, password reset

// ============================================================
// DEMO FALLBACK DATA
// ============================================================
const DEMO_USER = {
  givenName: 'Jane',
  familyName: 'Smith',
  name: 'Jane Smith',
  firstName: 'Jane',
  role: 'Provider',
  email: 'jane.smith@valleyhealth.com',
  orgName: 'Valley Health System',
  npi: '1234567890',
  taxId: '36-2481928',
  accountType: 'provider',
  address: '100 Medical Center Drive',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  phone: '(217) 555-0100',
  contactPhone: '(217) 555-0200',
  title: 'Revenue Cycle Manager',
  notifications: { edi270: true, payments: true, reports: true, errors: false }
};

let currentUser = null;
let regCurrentStep = 1;

// ============================================================
// INIT — called on DOMContentLoaded
// ============================================================
async function initAuth() {
  setDefaultDates();

  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    try {
      const user = await apiFetch('/api/users/me');
      currentUser = normalizeUser(user);
      showApp(currentUser);
      return;
    } catch (err) {
      // Token invalid or network error — clear and show login
      clearAuthTokens();
    }
  }
  showScreen('login');
}

// ============================================================
// AUTH SCREEN NAVIGATION
// ============================================================
function showAuthScreen(id) {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============================================================
// LOGIN
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('lg-email').value.trim();
  const pass = document.getElementById('lg-pass').value;
  let valid = true;
  clearError('lg-email-g');
  clearError('lg-pass-g');
  if (!isValidEmail(email)) { setError('lg-email-g'); valid = false; }
  if (!pass) { setError('lg-pass-g'); valid = false; }
  if (!valid) return;

  const btn = document.querySelector('#login-form button[type=submit]');
  const restore = setButtonLoading(btn, ' Signing in…');

  try {
    const tokens = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    localStorage.setItem('accessToken', tokens.accessToken);
    if (tokens.idToken) localStorage.setItem('idToken', tokens.idToken);
    if (tokens.refreshToken) localStorage.setItem('refreshToken', tokens.refreshToken);

    const user = await apiFetch('/api/users/me');
    currentUser = normalizeUser(user);
    showApp(currentUser);
  } catch (err) {
    if (err.isNetworkError || (err.status && err.status >= 500)) {
      // Demo mode fallback
      currentUser = Object.assign({}, DEMO_USER, { email });
      showApp(currentUser);
      showToast('Running in demo mode — API unavailable.', 'warning');
    }
    // Non-network errors already toasted by apiFetch
  } finally {
    restore();
  }
}

// ============================================================
// DEMO ACCESS
// ============================================================
function enterDemo() {
  currentUser = Object.assign({}, DEMO_USER);
  localStorage.setItem('demoMode', '1');
  showApp(currentUser);
}

// ============================================================
// SHOW APP
// ============================================================
function showApp(user) {
  document.getElementById('auth-wrapper').style.display = 'none';
  const app = document.getElementById('app-wrapper');
  app.style.display = 'flex';
  app.classList.add('active');

  document.getElementById('sidebar-user-name').textContent = user.name || (user.givenName + ' ' + user.familyName);
  document.getElementById('sidebar-user-role').textContent = capitalize(user.accountType || user.role || 'Provider');
  document.getElementById('dash-user-name').textContent = user.firstName || user.givenName || 'User';
  const now = new Date();
  document.getElementById('dash-date').textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  showSection('dashboard');
  showToast('Welcome back, ' + (user.firstName || user.givenName || 'User') + '!', 'success');
}

// ============================================================
// LOGOUT
// ============================================================
async function doLogout() {
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ accessToken })
      });
    } catch (_) { /* ignore logout errors */ }
  }
  clearAuthTokens();
  currentUser = null;
  showScreen('login');
  showToast('You have been signed out.');
}

// ============================================================
// PASSWORD RESET
// ============================================================
async function handleReset(e) {
  e.preventDefault();
  const email = document.getElementById('rst-email').value.trim();
  clearError('rst-email-g');
  if (!isValidEmail(email)) { setError('rst-email-g'); return; }

  const btn = document.querySelector('#reset-form button[type=submit]');
  const restore = setButtonLoading(btn, ' Sending…');

  try {
    await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  } catch (err) {
    if (!err.isNetworkError && (!err.status || err.status < 500)) {
      restore();
      return; // error already toasted
    }
    // Network/server error — still show success UI (email may have been queued)
  } finally {
    restore();
  }

  document.getElementById('reset-form').style.display = 'none';
  document.getElementById('reset-success').classList.add('show');
  setTimeout(() => {
    document.getElementById('reset-success').classList.remove('show');
    document.getElementById('reset-form').style.display = 'block';
    document.getElementById('rst-email').value = '';
    showAuthScreen('screen-login');
  }, 3000);
}

// ============================================================
// REGISTRATION
// ============================================================
function regNext(step) {
  if (step === 2) {
    let v = true;
    if (!document.getElementById('r-orgname').value.trim()) { setError('r-orgname-g'); v = false; } else clearError('r-orgname-g');
    if (!/^\d{10}$/.test(document.getElementById('r-npi').value.trim())) { setError('r-npi-g'); v = false; } else clearError('r-npi-g');
    if (!document.getElementById('r-ein').value.trim()) { setError('r-ein-g'); v = false; } else clearError('r-ein-g');
    if (!document.getElementById('r-addr').value.trim()) { setError('r-addr-g'); v = false; } else clearError('r-addr-g');
    if (!document.getElementById('r-city').value.trim()) { setError('r-city-g'); v = false; } else clearError('r-city-g');
    if (!document.getElementById('r-zip').value.trim()) { setError('r-zip-g'); v = false; } else clearError('r-zip-g');
    if (!document.getElementById('r-phone').value.trim()) { setError('r-phone-g'); v = false; } else clearError('r-phone-g');
    if (!v) return;
  }
  if (step === 3) {
    let v = true;
    if (!document.getElementById('r-fname').value.trim()) { setError('r-fname-g'); v = false; } else clearError('r-fname-g');
    if (!document.getElementById('r-lname').value.trim()) { setError('r-lname-g'); v = false; } else clearError('r-lname-g');
    if (!isValidEmail(document.getElementById('r-cemail').value.trim())) { setError('r-cemail-g'); v = false; } else clearError('r-cemail-g');
    if (!document.getElementById('r-cphone').value.trim()) { setError('r-cphone-g'); v = false; } else clearError('r-cphone-g');
    if (!v) return;
  }
  const next = step + 1;
  document.getElementById('reg-step-' + step).classList.remove('active');
  document.getElementById('reg-step-' + next).classList.add('active');
  document.getElementById('rp-' + step).classList.remove('active');
  document.getElementById('rp-' + step).classList.add('done');
  document.getElementById('rp-' + next).classList.add('active');
  regCurrentStep = next;
}

function regBack(step) {
  const prev = step - 1;
  document.getElementById('reg-step-' + step).classList.remove('active');
  document.getElementById('reg-step-' + prev).classList.add('active');
  document.getElementById('rp-' + step).classList.remove('active');
  document.getElementById('rp-' + prev).classList.remove('done');
  document.getElementById('rp-' + prev).classList.add('active');
  regCurrentStep = prev;
}

async function regSubmit() {
  const pw = document.getElementById('r-pw').value;
  const pwc = document.getElementById('r-pwc').value;
  let v = true;
  if (!isValidPassword(pw)) { setError('r-pw-g'); v = false; } else clearError('r-pw-g');
  if (pw !== pwc) { setError('r-pwc-g'); v = false; } else clearError('r-pwc-g');
  if (!v) return;

  const btn = document.querySelector('#reg-step-4 .btn-green');
  const restore = setButtonLoading(btn, ' Creating account…');

  const acctType = document.querySelector('input[name=acct-type]:checked').value;
  const fname = document.getElementById('r-fname').value.trim();
  const lname = document.getElementById('r-lname').value.trim();
  const email = document.getElementById('r-cemail').value.trim();
  const orgName = document.getElementById('r-orgname').value.trim();
  const npi = document.getElementById('r-npi').value.trim();
  const taxId = document.getElementById('r-ein').value.trim();

  const payload = {
    email,
    password: pw,
    givenName: fname,
    familyName: lname,
    orgName,
    npi,
    taxId,
    accountType: acctType
  };

  try {
    await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });

    // Auto-login after registration
    const tokens = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pw })
    });
    localStorage.setItem('accessToken', tokens.accessToken);
    if (tokens.idToken) localStorage.setItem('idToken', tokens.idToken);
    if (tokens.refreshToken) localStorage.setItem('refreshToken', tokens.refreshToken);

    const user = await apiFetch('/api/users/me');
    currentUser = normalizeUser(user);
  } catch (err) {
    if (err.isNetworkError || (err.status && err.status >= 500)) {
      // Demo fallback
      currentUser = { name: fname + ' ' + lname, firstName: fname, givenName: fname, familyName: lname, role: 'Provider', accountType: acctType, email };
    } else {
      restore();
      return;
    }
  } finally {
    restore();
  }

  showToast('Account created successfully!', 'success');
  resetRegForm();
  setTimeout(() => showApp(currentUser), 500);
}

function resetRegForm() {
  document.querySelectorAll('.reg-step').forEach(s => s.classList.remove('active'));
  document.getElementById('reg-step-1').classList.add('active');
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('rp-' + i);
    el.classList.remove('active', 'done');
  }
  document.getElementById('rp-1').classList.add('active');
  regCurrentStep = 1;
}

// ============================================================
// HELPERS
// ============================================================
function normalizeUser(apiUser) {
  return {
    name: (apiUser.givenName || '') + ' ' + (apiUser.familyName || ''),
    firstName: apiUser.givenName || '',
    givenName: apiUser.givenName || '',
    familyName: apiUser.familyName || '',
    role: apiUser.accountType || 'Provider',
    accountType: apiUser.accountType || 'provider',
    email: apiUser.email || '',
    orgName: apiUser.orgName || '',
    npi: apiUser.npi || '',
    taxId: apiUser.taxId || '',
    address: apiUser.address || '',
    city: apiUser.city || '',
    state: apiUser.state || '',
    zip: apiUser.zip || '',
    phone: apiUser.phone || '',
    contactPhone: apiUser.contactPhone || '',
    title: apiUser.title || '',
    notifications: apiUser.notifications || { edi270: true, payments: true, reports: true, errors: false }
  };
}

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const el = document.getElementById('py-date');
  if (el) el.value = today;
  const rFrom = document.getElementById('rpt-from');
  const rTo = document.getElementById('rpt-to');
  if (rFrom) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    rFrom.value = d.toISOString().split('T')[0];
  }
  if (rTo) rTo.value = today;
  const dos = document.getElementById('e-dos');
  if (dos) dos.value = today;
}
