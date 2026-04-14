// reports.js — report generation and download

async function generateReport(reportType) {
  const dateFrom = document.getElementById('report-date-from')?.value || '';
  const dateTo   = document.getElementById('report-date-to')?.value || '';
  const btn = document.getElementById('report-btn-' + reportType.replace('_','-').toLowerCase());
  const restore = setButtonLoading(btn, 'Generating...');

  try {
    let data;
    try {
      data = await apiFetch('/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ reportType, dateFrom, dateTo }),
      });
    } catch (err) {
      if (err.isNetworkError) {
        // Demo mode — generate CSV locally
        generateDemoCSV(reportType, dateFrom, dateTo);
        showToast('Demo report downloaded', 'success');
        return;
      }
      throw err;
    }

    showToast(`Report generated — ${data.report.filename}`, 'success');
    loadReports();

    // Auto-download via signed URL
    if (data.report.reportId) {
      setTimeout(() => downloadReport(data.report.reportId, data.report.filename), 500);
    }
  } catch (err) {
    showToast(err.message || 'Report generation failed', 'error');
  } finally {
    restore();
  }
}

async function downloadReport(reportId, filename) {
  try {
    let data;
    try {
      data = await apiFetch(`/api/reports/${reportId}/download`);
    } catch (err) {
      if (err.isNetworkError) {
        showToast('Demo mode — download unavailable offline', 'warning');
        return;
      }
      throw err;
    }
    if (data.url) {
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.filename || filename || 'report.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

async function loadReports() {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Loading...</td></tr>';

  try {
    let data;
    try {
      data = await apiFetch('/api/reports');
    } catch (err) {
      if (err.isNetworkError) {
        data = { reports: getDemoReports() };
      } else {
        throw err;
      }
    }

    if (!data.reports || data.reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No reports generated yet</td></tr>';
      return;
    }

    tbody.innerHTML = data.reports.map((r) => `
      <tr>
        <td><code style="font-size:11px">${r.referenceId || r.reportId}</code></td>
        <td>${formatReportType(r.reportType)}</td>
        <td>${r.dateFrom || 'All dates'} → ${r.dateTo || 'present'}</td>
        <td>${r.rowCount || 0} rows</td>
        <td>${statusBadge(r.status === 'READY' ? 'Complete' : 'Pending')}</td>
        <td>
          ${r.status === 'READY'
            ? `<button class="btn btn-secondary btn-sm" onclick="downloadReport('${r.reportId}','${r.filename}')">↓ Download</button>`
            : '<span style="color:var(--muted);font-size:12px">Processing...</span>'
          }
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">${err.message}</td></tr>`;
  }
}

function formatReportType(type) {
  const map = { '270': 'EDI 270 Inquiry', '271': 'EDI 271 Response', PAYMENT_SUMMARY: 'Payment Summary', TRANSACTION_SUMMARY: 'Transaction Summary' };
  return map[type] || type;
}

// ── Demo CSV generator ────────────────────────────────────────────────────

function generateDemoCSV(reportType, dateFrom, dateTo) {
  let csv, filename;

  if (reportType === '270') {
    csv = [
      'Reference ID,Status,Payer Name,Payer ID,Member ID,Member Last Name,Member First Name,Date of Birth,Service Type Code,Submitted At',
      `CPE-20260413-AB1CD2,RESPONSE_RECEIVED,Blue Cross Blue Shield,00001,XYZ123456,DOE,JANE,19850615,30,${new Date(Date.now()-86400000).toISOString()}`,
      `CPE-20260412-EF3GH4,SENT,UnitedHealthcare,87726,UHC98765432,SMITH,JOHN,19721201,30,${new Date(Date.now()-172800000).toISOString()}`,
      `CPE-20260411-IJ5KL6,PENDING,Aetna,60054,AET44332211,JOHNSON,MARY,19901105,UC,${new Date(Date.now()-259200000).toISOString()}`,
    ].join('\n');
    filename = `clearpath-270-${new Date().toISOString().slice(0,10)}.csv`;
  } else if (reportType === '271') {
    csv = [
      'Reference ID,Payer Name,Member ID,Member Name,Coverage Status,Plan Name,Deductible (Ind),Deductible Met,OOP Max,Response Received At',
      `CPE-20260413-AB1CD2,Blue Cross Blue Shield,XYZ123456,"DOE, JANE",Active,BCBS PPO Gold,$500.00,$320.00,$3500.00,${new Date().toISOString()}`,
    ].join('\n');
    filename = `clearpath-271-${new Date().toISOString().slice(0,10)}.csv`;
  } else {
    csv = [
      'Payment ID,Reference ID,Type,Amount,Status,Description,Date',
      `pay-001,CPE-20260413-PAY001,ACH,$1250.00,COMPLETED,Monthly EDI fees,${new Date(Date.now()-172800000).toISOString()}`,
      `pay-002,CPE-20260411-PAY002,ACH,$875.50,PENDING,Processing fees Q1,${new Date(Date.now()-345600000).toISOString()}`,
    ].join('\n');
    filename = `clearpath-payments-${new Date().toISOString().slice(0,10)}.csv`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Demo data ─────────────────────────────────────────────────────────────

function getDemoReports() {
  const d = (daysAgo) => new Date(Date.now() - 86400000 * daysAgo).toISOString();
  return [
    { reportId: '1', referenceId: 'CPE-20260414-RPT001', reportType: '270',              filename: 'clearpath-270-2026-04-14.csv',         dateFrom: '2026-04-01', dateTo: '2026-04-14', rowCount: 1284, status: 'READY',   createdAt: d(0) },
    { reportId: '2', referenceId: 'CPE-20260414-RPT002', reportType: 'PAYMENT_SUMMARY',   filename: 'clearpath-payments-q1-2026.csv',        dateFrom: '2026-01-01', dateTo: '2026-03-31', rowCount: 42,   status: 'READY',   createdAt: d(1) },
    { reportId: '3', referenceId: 'CPE-20260413-RPT003', reportType: 'TRANSACTION_SUMMARY',filename: 'clearpath-transactions-apr-2026.csv',  dateFrom: '2026-04-01', dateTo: '2026-04-13', rowCount: 847,  status: 'READY',   createdAt: d(2) },
    { reportId: '4', referenceId: 'CPE-20260401-RPT004', reportType: '271',              filename: 'clearpath-271-responses-mar-2026.csv',  dateFrom: '2026-03-01', dateTo: '2026-03-31', rowCount: 1102, status: 'READY',   createdAt: d(14) },
    { reportId: '5', referenceId: 'CPE-20260331-RPT005', reportType: 'PAYMENT_SUMMARY',   filename: 'clearpath-payments-q4-2025.csv',        dateFrom: '2025-10-01', dateTo: '2025-12-31', rowCount: 38,   status: 'READY',   createdAt: d(15) },
    { reportId: '6', referenceId: 'CPE-20260414-RPT006', reportType: 'TRANSACTION_SUMMARY',filename: 'clearpath-claims-837p-apr-2026.csv',   dateFrom: '2026-04-01', dateTo: '2026-04-14', rowCount: 0,    status: 'PENDING', createdAt: d(0) },
  ];
}

// ── Init ─────────────────────────────────────────────────────────────────

function initReports() {
  loadReports();
  // Set default date range (last 30 days)
  const to   = document.getElementById('report-date-to');
  const from = document.getElementById('report-date-from');
  if (to)   to.value   = new Date().toISOString().slice(0, 10);
  if (from) from.value = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
}
