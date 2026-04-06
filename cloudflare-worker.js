// anthropic-proxy — Cloudflare Worker
// Routes:
//   POST /              → Anthropic API  (x-api-key passed through from request)
//   POST /notion/*      → Notion API     (x-notion-key header from dashboard)
//   GET  /config/:key   → Read config from KV
//   PUT  /config/:key   → Write config to KV
//   OPTIONS *           → CORS preflight
//
// KV binding required: CONFIG_KV  (create a KV namespace in CF dashboard and bind it)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access,Authorization,Notion-Version,x-notion-key',
};

function corsResponse(body, status, extra) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

export default {
  async fetch(request, env) {
    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // ── Config KV store: /config/:key ──
    if (url.pathname.startsWith('/config/')) {
      const key = decodeURIComponent(url.pathname.replace(/^\/config\//, ''));
      if (!key) return corsResponse(JSON.stringify({ error: 'Missing key' }), 400);

      if (!env.CONFIG_KV) {
        return corsResponse(JSON.stringify({ error: 'KV not bound — add CONFIG_KV binding in CF dashboard' }), 500);
      }

      // GET /config/:key — read
      if (request.method === 'GET') {
        const value = await env.CONFIG_KV.get(key);
        if (value === null) return corsResponse(JSON.stringify({ found: false }), 404);
        return corsResponse(value, 200);
      }

      // PUT /config/:key — write
      if (request.method === 'PUT') {
        const body = await request.text();
        await env.CONFIG_KV.put(key, body);
        return corsResponse(JSON.stringify({ ok: true }), 200);
      }

      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
    }

    // ── Config KV bulk: GET /config-all ──
    if (url.pathname === '/config-all' && request.method === 'GET') {
      if (!env.CONFIG_KV) {
        return corsResponse(JSON.stringify({ error: 'KV not bound' }), 500);
      }
      const list = await env.CONFIG_KV.list();
      const result = {};
      for (const { name } of list.keys) {
        result[name] = JSON.parse(await env.CONFIG_KV.get(name) || 'null');
      }
      return corsResponse(JSON.stringify(result), 200);
    }

    // ── Notion proxy: /notion/* → api.notion.com ──
    if (url.pathname.startsWith('/notion')) {
      try {
        const notionPath  = url.pathname.replace(/^\/notion/, '') || '/v1/pages';
        const notionUrl   = `https://api.notion.com${notionPath}${url.search}`;
        const notionToken = request.headers.get('x-notion-key') || env.NOTION_TOKEN || '';
        const body        = (request.method !== 'GET') ? await request.text() : undefined;

        const notionResp = await fetch(notionUrl, {
          method:  request.method,
          headers: {
            'Authorization':  `Bearer ${notionToken}`,
            'Content-Type':   'application/json',
            'Notion-Version': '2022-06-28',
          },
          body,
        });

        const data = await notionResp.text();
        return corsResponse(data, notionResp.status);
      } catch (err) {
        return corsResponse(JSON.stringify({ error: err.message }), 500);
      }
    }

    // ── Anthropic proxy: everything else → api.anthropic.com/v1/messages ──
    try {
      const body = await request.text();
      const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':                              'application/json',
          'x-api-key':                                 request.headers.get('x-api-key') || '',
          'anthropic-version':                         request.headers.get('anthropic-version') || '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body,
      });
      const data = await anthropicResp.text();
      return corsResponse(data, anthropicResp.status);
    } catch (err) {
      return corsResponse(JSON.stringify({ error: err.message }), 500);
    }
  }
};
