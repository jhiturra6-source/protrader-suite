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
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
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
  
  const { symbol, interval } = req.query;
  const safeSymbol = (symbol && symbol.trim()) ? symbol.toUpperCase() : 'AAPL';
  const safeInterval = (interval && ['1d', '1wk', '1mo'].includes(interval)) ? interval : '1d';
  const cacheKey = `${safeSymbol}_${safeInterval}`;
  
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }
  
  try {
    // Ajustar periodo según intervalo
    const period1 = Math.floor(Date.now() / 1000) - (interval === '1mo' ? 30 * 365 * 24 * 60 * 60 : 10 * 365 * 24 * 60 * 60);
    const period2 = Math.floor(Date.now() / 1000);
    
    // Fetch Chart Data
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${safeSymbol}?period1=${period1}&period2=${period2}&interval=${safeInterval}`;
    
    // Fetch Fundamental Data (EPS)
    const fundamentalUrl = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${cacheKey}?modules=defaultKeyStatistics,earnings`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const [chartRes, fundRes] = await Promise.all([
      fetch(chartUrl, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(fundamentalUrl, { headers, signal: AbortSignal.timeout(8000) })
    ]);
    
    if (!chartRes.ok) throw new Error(`Yahoo Chart Error: ${chartRes.status}`);
    
    const chartData = await chartRes.json();
    let fundamentals = null;

    if (fundRes.ok) {
      const fundData = await fundRes.json();
      const result = fundData.quoteSummary?.result?.[0];
      if (result) {
        fundamentals = {
          epsTrailing: result.defaultKeyStatistics?.trailingEps?.fmt || 'N/A',
          epsForward: result.defaultKeyStatistics?.forwardEps?.fmt || 'N/A',
          epsEstimateNextQuarter: result.earnings?.earningsChart?.quarterly?.[0]?.estimate?.fmt || 'N/A'
        };
      }
    }
    
    const finalData = {
      chart: chartData.chart,
      fundamentals
    };
    
    setCache(cacheKey, finalData);
    res.setHeader('X-Cache', 'MISS');
    
    return res.status(200).json(finalData);
  } catch (error) {
    console.error('[finance.js]', error.message);
    const status = error.name === 'TimeoutError' ? 504 : 500;
    return res.status(status).json({ error: 'Failed to fetch market data' });
  }
}
