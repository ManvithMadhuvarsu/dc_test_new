// Quick test script to verify server can start and database can connect
import { config } from './src/config/env.js';
import { pool } from './src/db/pool.js';

console.log('=== Connection Test ===\n');
console.log('Server Config:');
console.log(`  Port: ${config.port}`);
console.log(`  Host: 0.0.0.0`);
console.log(`  Database: ${config.db.database}`);
console.log(`  DB Host: ${config.db.host}:${config.db.port}\n`);

console.log('Testing database connection...');
try {
  const [rows] = await pool.query('SELECT 1 as test, current_database() as current_db');
  console.log('✅ Database connection successful!');
  console.log(`  Current database: ${rows[0].current_db}\n`);

  const [students] = await pool.query('SELECT COUNT(*) as count FROM students');
  console.log(`✅ Students table accessible: ${students[0].count} students found\n`);

  await pool.end();
  console.log('✅ All tests passed! Server should start correctly.\n');
  process.exit(0);
} catch (error) {
  console.error('❌ Database connection failed!');
  console.error(`  Error: ${error.message}\n`);
  console.error('Please check:');
  console.error('  1. Supabase/Postgres is running');
  console.error('  2. Database and schema exist (run deployment/supabase-schema.sql)');
  console.error('  3. Credentials in server/.env match Supabase values\n');
  await pool.end();
  process.exit(1);
}

