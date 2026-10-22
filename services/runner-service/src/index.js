const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('./app');
const { runJob } = require('./k8s');

const mode = process.env.RUNNER_MODE || 'k8s';
const namespace = process.env.SANDBOX_NAMESPACE || 'cloudcode-sandbox';

// DEV ONLY: runs code directly inside this container. Never enable in production.
function localExecute(_job, { language, code }) {
  const bins = { javascript: ['node', 'main.js'], python: ['python3', 'main.py'] };
  const spec = bins[language];
  if (!spec) return Promise.resolve({ output: `local mode does not support ${language}`, exitStatus: 'error' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'));
  fs.writeFileSync(path.join(dir, spec[1]), code);
  return new Promise((resolve) => {
    const p = spawn(spec[0], [spec[1]], { cwd: dir, timeout: 10000 });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => resolve({ output: String(e), exitStatus: 'error' }));
    p.on('close', (c, sig) => {
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ output: out.slice(0, 65536), exitStatus: sig ? 'timeout' : c === 0 ? 'success' : 'error' });
    });
  });
}

const execute = mode === 'local' ? localExecute : (job) => runJob(job, namespace);
const port = process.env.PORT || 4003;
createApp({ execute }).listen(port, () => console.log(`runner-service (${mode}) listening on ${port}`));
