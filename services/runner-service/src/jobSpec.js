// Builds the Kubernetes Job that runs one piece of untrusted code.
// Every hardening decision lives here so it can be unit tested and reviewed.
const LANGS = {
  javascript: { image: 'node:20-alpine', file: 'main.js', cmd: 'node /tmp/main.js' },
  python: { image: 'python:3.12-alpine', file: 'main.py', cmd: 'python /tmp/main.py' },
  cpp: { image: 'gcc:13', file: 'main.cpp', cmd: 'g++ -O1 -o /tmp/main /tmp/main.cpp && /tmp/main' },
};

const MAX_CODE_BYTES = 100 * 1024;

function buildJob({ id, language, code, timeoutSeconds = 10 }) {
  const lang = LANGS[language];
  if (!lang) throw new Error(`unsupported language: ${language}`);
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) throw new Error('code too large');

  const script = `echo "$CODE_B64" | base64 -d > /tmp/${lang.file} && ${lang.cmd}`;
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: `run-${id}`, labels: { app: 'cloudcode-sandbox' } },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: timeoutSeconds,
      ttlSecondsAfterFinished: 60,
      template: {
        metadata: { labels: { app: 'cloudcode-sandbox' } },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          enableServiceLinks: false,
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 10001,
            runAsGroup: 10001,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'run',
              image: lang.image,
              imagePullPolicy: 'IfNotPresent',
              command: ['sh', '-c', script],
              env: [{ name: 'CODE_B64', value: Buffer.from(code).toString('base64') }],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
              },
              resources: {
                requests: { cpu: '50m', memory: '32Mi' },
                limits: { cpu: '500m', memory: '256Mi', 'ephemeral-storage': '64Mi' },
              },
              volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }],
            },
          ],
          volumes: [{ name: 'tmp', emptyDir: { medium: 'Memory', sizeLimit: '32Mi' } }],
        },
      },
    },
  };
}

module.exports = { buildJob, LANGS, MAX_CODE_BYTES };
