// lib/preview-proxy.js — Reverse-Proxy für lokale Dev-Server (HMR) über
// die Wildcard-Subdomain <port>.preview.<PREVIEW_DOMAIN>. Express-frei.
// Forwarding via http-proxy (HTTP + WS-Upgrade). hostToPort ist der reine,
// getestete Parser; der SSRF-Guard (isListening) wird vom Caller injiziert.
import httpProxy from 'http-proxy';

// host: "5173.preview.hub.example.com[:443]"; baseDomain: "preview.hub.example.com".
// → 5173 | null. Validiert Port-Range 1024–65535, lehnt Fremd-Hosts ab.
export function hostToPort(host, baseDomain) {
  if (typeof host !== 'string' || !host) return null;
  const clean = host.split(':')[0].toLowerCase();        // :port-Suffix abschneiden
  const suffix = '.' + baseDomain.toLowerCase();
  if (!clean.endsWith(suffix)) return null;              // Fremd-Host → null
  const label = clean.slice(0, clean.length - suffix.length);
  if (!label || label.includes('.')) return null;        // genau ein Label vor .preview…
  if (!/^\d+$/.test(label)) return null;                 // nicht-numerisch → null
  const port = parseInt(label, 10);
  if (port < 1024 || port > 65535) return null;          // out-of-range → null
  return port;
}

// Singleton-Proxy. changeOrigin schreibt den Upstream-Host auf localhost:<port>
// (umgeht Vites allowedHosts-Reject + host-abhängige Dev-Server). ws:true für HMR.
let _proxy = null;
export function makeProxy() {
  if (_proxy) return _proxy;
  _proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: false });
  _proxy.on('error', (err, req, res) => {
    // res ist bei WS-Fehlern ein Socket → kein writeHead. Defensive Behandlung.
    try {
      if (res && typeof res.writeHead === 'function') {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('preview upstream error');
      } else if (res && typeof res.destroy === 'function') {
        res.destroy();
      }
    } catch { /* socket already gone */ }
  });
  return _proxy;
}

export function proxyHttp(req, res, port) {
  makeProxy().web(req, res, { target: `http://127.0.0.1:${port}` });
}

export function proxyWs(req, socket, head, port) {
  makeProxy().ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
}

// WS-Upgrade-Dispatch, der mit express-ws koexistiert.
//
// Node feuert ALLE 'upgrade'-Listener — ein blosses prependListener reicht NICHT:
// der von express-ws via `new ws.Server({ server })` angehängte Listener würde
// JEDEN Upgrade (auch Preview-Hosts) mit-handshaken und mit proxyWs um den Socket
// rennen. Deshalb übernehmen wir den Upgrade-Pfad exklusiv: die bestehenden
// Listener (= express-ws) abgreifen, entfernen, und einen einzigen Dispatcher
// installieren, der Preview-Hosts an proxyWs gibt und alles andere an die
// ursprünglichen Listener DELEGIERT. So ist genau ein Pfad pro Upgrade aktiv.
// → attachUpgrade MUSS nach `const server = app.listen()` (express-ws hat dann
//   seinen Listener bereits angehängt) aufgerufen werden.
export function attachUpgrade(server, { baseDomain, isListening }) {
  const existing = server.listeners('upgrade').slice();   // express-ws-Listener
  server.removeAllListeners('upgrade');
  server.on('upgrade', (req, socket, head) => {
    const port = hostToPort(req.headers.host, baseDomain);
    if (port == null) {
      // Hub-WS (/api/terminal, /api/files/events, …) → an express-ws delegieren.
      for (const fn of existing) fn.call(server, req, socket, head);
      return;
    }
    if (!isListening(port)) { socket.destroy(); return; }
    proxyWs(req, socket, head, port);                 // konsumiert den Socket exklusiv
  });
}
