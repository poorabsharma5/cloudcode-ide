const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Single entry point: verifies the JWT, injects a trusted x-user-id header and
// forwards to the internal services. Downstream services never see raw tokens.
function createApp({ jwtSecret, targets }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

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

  // Express strips the mount path (/api/x) before the proxy sees the URL, so we
  // re-add the upstream prefix here.
  const proxy = (target, prefix = '') =>
    createProxyMiddleware({ target, changeOrigin: true, pathRewrite: (p) => prefix + p, on: { error: (_e, _q, res) => res.writeHead && res.writeHead(502).end('{"error":"upstream unavailable"}') } });

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
