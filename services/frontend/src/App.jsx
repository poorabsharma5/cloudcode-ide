import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { api, getToken, setToken, LANGUAGES, statusLabel } from './api.js';

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: form });
      setToken(data.token);
      onAuth(data.username);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth">
      <form onSubmit={submit} className="auth-card">
        <div className="logo">⚡ CloudCode</div>
        <p className="muted">Write, run and ship code from your browser. Every run executes in an isolated Kubernetes sandbox.</p>
        <input placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
        <input type="password" placeholder="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div className="error">{error}</div>}
        <button className="primary">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}

function Workspace({ username, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [active, setActive] = useState(null);
  const [code, setCode] = useState('');
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const activeRef = useRef(null);
  activeRef.current = active;

  const guard = useCallback(async (fn) => {
    try {
      setError('');
      return await fn();
    } catch (e) {
      if (e.status === 401) return onLogout();
      setError(e.message);
    }
  }, [onLogout]);

  const loadProjects = useCallback(() => guard(async () => setProjects(await api('/projects'))), [guard]);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const openProject = (p) => guard(async () => {
    setProject(p);
    const list = await api(`/projects/${p.id}/files`);
    setFiles(list);
    selectFile(list[0] || null);
  });

  const selectFile = (f) => { setActive(f); setCode(f ? f.content : ''); setDirty(false); setResult(null); };

  const newProject = () => {
    const name = prompt('Project name');
    if (!name) return;
    guard(async () => {
      const p = await api('/projects', { method: 'POST', body: { name } });
      await loadProjects();
      await openProject(p);
    });
  };

  const newFile = () => {
    const language = prompt('Language (javascript / python / cpp)', 'python');
    if (!language || !LANGUAGES[language]) return setError('Pick javascript, python or cpp');
    const name = prompt('File name', `main.${LANGUAGES[language].ext}`);
    if (!name) return;
    guard(async () => {
      const f = await api(`/projects/${project.id}/files`, { method: 'POST', body: { name, language, content: LANGUAGES[language].starter } });
      setFiles((fs) => [...fs, f]);
      selectFile(f);
    });
  };

  const save = useCallback(() => guard(async () => {
    const cur = activeRef.current;
    if (!cur) return;
    const f = await api(`/files/${cur.id}`, { method: 'PUT', body: { content: code } });
    setFiles((fs) => fs.map((x) => (x.id === f.id ? f : x)));
    setActive(f);
    setDirty(false);
  }), [code, guard]);

  const run = () => guard(async () => {
    if (!active) return;
    setRunning(true);
    setResult(null);
    try {
      if (dirty) await save();
      setResult(await api('/run', { method: 'POST', body: { language: active.language, code } }));
    } finally {
      setRunning(false);
    }
  });

  const removeFile = (f) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    guard(async () => {
      await api(`/files/${f.id}`, { method: 'DELETE' });
      const rest = files.filter((x) => x.id !== f.id);
      setFiles(rest);
      if (active && active.id === f.id) selectFile(rest[0] || null);
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="shell">
      <header>
        <div className="logo">⚡ CloudCode</div>
        <div className="spacer" />
        <span className="muted">{username}</span>
        <button className="ghost" onClick={onLogout}>Sign out</button>
      </header>
      <aside>
        <div className="section-title">Projects <button className="icon" title="New project" onClick={newProject}>＋</button></div>
        {projects.map((p) => (
          <div key={p.id} className={`item ${project && project.id === p.id ? 'selected' : ''}`} onClick={() => openProject(p)}>📁 {p.name}</div>
        ))}
        {!projects.length && <div className="muted pad">No projects yet</div>}
        {project && (
          <>
            <div className="section-title">Files <button className="icon" title="New file" onClick={newFile}>＋</button></div>
            {files.map((f) => (
              <div key={f.id} className={`item ${active && active.id === f.id ? 'selected' : ''}`} onClick={() => selectFile(f)}>
                <span>{f.name}</span>
                <button className="icon del" title="Delete" onClick={(e) => { e.stopPropagation(); removeFile(f); }}>×</button>
              </div>
            ))}
          </>
        )}
      </aside>
      <main>
        <div className="toolbar">
          <span>{active ? `${active.name}${dirty ? ' ●' : ''}` : 'No file open'}</span>
          <div className="spacer" />
          <button className="ghost" disabled={!active || !dirty} onClick={save}>Save ⌘S</button>
          <button className="primary" disabled={!active || running} onClick={run}>{running ? 'Running…' : '▶ Run ⌘↵'}</button>
        </div>
        <div className="editor">
          {active ? (
            <Editor
              theme="vs-dark"
              language={LANGUAGES[active.language].monaco}
              value={code}
              path={String(active.id)}
              onChange={(v) => { setCode(v ?? ''); setDirty(true); }}
              options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true }}
            />
          ) : (
            <div className="empty">{project ? 'Create a file to start coding' : 'Create or open a project to begin'}</div>
          )}
        </div>
        <div className="console">
          <div className="console-head">
            Output
            {result && <span className={`badge ${result.exitStatus}`}>{statusLabel(result.exitStatus)} · {result.durationMs} ms</span>}
          </div>
          <pre>{running ? 'Starting sandbox…' : result ? result.output || '(no output)' : error || 'Press Run to execute your code in an isolated sandbox.'}</pre>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState(() => (getToken() ? localStorage.getItem('cloudcode_user') : null));
  const logout = useCallback(() => { setToken(null); localStorage.removeItem('cloudcode_user'); setUsername(null); }, []);
  const onAuth = (u) => { localStorage.setItem('cloudcode_user', u); setUsername(u); };
  return username ? <Workspace username={username} onLogout={logout} /> : <AuthScreen onAuth={onAuth} />;
}
