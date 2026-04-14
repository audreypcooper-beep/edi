'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const auth        = require('../middleware/auth');
const dynamoSvc   = require('../services/dynamodb');
const { TABLES }  = require('../config/constants');

const router = Router();
router.use(auth); // All user routes require authentication

function validateReq(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    return false;
  }
  return true;
}

// ── GET /api/users/me ─────────────────────────────────────────────────────
router.get('/me', async (req, res, next) => {
  try {
    const user = await dynamoSvc.getItem(TABLES.USERS, { userId: req.user.sub });
    if (!user) {
      // First login — create a skeleton profile from Cognito claims
      const skeleton = {
        userId: req.user.sub,
        email: req.user.email,
        givenName: req.user.given_name || '',
        familyName: req.user.family_name || '',
        orgName: req.user.orgName || '',
        npi: req.user.npi || '',
        taxId: req.user.taxId || '',
        accountType: req.user.accountType || 'PROVIDER',
        profileComplete: false,
        notificationsEmail: true,
        notificationsSms: false,
      };
      await dynamoSvc.putItem(TABLES.USERS, skeleton);
      return res.json({ success: true, user: skeleton });
    }
    // Don't expose internal DynamoDB fields
    const { createdAt, updatedAt, ...safe } = user;
    res.json({ success: true, user: safe });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/users/me ─────────────────────────────────────────────────────
router.put(
  '/me',
  [
    body('givenName').optional().trim().notEmpty().withMessage('First name cannot be blank'),
    body('familyName').optional().trim().notEmpty().withMessage('Last name cannot be blank'),
    body('npi').optional().isLength({ min: 10, max: 10 }).withMessage('NPI must be 10 digits'),
  ],
  async (req, res, next) => {
    try {
      if (!validateReq(req, res)) return;
      const allowed = ['givenName', 'familyName', 'orgName', 'npi', 'taxId', 'phone', 'address',
                       'accountType', 'notificationsEmail', 'notificationsSms', 'profileComplete'];
      const updates = {};
      allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update.' });
      }

      const updated = await dynamoSvc.updateItem(TABLES.USERS, { userId: req.user.sub }, updates);
      res.json({ success: true, user: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/users/notifications ─────────────────────────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const { items } = await dynamoSvc.queryItems(
      TABLES.NOTIFICATIONS || 'clearpath-notifications',
      'userId = :uid',
      {
        expressionAttributeValues: { ':uid': req.user.sub },
        scanIndexForward: false,
        limit: 20,
      },
    );
    res.json({ success: true, notifications: items });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/users/notifications/:id/read ────────────────────────────────
router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    await dynamoSvc.updateItem(
      TABLES.NOTIFICATIONS || 'clearpath-notifications',
      { userId: req.user.sub, notificationId: req.params.id },
      { read: true },
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
