const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const http = require('http');

// Single entry point: verifies the JWT, injects a trusted x-user-id header and
// forwards to the internal services. Downstream services never see raw tokens.
function createApp({ jwtSecret, targets, trustProxyHops = 2 }) {
  const app = express();
  app.disable('x-powered-by');
  // Behind cloudflared -> nginx (frontend) -> gateway. Trust exactly that many hops so
  // clients cannot spoof X-Forwarded-For to dodge the rate limiter.
  app.set('trust proxy', trustProxyHops);

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

  const requireAuth = (req, res, next) => {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    try {
      const claims = jwt.verify(token, jwtSecret);
      req.headers['x-user-id'] = claims.sub; // overwrites anything the client sent
      next();
    } catch {
      res.status(401).json({ error: 'invalid or missing token' });
    }
  };

  // Minimal streaming reverse proxy. Express strips the mount path (/api/x) before
  // the handler runs, so the upstream prefix is re-added here. Request and response
  // bodies are piped, never buffered.
  const proxy = (target, prefix = '') => {
    const base = new URL(target);
    return (req, res) => {
      const upstream = http.request(
        {
          hostname: base.hostname,
          port: base.port || 80,
          method: req.method,
          path: prefix + req.url,
          headers: { ...req.headers, host: base.host },
        },
        (up) => {
          res.writeHead(up.statusCode, up.headers);
          up.pipe(res);
        }
      );
      upstream.setTimeout(30_000, () => upstream.destroy(new Error('upstream timeout')));
      upstream.on('error', () => {
        if (!res.headersSent) res.status(502).json({ error: 'upstream unavailable' });
        else res.destroy();
      });
      req.pipe(upstream);
    };
  };

  const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
  const runLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

  app.use('/api/auth', authLimiter, proxy(targets.auth));
  app.use('/api/projects', requireAuth, proxy(targets.projects, '/projects'));
  app.use('/api/files', requireAuth, proxy(targets.projects, '/files'));
  app.use('/api/run', requireAuth, runLimiter, proxy(targets.runner, '/run'));

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));
  return app;
}

module.exports = { createApp };
