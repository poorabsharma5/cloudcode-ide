const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./app');

function memoryStore() {
  let pid = 0, fid = 0;
  const projects = [], files = [];
  return {
    async listProjects(uid) { return projects.filter((p) => p.owner === uid); },
    async createProject(uid, name) { const p = { id: ++pid, owner: uid, name }; projects.push(p); return p; },
    async deleteProject() { return false; },
    async listFiles(uid, id) {
      return projects.some((p) => p.id === id && p.owner === uid) ? files.filter((f) => f.project_id === id) : null;
    },
    async createFile(uid, id, name, language, content) {
      if (!projects.some((p) => p.id === id && p.owner === uid)) return undefined;
      const f = { id: ++fid, project_id: id, name, language, content };
      files.push(f);
      return f;
    },
    async updateFile(_uid, id, content) { const f = files.find((x) => x.id === id); if (f) f.content = content; return f; },
    async deleteFile() { return false; },
  };
}

async function withServer(fn) {
  const server = createApp({ store: memoryStore() }).listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

const call = (url, method, uid, body) =>
  fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(uid ? { 'x-user-id': uid } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('requests without identity are rejected', async () => {
  await withServer(async (base) => assert.strictEqual((await call(`${base}/projects`, 'GET')).status, 401));
});

test('create project, add file, edit file', async () => {
  await withServer(async (base) => {
    const p = await (await call(`${base}/projects`, 'POST', '1', { name: 'demo' })).json();
    const f = await (await call(`${base}/projects/${p.id}/files`, 'POST', '1', { name: 'main.py', language: 'python', content: 'print(1)' })).json();
    assert.strictEqual(f.name, 'main.py');
    const u = await (await call(`${base}/files/${f.id}`, 'PUT', '1', { content: 'print(2)' })).json();
    assert.strictEqual(u.content, 'print(2)');
  });
});

test("users cannot see each other's projects", async () => {
  await withServer(async (base) => {
    const p = await (await call(`${base}/projects`, 'POST', '1', { name: 'secret' })).json();
    assert.strictEqual((await call(`${base}/projects/${p.id}/files`, 'GET', '2')).status, 404);
  });
});

test('unsupported language rejected', async () => {
  await withServer(async (base) => {
    const p = await (await call(`${base}/projects`, 'POST', '1', { name: 'x' })).json();
    const r = await call(`${base}/projects/${p.id}/files`, 'POST', '1', { name: 'a.rb', language: 'ruby' });
    assert.strictEqual(r.status, 400);
  });
});
