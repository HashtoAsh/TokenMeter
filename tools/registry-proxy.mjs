// Local sparse-registry proxy for cargo.
//
// Why: in some sandboxed/CI Windows environments the schannel TLS backend used
// by cargo (and .NET / curl.exe) fails with SEC_E_NO_CREDENTIALS, while Node's
// OpenSSL-based fetch works fine. This tiny no-dependency server exposes the
// cargo sparse registry over plain http://127.0.0.1 and does all TLS upstream
// itself, so `cargo build` works in those environments.
//
// Usage:  node tools/registry-proxy.mjs          (defaults: port 8765, upstream rsproxy)
//         PORT=8765 UPSTREAM=cratesio node tools/registry-proxy.mjs
// Then point cargo at it, e.g.:
//   cargo build --config 'source.crates-io.replace-with="local"' \
//               --config 'source.local.registry="sparse+http://127.0.0.1:8765/"'
//
// Checksums are verified by cargo itself, so plain http transport is safe here.

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8765);
const UP = (process.env.UPSTREAM || 'rsproxy').toLowerCase();

const UPSTREAMS = {
  // rsproxy.cn: China mirror of crates.io (sparse index + downloads follow the
  // crates.io convention: index under /index/, downloads under /api/v1/crates/)
  rsproxy: {
    index: 'https://rsproxy.cn/index/',
    dl: 'https://rsproxy.cn/api/v1/crates/',
  },
  cratesio: {
    index: 'https://index.crates.io/',
    dl: 'https://static.crates.io/api/v1/crates/',
  },
};

const up = UPSTREAMS[UP] || UPSTREAMS.rsproxy;
const base = `http://127.0.0.1:${PORT}`;

// Fetch upstream with a hard timeout and a few retries, so a stalled mirror
// connection (which otherwise makes cargo abort with "transfer too slow")
// turns into a clean retried request instead.
async function fetchUpstream(url, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': 'tokenmeter-registry-proxy', 'accept-encoding': 'identity' },
        redirect: 'follow',
        signal: AbortSignal.timeout(120000),
      });
      if (r.ok) return r;
      last = new Error(`upstream status ${r.status} ${r.statusText}`);
      if (r.status === 404) return r; // definitive: not present on this mirror
    } catch (e) {
      last = e;
    }
    console.log(`[retry ${i}/${attempts - 1}] ${url.host}${url.pathname}: ${last.message}`);
    await new Promise((res) => setTimeout(res, 1500 * i));
  }
  throw last;
}

const server = createServer(async (req, res) => {
  const t0 = Date.now();
  const log = (msg) => console.log(`[${Date.now() - t0}ms] ${req.method} ${req.url} ${msg}`);
  try {
    const path = req.url.split('?')[0];

    if (path === '/config.json') {
      // Serve the registry index config but rewrite "dl"/"api" to point at us,
      // so crate downloads also flow through this proxy.
      const r = await fetchUpstream(new URL('config.json', up.index));
      const text = await r.text();
      let cfg;
      try { cfg = JSON.parse(text); } catch { cfg = {}; }
      cfg.dl = `${base}/api/v1/crates`;
      cfg.api = base;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(cfg));
      log(`sent ${JSON.stringify(cfg).length} bytes`);
      return;
    }

    let upstream;
    if (path.startsWith('/api/v1/crates/')) {
      // Crate download request -> upstream download endpoint.
      // Strip the leading /api/v1/crates/ prefix; up.dl already ends in it.
      upstream = new URL(path.slice('/api/v1/crates/'.length), up.dl);
    } else if (path.startsWith('/')) {
      // Sparse index per-crate file, e.g. /ta/ur/tauri -> upstream index dir.
      upstream = new URL(path.slice(1), up.index);
    } else {
      res.writeHead(400);
      res.end('bad path');
      return;
    }
    log(`-> ${upstream.href}`);

    const r = await fetchUpstream(upstream);
    log(`upstream ${r.status}`);
    if (!r.ok || !r.body) {
      res.writeHead(r.status);
      res.end(`upstream ${r.status} ${r.statusText}`);
      return;
    }
    const isJson = !path.startsWith('/api/v1/crates/');
    res.writeHead(200, { 'content-type': isJson ? 'application/json' : 'application/octet-stream' });
    let n = 0;
    for await (const chunk of r.body) { res.write(chunk); n += chunk.length; }
    res.end();
    log(`sent ${n} bytes`);
  } catch (e) {
    log(`ERROR ${e.message}`);
    try {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy error: ${e.message}`);
    } catch {}
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[registry-proxy] ${base} -> ${UP === 'rsproxy' ? 'rsproxy.cn' : 'crates.io'}`);
  console.log(`  index: ${up.index}   dl: ${up.dl}`);
});
