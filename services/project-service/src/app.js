const express = require('express');

const LANGUAGES = ['javascript', 'python', 'cpp'];

// Identity comes from the gateway (x-user-id). This service is only reachable
// from the gateway thanks to the NetworkPolicy, so the header can be trusted.
function createApp({ store }) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'project-service' }));

  app.use((req, res, next) => {
    const uid = req.get('x-user-id');
    if (!uid) return res.status(401).json({ error: 'missing identity' });
    req.userId = uid;
    next();
  });

  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
  const validName = (n) => typeof n === 'string' && /^[\w.\- ]{1,64}$/.test(n);

  app.get('/projects', wrap(async (req, res) => res.json(await store.listProjects(req.userId))));

  app.post('/projects', wrap(async (req, res) => {
    if (!validName(req.body.name)) return res.status(400).json({ error: 'invalid project name' });
    res.status(201).json(await store.createProject(req.userId, req.body.name));
  }));

  app.delete('/projects/:id', wrap(async (req, res) => {
    const ok = await store.deleteProject(req.userId, Number(req.params.id));
    res.status(ok ? 204 : 404).end();
  }));

  app.get('/projects/:id/files', wrap(async (req, res) => {
    const files = await store.listFiles(req.userId, Number(req.params.id));
    if (!files) return res.status(404).json({ error: 'project not found' });
    res.json(files);
  }));

  app.post('/projects/:id/files', wrap(async (req, res) => {
    const { name, language, content } = req.body;
    if (!validName(name)) return res.status(400).json({ error: 'invalid file name' });
    if (!LANGUAGES.includes(language)) return res.status(400).json({ error: `language must be one of ${LANGUAGES}` });
    const file = await store.createFile(req.userId, Number(req.params.id), name, language, content || '');
    if (file === undefined) return res.status(404).json({ error: 'project not found' });
    if (file === null) return res.status(409).json({ error: 'file already exists' });
    res.status(201).json(file);
  }));

  app.put('/files/:id', wrap(async (req, res) => {
    if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content required' });
    const file = await store.updateFile(req.userId, Number(req.params.id), req.body.content);
    if (!file) return res.status(404).json({ error: 'file not found' });
    res.json(file);
  }));

  app.delete('/files/:id', wrap(async (req, res) => {
    const ok = await store.deleteFile(req.userId, Number(req.params.id));
    res.status(ok ? 204 : 404).end();
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp, LANGUAGES };
