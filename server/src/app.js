import express from 'express';
import cors from 'cors';
import sessionRoutes from './routes/sessionRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { config } from './config/env.js';

const app = express();

const corsOptions = {
  origin: config.allowedOrigins.length ? config.allowedOrigins : true, // Allow all origins in dev
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Handle preflight OPTIONS requests with middleware
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(200).end();
    return;
  }
  next();
});

// Apply CORS middleware for all other requests
app.use(cors(corsOptions));

// Ensure CORS headers are set on all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

app.use(express.json());

// Log all incoming requests for debugging (after CORS)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  if (req.method === 'OPTIONS') {
    console.log(`[${timestamp}] Preflight request - CORS headers should be set`);
  }
  if (req.method === 'POST' && req.path.includes('/login')) {
    console.log(`[${timestamp}] Request body keys:`, Object.keys(req.body || {}));
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test database connection endpoint
app.get('/test-db', async (req, res, next) => {
  try {
    const { pool } = await import('./db/pool.js');
    const [rows] = await pool.query('SELECT 1 as test, COUNT(*) as student_count FROM students');
    res.json({ 
      status: 'ok', 
      db: 'connected',
      test: rows[0].test,
      student_count: rows[0].student_count 
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/session', sessionRoutes);

app.use(errorHandler);

export default app;

