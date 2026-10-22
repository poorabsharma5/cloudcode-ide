const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const { createApp } = require('./app');

// A fake upstream that echoes the path and the identity header it received.
function fakeUpstream() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ path: req.url, uid: req.headers['x-user-id'] || null }));
    }).listen(0, () => resolve(s));
  });
}

test('gateway auth + routing', async () => {
  const up = await fakeUpstream();
  const url = `http://127.0.0.1:${up.address().port}`;
  const gw = createApp({ jwtSecret: 's3cret', targets: { auth: url, projects: url, runner: url } }).listen(0);
  const base = `http://127.0.0.1:${gw.address().port}`;
  try {
    // protected route without token
    assert.strictEqual((await fetch(`${base}/api/projects`)).status, 401);

    // valid token: path rewritten, identity injected
    const token = jwt.sign({ sub: '42' }, 's3cret');
    const ok = await (await fetch(`${base}/api/projects/1/files`, { headers: { authorization: `Bearer ${token}` } })).json();
    assert.strictEqual(ok.path, '/projects/1/files');
    assert.strictEqual(ok.uid, '42');

    // spoofed identity header cannot override the token's subject
    const spoof = await (await fetch(`${base}/api/projects`, { headers: { authorization: `Bearer ${token}`, 'x-user-id': '1' } })).json();
    assert.strictEqual(spoof.uid, '42');

    // token signed with another key is rejected
    const forged = jwt.sign({ sub: '1' }, 'other');
    assert.strictEqual((await fetch(`${base}/api/run`, { method: 'POST', headers: { authorization: `Bearer ${forged}` } })).status, 401);

    // auth routes are public
    const a = await (await fetch(`${base}/api/auth/login`)).json();
    assert.strictEqual(a.path, '/login');
  } finally {
    gw.close();
    up.close();
  }
});
