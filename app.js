'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const ediRoutes     = require('./routes/edi');
const paymentRoutes = require('./routes/payments');
const reportRoutes  = require('./routes/reports');
const ehrRoutes     = require('./routes/ehr');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((u) => u.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, mobile apps, etc.)
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  }),
);

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV }),
);

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/edi',      ediRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports',  reportRoutes);
app.use('/api/ehr',      ehrRoutes);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Endpoint not found.', code: 'NOT_FOUND' }),
);

// ── Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

module.exports = app;
