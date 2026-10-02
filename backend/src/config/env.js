import 'dotenv/config';

const required = (name, fallback) => process.env[name] ?? fallback;
const asBoolean = (val) => val === 'true' || val === '1';
const asNumber = (val) => Number(val) || 0;

const nodeEnv = required('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

export const env = Object.freeze({
  nodeEnv,
  isProduction,
  isTest,
  port: asNumber(required('PORT', '4000')),

  // Database
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/dunkai'),
  mongoDbName: process.env.MONGODB_DB_NAME || '',

  // JWT
  accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  accessTtl: required('ACCESS_TOKEN_TTL', '15m'),
  refreshTtl: required('REFRESH_TOKEN_TTL', '30d'),

  // Cookie
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  cookieSecure: asBoolean(process.env.COOKIE_SECURE || 'false'),

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: required(
    'GOOGLE_REDIRECT_URI',
    'http://localhost:4000/api/v1/auth/google/callback'
  ),

  // Frontend / CORS
  clientOrigin: required('FRONTEND_URL', 'http://localhost:3000'),
  clientOriginFallback: process.env.CLIENT_ORIGIN || 'http://localhost:3000',

  // Supervisor Agent (Python AI server)
  supervisorUrl: required('SUPERVISOR_AGENT_URL', 'http://127.0.0.1:8000'),
  supervisorPath: required('SUPERVISOR_AGENT_PATH', '/api/v1/supervisor'),
  supervisorToken: process.env.SUPERVISOR_AGENT_TOKEN || '',

  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_SECRET || '',

  // File Uploads
  uploadDir: required('UPLOAD_DIR', 'uploads'),
  maxFileSize: asNumber(required('MAX_FILE_SIZE_MB', '25')) * 1024 * 1024,

  // Firmware compiler
  arduinoCliPath: process.env.ARDUINO_CLI_PATH || 'arduino-cli',
  firmwareWorkDir: process.env.FIRMWARE_WORK_DIR || '',
  firmwareCompileTimeoutMs: asNumber(process.env.FIRMWARE_COMPILE_TIMEOUT_MS || '300000'),

  // Email (placeholder for production SMTP)
  emailFrom: process.env.EMAIL_FROM || 'noreply@dunkai.io',
  emailHost: process.env.EMAIL_HOST || '',
  emailPort: asNumber(process.env.EMAIL_PORT || '587'),
  emailUser: process.env.EMAIL_USER || '',
  emailPass: process.env.EMAIL_PASS || '',

  // Security
  bcryptRounds: asNumber(required('BCRYPT_ROUNDS', '12')),

  // Rate limiting
  rateLimitWindowMs: asNumber(required('RATE_LIMIT_WINDOW_MS', String(15 * 60 * 1000))),
  rateLimitMax: asNumber(required('RATE_LIMIT_MAX', '300')),
  authRateLimitMax: asNumber(required('AUTH_RATE_LIMIT_MAX', '10')),

  // Reset token expiry (in minutes)
  resetTokenExpiry: asNumber(required('RESET_TOKEN_EXPIRY_MIN', '30')),
});

// Fail-fast guard for production
if (isProduction && (env.accessSecret.includes('change-me') || env.refreshSecret.includes('change-me'))) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be configured in production');
}
