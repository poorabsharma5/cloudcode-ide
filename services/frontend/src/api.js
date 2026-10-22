const TOKEN_KEY = 'cloudcode_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export const LANGUAGES = {
  javascript: { label: 'JavaScript', ext: 'js', monaco: 'javascript', starter: 'console.log("Hello from CloudCode!");\n' },
  python: { label: 'Python', ext: 'py', monaco: 'python', starter: 'print("Hello from CloudCode!")\n' },
  cpp: {
    label: 'C++',
    ext: 'cpp',
    monaco: 'cpp',
    starter: '#include <iostream>\n\nint main() {\n  std::cout << "Hello from CloudCode!" << std::endl;\n  return 0;\n}\n',
  },
};

export function statusLabel(exitStatus) {
  return { success: 'Finished', error: 'Exited with error', timeout: 'Timed out (10s limit)' }[exitStatus] || exitStatus;
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
