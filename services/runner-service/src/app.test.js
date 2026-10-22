const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./app');
const { buildJob } = require('./jobSpec');

test('job spec is hardened', () => {
  const job = buildJob({ id: 'abc', language: 'python', code: 'print(1)' });
  const pod = job.spec.template.spec;
  const c = pod.containers[0];
  assert.strictEqual(job.spec.activeDeadlineSeconds, 10);
  assert.strictEqual(pod.securityContext.runAsNonRoot, true);
  assert.strictEqual(pod.automountServiceAccountToken, false);
  assert.strictEqual(c.securityContext.readOnlyRootFilesystem, true);
  assert.strictEqual(c.securityContext.allowPrivilegeEscalation, false);
  assert.deepStrictEqual(c.securityContext.capabilities.drop, ['ALL']);
  assert.ok(c.resources.limits.memory && c.resources.limits.cpu);
});

test('code is passed base64 encoded, never interpolated into the shell', () => {
  const evil = '"; rm -rf / #';
  const c = buildJob({ id: 'x', language: 'javascript', code: evil }).spec.template.spec.containers[0];
  assert.ok(!c.command.join(' ').includes('rm -rf'));
  assert.strictEqual(Buffer.from(c.env[0].value, 'base64').toString(), evil);
});

test('oversized code and unknown languages are rejected', () => {
  assert.throws(() => buildJob({ id: 'x', language: 'python', code: 'a'.repeat(200 * 1024) }));
  assert.throws(() => buildJob({ id: 'x', language: 'ruby', code: '1' }));
});

test('POST /run validates input and returns executor result', async () => {
  const server = createApp({ execute: async () => ({ output: 'hi\n', exitStatus: 'success' }) }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bad = await fetch(`${base}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'ruby', code: '1' }) });
    assert.strictEqual(bad.status, 400);
    const ok = await fetch(`${base}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'python', code: 'print("hi")' }) });
    const body = await ok.json();
    assert.strictEqual(body.output, 'hi\n');
    assert.strictEqual(body.exitStatus, 'success');
  } finally { server.close(); }
});
