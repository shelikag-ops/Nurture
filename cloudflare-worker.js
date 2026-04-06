// anthropic-proxy — Cloudflare Worker
// Routes:
//   POST /              → Anthropic API  (x-api-key passed through from request)
//   POST /notion/*      → Notion API     (x-notion-key header from dashboard)
//   GET  /config/:key   → Read config from KV
//   PUT  /config/:key   → Write config to KV
//   POST /config/:key   → Write config to KV (sendBeacon compat)
//   GET  /config-all    → Bulk read all KV keys
//   PUT  /image/:id     → Upload image to R2 (base64 JSON body)
//   GET  /image/:id     → Serve image from R2
//   OPTIONS *           → CORS preflight
//
// Bindings required:
//   CONFIG_KV   — KV namespace for config sync
//   IMAGE_STORE — R2 bucket for worksheet images

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
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

    // ── Image R2 store: /image/:id ──
    if (url.pathname.startsWith('/image/')) {
      const imageId = decodeURIComponent(url.pathname.replace(/^\/image\//, ''));
      if (!imageId) return corsResponse(JSON.stringify({ error: 'Missing image ID' }), 400);

      if (!env.IMAGE_STORE) {
        return corsResponse(JSON.stringify({ error: 'R2 not bound — add IMAGE_STORE binding in CF dashboard' }), 500);
      }

      // GET /image/:id — serve the image
      if (request.method === 'GET') {
        const obj = await env.IMAGE_STORE.get(imageId);
        if (!obj) return corsResponse(JSON.stringify({ error: 'Image not found' }), 404);
        const headers = {
          ...CORS,
          'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        };
        return new Response(obj.body, { status: 200, headers });
      }

      // PUT /image/:id — upload image (accepts base64 JSON or raw binary)
      if (request.method === 'PUT') {
        const contentType = request.headers.get('Content-Type') || '';
        let imageBytes;
        let mimeType = 'image/jpeg';

        if (contentType.includes('application/json')) {
          // JSON body: { "data": "base64string", "mimeType": "image/jpeg" }
          const json = await request.json();
          if (!json.data) return corsResponse(JSON.stringify({ error: 'Missing data field' }), 400);
          // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,")
          let b64 = json.data;
          const match = b64.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            b64 = match[2];
          }
          if (json.mimeType) mimeType = json.mimeType;
          // Decode base64 to binary
          const raw = atob(b64);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          imageBytes = arr.buffer;
        } else {
          // Raw binary upload
          imageBytes = await request.arrayBuffer();
          if (contentType) mimeType = contentType;
        }

        await env.IMAGE_STORE.put(imageId, imageBytes, {
          httpMetadata: { contentType: mimeType },
        });

        const imageUrl = `${url.origin}/image/${encodeURIComponent(imageId)}`;
        return corsResponse(JSON.stringify({ ok: true, url: imageUrl }), 200);
      }

      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
    }

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

      // PUT or POST /config/:key — write (POST needed for sendBeacon on page unload)
      if (request.method === 'PUT' || request.method === 'POST') {
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
