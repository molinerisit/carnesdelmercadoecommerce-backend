import cors from 'cors';

function parseOrigins() {
  const list = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowVercelPreviews = (process.env.CORS_ALLOW_VERCEL_PREVIEWS || 'false').toLowerCase() === 'true';
  if (allowVercelPreviews) {
    list.push(/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i);
  }

  list.push(/^http:\/\/localhost:(\d{2,5})$/i, /^http:\/\/127\.0\.0\.1:(\d{2,5})$/i);
  return list;
}

const ALLOWED_ORIGINS = parseOrigins();

function isOriginAllowed(origin) {
  if (!origin) return true;
  for (const rule of ALLOWED_ORIGINS) {
    if (typeof rule === 'string' && rule === origin) return true;
    if (rule instanceof RegExp && rule.test(origin)) return true;
  }
  return false;
}

export function corsMiddleware() {
  const credentials = (process.env.CORS_CREDENTIALS || 'false').toLowerCase() === 'true';
  const methods = process.env.CORS_METHODS || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  const allowedHeaders = process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Requested-With';
  const exposedHeaders = process.env.CORS_EXPOSE_HEADERS || 'Content-Length,Content-Type,Authorization';
  const maxAge = parseInt(process.env.CORS_MAX_AGE || '600', 10);

  return cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials,
    methods,
    allowedHeaders,
    exposedHeaders,
    maxAge,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
}
