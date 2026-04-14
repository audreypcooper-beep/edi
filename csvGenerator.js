'use strict';

/**
 * CSV / JSON report generators for EDI 270 and 271 transactions.
 *
 * All CSV output is RFC 4180-compliant:
 *   - Fields containing commas, double-quotes, or newlines are quoted.
 *   - Double-quotes inside values are escaped by doubling them.
 *   - The first row is always a header row.
 */

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

/**
 * Escape and optionally quote a single CSV field value.
 * @param {*} value
 * @returns {string}
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote the field if it contains comma, double-quote, newline, or carriage return.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of row objects to a CSV string.
 * @param {string[]} headers       Column header labels (in order).
 * @param {Function} rowMapper     Function that maps a data item to an array of values matching `headers`.
 * @param {object[]} items         Data items.
 * @returns {string}               Full CSV string including header row.
 */
function buildCsv(headers, rowMapper, items) {
  const headerRow = headers.map(escapeCsvField).join(',');
  const dataRows = items.map((item) => rowMapper(item).map(escapeCsvField).join(','));
  return [headerRow, ...dataRows].join('\r\n');
}

// ─── 270 Report ───────────────────────────────────────────────────────────────

const HEADERS_270 = [
  'TransactionID',
  'SubmittedDate',
  'PayerName',
  'PayerID',
  'ProviderNPI',
  'SubscriberID',
  'SubscriberName',
  'DOB',
  'ServiceTypes',
  'Status',
  'ReferenceID',
];

/**
 * Generate a CSV report for EDI 270 (Eligibility Inquiry) transactions.
 *
 * @param {object[]} transactions  Array of transaction records from DynamoDB.
 * @returns {string}  CSV string.
 */
function generate270Csv(transactions) {
  return buildCsv(HEADERS_270, (tx) => [
    tx.transactionId || tx.id || '',
    tx.createdAt ? new Date(tx.createdAt).toISOString() : '',
    tx.payerName || '',
    tx.payerId || '',
    tx.providerNpi || '',
    tx.subscriberId || '',
    [tx.subscriberLastName, tx.subscriberFirstName].filter(Boolean).join(', '),
    tx.subscriberDob || '',
    Array.isArray(tx.serviceTypeCodes) ? tx.serviceTypeCodes.join('; ') : (tx.serviceTypeCodes || ''),
    tx.status || '',
    tx.referenceId || '',
  ], transactions);
}

// ─── 271 Report ───────────────────────────────────────────────────────────────

const HEADERS_271 = [
  'TransactionID',
  'ResponseDate',
  'PayerName',
  'SubscriberID',
  'EligibilityStatus',
  'CoverageType',
  'DeductibleRemaining',
  'CopayAmount',
  'CoinsurancePercent',
  'AuthRequired',
  'ReferenceID',
];

/**
 * Generate a CSV report for EDI 271 (Eligibility Response) transactions.
 *
 * @param {object[]} transactions  Array of transaction records that include 271 response data.
 * @returns {string}  CSV string.
 */
function generate271Csv(transactions) {
  return buildCsv(HEADERS_271, (tx) => {
    // Response data may be nested under tx.response or at the top level.
    const r = tx.response || tx;
    return [
      tx.transactionId || tx.id || '',
      r.responseDate ? new Date(r.responseDate).toISOString() : (tx.updatedAt ? new Date(tx.updatedAt).toISOString() : ''),
      tx.payerName || r.payerName || '',
      tx.subscriberId || r.subscriberId || '',
      r.eligibilityStatus || '',
      r.coverageType || '',
      r.deductibleRemaining !== undefined ? r.deductibleRemaining : '',
      r.copayAmount !== undefined ? r.copayAmount : '',
      r.coinsurancePercent !== undefined ? r.coinsurancePercent : '',
      r.authRequired !== undefined ? (r.authRequired ? 'Yes' : 'No') : '',
      tx.referenceId || '',
    ];
  }, transactions);
}

// ─── JSON Report ──────────────────────────────────────────────────────────────

/**
 * Generate a JSON representation of transactions.
 * Mirrors the same fields as the corresponding CSV generators.
 *
 * @param {object[]} transactions
 * @param {'270'|'271'} type
 * @returns {string}  Pretty-printed JSON string.
 */
function generateJson(transactions, type) {
  let records;

  if (type === '271') {
    records = transactions.map((tx) => {
      const r = tx.response || tx;
      return {
        transactionId: tx.transactionId || tx.id || null,
        responseDate: r.responseDate || tx.updatedAt || null,
        payerName: tx.payerName || r.payerName || null,
        subscriberId: tx.subscriberId || r.subscriberId || null,
        eligibilityStatus: r.eligibilityStatus || null,
        coverageType: r.coverageType || null,
        deductibleRemaining: r.deductibleRemaining !== undefined ? r.deductibleRemaining : null,
        copayAmount: r.copayAmount !== undefined ? r.copayAmount : null,
        coinsurancePercent: r.coinsurancePercent !== undefined ? r.coinsurancePercent : null,
        authRequired: r.authRequired !== undefined ? r.authRequired : null,
        referenceId: tx.referenceId || null,
      };
    });
  } else {
    // Default: 270
    records = transactions.map((tx) => ({
      transactionId: tx.transactionId || tx.id || null,
      submittedDate: tx.createdAt || null,
      payerName: tx.payerName || null,
      payerId: tx.payerId || null,
      providerNpi: tx.providerNpi || null,
      subscriberId: tx.subscriberId || null,
      subscriberName: [tx.subscriberLastName, tx.subscriberFirstName].filter(Boolean).join(', ') || null,
      dob: tx.subscriberDob || null,
      serviceTypeCodes: tx.serviceTypeCodes || [],
      status: tx.status || null,
      referenceId: tx.referenceId || null,
    }));
  }

  return JSON.stringify({ type, generatedAt: new Date().toISOString(), count: records.length, records }, null, 2);
}

module.exports = {
  generate270Csv,
  generate271Csv,
  generateJson,
};
