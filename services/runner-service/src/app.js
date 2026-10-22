const express = require('express');
const crypto = require('crypto');
const { buildJob, LANGS } = require('./jobSpec');

// `execute(job)` is injected: Kubernetes Job in production, local process in dev.
function createApp({ execute }) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'runner-service' }));

  app.post('/run', async (req, res) => {
    const { language, code } = req.body || {};
    if (!Object.keys(LANGS).includes(language) || typeof code !== 'string') {
      return res.status(400).json({ error: `language must be one of ${Object.keys(LANGS)} and code must be a string` });
    }
    let job;
    try {
      job = buildJob({ id: crypto.randomBytes(5).toString('hex'), language, code });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    try {
      const started = Date.now();
      const result = await execute(job, { language, code });
      res.json({ ...result, durationMs: Date.now() - started });
    } catch (e) {
      console.error(e.message);
      res.status(502).json({ error: 'sandbox unavailable' });
    }
  });

  return app;
}

module.exports = { createApp };
