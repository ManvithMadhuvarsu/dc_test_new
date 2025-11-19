import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || '';
const fallbackHost = process.env.SUPABASE_DB_HOST || process.env.DB_HOST || '127.0.0.1';
const fallbackPort = Number(process.env.SUPABASE_DB_PORT || process.env.DB_PORT || 5432);
const fallbackUser = process.env.SUPABASE_DB_USER || process.env.DB_USER || 'postgres';
const fallbackPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || '';
const fallbackDatabase = process.env.SUPABASE_DB_NAME || process.env.DB_NAME || 'postgres';

export const config = {
  port: process.env.PORT || 4000,
  examPassword: process.env.EXAM_PASSWORD || 'EXAM@123',
  examDurationMinutes: Number(process.env.SESSION_DURATION_MINUTES || 45),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  db: {
    connectionString: databaseUrl || null,
    host: fallbackHost,
    port: fallbackPort,
    user: fallbackUser,
    password: fallbackPassword,
    database: fallbackDatabase,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  },
};

