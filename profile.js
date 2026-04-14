// profile.js — load and save user profile

async function loadProfile() {
  try {
    let data;
    try {
      data = await apiFetch('/api/users/me');
    } catch (err) {
      if (err.isNetworkError) {
        data = { user: getDemoProfile() };
      } else {
        throw err;
      }
    }

    const u = data.user;
    setValue('profile-first',   u.givenName || '');
    setValue('profile-last',    u.familyName || '');
    setValue('profile-email',   u.email || '');
    setValue('profile-org',     u.orgName || '');
    setValue('profile-npi',     u.npi || '');
    setValue('profile-tax-id',  u.taxId || '');
    setValue('profile-phone',   u.phone || '');
    setValue('profile-type',    u.accountType || 'PROVIDER');
    setChecked('notif-email',   u.notificationsEmail !== false);
    setChecked('notif-sms',     u.notificationsSms === true);
  } catch (err) {
    showToast('Failed to load profile: ' + err.message, 'error');
  }
}

async function saveProfile() {
  const btn = document.getElementById('profile-save-btn');
  const restore = setButtonLoading(btn, 'Saving...');

  const npi = getValue('profile-npi');
  if (npi && npi.replace(/\D/g, '').length !== 10) {
    document.getElementById('profile-npi')?.closest('.form-group')?.classList.add('error');
    showToast('NPI must be 10 digits', 'error');
    restore();
    return;
  }

  const updates = {
    givenName: getValue('profile-first'),
    familyName: getValue('profile-last'),
    orgName: getValue('profile-org'),
    npi: npi,
    taxId: getValue('profile-tax-id'),
    phone: getValue('profile-phone'),
    accountType: getValue('profile-type'),
    notificationsEmail: isChecked('notif-email'),
    notificationsSms: isChecked('notif-sms'),
    profileComplete: true,
  };

  try {
    try {
      await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    } catch (err) {
      if (!err.isNetworkError) throw err;
      // Demo mode — save to localStorage
      localStorage.setItem('demoProfile', JSON.stringify(updates));
    }
    showToast('Profile saved successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save profile', 'error');
  } finally {
    restore();
  }
}

async function changePassword() {
  const current  = getValue('pwd-current');
  const newPwd   = getValue('pwd-new');
  const confirm  = getValue('pwd-confirm');
  const btn      = document.getElementById('pwd-change-btn');

  if (!current || !newPwd || !confirm) {
    showToast('All password fields are required', 'error');
    return;
  }
  if (!isValidPassword(newPwd)) {
    showToast('New password must be 8+ chars with an uppercase letter and number', 'error');
    return;
  }
  if (newPwd !== confirm) {
    document.getElementById('pwd-confirm')?.closest('.form-group')?.classList.add('error');
    showToast('Passwords do not match', 'error');
    return;
  }

  const restore = setButtonLoading(btn, 'Updating...');
  try {
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ previousPassword: current, proposedPassword: newPwd }),
      });
    } catch (err) {
      if (!err.isNetworkError) throw err;
    }
    showToast('Password changed successfully', 'success');
    setValue('pwd-current', '');
    setValue('pwd-new', '');
    setValue('pwd-confirm', '');
  } catch (err) {
    showToast(err.message || 'Password change failed', 'error');
  } finally {
    restore();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
function isChecked(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}
function setChecked(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = checked;
}

function getDemoProfile() {
  const stored = localStorage.getItem('demoProfile');
  if (stored) {
    try { return JSON.parse(stored); } catch (_) {}
  }
  return {
    givenName: 'Sarah',
    familyName: 'Chen',
    email: 'sarah.chen@valleyhealthgroup.com',
    orgName: 'Valley Health Medical Group',
    npi: '1245319599',
    taxId: '45-6789123',
    phone: '(415) 555-0182',
    accountType: 'PROVIDER',
    notificationsEmail: true,
    notificationsSms: true,
  };
}

// ── Init ─────────────────────────────────────────────────────────────────

function initProfile() {
  loadProfile();
}
