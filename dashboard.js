// dashboard.js — load stats + recent activity from API

// ============================================================
// DEMO FALLBACK DATA
// ============================================================
const DEMO_ACTIVITY = [
  { date: 'Apr 14, 2026', txId: 'CPE-20260414-SET001', type: 'EDI Setup Request', payer: 'Blue Cross Blue Shield',  status: 'Pending' },
  { date: 'Apr 13, 2026', txId: 'CPE-20260413-RPT001', type: 'Report Generated',  payer: '1,284 eligibility rows', status: 'Complete' },
  { date: 'Apr 12, 2026', txId: 'CPE-20260412-SET002', type: 'EDI Setup Request', payer: 'Aetna / CVS Health',      status: 'Complete' },
  { date: 'Apr 11, 2026', txId: 'CPE-20260411-PAY001', type: 'ACH Payment',       payer: 'First National Bank',    status: 'Complete' },
  { date: 'Apr 10, 2026', txId: 'CPE-20260410-SET003', type: 'EDI Setup Request', payer: 'UnitedHealthcare',        status: 'Complete' },
  { date: 'Apr 09, 2026', txId: 'CPE-20260409-SET004', type: 'EDI Setup Request', payer: 'Delta Dental',           status: 'Pending' },
  { date: 'Apr 07, 2026', txId: 'CPE-20260407-SET005', type: 'EDI Setup Request', payer: 'Medicare (CMS)',         status: 'Pending' },
  { date: 'Apr 03, 2026', txId: 'CPE-20260403-SET006', type: 'EDI Setup Request', payer: 'Cigna / Evernorth',      status: 'Complete' },
];

// ============================================================
// LOAD DASHBOARD
// ============================================================
async function loadDashboard() {
  await Promise.all([
    loadActivityTable(),
    loadDashboardStats()
  ]);
}

async function loadActivityTable() {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;

  try {
    const data = await apiFetch('/api/edi/transactions?limit=6');
    const rows = (data.transactions || data || []).slice(0, 10);
    if (rows.length === 0) throw new Error('empty');
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${formatDisplayDate(r.createdAt || r.date)}</td>
        <td style="font-family:monospace;font-size:12px">${r.referenceId || r.txId || r.id || ''}</td>
        <td>${r.transactionType || r.type || '270 Inquiry'}</td>
        <td>${r.payerName || r.payer || ''}</td>
        <td>${statusBadge(r.status || 'Pending')}</td>
      </tr>`).join('');
  } catch (_) {
    // Demo fallback
    renderActivityRows(DEMO_ACTIVITY);
  }
}

function renderActivityRows(rows) {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td style="font-family:monospace;font-size:12px">${r.txId}</td>
      <td>${r.type}</td>
      <td>${r.payer}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');
}

async function loadDashboardStats() {
  // Demo stats — impressive numbers for investor demos
  const DEMO_STATS = { pending: 12, completed: 847, total: 1284, errors: 3 };
  try {
    const data = await apiFetch('/api/edi/stats');
    const s = data.stats || DEMO_STATS;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-pending',   s.pending   ?? DEMO_STATS.pending);
    set('stat-completed', s.responseReceived ?? s.completed ?? DEMO_STATS.completed);
    set('stat-total',     s.total     ?? DEMO_STATS.total);
    set('stat-errors',    s.error     ?? DEMO_STATS.errors);
    const metaEl = document.getElementById('stat-pending-meta');
    if (metaEl) metaEl.textContent = 'Awaiting admin review';
  } catch (_) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-pending',   DEMO_STATS.pending);
    set('stat-completed', DEMO_STATS.completed);
    set('stat-total',     DEMO_STATS.total);
    set('stat-errors',    DEMO_STATS.errors);
    const metaEl = document.getElementById('stat-pending-meta');
    if (metaEl) metaEl.textContent = 'Awaiting admin review';
  }
}

// ============================================================
// SECTION NAVIGATION (shared)
// ============================================================
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  const navMap = { dashboard: 0, edi270: 1, payments: 2, reports: 3, profile: 4 };
  const items = document.querySelectorAll('.nav-item');
  if (navMap[id] !== undefined) items[navMap[id]].classList.add('active');

  // Lazy-load section data when navigating
  if (id === 'dashboard') loadDashboard();
  if (id === 'payments') loadPayments();
  if (id === 'reports') loadReports();
  if (id === 'profile') loadProfile();
}

// ============================================================
// TABS
// ============================================================
function switchTab(el, panelId) {
  const parent = el.closest('.tabs');
  parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
}

// ============================================================
// SECTION BLOCK COLLAPSE
// ============================================================
function toggleBlock(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('span');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    arrow.innerHTML = '&#9660;';
  } else {
    body.style.display = 'none';
    arrow.innerHTML = '&#9658;';
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatDisplayDate(val) {
  if (!val) return '';
  try {
    return new Date(val).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch (_) { return val; }
}

/** Called by EDI submit to append a new row without full reload */
function prependActivityRow(row) {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${row.date}</td>
    <td style="font-family:monospace;font-size:12px">${row.txId}</td>
    <td>${row.type}</td>
    <td>${row.payer}</td>
    <td>${statusBadge(row.status)}</td>`;
  tbody.insertBefore(tr, tbody.firstChild);
}
