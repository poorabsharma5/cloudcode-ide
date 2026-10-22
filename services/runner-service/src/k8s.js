// Minimal Kubernetes REST client using the in-cluster service account.
// Avoids a heavy SDK: the runner only needs create/get/delete Job and read pod logs.
const https = require('https');
const fs = require('fs');

const SA = '/var/run/secrets/kubernetes.io/serviceaccount';

function client() {
  const token = fs.readFileSync(`${SA}/token`, 'utf8');
  const ca = fs.readFileSync(`${SA}/ca.crt`);
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT || 443;

  return function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = https.request(
        {
          host, port, path, method, ca,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          },
        },
        (res) => {
          let buf = '';
          res.on('data', (c) => (buf += c));
          res.on('end', () => {
            if (res.statusCode >= 400) return reject(new Error(`k8s ${method} ${path} -> ${res.statusCode}: ${buf.slice(0, 200)}`));
            try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  };
}

async function runJob(job, namespace, waitMs = 20000) {
  const k = client();
  const name = job.metadata.name;
  await k('POST', `/apis/batch/v1/namespaces/${namespace}/jobs`, job);

  const deadline = Date.now() + waitMs;
  let status = {};
  try {
    while (Date.now() < deadline) {
      status = (await k('GET', `/apis/batch/v1/namespaces/${namespace}/jobs/${name}`)).status || {};
      if (status.succeeded || status.failed) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    let output = '';
    const pods = await k('GET', `/api/v1/namespaces/${namespace}/pods?labelSelector=job-name%3D${name}`);
    const pod = pods.items && pods.items[0];
    if (pod) {
      try {
        output = await k('GET', `/api/v1/namespaces/${namespace}/pods/${pod.metadata.name}/log?limitBytes=65536`);
      } catch (e) {
        output = ''; // pod never started (e.g. image pull) or already gone
      }
    }
    const timedOut = (status.conditions || []).some((c) => c.reason === 'DeadlineExceeded');
    return {
      output: typeof output === 'string' ? output : JSON.stringify(output),
      exitStatus: status.succeeded ? 'success' : timedOut ? 'timeout' : status.failed ? 'error' : 'timeout',
    };
  } finally {
    k('DELETE', `/apis/batch/v1/namespaces/${namespace}/jobs/${name}?propagationPolicy=Background`).catch(() => {});
  }
}

module.exports = { runJob };
