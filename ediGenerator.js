'use strict';

/**
 * ANSI X12 5010 EDI 270 Generator
 *
 * Produces a spec-compliant Healthcare Eligibility Benefit Inquiry (270)
 * transaction set string, suitable for submission to a payer or clearinghouse.
 *
 * Spec references:
 *   - ASC X12N 005010X279A1 (270/271 Implementation Guide)
 *   - X12 5010 ISA/GS envelope standards
 *
 * Element separator:  *
 * Sub-element sep:    :
 * Segment terminator: ~
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Left-pad a number to `width` digits with zeros. */
const pad = (n, width) => String(n).padStart(width, '0');

/** Right-pad a string to `width` characters with spaces. */
const rpad = (s, width) => String(s || '').padEnd(width, ' ');

/** Format a Date as YYYYMMDD (ISA date field). */
function formatDate(date) {
  const d = date || new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
}

/** Format a Date as HHMM (ISA time field). */
function formatTime(date) {
  const d = date || new Date();
  return `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}`;
}

/** Format a Date as CCYYMMDD (GS / BHT date field). */
const formatDateLong = formatDate;

/** Format a Date as HHMMSS (GS time field). */
function formatTimeLong(date) {
  const d = date || new Date();
  return `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
}

/** Trim and uppercase a string — normalises IDs before embedding in EDI. */
const clean = (s) => (s || '').toString().trim().toUpperCase();

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generate a complete ANSI X12 5010 EDI 270 string.
 *
 * @param {object} tx  Transaction data.
 *
 * Required fields:
 *   tx.submitterId        string  ISA06  - Sender ID (NPI or ID of submitter)
 *   tx.payerId            string  ISA08  - Receiver/Payer ID
 *   tx.payerName          string         - Human name of payer (for NM1)
 *   tx.providerNpi        string         - Billing provider NPI
 *   tx.providerName       string         - Billing provider last/org name
 *   tx.subscriberId       string         - Member ID
 *   tx.subscriberLastName string
 *   tx.subscriberFirstName string
 *   tx.subscriberDob      string         - YYYYMMDD
 *   tx.subscriberGender   string         - 'M' | 'F' | 'U'
 *   tx.dateOfService      string         - YYYYMMDD (date of requested service)
 *   tx.serviceTypeCodes   string[]       - Array of X12 service type codes e.g. ['30','1']
 *
 * Optional fields:
 *   tx.controlNumber      string         - 9-digit ISA control number (auto-generated if absent)
 *   tx.groupControlNumber string         - GS/GE control number
 *   tx.transactionControlNumber string   - ST/SE control number
 *   tx.referenceId        string         - Used as TRN02 trace reference
 *
 * @returns {string} EDI 270 string with segments separated by `~\n` for readability.
 *                   Strip the `\n` characters before transmission if required.
 */
function generateEdi270(tx) {
  const now = new Date();

  // ── Control Numbers ──────────────────────────────────────────────────────
  // ISA control number — 9 digits.
  const isaCtrl = pad(tx.controlNumber || Math.floor(Math.random() * 999999999) + 1, 9);
  // GS/GE control number — typically sequential, 1-9 digits.
  const gsCtrl = tx.groupControlNumber || '1';
  // ST/SE control number — 4 digits.
  const stCtrl = pad(tx.transactionControlNumber || '0001', 4);

  // ── Identifiers ──────────────────────────────────────────────────────────
  const submitterId = rpad(clean(tx.submitterId || tx.providerNpi || 'SUBMITTER'), 15);
  const payerId     = rpad(clean(tx.payerId), 15);
  const isaDate     = formatDate(now);   // YYMMDD for ISA (6-char)
  const isaDateShort = isaDate.slice(2); // ISA date is YYMMDD (6 chars)
  const isaTime     = formatTime(now);   // HHMM

  const gsDate      = formatDateLong(now);
  const gsTime      = formatTimeLong(now);

  const traceRef = clean(tx.referenceId || tx.transactionControlNumber || isaCtrl);

  // ── Service Type Codes ───────────────────────────────────────────────────
  // At least one EQ segment is required. Default to '30' (Health Benefit Plan).
  const serviceTypeCodes =
    Array.isArray(tx.serviceTypeCodes) && tx.serviceTypeCodes.length > 0
      ? tx.serviceTypeCodes
      : ['30'];

  // ── Subscriber Gender ────────────────────────────────────────────────────
  // DMG03 accepts M, F, or U.
  const gender = ['M', 'F'].includes((tx.subscriberGender || 'U').toUpperCase())
    ? tx.subscriberGender.toUpperCase()
    : 'U';

  // ── Date of Service ──────────────────────────────────────────────────────
  const dos = clean(tx.dateOfService || formatDateLong(now));

  // ═══════════════════════════════════════════════════════════════════════════
  // Build segment array — each string is one EDI segment (without terminator).
  // ═══════════════════════════════════════════════════════════════════════════
  const segments = [];

  // ── ISA — Interchange Control Header ────────────────────────────────────
  // ISA01-ISA16, fixed widths defined by X12 standard.
  segments.push(
    `ISA*00*${rpad('', 10)}*00*${rpad('', 10)}` +
    `*ZZ*${submitterId}` +
    `*ZZ*${payerId}` +
    `*${isaDateShort}*${isaTime}*^*00501*${isaCtrl}*0*P*:`
  );

  // ── GS — Functional Group Header ────────────────────────────────────────
  // GS01=HS (Health Care Eligibility/Benefit Inquiry)
  segments.push(
    `GS*HS` +
    `*${clean(tx.submitterId || tx.providerNpi)}` +
    `*${clean(tx.payerId)}` +
    `*${gsDate}*${gsTime}` +
    `*${gsCtrl}*X*005010X279A1`
  );

  // ── ST — Transaction Set Header ──────────────────────────────────────────
  // ST01=270, ST02=transaction set control number, ST03=implementation guide version
  segments.push(`ST*270*${stCtrl}*005010X279A1`);

  // ── BHT — Beginning of Hierarchical Transaction ──────────────────────────
  // BHT01=0022 (Information Source), BHT02=13 (Request), BHT03=reference identification
  // BHT04=date, BHT05=time, BHT06=1 (Inquiry)
  segments.push(`BHT*0022*13*${traceRef}*${gsDate}*${gsTime}*1`);

  // ─────────────────────────────────────────────────────────────────────────
  // Loop 2000A — Information Source Level (the payer / insurance company)
  // ─────────────────────────────────────────────────────────────────────────

  // HL*1**20*1 — HL01=1 (hierarchical ID), HL02=blank (no parent), HL03=20 (Information Source), HL04=1 (has children)
  segments.push(`HL*1**20*1`);

  // NM1 — Information Source Name (Payer)
  // NM101=PR (Payer), NM102=2 (Non-Person Entity)
  const payerNm1LastName = clean(tx.payerName || tx.payerId);
  segments.push(`NM1*PR*2*${payerNm1LastName}*****PI*${clean(tx.payerId)}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Loop 2000B — Information Receiver Level (the provider / submitter)
  // ─────────────────────────────────────────────────────────────────────────

  // HL*2*1*21*1 — HL02=1 (parent is HL 1), HL03=21 (Information Receiver), HL04=1 (has children)
  segments.push(`HL*2*1*21*1`);

  // NM1 — Information Receiver Name (Billing Provider)
  // NM101=1P (Provider), NM102=2 (Non-Person Entity for org) or 1 for individual
  const providerNm1LastName = clean(tx.providerName || tx.providerNpi);
  segments.push(`NM1*1P*2*${providerNm1LastName}*****XX*${clean(tx.providerNpi)}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Loop 2000C — Subscriber Level
  // ─────────────────────────────────────────────────────────────────────────

  // HL*3*2*22*0 — HL02=2 (parent is HL 2), HL03=22 (Subscriber), HL04=0 (no children / no dependent loop)
  segments.push(`HL*3*2*22*0`);

  // TRN — Subscriber Trace Number
  // TRN01=1 (current), TRN02=reference ID, TRN03=NPI of requesting provider
  segments.push(`TRN*1*${traceRef}*${clean(tx.providerNpi)}`);

  // NM1 — Subscriber Name
  // NM101=IL (Insured or Subscriber), NM102=1 (Person)
  const subLast  = clean(tx.subscriberLastName);
  const subFirst = clean(tx.subscriberFirstName);
  const subMid   = clean(tx.subscriberMiddleName || '');
  segments.push(`NM1*IL*1*${subLast}*${subFirst}*${subMid}***MI*${clean(tx.subscriberId)}`);

  // REF — Subscriber Additional Reference (optional group/member number)
  if (tx.groupNumber) {
    segments.push(`REF*6P*${clean(tx.groupNumber)}`);
  }

  // DMG — Subscriber Demographic Information
  // DMG01=D8 (date format CCYYMMDD), DMG02=DOB, DMG03=gender
  segments.push(`DMG*D8*${clean(tx.subscriberDob)}*${gender}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Loop 2110C — Subscriber Eligibility / Benefit Inquiry
  // One EQ segment per requested service type.
  // ─────────────────────────────────────────────────────────────────────────

  for (const code of serviceTypeCodes) {
    // EQ*{serviceTypeCode} — Eligibility or Benefit Inquiry
    segments.push(`EQ*${clean(code)}`);
  }

  // DTP — Date of Service (the date for which eligibility is being checked)
  // DTP01=291 (Plan), DTP02=D8 (CCYYMMDD), DTP03=date
  segments.push(`DTP*291*D8*${dos}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Transaction Set Trailer
  // ─────────────────────────────────────────────────────────────────────────

  // SE01 = segment count (number of segments from ST through SE inclusive)
  // SE02 = must match ST02
  const segmentCount = segments.length + 1; // +1 for the SE segment itself
  segments.push(`SE*${segmentCount}*${stCtrl}`);

  // ── GE — Functional Group Trailer ───────────────────────────────────────
  // GE01=number of transaction sets in group (1), GE02=must match GS06
  segments.push(`GE*1*${gsCtrl}`);

  // ── IEA — Interchange Control Trailer ───────────────────────────────────
  // IEA01=number of functional groups (1), IEA02=must match ISA13
  segments.push(`IEA*1*${isaCtrl}`);

  // Join with segment terminator + newline.
  // The newline is for human readability only; strip it before strict
  // transmission if the trading partner does not allow it.
  return segments.join('~\n') + '~';
}

module.exports = { generateEdi270 };
