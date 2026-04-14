// payments.js — payment submission and bank account management

// ── Payment submission ────────────────────────────────────────────────────

async function submitPayment() {
  const amountEl  = document.getElementById('pay-amount');
  const typeEl    = document.getElementById('pay-type');
  const accountEl = document.getElementById('pay-account');
  const descEl    = document.getElementById('pay-description');
  const btn       = document.getElementById('pay-submit-btn');

  // Validate
  let valid = true;
  [amountEl, typeEl, accountEl].forEach((el) => {
    const fg = el?.closest('.form-group');
    if (!el || !el.value.trim()) { fg?.classList.add('error'); valid = false; }
    else fg?.classList.remove('error');
  });

  if (!valid) { showToast('Please fill in all required fields', 'error'); return; }

  const rawAmount = amountEl.value.replace(/[^0-9.]/g, '');
  if (!rawAmount || isNaN(parseFloat(rawAmount)) || parseFloat(rawAmount) <= 0) {
    amountEl.closest('.form-group')?.classList.add('error');
    showToast('Please enter a valid payment amount', 'error');
    return;
  }

  const restore = setButtonLoading(btn, 'Processing...');
  try {
    let data;
    try {
      data = await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(rawAmount),
          paymentType: typeEl.value,
          accountId: accountEl.value,
          description: descEl?.value?.trim() || '',
        }),
      });
    } catch (err) {
      if (err.isNetworkError) {
        data = {
          payment: {
            referenceId: generateRef(),
            amount: parseFloat(rawAmount),
            paymentType: typeEl.value,
            status: 'PENDING',
          },
        };
      } else {
        throw err;
      }
    }

    showToast(`Payment of $${parseFloat(rawAmount).toFixed(2)} submitted — Ref: ${data.payment.referenceId}`, 'success');
    amountEl.value = '';
    if (descEl) descEl.value = '';
    loadPayments();
  } catch (err) {
    showToast(err.message || 'Payment failed', 'error');
  } finally {
    restore();
  }
}

// ── Payment list ─────────────────────────────────────────────────────────

async function loadPayments() {
  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Loading...</td></tr>';

  try {
    let data;
    try {
      data = await apiFetch('/api/payments');
    } catch (err) {
      if (err.isNetworkError) {
        data = { payments: getDemoPayments() };
      } else {
        throw err;
      }
    }

    if (!data.payments || data.payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No payments yet</td></tr>';
      return;
    }

    tbody.innerHTML = data.payments.map((p) => `
      <tr>
        <td><code style="font-size:11px">${p.referenceId || p.paymentId || '—'}</code></td>
        <td>$${parseFloat(p.amount || 0).toFixed(2)}</td>
        <td>${p.paymentType || '—'}</td>
        <td>${p.description || '—'}</td>
        <td>${statusBadge(p.status === 'COMPLETED' ? 'Complete' : p.status === 'FAILED' ? 'Rejected' : 'Pending')}</td>
        <td>${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red)">${err.message}</td></tr>`;
  }
}

// ── Bank account management ───────────────────────────────────────────────

async function addBankAccount() {
  const routing = document.getElementById('bank-routing');
  const account = document.getElementById('bank-account');
  const type    = document.getElementById('bank-type');
  const name    = document.getElementById('bank-name');
  const holder  = document.getElementById('bank-holder');
  const btn     = document.getElementById('bank-add-btn');

  // Validate routing number (9 digits)
  let valid = true;
  if (!routing || !/^\d{9}$/.test(routing.value.trim())) {
    routing?.closest('.form-group')?.classList.add('error');
    showToast('Routing number must be 9 digits', 'error');
    valid = false;
  } else {
    routing?.closest('.form-group')?.classList.remove('error');
  }
  if (!account || !account.value.trim()) {
    account?.closest('.form-group')?.classList.add('error');
    valid = false;
  } else {
    account?.closest('.form-group')?.classList.remove('error');
  }
  if (!name || !name.value.trim()) {
    name?.closest('.form-group')?.classList.add('error');
    valid = false;
  } else {
    name?.closest('.form-group')?.classList.remove('error');
  }
  if (!valid) { showToast('Please fill in all required fields correctly', 'error'); return; }

  const restore = setButtonLoading(btn, 'Saving...');
  try {
    let data;
    try {
      data = await apiFetch('/api/payments/bank-accounts', {
        method: 'POST',
        body: JSON.stringify({
          routingNumber: routing.value.trim(),
          accountNumber: account.value.trim(),
          accountType: type.value,
          bankName: name.value.trim(),
          accountHolder: holder?.value?.trim() || '',
        }),
      });
    } catch (err) {
      if (err.isNetworkError) {
        data = {
          account: {
            accountId: 'demo-' + randStr(8),
            bankName: name.value.trim(),
            accountType: type.value,
            accountNumberMasked: '****' + account.value.slice(-4),
            routingNumber: routing.value.trim(),
            status: 'ACTIVE',
          },
        };
      } else {
        throw err;
      }
    }

    showToast('Bank account added successfully', 'success');
    routing.value = ''; account.value = ''; name.value = '';
    if (holder) holder.value = '';
    loadBankAccounts();
  } catch (err) {
    showToast(err.message || 'Failed to add account', 'error');
  } finally {
    restore();
  }
}

async function loadBankAccounts() {
  const container = document.getElementById('bank-accounts-list');
  const accountSel = document.getElementById('pay-account');
  if (!container) return;

  try {
    let data;
    try {
      data = await apiFetch('/api/payments/bank-accounts');
    } catch (err) {
      if (err.isNetworkError) {
        data = { accounts: getDemoBankAccounts() };
      } else {
        throw err;
      }
    }

    const accounts = data.accounts || [];

    if (accountSel) {
      accountSel.innerHTML = accounts.length
        ? accounts.map((a) => `<option value="${a.accountId}">${a.bankName} — ${a.accountNumberMasked} (${a.accountType})</option>`).join('')
        : '<option value="">No accounts on file</option>';
    }

    container.innerHTML = accounts.length === 0
      ? '<p style="color:var(--muted);font-size:13px">No bank accounts on file.</p>'
      : accounts.map((a) => `
          <div class="bank-account-card" style="border:1.5px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600;font-size:14px">${a.bankName}</div>
              <div style="color:var(--muted);font-size:12px">${a.accountType} — ${a.accountNumberMasked} &nbsp;|&nbsp; Routing: ${a.routingNumber}</div>
              <div style="margin-top:4px">${statusBadge(a.status === 'ACTIVE' ? 'Active' : 'Inactive')}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeBankAccount('${a.accountId}')">Remove</button>
          </div>`).join('');
  } catch (err) {
    if (container) container.innerHTML = `<p style="color:var(--red)">${err.message}</p>`;
  }
}

async function removeBankAccount(accountId) {
  if (!confirm('Remove this bank account?')) return;
  try {
    try {
      await apiFetch(`/api/payments/bank-accounts/${accountId}`, { method: 'DELETE' });
    } catch (err) {
      if (!err.isNetworkError) throw err;
    }
    showToast('Bank account removed', 'success');
    loadBankAccounts();
  } catch (err) {
    showToast(err.message || 'Failed to remove account', 'error');
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────

function getDemoPayments() {
  const d = (daysAgo) => new Date(Date.now() - 86400000 * daysAgo).toISOString();
  return [
    { paymentId: '1', referenceId: 'CPE-20260414-PAY001', amount: 12450.00, paymentType: 'ACH', description: 'Monthly EDI transaction processing — April 2026', status: 'COMPLETED', createdAt: d(1) },
    { paymentId: '2', referenceId: 'CPE-20260401-PAY002', amount: 8750.00, paymentType: 'ACH', description: 'Q1 2026 volume processing fees', status: 'COMPLETED', createdAt: d(14) },
    { paymentId: '3', referenceId: 'CPE-20260328-PAY003', amount: 3200.00, paymentType: 'ACH', description: 'Premium support & SLA package — Q2 2026', status: 'PENDING', createdAt: d(17) },
    { paymentId: '4', referenceId: 'CPE-20260315-PAY004', amount: 1875.50, paymentType: 'ACH', description: 'Additional payer connections — Delta Dental, Cigna', status: 'COMPLETED', createdAt: d(30) },
    { paymentId: '5', referenceId: 'CPE-20260301-PAY005', amount: 9100.00, paymentType: 'ACH', description: 'Monthly EDI transaction processing — March 2026', status: 'COMPLETED', createdAt: d(44) },
    { paymentId: '6', referenceId: 'CPE-20260215-PAY006', amount: 500.00, paymentType: 'ACH', description: 'EHR integration setup — Epic FHIR R4', status: 'COMPLETED', createdAt: d(58) },
  ];
}

function getDemoBankAccounts() {
  return [
    { accountId: 'demo-1', bankName: 'First National Bank', accountType: 'CHECKING', accountNumberMasked: '****4421', routingNumber: '021000021', status: 'ACTIVE' },
    { accountId: 'demo-2', bankName: 'Pacific Premier Bank', accountType: 'SAVINGS',  accountNumberMasked: '****8892', routingNumber: '122242843', status: 'ACTIVE' },
  ];
}

// ── Init ─────────────────────────────────────────────────────────────────

function initPayments() {
  loadPayments();
  loadBankAccounts();
}
