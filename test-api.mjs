// Test script para api/finance.js
// Simula req/res de Vercel y valida rate limiting + CORS + cache
import { createServer } from 'http';
import { readFileSync } from 'fs';

const API_SOURCE = readFileSync('./api/finance.js', 'utf-8');

// Mock req/res
function makeReqRes(method, url, headers = {}) {
  const req = { method, url, headers, query: {} };
  const urlObj = new URL(url, 'http://localhost');
  for (const [k, v] of urlObj.searchParams) req.query[k] = v;
  
  const resHeaders = {};
  const res = {
    statusCode: 200,
    setHeader: (k, v) => { resHeaders[k] = v; },
    getHeader: (k) => resHeaders[k],
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.body = data; return this; },
    end: function() { if (!this.body) this.body = ''; },
  };
  
  return { req, res, resHeaders };
}

// Import dinámico del handler
const handler = (await import('./api/finance.js')).default;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
  }
}

// Test 1: CORS preflight
await test('OPTIONS preflight returns 204', async () => {
  const { req, res } = makeReqRes('OPTIONS', '/api/finance?symbol=AAPL', {
    origin: 'https://protrader-suite.vercel.app'
  });
  await handler(req, res);
  if (res.statusCode !== 204) throw new Error(`Expected 204, got ${res.statusCode}`);
});

// Test 2: CORS header for allowed origin
await test('CORS allows protrader-suite.vercel.app', async () => {
  const { req, res } = makeReqRes('GET', '/api/finance?symbol=AAPL', {
    origin: 'https://protrader-suite.vercel.app'
  });
  await handler(req, res);
  if (res.getHeader('Access-Control-Allow-Origin') !== 'https://protrader-suite.vercel.app') {
    throw new Error('Origin not allowed');
  }
});

// Test 3: CORS blocks disallowed origin
await test('CORS blocks foreign origin', async () => {
  const { req, res } = makeReqRes('GET', '/api/finance?symbol=AAPL', {
    origin: 'https://evil.com'
  });
  await handler(req, res);
  if (res.getHeader('Access-Control-Allow-Origin') === 'https://evil.com') {
    throw new Error('Foreign origin was allowed!');
  }
});

// Test 4: Rate limiting kicks in after 30 requests
await test('Rate limit blocks after 30 requests/min', async () => {
  const ip = '1.2.3.4';
  let lastStatus = 200;
  for (let i = 0; i < 35; i++) {
    const { req, res } = makeReqRes('GET', '/api/finance?symbol=AAPL', {
      origin: 'https://protrader-suite.vercel.app',
      'x-forwarded-for': ip
    });
    await handler(req, res);
    lastStatus = res.statusCode;
  }
  if (lastStatus !== 429) {
    throw new Error(`Expected 429 after 30 reqs, got ${lastStatus}`);
  }
});

// Test 5: Rate limit headers present
await test('Rate limit headers present', async () => {
  const { req, res } = makeReqRes('GET', '/api/finance?symbol=AAPL', {
    origin: 'https://protrader-suite.vercel.app',
    'x-forwarded-for': '5.6.7.8'
  });
  await handler(req, res);
  if (!res.getHeader('X-RateLimit-Limit')) throw new Error('Missing X-RateLimit-Limit');
  if (!res.getHeader('X-RateLimit-Remaining')) throw new Error('Missing X-RateLimit-Remaining');
  if (!res.getHeader('X-RateLimit-Reset')) throw new Error('Missing X-RateLimit-Reset');
});

// Test 6: Invalid symbol handling
await test('Empty symbol defaults to AAPL', async () => {
  const { req, res } = makeReqRes('GET', '/api/finance?symbol=', {
    origin: 'https://protrader-suite.vercel.app',
    'x-forwarded-for': '9.10.11.12'
  });
  await handler(req, res);
  // Handler should not throw and should proceed (cacheKey defaults to AAPL)
  if (res.statusCode === 500) throw new Error('Empty symbol caused 500 error');
  // Check that X-Cache header exists (means it tried cache with AAPL key)
  if (!res.getHeader('X-Cache')) throw new Error('Handler did not process request');
});

console.log('\n--- API tests complete ---');
