import { Pool } from 'pg';
import { config } from '../config/env.js';

const baseConfig = config.db.connectionString
  ? { connectionString: config.db.connectionString }
  : {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
    };

// SSL configuration: Only add SSL if explicitly configured
// (env.js already handles auto-detection for localhost)
if (config.db.ssl) {
  baseConfig.ssl = config.db.ssl;
}

// Optimize pool for 200-300 concurrent users
// Adjust max based on your database plan:
// - Free tier: 10-15 connections max
// - Basic-256mb ($6/month): 20-25 connections max
// - Basic-1gb ($19/month): 50-100 connections max (Recommended for 200-300 users)
// - Pro-4gb ($55/month): 100+ connections max
const poolConfig = {
  ...baseConfig,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum pool size
  min: parseInt(process.env.DB_POOL_MIN || '5', 10),  // Minimum idle connections
  idleTimeoutMillis: 30000,  // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established
};

export const pool = new Pool(poolConfig);

// Patch pool.query to return [rows] for compatibility with existing code.
const rawQuery = pool.query.bind(pool);
pool.query = async (text, params = []) => {
  const result = await rawQuery(text, params);
  return [result.rows];
};

export async function withTransaction(callback) {
  const client = await pool.connect();
  const wrappedClient = {
    query: async (text, params = []) => {
      const result = await client.query(text, params);
      return [result.rows];
    },
  };

  try {
    await client.query('BEGIN');
    const result = await callback(wrappedClient);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DB Transaction Error]:', error.message);
    console.error('[DB Error Stack]:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

