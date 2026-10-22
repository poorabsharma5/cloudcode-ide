const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// `store` abstracts persistence so the routes can be unit tested without Postgres.
function createApp({ store, jwtSecret }) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

  const validCreds = (b) =>
    b &&
    typeof b.username === 'string' &&
    /^[a-zA-Z0-9_]{3,32}$/.test(b.username) &&
    typeof b.password === 'string' &&
    b.password.length >= 6 &&
    b.password.length <= 128;

  const sign = (user) =>
    jwt.sign({ sub: String(user.id), username: user.username }, jwtSecret, { expiresIn: '12h' });

  app.post('/register', async (req, res) => {
    if (!validCreds(req.body)) {
      return res.status(400).json({ error: 'username (3-32 alphanumeric) and password (6+ chars) required' });
    }
    const hash = await bcrypt.hash(req.body.password, 10);
    const user = await store.createUser(req.body.username, hash);
    if (!user) return res.status(409).json({ error: 'username already taken' });
    res.status(201).json({ token: sign(user), username: user.username });
  });

  app.post('/login', async (req, res) => {
    if (!validCreds(req.body)) return res.status(400).json({ error: 'invalid credentials format' });
    const user = await store.findUser(req.body.username);
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ error: 'wrong username or password' });
    }
    res.json({ token: sign(user), username: user.username });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
