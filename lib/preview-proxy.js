// lib/preview-proxy.js — Reverse-Proxy für einen lokalen Dev-Server (HMR) über
// EINEN festen Preview-Host (z.B. "preview.code.derremo.xyz"). Express-frei.
//
// Single-Host-Modell (statt <port>.preview.<domain>): der Host bleibt eine Ebene
// flach → vom bestehenden Universal-SSL-Wildcard *.<domain> gedeckt, kein ACM,
// kein Catch-all. Welcher localhost-Port hinter dem Host steckt, kommt aus
// externem State (getPort), den der Hub über POST /api/preview/select setzt.
// Forwarding via http-proxy (HTTP + WS-Upgrade) mit changeOrigin (Host→localhost).
import httpProxy from 'http-proxy';

// Exact-Match auf den fixen Preview-Host. Strippt optionalen :port-Suffix,
// case-insensitive. previewHost z.B. "preview.code.derremo.xyz".
export function isPreviewHost(host, previewHost) {
  if (typeof host !== 'string' || !host || !previewHost) return false;
  return host.split(':')[0].toLowerCase() === previewHost.toLowerCase();
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

// Der Hub hängt an die iframe-URL einen eigenen Cache-Bust-Param `?__penates=<port>`
// (PreviewPanel — erzwingt ein iframe-Reload beim Port-Wechsel, weil die Host-URL
// sonst identisch bliebe und nicht neu lädt). Manche Upstreams routen per exaktem
// `req.url`-Match und liefern für `/?__penates=…` ein 404 statt der Indexseite (z.B.
// einfache statische Server). Vor dem Forwarding strippen wir deshalb NUR diesen
// Hub-eigenen Param — fremde Query-Parameter echter Dev-Server bleiben unangetastet.
export function stripCachebust(url) {
  if (typeof url !== 'string') return url;
  const qi = url.indexOf('?');
  if (qi === -1) return url;
  const params = new URLSearchParams(url.slice(qi + 1));
  if (!params.has('__penates')) return url;        // nichts zu tun
  params.delete('__penates');
  const q = params.toString();
  return q ? `${url.slice(0, qi)}?${q}` : url.slice(0, qi);
}

// Target ist `localhost` (NICHT 127.0.0.1): Node wählt per Happy-Eyeballs
// automatisch IPv4 ODER IPv6 — Dev-Server, die nur auf [::1] lauschen (z.B.
// Vite/Node, die `localhost` an ::1 binden), wären sonst über 127.0.0.1
// nicht erreichbar (Connection refused → 502).
export function proxyHttp(req, res, port) {
  req.url = stripCachebust(req.url);
  makeProxy().web(req, res, { target: `http://localhost:${port}` });
}

export function proxyWs(req, socket, head, port) {
  makeProxy().ws(req, socket, head, { target: `http://localhost:${port}` });
}

// WS-Upgrade-Dispatch, der mit express-ws koexistiert.
//
// Node feuert ALLE 'upgrade'-Listener — ein blosses prependListener reicht NICHT:
// der von express-ws via `new ws.Server({ server })` angehängte Listener würde
// JEDEN Upgrade (auch den Preview-Host) mit-handshaken und mit proxyWs um den
// Socket rennen. Deshalb übernehmen wir den Upgrade-Pfad exklusiv: die bestehenden
// Listener (= express-ws) abgreifen, entfernen, und einen einzigen Dispatcher
// installieren, der den Preview-Host an proxyWs gibt und alles andere an die
// ursprünglichen Listener DELEGIERT. So ist genau ein Pfad pro Upgrade aktiv.
// → attachUpgrade MUSS nach `const server = app.listen()` aufgerufen werden.
// getPort() liefert den aktuell gewählten, lauschenden Port oder null.
export function attachUpgrade(server, { previewHost, getPort }) {
  const existing = server.listeners('upgrade').slice();   // express-ws-Listener
  server.removeAllListeners('upgrade');
  server.on('upgrade', (req, socket, head) => {
    if (isPreviewHost(req.headers.host, previewHost)) {
      const port = getPort();
      if (port == null) { socket.destroy(); return; }   // kein aktiver Port → kein HMR
      proxyWs(req, socket, head, port);                  // konsumiert den Socket exklusiv
      return;
    }
    // Hub-WS (/api/terminal, /api/files/events, …) → an express-ws delegieren.
    for (const fn of existing) fn.call(server, req, socket, head);
  });
}
