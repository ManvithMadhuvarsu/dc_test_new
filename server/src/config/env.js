import dotenv from 'dotenv';

dotenv.config();

// Priority: If DB_HOST is explicitly set to localhost, use local settings
// Otherwise, use DATABASE_URL or remote settings
const explicitLocalHost = process.env.DB_HOST === '127.0.0.1' || process.env.DB_HOST === 'localhost';
const useLocal = explicitLocalHost && process.env.DB_HOST;

const databaseUrl = useLocal ? '' : (process.env.DATABASE_URL || '');
const fallbackHost = useLocal 
  ? process.env.DB_HOST 
  : (process.env.SUPABASE_DB_HOST || process.env.DB_HOST || '127.0.0.1');
const fallbackPort = Number(
  useLocal 
    ? (process.env.DB_PORT || 5432)
    : (process.env.SUPABASE_DB_PORT || process.env.DB_PORT || 5432)
);
const fallbackUser = useLocal
  ? (process.env.DB_USER || 'postgres')
  : (process.env.SUPABASE_DB_USER || process.env.DB_USER || 'postgres');
const fallbackPassword = useLocal
  ? (process.env.DB_PASSWORD || '')
  : (process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || '');
const fallbackDatabase = useLocal
  ? (process.env.DB_NAME || 'postgres')
  : (process.env.SUPABASE_DB_NAME || process.env.DB_NAME || 'postgres');

// Auto-detect localhost and disable SSL automatically
// This makes it easy to switch between local and deployment
const isLocalhost = fallbackHost === '127.0.0.1' || 
                    fallbackHost === 'localhost' || 
                    fallbackHost.includes('127.0.0.1') ||
                    fallbackHost.includes('localhost');

// SSL configuration: 
// - Explicitly set DB_SSL=false to disable
// - Set DB_SSL=true to enable
// - Auto-disable for localhost (unless DB_SSL is explicitly set)
let sslConfig = false;
if (process.env.DB_SSL === 'true') {
  sslConfig = { rejectUnauthorized: false };
} else if (process.env.DB_SSL === 'false') {
  sslConfig = false;
} else {
  // Auto-detect: disable SSL for localhost, enable for remote
  sslConfig = isLocalhost ? false : { rejectUnauthorized: false };
}

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
    ssl: sslConfig,
  },
};

