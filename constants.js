'use strict';

// ─── DynamoDB Table Names ─────────────────────────────────────────────────────
const TABLES = {
  USERS: process.env.DYNAMODB_USERS_TABLE || 'clearpath-users',
  TRANSACTIONS: process.env.DYNAMODB_TRANSACTIONS_TABLE || 'clearpath-transactions',
  PAYMENTS: process.env.DYNAMODB_PAYMENTS_TABLE || 'clearpath-payments',
  BANK_ACCOUNTS: process.env.DYNAMODB_BANK_ACCOUNTS_TABLE || 'clearpath-bank-accounts',
  REPORTS: process.env.DYNAMODB_REPORTS_TABLE || 'clearpath-reports',
  NOTIFICATIONS: process.env.DYNAMODB_NOTIFICATIONS_TABLE || 'clearpath-notifications',
};

// ─── EDI 270 Service Type Codes (ANSI X12 5010) ──────────────────────────────
// Maps X12 service type code to human-readable label.
// These codes appear in the EQ segment of Loop 2110C.
const SERVICE_TYPE_CODES = {
  '1':  'Medical Care',
  '2':  'Surgical',
  '3':  'Consultation',
  '4':  'Diagnostic X-Ray',
  '5':  'Diagnostic Lab',
  '6':  'Radiation Therapy',
  '7':  'Anesthesia',
  '8':  'Surgical Assistance',
  '12': 'Durable Medical Equipment Purchase',
  '18': 'Vision (Optometry)',
  '23': 'Diagnostic Dental',
  '24': 'Periodontics',
  '25': 'Restorative',
  '26': 'Endodontics',
  '27': 'Maxillofacial Prosthetics',
  '28': 'Adjunctive Dental Services',
  '30': 'Health Benefit Plan Coverage',
  '33': 'Chiropractic',
  '35': 'Dental Care',
  'A6': 'Psychotherapy',
  'AG': 'Primary Care',
  'AJ': 'Skilled Nursing Care',
  'AK': 'Substance Abuse',
  'AL': 'Vision (Optometry)',
  'BB': 'Prescription Drug',
  'MH': 'Mental Health',
  'UC': 'Urgent Care',
};

// ─── EDI Transaction Status Values ───────────────────────────────────────────
const EDI_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  RESPONSE_RECEIVED: 'RESPONSE_RECEIVED',
  ERROR: 'ERROR',
};

// ─── Payment Status Values ────────────────────────────────────────────────────
const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
};

// ─── Report Types ─────────────────────────────────────────────────────────────
const REPORT_TYPES = {
  EDI_270: '270',
  EDI_271: '271',
  PAYMENT_SUMMARY: 'PAYMENT_SUMMARY',
  TRANSACTION_SUMMARY: 'TRANSACTION_SUMMARY',
};

// ─── Account Types ────────────────────────────────────────────────────────────
const ACCOUNT_TYPES = {
  PROVIDER: 'PROVIDER',
  BILLING_COMPANY: 'BILLING_COMPANY',
  CLEARINGHOUSE: 'CLEARINGHOUSE',
};

// ─── Cognito Custom Attribute Names ──────────────────────────────────────────
const COGNITO_ATTRS = {
  ORG_NAME: 'custom:orgName',
  NPI: 'custom:npi',
  TAX_ID: 'custom:taxId',
  ACCOUNT_TYPE: 'custom:accountType',
};

module.exports = {
  TABLES,
  SERVICE_TYPE_CODES,
  EDI_STATUS,
  PAYMENT_STATUS,
  REPORT_TYPES,
  ACCOUNT_TYPES,
  COGNITO_ATTRS,
};
