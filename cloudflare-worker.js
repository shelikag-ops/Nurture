// anthropic-proxy — Cloudflare Worker
// Routes:
//   POST /              → Anthropic API  (x-api-key passed through from request)
//   POST /notion/*      → Notion API     (x-notion-key header from dashboard)
//   OPTIONS *           → CORS preflight

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
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
