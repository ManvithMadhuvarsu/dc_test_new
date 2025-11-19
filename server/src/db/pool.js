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

if (config.db.ssl) {
  baseConfig.ssl = config.db.ssl;
}

export const pool = new Pool(baseConfig);

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

