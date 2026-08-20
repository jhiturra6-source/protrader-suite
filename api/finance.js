// api/finance.js
// Rate limiting simple en memoria (por proceso de serverless)
// Nota: En Vercel, cada invocation es un proceso separado, así que esto es best-effort.
// Para producción real, usar Vercel KV / Upstash Redis.

const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 30,     // 30 req/min por IP
};

const requestCounts = new Map();

function getClientIp(req) {
  // Vercel injects these headers
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip).filter(ts => ts > windowStart);
  
  if (requests.length >= RATE_LIMIT.maxRequests) {
    const oldest = requests[0];
    const retryAfter = Math.ceil((oldest + RATE_LIMIT.windowMs - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }
  
  requests.push(now);
  requestCounts.set(ip, requests);
  
  return { allowed: true, retryAfter: 0, remaining: RATE_LIMIT.maxRequests - requests.length };
}

// Cache simple en memoria (TTL 60s)
const cache = new Map();
const CACHE_TTL = 60 * 1000;

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export default async function handler(req, res) {
  // CORS - restrict to our domain in production
  const origin = req.headers.origin;
  const allowedOrigin = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:5173';
  
  if (origin === allowedOrigin || origin === 'https://protrader-suite.vercel.app') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Rate limiting
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip);
  
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + RATE_LIMIT.windowMs) / 1000));
  
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', rateLimit.retryAfter);
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Try again in ' + rateLimit.retryAfter + ' seconds.',
      retryAfter: rateLimit.retryAfter
    });
  }
  
  const { symbol } = req.query;
  const safeSymbol = (symbol && symbol.trim()) ? symbol.toUpperCase() : 'AAPL';
  const cacheKey = safeSymbol;
  
  // Check cache first
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }
  
  try {
    // 10 años de datos diarios
    const period1 = Math.floor(Date.now() / 1000) - (10 * 365 * 24 * 60 * 60);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${cacheKey}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      // Timeout de 8 segundos
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Validate response structure
    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      throw new Error('No data found for symbol: ' + symbol);
    }
    
    // Cache successful response
    setCache(cacheKey, data);
    res.setHeader('X-Cache', 'MISS');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('[finance.js]', error.message);
    
    // Don't leak internal errors
    const status = error.name === 'TimeoutError' ? 504 : 500;
    const message = status === 504 
      ? 'Upstream timeout' 
      : 'Failed to fetch market data';
    
    return res.status(status).json({ error: message });
  }
}