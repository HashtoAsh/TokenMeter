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
//
// Hardening (see docs/review-issues.md P2-5 / P3-14 / P3-15 / P3-16):
//   - PORT env var is validated (integer, 1..65535).
//   - Every upstream request is resolved against a fixed base URL and its
//     hostname is checked against an allowlist, so client-controlled "//host"
//     (protocol-relative) paths cannot make this proxy reach arbitrary hosts.
//   - A small concurrency cap protects the upstream mirror; excess requests
//     get an immediate 503 instead of piling up.
//   - Client disconnects abort the upstream body (no leaked connections).

import { createServer } from 'node:http';

// ---- config ----
const PORT_RAW = Number(process.env.PORT || 8765);
const UP = (process.env.UPSTREAM || 'rsproxy').toLowerCase();

if (!Number.isInteger(PORT_RAW) || PORT_RAW < 1 || PORT_RAW > 65535) {
  console.error(`[registry-proxy] invalid PORT: ${process.env.PORT || '(empty)'} (must be an integer in 1..65535)`);
  process.exit(1);
}
const PORT = PORT_RAW;
const MAX_CONCURRENT = 16; // upstream concurrency cap

const UPSTREAMS = {
  rsproxy: {
    index: 'https://rsproxy.cn/index/',
    dl: 'https://rsproxy.cn/api/v1/crates/',
    hosts: new Set(['rsproxy.cn']),
  },
  cratesio: {
    index: 'https://index.crates.io/',
    dl: 'https://static.crates.io/api/v1/crates/',
    hosts: new Set(['index.crates.io', 'static.crates.io']),
  },
};

const up = UPSTREAMS[UP] || UPSTREAMS.rsproxy;
const base = `http://127.0.0.1:${PORT}`;
const ALLOWED_HOSTS = up.hosts;

// ---- upstream fetch with timeout + optional external abort ----
async function fetchUpstream(url, { signal: external } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  try {
    let last;
    for (let i = 1; i <= 3; i++) {
      try {
        const r = await fetch(url, {
          headers: { 'user-agent': 'tokenmeter-registry-proxy', 'accept-encoding': 'identity' },
          redirect: 'follow',
          signal: controller.signal,
        });
        if (r.ok) return r;
        last = new Error(`upstream status ${r.status} ${r.statusText}`);
        if (r.status === 404) return r; // definitive: not present on this mirror
      } catch (e) {
        last = e;
        if (controller.signal.aborted) break; // aborted (timeout / client gone): stop retrying
      }
      if (controller.signal.aborted) break;
      console.log(`[retry ${i}/2] ${url.host}${url.pathname}: ${last.message}`);
      await new Promise((res) => setTimeout(res, 1500 * i));
    }
    throw last;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onAbort);
  }
}

/** Resolve a client path against a fixed base, then enforce the hostname allowlist. */
function resolveUpstream(rawPath) {
  // Reject protocol-relative ("//host/...") paths outright: they would resolve
  // against a client-chosen authority.
  if (rawPath.startsWith('//')) return null;
  let upstream;
  if (rawPath.startsWith('/api/v1/crates/')) {
    upstream = new URL(rawPath.slice('/api/v1/crates/'.length), up.dl);
  } else if (rawPath.startsWith('/')) {
    upstream = new URL(rawPath.slice(1), up.index);
  } else {
    return null;
  }
  if (!ALLOWED_HOSTS.has(upstream.hostname)) return null;
  return upstream;
}

let active = 0;
const server = createServer(async (req, res) => {
  const t0 = Date.now();
  const log = (msg) => console.log(`[${Date.now() - t0}ms] ${req.method} ${req.url} ${msg}`);

  let done = false;
  const controller = new AbortController();
  const onClose = () => {
    if (!done) {
      done = true; // client gone: stop relaying and free the concurrency slot
      controller.abort();
    }
  };
  res.on('close', onClose);

  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('method not allowed');
    return;
  }

  try {
    if (active >= MAX_CONCURRENT) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('registry proxy busy, retry later');
      return;
    }
    active++;
    try {
      const path = req.url.split('?')[0];

      if (path === '/config.json') {
        const upstream = new URL('config.json', up.index);
        const r = await fetchUpstream(upstream, { signal: controller.signal });
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

      const upstream = resolveUpstream(path);
      if (!upstream) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('bad path');
        log('rejected (hostname/path not allowed)');
        return;
      }
      log(`-> ${upstream.href}`);

      const r = await fetchUpstream(upstream, { signal: controller.signal });
      log(`upstream ${r.status}`);
      if (!r.ok || !r.body) {
        res.writeHead(r.status);
        res.end(`upstream ${r.status} ${r.statusText}`);
        return;
      }
      const isJson = !path.startsWith('/api/v1/crates/');
      res.writeHead(200, { 'content-type': isJson ? 'application/json' : 'application/octet-stream' });
      let n = 0;
      for await (const chunk of r.body) {
        if (res.destroyed) break; // client already gone; abort relay
        res.write(chunk);
        n += chunk.length;
      }
      res.end();
      log(`sent ${n} bytes`);
    } finally {
      active--;
      if (!done) {
        done = true;
        res.removeListener('close', onClose);
      }
    }
  } catch (e) {
    log(`ERROR ${e.message}`);
    if (!res.headersSent && !res.destroyed) {
      try {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`proxy error: ${e.message}`);
      } catch { /* ignore */ }
    }
  } finally {
    // ensure upstream aborts even on unexpected paths (e.g. relay throw)
    if (!done) {
      done = true;
      res.removeListener('close', onClose);
    }
    controller.abort();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[registry-proxy] ${base} -> ${UP === 'rsproxy' ? 'rsproxy.cn' : 'crates.io'}`);
  console.log(`  index: ${up.index}   dl: ${up.dl}   maxConcurrent: ${MAX_CONCURRENT}`);
});
