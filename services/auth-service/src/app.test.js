const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { createApp } = require('./app');

function memoryStore() {
  const users = new Map();
  return {
    async createUser(username, hash) {
      if (users.has(username)) return null;
      const u = { id: users.size + 1, username, password_hash: hash };
      users.set(username, u);
      return u;
    },
    async findUser(username) {
      return users.get(username);
    },
  };
}

async function withServer(fn) {
  const app = createApp({ store: memoryStore(), jwtSecret: 'test-secret' });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('register returns a signed token', async () => {
  await withServer(async (base) => {
    const res = await post(`${base}/register`, { username: 'alice', password: 'secret1' });
    assert.strictEqual(res.status, 201);
    const { token } = await res.json();
    assert.strictEqual(jwt.verify(token, 'test-secret').username, 'alice');
  });
});

test('duplicate username is rejected', async () => {
  await withServer(async (base) => {
    await post(`${base}/register`, { username: 'bob', password: 'secret1' });
    const res = await post(`${base}/register`, { username: 'bob', password: 'secret1' });
    assert.strictEqual(res.status, 409);
  });
});

test('login fails with wrong password and works with right one', async () => {
  await withServer(async (base) => {
    await post(`${base}/register`, { username: 'carol', password: 'secret1' });
    assert.strictEqual((await post(`${base}/login`, { username: 'carol', password: 'nope-nope' })).status, 401);
    assert.strictEqual((await post(`${base}/login`, { username: 'carol', password: 'secret1' })).status, 200);
  });
});

test('weak input is rejected', async () => {
  await withServer(async (base) => {
    assert.strictEqual((await post(`${base}/register`, { username: 'x', password: '1' })).status, 400);
  });
});
