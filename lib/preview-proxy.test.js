import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';        // default export IS the WebSocket class
const WebSocketServer = WebSocket.Server;
import { isPreviewHost, proxyHttp, attachUpgrade } from './preview-proxy.js';

const HOST = 'preview.hub.example.com';

test('isPreviewHost matches the fixed preview host exactly', () => {
  assert.equal(isPreviewHost('preview.hub.example.com', HOST), true);
});

test('isPreviewHost strips a :port suffix and is case-insensitive', () => {
  assert.equal(isPreviewHost('preview.hub.example.com:443', HOST), true);
  assert.equal(isPreviewHost('PREVIEW.HUB.EXAMPLE.COM', HOST), true);
});

test('isPreviewHost rejects foreign hosts (the Hub itself, subdomains)', () => {
  assert.equal(isPreviewHost('hub.example.com', HOST), false);
  assert.equal(isPreviewHost('5173.preview.hub.example.com', HOST), false); // no per-port subdomains
  assert.equal(isPreviewHost('preview.evil.com', HOST), false);
});

test('isPreviewHost tolerates missing/garbage host or unset previewHost', () => {
  assert.equal(isPreviewHost(undefined, HOST), false);
  assert.equal(isPreviewHost('', HOST), false);
  assert.equal(isPreviewHost('preview.hub.example.com', ''), false);
});

// ── Real HTTP round-trip + changeOrigin ───────────────────────────────
function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function get(port, path = '/', host = 'preview.hub.example.com') {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('proxyHttp forwards the request and rewrites Host to localhost (changeOrigin)', async () => {
  const target = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`hello from ${req.headers.host}`);
  });
  const targetPort = target.address().port;
  const front = await listen((req, res) => proxyHttp(req, res, targetPort));
  const frontPort = front.address().port;
  try {
    const r = await get(frontPort, '/foo');
    assert.equal(r.status, 200);
    // changeOrigin:true → Upstream sieht Host: localhost:<port> (Target-Host), NICHT die Subdomain.
    assert.match(r.body, /^hello from localhost:/);
    assert.ok(!r.body.includes('preview.hub.example.com'), 'subdomain host not forwarded');
  } finally {
    front.close(); target.close();
  }
});

// ── WS-upgrade proxy + express-ws coexistence (load-bearing risk #1) ───
test('attachUpgrade proxies preview-host WS to the active port AND lets Hub WS reach express-ws', async () => {
  // 1) Dummy HMR-Upstream: ws-Server der bei connect "upstream-ok" sendet.
  const upstream = await listen(() => {});
  const upstreamPort = upstream.address().port;
  const upstreamWss = new WebSocketServer({ server: upstream });
  upstreamWss.on('connection', (sock) => sock.send('upstream-ok'));

  // 2) Front-Server stellt die express-ws-Situation nach: ein ws.Server am selben
  //    http.Server + unser attachUpgrade davor. getPort liefert den aktiven Port.
  const front = await listen((req, res) => res.end('http'));
  const frontPort = front.address().port;
  const hubWss = new WebSocketServer({ server: front });           // "express-ws"
  hubWss.on('connection', (sock) => sock.send('hub-ok'));

  attachUpgrade(front, { previewHost: HOST, getPort: () => upstreamPort });

  function wsOnce(path, host) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${frontPort}${path}`, { headers: { host } });
      ws.on('message', (m) => { resolve(String(m)); ws.close(); });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('ws timeout')), 4000);
    });
  }

  try {
    // Preview-Host → proxyWs → Upstream antwortet "upstream-ok".
    const previewMsg = await wsOnce('/', 'preview.hub.example.com');
    assert.equal(previewMsg, 'upstream-ok', 'preview WS proxied to active port');

    // Hub-Host (kein Preview) → express-ws ws.Server antwortet "hub-ok".
    const hubMsg = await wsOnce('/api/terminal/x', 'hub.example.com');
    assert.equal(hubMsg, 'hub-ok', 'hub WS still handled by express-ws');
  } finally {
    upstreamWss.close(); hubWss.close(); upstream.close(); front.close();
  }
});

test('attachUpgrade destroys preview-host WS when no active port', async () => {
  const front = await listen((req, res) => res.end('http'));
  const frontPort = front.address().port;
  const hubWss = new WebSocketServer({ server: front });
  hubWss.on('connection', (sock) => sock.send('hub-ok'));
  attachUpgrade(front, { previewHost: HOST, getPort: () => null });   // kein aktiver Port
  try {
    const outcome = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${frontPort}/`, { headers: { host: 'preview.hub.example.com' } });
      ws.on('open', () => resolve('opened'));
      ws.on('error', () => resolve('refused'));
      ws.on('close', () => resolve('closed'));
      setTimeout(() => resolve('timeout'), 3000);
    });
    assert.ok(outcome === 'refused' || outcome === 'closed', `expected refused/closed, got ${outcome}`);
  } finally {
    hubWss.close(); front.close();
  }
});
