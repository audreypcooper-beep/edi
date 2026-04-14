'use strict';

/**
 * EHR Integration Routes — /api/ehr
 *
 * Manages connections to major EHR systems via:
 *   - Epic FHIR R4 (OAuth 2.0 / SMART on FHIR)
 *   - Oracle Cerner FHIR R4 (OAuth 2.0)
 *   - Athenahealth REST API (OAuth 2.0)
 *   - NextGen HL7v2 / FHIR (MLLP / REST)
 *   - eClinicalWorks FHIR R4
 *   - Allscripts / Veradigm REST
 *   - Meditech Expanse FHIR R4
 *   - AdvancedMD REST API
 *   - WebPT REST API
 *   - Kareo / Tebra REST API
 */

const { Router }   = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const https        = require('https');
const http         = require('http');

const auth         = require('../middleware/auth');
const dynamoSvc    = require('../services/dynamodb');
const { TABLES }   = require('../config/constants');

const router = Router();
router.use(auth);

// ── Supported EHR systems registry ────────────────────────────────────────
const EHR_SYSTEMS = {
  epic: {
    name: 'Epic MyChart / Epic FHIR',
    vendor: 'Epic Systems',
    protocol: 'FHIR R4',
    authType: 'SMART on FHIR (OAuth 2.0)',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://{instance}.epic.com/api/FHIR/R4',
    sandboxUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
    scopes: ['patient/*.read', 'user/*.read', 'launch/patient', 'openid', 'fhirUser'],
    resources: ['Patient', 'Coverage', 'Claim', 'ExplanationOfBenefit', 'Encounter', 'Condition', 'Observation', 'MedicationRequest'],
    ediCapabilities: ['270/271', '837P', '837I', '835', '277CA'],
    requiredConfig: ['clientId', 'clientSecret', 'instanceUrl', 'redirectUri'],
    marketShare: '31%',
    notes: 'Requires App Orchard registration for production access.',
  },
  cerner: {
    name: 'Oracle Cerner Millennium',
    vendor: 'Oracle Health',
    protocol: 'FHIR R4',
    authType: 'SMART on FHIR (OAuth 2.0)',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://fhir-ehr.cerner.com/r4/{tenantId}',
    sandboxUrl: 'https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
    scopes: ['patient/Patient.read', 'patient/Coverage.read', 'user/Claim.read'],
    resources: ['Patient', 'Coverage', 'Claim', 'Encounter', 'Condition'],
    ediCapabilities: ['270/271', '837P', '837I', '835'],
    requiredConfig: ['clientId', 'clientSecret', 'tenantId', 'redirectUri'],
    marketShare: '25%',
    notes: 'Code Console registration required for all environments.',
  },
  athenahealth: {
    name: 'Athenahealth / athenaOne',
    vendor: 'Athenahealth',
    protocol: 'REST + FHIR R4',
    authType: 'OAuth 2.0',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://api.platform.athenahealth.com/v1/{practiceId}',
    sandboxUrl: 'https://api.preview.platform.athenahealth.com/v1/1',
    scopes: ['athena/service/Athenanet.MDP.Claims.Read', 'athena/service/Athenanet.MDP.Patient.Read'],
    resources: ['Patient', 'Appointment', 'Claim', 'ClinicalNote', 'Insurance'],
    ediCapabilities: ['270/271', '837P', '835', '277CA'],
    requiredConfig: ['clientId', 'clientSecret', 'practiceId'],
    marketShare: '10%',
    notes: 'Developer portal at developer.athenahealth.com. Rate limit: 1000 req/min.',
  },
  nextgen: {
    name: 'NextGen Enterprise / Office',
    vendor: 'NextGen Healthcare',
    protocol: 'HL7 v2.x + FHIR R4',
    authType: 'OAuth 2.0 / MLLP (HL7)',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://api.nextgen.com/fhir/r4',
    sandboxUrl: 'https://sandbox-api.nextgen.com/fhir/r4',
    scopes: ['patient/*.read', 'user/*.read'],
    resources: ['Patient', 'Coverage', 'Claim', 'Encounter', 'DiagnosticReport'],
    ediCapabilities: ['270/271', '837P', '835'],
    requiredConfig: ['clientId', 'clientSecret', 'practiceId', 'hl7Host', 'hl7Port'],
    marketShare: '8%',
    notes: 'HL7 v2.5.1 MLLP available for legacy transaction sets. FHIR R4 preferred.',
  },
  eclinicalworks: {
    name: 'eClinicalWorks (eCW)',
    vendor: 'eClinicalWorks',
    protocol: 'FHIR R4',
    authType: 'SMART on FHIR (OAuth 2.0)',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://{instance}.eclinicalworks.com/fhir/r4',
    sandboxUrl: 'https://fhir.eclinicalworks.com/fhir/r4',
    scopes: ['patient/*.read', 'user/Claim.read', 'launch/patient'],
    resources: ['Patient', 'Coverage', 'Claim', 'AllergyIntolerance', 'Condition'],
    ediCapabilities: ['270/271', '837P', '835'],
    requiredConfig: ['clientId', 'clientSecret', 'instanceUrl'],
    marketShare: '7%',
    notes: 'ECW Integration Service (EIS) required for full EDI capabilities.',
  },
  allscripts: {
    name: 'Allscripts / Veradigm',
    vendor: 'Veradigm',
    protocol: 'REST + HL7 v2',
    authType: 'OAuth 2.0',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://api.veradigm.com/fhir/r4',
    sandboxUrl: 'https://developer.veradigm.com/sandbox/fhir/r4',
    scopes: ['patient/*.read', 'user/Claim.read'],
    resources: ['Patient', 'Coverage', 'Encounter', 'Claim'],
    ediCapabilities: ['270/271', '837P', '835'],
    requiredConfig: ['clientId', 'clientSecret', 'practiceId'],
    marketShare: '5%',
    notes: 'Veradigm developer portal at developer.veradigm.com.',
  },
  meditech: {
    name: 'MEDITECH Expanse',
    vendor: 'MEDITECH',
    protocol: 'FHIR R4',
    authType: 'SMART on FHIR (OAuth 2.0)',
    fhirVersion: 'R4',
    baseUrlPattern: 'https://{instance}.meditech.com/api/fhir/r4',
    sandboxUrl: 'https://ehr.meditech.com/api/fhir/r4',
    scopes: ['patient/*.read', 'user/*.read'],
    resources: ['Patient', 'Coverage', 'Encounter', 'Claim', 'Condition'],
    ediCapabilities: ['270/271', '837I', '837P', '835'],
    requiredConfig: ['clientId', 'clientSecret', 'instanceUrl'],
    marketShare: '4%',
    notes: 'Strong in community hospitals and critical access facilities.',
  },
  advancedmd: {
    name: 'AdvancedMD',
    vendor: 'AdvancedMD',
    protocol: 'REST',
    authType: 'OAuth 2.0',
    fhirVersion: 'R4 (partial)',
    baseUrlPattern: 'https://providerapi.advancedmd.com/processrequest/{officeKey}',
    sandboxUrl: 'https://providerapi.advancedmd.com/processrequest/sandbox',
    scopes: ['claims', 'patients', 'insurance'],
    resources: ['Patient', 'Appointment', 'Claim', 'Insurance'],
    ediCapabilities: ['270/271', '837P', '835', '277CA'],
    requiredConfig: ['username', 'password', 'officeKey', 'appName'],
    marketShare: '3%',
    notes: 'REST-based API with XML/JSON support. Webhook notifications available.',
  },
  webpt: {
    name: 'WebPT',
    vendor: 'WebPT',
    protocol: 'REST',
    authType: 'OAuth 2.0',
    fhirVersion: 'Partial',
    baseUrlPattern: 'https://api.webpt.com/v1',
    sandboxUrl: 'https://api.sandbox.webpt.com/v1',
    scopes: ['read:patients', 'read:claims', 'read:appointments'],
    resources: ['Patient', 'Appointment', 'DocumentReference', 'Claim'],
    ediCapabilities: ['270/271', '837P', '275'],
    requiredConfig: ['clientId', 'clientSecret', 'organizationId'],
    marketShare: '2%',
    notes: 'Physical therapy specialty EHR. Strong in outpatient rehab.',
  },
  kareo: {
    name: 'Kareo / Tebra',
    vendor: 'Tebra',
    protocol: 'REST',
    authType: 'API Key + OAuth 2.0',
    fhirVersion: 'R4 (partial)',
    baseUrlPattern: 'https://api.kareo.com/v1',
    sandboxUrl: 'https://api.kareo.com/v1/sandbox',
    scopes: ['read', 'write'],
    resources: ['Patient', 'Appointment', 'Claim', 'Insurance', 'Payment'],
    ediCapabilities: ['270/271', '837P', '835'],
    requiredConfig: ['apiKey', 'customerId', 'userId', 'userPassword'],
    marketShare: '2%',
    notes: 'Strong in small-to-mid size practices. Merged with PatientPop as Tebra.',
  },
};

// ── GET /api/ehr/systems — List supported EHR systems ─────────────────────
router.get('/systems', (req, res) => {
  const systems = Object.entries(EHR_SYSTEMS).map(([key, s]) => ({
    key,
    name: s.name,
    vendor: s.vendor,
    protocol: s.protocol,
    authType: s.authType,
    fhirVersion: s.fhirVersion,
    ediCapabilities: s.ediCapabilities,
    marketShare: s.marketShare,
    requiredConfig: s.requiredConfig,
    notes: s.notes,
  }));
  res.json({ success: true, systems, total: systems.length });
});

// ── GET /api/ehr/connections — List user's EHR connections ────────────────
router.get('/connections', async (req, res, next) => {
  try {
    const { items } = await dynamoSvc.queryItems(
      TABLES.TRANSACTIONS,
      'userId = :uid',
      {
        expressionAttributeValues: { ':uid': req.user.sub, ':type': 'EHR_CONNECTION' },
        filterExpression: 'transactionType = :type',
        scanIndexForward: false,
        limit: 100,
      },
    );
    // Strip secrets before returning
    const safe = items.map(({ clientSecret, apiKey, userPassword, accessToken, refreshToken, ...rest }) => rest);
    res.json({ success: true, connections: safe });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/ehr/systems/:key — Get system info + config schema ───────────
router.get('/systems/:key', (req, res) => {
  const system = EHR_SYSTEMS[req.params.key];
  if (!system) return res.status(404).json({ success: false, message: `Unknown EHR system: ${req.params.key}` });
  res.json({ success: true, system: { key: req.params.key, ...system } });
});

// ── POST /api/ehr/connections — Add a new EHR connection ──────────────────
router.post(
  '/connections',
  [
    body('ehrSystem').notEmpty().isIn(Object.keys(EHR_SYSTEMS)).withMessage('Valid EHR system key required'),
    body('instanceUrl').optional().isURL().withMessage('instanceUrl must be a valid URL'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

      const system = EHR_SYSTEMS[req.body.ehrSystem];
      const connectionId = uuidv4();

      const connection = {
        userId:         req.user.sub,
        transactionId:  connectionId,
        transactionType: 'EHR_CONNECTION',
        connectionId,
        ehrSystem:      req.body.ehrSystem,
        ehrSystemName:  system.name,
        protocol:       system.protocol,
        fhirVersion:    system.fhirVersion,
        instanceUrl:    req.body.instanceUrl    || system.sandboxUrl,
        environment:    req.body.environment    || 'sandbox',
        status:         'PENDING_AUTH',
        createdAt:      new Date().toISOString(),
        // Config (store encrypted in prod — use KMS or Secrets Manager)
        clientId:       req.body.clientId       || '',
        practiceId:     req.body.practiceId     || '',
        tenantId:       req.body.tenantId       || '',
        officeKey:      req.body.officeKey      || '',
        organizationId: req.body.organizationId || '',
        // Secrets — store only non-empty, rotate regularly
        ...(req.body.clientSecret && { clientSecret: req.body.clientSecret }),
        ...(req.body.apiKey       && { apiKey: req.body.apiKey }),
        configuredBy:   req.user.email,
      };

      await dynamoSvc.putItem(TABLES.TRANSACTIONS, connection);

      res.status(201).json({
        success:      true,
        connectionId,
        ehrSystem:    req.body.ehrSystem,
        ehrSystemName: system.name,
        status:       'PENDING_AUTH',
        authUrl:      buildAuthUrl(req.body.ehrSystem, system, req.body),
        message:      `${system.name} connection created. Complete OAuth authorization to activate.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/ehr/connections/:id/test — Test a connection ────────────────
router.post('/connections/:id/test', async (req, res, next) => {
  try {
    const { items } = await dynamoSvc.queryItems(
      TABLES.TRANSACTIONS,
      'userId = :uid',
      {
        expressionAttributeValues: { ':uid': req.user.sub, ':type': 'EHR_CONNECTION' },
        filterExpression: 'transactionType = :type AND connectionId = :cid',
        expressionAttributeValues: { ':uid': req.user.sub, ':type': 'EHR_CONNECTION', ':cid': req.params.id },
        limit: 1,
      },
    );
    const connection = items[0];
    if (!connection) return res.status(404).json({ success: false, message: 'Connection not found.' });

    const system = EHR_SYSTEMS[connection.ehrSystem];
    if (!system) return res.status(400).json({ success: false, message: 'Unknown EHR system.' });

    // Attempt a metadata / capability statement request
    const testResult = await testFhirEndpoint(connection.instanceUrl);
    const newStatus = testResult.ok ? 'CONNECTED' : 'ERROR';

    await dynamoSvc.updateItem(
      TABLES.TRANSACTIONS,
      { userId: req.user.sub, transactionId: connection.transactionId },
      'SET #st = :s, lastTestedAt = :t, lastTestResult = :r',
      {
        expressionAttributeNames: { '#st': 'status' },
        expressionAttributeValues: {
          ':s': newStatus,
          ':t': new Date().toISOString(),
          ':r': testResult.message,
        },
      },
    );

    res.json({
      success: testResult.ok,
      status: newStatus,
      latencyMs: testResult.latencyMs,
      message: testResult.message,
      fhirVersion: testResult.fhirVersion,
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/ehr/connections/:id — Remove a connection ─────────────────
router.delete('/connections/:id', async (req, res, next) => {
  try {
    const { items } = await dynamoSvc.queryItems(
      TABLES.TRANSACTIONS,
      'userId = :uid',
      {
        expressionAttributeValues: { ':uid': req.user.sub, ':type': 'EHR_CONNECTION', ':cid': req.params.id },
        filterExpression: 'transactionType = :type AND connectionId = :cid',
        limit: 1,
      },
    );
    const connection = items[0];
    if (!connection) return res.status(404).json({ success: false, message: 'Connection not found.' });

    await dynamoSvc.deleteItem(TABLES.TRANSACTIONS, {
      userId: req.user.sub,
      transactionId: connection.transactionId,
    });

    res.json({ success: true, message: 'EHR connection removed.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ehr/fhir/:connectionId/Patient — Fetch patient from EHR ─────
router.post('/fhir/:connectionId/search', async (req, res, next) => {
  try {
    const { resourceType, params } = req.body;
    if (!resourceType) return res.status(400).json({ success: false, message: 'resourceType required' });

    const { items } = await dynamoSvc.queryItems(
      TABLES.TRANSACTIONS,
      'userId = :uid',
      {
        expressionAttributeValues: { ':uid': req.user.sub, ':type': 'EHR_CONNECTION', ':cid': req.params.connectionId },
        filterExpression: 'transactionType = :type AND connectionId = :cid',
        limit: 1,
      },
    );
    const connection = items[0];
    if (!connection) return res.status(404).json({ success: false, message: 'Connection not found.' });
    if (connection.status !== 'CONNECTED') {
      return res.status(400).json({ success: false, message: `Connection status is ${connection.status}. Test connection first.` });
    }

    const fhirUrl = `${connection.instanceUrl}/${resourceType}?${new URLSearchParams(params || {}).toString()}`;
    const result = await fhirGet(fhirUrl, connection.accessToken);

    res.json({ success: true, resourceType, total: result.total || 0, entries: result.entry || [] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ehr/fhir/:connectionId/patient-to-270 — Auto-build 270 ──────
// Reads a Patient + Coverage from the EHR and builds an EDI 270 payload
router.post('/fhir/:connectionId/patient-to-270', async (req, res, next) => {
  try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ success: false, message: 'patientId required' });

    const { items } = await dynamoSvc.queryItems(
      TABLES.TRANSACTIONS,
      'userId = :uid',
      {
        expressionAttributeValues: { ':uid': req.user.sub, ':type': 'EHR_CONNECTION', ':cid': req.params.connectionId },
        filterExpression: 'transactionType = :type AND connectionId = :cid',
        limit: 1,
      },
    );
    const connection = items[0];
    if (!connection) return res.status(404).json({ success: false, message: 'Connection not found.' });

    // Fetch Patient resource
    const patient = await fhirGet(`${connection.instanceUrl}/Patient/${patientId}`, connection.accessToken);
    const coverages = await fhirGet(`${connection.instanceUrl}/Coverage?patient=${patientId}&status=active`, connection.accessToken);

    const coverage = coverages.entry?.[0]?.resource;
    const name = patient.name?.[0];
    const dob = patient.birthDate || '';
    const gender = patient.gender === 'male' ? 'M' : patient.gender === 'female' ? 'F' : 'U';

    const payload270 = {
      payerId: coverage?.payor?.[0]?.identifier?.value || '',
      payerName: coverage?.payor?.[0]?.display || '',
      memberId: coverage?.subscriberId || coverage?.id || '',
      memberFirstName: name?.given?.[0] || '',
      memberLastName: name?.family || '',
      memberDob: dob.replace(/-/g, ''),
      memberGender: gender,
      groupNumber: coverage?.class?.find(c => c.type?.coding?.[0]?.code === 'group')?.value || '',
      serviceTypeCode: '30',
      _ehrSource: { system: connection.ehrSystem, patientId, connectionId: connection.connectionId },
    };

    res.json({ success: true, payload270, patient, coverage: coverage || null });
  } catch (err) {
    next(err);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

function buildAuthUrl(key, system, config) {
  if (key === 'epic') {
    return `${config.instanceUrl || system.sandboxUrl}/oauth2/authorize?response_type=code&client_id=${config.clientId || ''}&redirect_uri=${encodeURIComponent(config.redirectUri || '')}&scope=${encodeURIComponent(system.scopes.join(' '))}&aud=${config.instanceUrl || system.sandboxUrl}`;
  }
  if (key === 'cerner') {
    return `https://authorization.cerner.com/tenants/${config.tenantId || 'SANDBOX'}/protocols/oauth2/profiles/smart-v1/authorize?response_type=code&client_id=${config.clientId || ''}&redirect_uri=${encodeURIComponent(config.redirectUri || '')}&scope=${encodeURIComponent(system.scopes.join(' '))}`;
  }
  if (key === 'athenahealth') {
    return `https://api.platform.athenahealth.com/oauth2/v1/authorize?response_type=code&client_id=${config.clientId || ''}&redirect_uri=${encodeURIComponent(config.redirectUri || '')}&scope=${encodeURIComponent(system.scopes.join(' '))}`;
  }
  // Generic SMART on FHIR authorize URL
  return `${config.instanceUrl || system.sandboxUrl}/authorize?response_type=code&client_id=${config.clientId || ''}&scope=${encodeURIComponent(system.scopes.join(' '))}`;
}

async function testFhirEndpoint(baseUrl) {
  return new Promise((resolve) => {
    const metadataUrl = `${baseUrl}/metadata`;
    const start = Date.now();
    const lib = metadataUrl.startsWith('https') ? https : http;
    try {
      const req = lib.get(metadataUrl, { headers: { Accept: 'application/fhir+json' }, timeout: 8000 }, (resp) => {
        const latencyMs = Date.now() - start;
        let body = '';
        resp.on('data', d => { body += d; });
        resp.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({ ok: true, latencyMs, fhirVersion: json.fhirVersion || json.version || 'R4', message: `Connected — FHIR ${json.fhirVersion || 'R4'} (${latencyMs}ms)` });
          } catch {
            resolve({ ok: resp.statusCode < 400, latencyMs, message: `HTTP ${resp.statusCode} (${latencyMs}ms)` });
          }
        });
      });
      req.on('error', (e) => resolve({ ok: false, latencyMs: Date.now() - start, message: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, latencyMs: 8000, message: 'Connection timed out' }); });
    } catch (e) {
      resolve({ ok: false, latencyMs: Date.now() - start, message: e.message });
    }
  });
}

async function fhirGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const headers = { Accept: 'application/fhir+json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const req = lib.get(url, { headers, timeout: 10000 }, (resp) => {
      let body = '';
      resp.on('data', d => { body += d; });
      resp.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Invalid FHIR response from ${url}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('FHIR request timed out')); });
  });
}

module.exports = router;
