// edi.js — EDI API Setup enrollment form + workflow

const EDI_STEPS = 5;
let currentEdiStep = 1;
const setupFormData = {};

// ── Stepper ───────────────────────────────────────────────────────────────

function updateEdiStepper() {
  for (let i = 1; i <= EDI_STEPS; i++) {
    const step  = document.getElementById('edi-step-' + i);
    const panel = document.getElementById('edi-panel-' + i);
    if (!step || !panel) continue;
    const num = step.querySelector('.step-num') || step.querySelector('.step-circle');
    const lbl = step.querySelector('.step-label') || step.querySelector('.step-name');
    step.classList.remove('active', 'done');
    panel.classList.remove('active');
    if (i < currentEdiStep) {
      step.classList.add('done');
      if (num) num.textContent = '✓';
    } else if (i === currentEdiStep) {
      step.classList.add('active');
      if (num) num.textContent = String(i);
      panel.classList.add('active');
    } else {
      if (num) num.textContent = String(i);
    }
  }
}

function ediNext() {
  if (!validateEdiStep(currentEdiStep)) return;
  collectEdiStep(currentEdiStep);
  if (currentEdiStep < EDI_STEPS) {
    currentEdiStep++;
    updateEdiStepper();
    if (currentEdiStep === 5) buildSetupPreview();
  }
}

function ediBack() {
  if (currentEdiStep > 1) {
    currentEdiStep--;
    updateEdiStepper();
  }
}

// ── Validation ────────────────────────────────────────────────────────────

function validateEdiStep(step) {
  let valid = true;

  const requiredIds = {
    1: ['setup-vendor-name', 'setup-contact-name', 'setup-contact-email'],
    2: ['setup-payer-name', 'setup-payer-id'],
    3: ['setup-tech-contact-name', 'setup-tech-contact-email'],
    4: ['setup-auth-name'],
    5: [],
  }[step] || [];

  requiredIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const fg = el.closest('.form-group');
    if (!el.value.trim()) {
      if (fg) fg.classList.add('error');
      valid = false;
    } else {
      if (fg) fg.classList.remove('error');
    }
  });

  // Step 2: at least one transaction type must be checked
  if (step === 2) {
    const txCheckboxes = ['setup-tx-270','setup-tx-837p','setup-tx-837i','setup-tx-837d','setup-tx-835','setup-tx-277','setup-tx-275'];
    const anyChecked = txCheckboxes.some((id) => document.getElementById(id)?.checked);
    if (!anyChecked) {
      showToast('Select at least one transaction type', 'error');
      valid = false;
    }
  }

  // Step 4: authorization checkbox must be checked
  if (step === 4) {
    const agree = document.getElementById('setup-auth-agree');
    if (agree && !agree.checked) {
      showToast('Authorization signature is required', 'error');
      valid = false;
    }
  }

  if (!valid && step !== 2 && step !== 4) showToast('Please fill in all required fields', 'error');
  return valid;
}

// ── Data collection ───────────────────────────────────────────────────────

function collectEdiStep(step) {
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const chk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

  if (step === 1) {
    setupFormData.vendorName       = val('setup-vendor-name');
    setupFormData.vendorType       = val('setup-vendor-type');
    setupFormData.contactName      = val('setup-contact-name');
    setupFormData.contactEmail     = val('setup-contact-email');
    setupFormData.contactPhone     = val('setup-contact-phone');
    setupFormData.vendorNpi        = val('setup-vendor-npi');
    setupFormData.vendorTaxId      = val('setup-vendor-tax-id');
  } else if (step === 2) {
    setupFormData.payerName        = val('setup-payer-name');
    setupFormData.payerId          = val('setup-payer-id');
    setupFormData.payerType        = val('setup-payer-type');
    setupFormData.environment      = val('setup-environment');
    setupFormData.transactionTypes = [
      chk('setup-tx-270')  && '270/271',
      chk('setup-tx-837p') && '837P',
      chk('setup-tx-837i') && '837I',
      chk('setup-tx-837d') && '837D',
      chk('setup-tx-835')  && '835',
      chk('setup-tx-277')  && '276/277',
      chk('setup-tx-275')  && '275',
    ].filter(Boolean);
  } else if (step === 3) {
    setupFormData.clearinghouse     = val('setup-clearinghouse');
    setupFormData.submitterId       = val('setup-submitter-id');
    setupFormData.isaSenderId       = val('setup-isa-sender');
    setupFormData.techContactName   = val('setup-tech-contact-name');
    setupFormData.techContactEmail  = val('setup-tech-contact-email');
    setupFormData.techPhone         = val('setup-tech-phone');
    setupFormData.goLiveDate        = val('setup-go-live-date');
  } else if (step === 4) {
    setupFormData.authName         = val('setup-auth-name');
    setupFormData.authTitle        = val('setup-auth-title');
    setupFormData.authDate         = val('setup-auth-date');
    setupFormData.notes            = val('setup-notes');
  }
}

// ── Review preview ────────────────────────────────────────────────────────

function buildSetupPreview() {
  collectEdiStep(4);
  const el = document.getElementById('setup-preview-block');
  if (!el) return;
  const f = setupFormData;

  const row = (label, value) => value
    ? `<tr><td style="color:var(--muted);font-size:12px;padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top">${label}</td><td style="font-size:12px;padding:6px 0;font-weight:500">${value}</td></tr>`
    : '';

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        <tr><td colspan="2" style="padding:8px 0 4px;font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px">Third Party</td></tr>
        ${row('Company', f.vendorName)}
        ${row('Type', f.vendorType)}
        ${row('Contact', f.contactName + (f.contactEmail ? ' &lt;' + f.contactEmail + '&gt;' : ''))}
        ${row('Phone', f.contactPhone)}
        ${f.vendorNpi ? row('NPI', f.vendorNpi) : ''}
        ${f.vendorTaxId ? row('Tax ID', f.vendorTaxId) : ''}
        <tr><td colspan="2" style="padding:12px 0 4px;font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px">Payer</td></tr>
        ${row('Payer', f.payerName + ' (' + f.payerId + ')')}
        ${row('Type', f.payerType)}
        ${row('Environment', f.environment)}
        ${row('Transactions', (f.transactionTypes || []).join(', '))}
        <tr><td colspan="2" style="padding:12px 0 4px;font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px">Technical</td></tr>
        ${row('Clearinghouse', f.clearinghouse)}
        ${f.submitterId ? row('Submitter ID', f.submitterId) : ''}
        ${f.isaSenderId ? row('ISA Sender ID', f.isaSenderId) : ''}
        ${row('Tech Contact', f.techContactName + (f.techContactEmail ? ' &lt;' + f.techContactEmail + '&gt;' : ''))}
        ${f.goLiveDate ? row('Go-Live', f.goLiveDate) : ''}
        <tr><td colspan="2" style="padding:12px 0 4px;font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px">Authorization</td></tr>
        ${row('Signatory', f.authName + (f.authTitle ? ', ' + f.authTitle : ''))}
        ${row('Date', f.authDate)}
        ${f.notes ? row('Notes', f.notes) : ''}
      </tbody>
    </table>`;
}

// ── Submit ────────────────────────────────────────────────────────────────

async function submitEdiSetup() {
  collectEdiStep(5);
  const btn = document.getElementById('edi-submit-btn');
  const restore = setButtonLoading(btn, 'Submitting...');

  try {
    let data;
    try {
      data = await apiFetch('/api/edi/setup', {
        method: 'POST',
        body: JSON.stringify(setupFormData),
      });
    } catch (err) {
      if (err.isNetworkError) {
        // Demo mode
        data = {
          referenceId: generateRef(),
          status: 'PENDING_ADMIN_REVIEW',
          message: 'Demo mode — EDI setup request submitted. Your EDI Administrator will receive an email to review.',
        };
      } else {
        throw err;
      }
    }

    // Show success
    const modal = document.getElementById('edi-success-modal');
    const refEl  = document.getElementById('edi-ref-id');
    if (refEl) refEl.textContent = data.referenceId;
    if (modal) {
      // Update modal message to reflect setup workflow
      const msgEl = modal.querySelector('.modal-body p, .modal-message, p');
      if (msgEl) msgEl.textContent = 'Your EDI setup request has been submitted. Your EDI Administrator has been notified by email to review and route this to the payer\'s enrollment team.';
      modal.style.display = 'flex';
    } else {
      showToast('EDI setup request submitted — Ref: ' + data.referenceId, 'success');
    }

    // Reset form
    currentEdiStep = 1;
    Object.keys(setupFormData).forEach((k) => delete setupFormData[k]);
    document.querySelectorAll('#section-edi input, #section-edi select, #section-edi textarea')
      .forEach((el) => {
        if (el.type === 'checkbox') { el.checked = false; }
        else { el.value = el.tagName === 'SELECT' ? (el.options[0]?.value || '') : ''; }
      });
    // Re-default auth date to today
    const authDate = document.getElementById('setup-auth-date');
    if (authDate) authDate.value = new Date().toISOString().slice(0, 10);
    updateEdiStepper();
    loadSetupRequests();
  } catch (err) {
    showToast(err.message || 'Submission failed', 'error');
  } finally {
    restore();
  }
}

// ── Setup requests list ───────────────────────────────────────────────────

async function loadSetupRequests() {
  const tbody = document.getElementById('setup-requests-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Loading...</td></tr>';

  try {
    let data;
    try {
      data = await apiFetch('/api/edi/setup');
    } catch (err) {
      if (err.isNetworkError) {
        data = { requests: getDemoSetupRequests() };
      } else {
        throw err;
      }
    }

    const requests = data.requests || [];
    if (!requests.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">No setup requests yet</td></tr>';
      return;
    }

    tbody.innerHTML = requests.map((r) => `
      <tr>
        <td><code style="font-size:11px">${r.referenceId || r.requestId}</code></td>
        <td>${r.vendorName || '—'}</td>
        <td>${r.payerName || '—'} <span style="color:var(--muted);font-size:11px">(${r.payerId || ''})</span></td>
        <td style="font-size:11px">${(r.transactionTypes || []).join(', ') || '—'}</td>
        <td>${setupStatusBadge(r.status)}</td>
        <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
        <td>
          ${r.status === 'PENDING_ADMIN_REVIEW'
            ? '<span style="color:var(--muted);font-size:11px">Awaiting admin</span>'
            : r.status === 'ADMIN_APPROVED'
              ? '<span style="color:var(--muted);font-size:11px">Sent to payer</span>'
              : '—'
          }
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red)">${err.message}</td></tr>`;
  }
}

function setupStatusBadge(status) {
  const map = {
    'PENDING_ADMIN_REVIEW': '<span class="badge badge-amber">Pending Review</span>',
    'ADMIN_APPROVED':       '<span class="badge badge-green">Approved</span>',
    'SENT_TO_PAYER':        '<span class="badge badge-blue">Sent to Payer</span>',
    'PAYER_PROCESSING':     '<span class="badge badge-blue">Payer Processing</span>',
    'COMPLETE':             '<span class="badge badge-green">Complete</span>',
    'REJECTED':             '<span class="badge badge-red">Rejected</span>',
  };
  return map[status] || statusBadge(status);
}

// ── Demo data ─────────────────────────────────────────────────────────────

function getDemoSetupRequests() {
  const d = (daysAgo) => new Date(Date.now() - 86400000 * daysAgo).toISOString();
  return [
    { requestId: '1', referenceId: 'CPE-20260414-SET001', vendorName: 'Valley Health Billing Solutions', payerName: 'Blue Cross Blue Shield', payerId: '00001', transactionTypes: ['270/271', '837P', '835', '277CA'], status: 'PENDING_ADMIN_REVIEW', createdAt: d(1) },
    { requestId: '2', referenceId: 'CPE-20260412-SET002', vendorName: 'MedBill Pro LLC', payerName: 'Aetna / CVS Health', payerId: '60054', transactionTypes: ['837P', '837I', '835', '276/277'], status: 'SENT_TO_PAYER', createdAt: d(3) },
    { requestId: '3', referenceId: 'CPE-20260410-SET003', vendorName: 'NextGen Health Systems', payerName: 'UnitedHealthcare / Optum', payerId: '87726', transactionTypes: ['270/271', '837P', '837I', '837D', '835', '276/277', '275'], status: 'COMPLETE', createdAt: d(5) },
    { requestId: '4', referenceId: 'CPE-20260409-SET004', vendorName: 'Pacific Dental Partners', payerName: 'Delta Dental', payerId: 'DDCA0', transactionTypes: ['837D', '270/271', '835'], status: 'ADMIN_APPROVED', createdAt: d(6) },
    { requestId: '5', referenceId: 'CPE-20260407-SET005', vendorName: 'Riverside Medical Group', payerName: 'Medicare (CMS)', payerId: '00995', transactionTypes: ['270/271', '837I', '835', '276/277'], status: 'PAYER_PROCESSING', createdAt: d(8) },
    { requestId: '6', referenceId: 'CPE-20260403-SET006', vendorName: 'Summit Orthopaedics LLC', payerName: 'Cigna / Evernorth', payerId: '62308', transactionTypes: ['270/271', '837P', '835'], status: 'COMPLETE', createdAt: d(12) },
  ];
}

// ── Init ──────────────────────────────────────────────────────────────────

function initEdi() {
  updateEdiStepper();
  loadSetupRequests();
  // Default auth date to today
  const authDate = document.getElementById('setup-auth-date');
  if (authDate) authDate.value = new Date().toISOString().slice(0, 10);
}
