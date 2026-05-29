import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';        // default export IS the WebSocket class
const WebSocketServer = WebSocket.Server;
import { hostToPort, proxyHttp, attachUpgrade } from './preview-proxy.js';

const BASE = 'preview.hub.example.com';

test('hostToPort extracts a valid port from a preview subdomain', () => {
  assert.equal(hostToPort('5173.preview.hub.example.com', BASE), 5173);
});

test('hostToPort strips a :port suffix on the Host header', () => {
  assert.equal(hostToPort('5173.preview.hub.example.com:443', BASE), 5173);
});

test('hostToPort rejects foreign hosts (the Hub itself)', () => {
  assert.equal(hostToPort('hub.example.com', BASE), null);
  assert.equal(hostToPort('preview.hub.example.com', BASE), null); // no port label
  assert.equal(hostToPort('5173.preview.evil.com', BASE), null);
});

test('hostToPort rejects out-of-range and non-numeric first labels', () => {
  assert.equal(hostToPort('80.preview.hub.example.com', BASE), null);      // privileged
  assert.equal(hostToPort('99999.preview.hub.example.com', BASE), null);   // > 65535
  assert.equal(hostToPort('app.preview.hub.example.com', BASE), null);     // non-numeric
});

test('hostToPort tolerates missing/garbage host', () => {
  assert.equal(hostToPort(undefined, BASE), null);
  assert.equal(hostToPort('', BASE), null);
});

// ── Real HTTP round-trip + changeOrigin ───────────────────────────────
function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function get(port, path = '/', host = '5173.preview.hub.example.com') {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('proxyHttp forwards the request and rewrites Host to localhost (changeOrigin)', async () => {
  // Upstream-Target spiegelt den empfangenen Host-Header zurück.
  const target = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`hello from ${req.headers.host}`);
  });
  const targetPort = target.address().port;

  // Front-Server, der wie der Hub-Host-Dispatch alles an proxyHttp(targetPort) gibt.
  const front = await listen((req, res) => proxyHttp(req, res, targetPort));
  const frontPort = front.address().port;

  try {
    const r = await get(frontPort, '/foo');
    assert.equal(r.status, 200);
    // changeOrigin:true → Upstream sieht Host: 127.0.0.1:<targetPort>, NICHT die Subdomain.
    assert.match(r.body, /^hello from 127\.0\.0\.1:/);
    assert.ok(!r.body.includes('preview.hub.example.com'), 'subdomain host not forwarded');
  } finally {
    front.close(); target.close();
  }
});

// ── WS-upgrade proxy + express-ws coexistence (load-bearing risk #1) ───
test('attachUpgrade proxies preview WS to upstream AND lets Hub WS reach express-ws', async () => {
  // 1) Dummy HMR-Upstream: ws-Server der bei connect "upstream-ok" sendet.
  const upstream = await listen(() => {});
  const upstreamPort = upstream.address().port;
  const upstreamWss = new WebSocketServer({ server: upstream });
  upstreamWss.on('connection', (sock) => sock.send('upstream-ok'));

  // 2) Front-Server, der die express-ws-Situation nachstellt: ein ws.Server,
  //    der auf demselben http.Server lauscht (wie expressWs es tut) + unser
  //    attachUpgrade davor.
  const front = await listen((req, res) => res.end('http'));
  const frontPort = front.address().port;
  const hubWss = new WebSocketServer({ server: front });           // "express-ws"
  hubWss.on('connection', (sock) => sock.send('hub-ok'));

  // isListening meldet nur upstreamPort als lauschend (SSRF-Guard).
  attachUpgrade(front, {
    baseDomain: BASE,
    isListening: (p) => p === upstreamPort,
  });

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
    const previewMsg = await wsOnce('/', `${upstreamPort}.preview.hub.example.com`);
    assert.equal(previewMsg, 'upstream-ok', 'preview WS proxied to upstream');

    // Hub-Host (kein Preview) → express-ws ws.Server antwortet "hub-ok".
    const hubMsg = await wsOnce('/api/terminal/x', 'hub.example.com');
    assert.equal(hubMsg, 'hub-ok', 'hub WS still handled by express-ws');
  } finally {
    upstreamWss.close(); hubWss.close(); upstream.close(); front.close();
  }
});
