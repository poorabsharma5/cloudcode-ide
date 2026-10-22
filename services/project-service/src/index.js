const { createApp } = require('./app');
const { pool, init } = require('./db');

const store = {
  async listProjects(uid) {
    const { rows } = await pool.query(
      'SELECT id, name, created_at FROM projects.projects WHERE owner_id = $1 ORDER BY id',
      [uid]
    );
    return rows;
  },
  async createProject(uid, name) {
    const { rows } = await pool.query(
      'INSERT INTO projects.projects (owner_id, name) VALUES ($1, $2) RETURNING id, name, created_at',
      [uid, name]
    );
    return rows[0];
  },
  async deleteProject(uid, id) {
    const r = await pool.query('DELETE FROM projects.projects WHERE id = $1 AND owner_id = $2', [id, uid]);
    return r.rowCount > 0;
  },
  async owns(uid, projectId) {
    const { rowCount } = await pool.query('SELECT 1 FROM projects.projects WHERE id = $1 AND owner_id = $2', [projectId, uid]);
    return rowCount > 0;
  },
  async listFiles(uid, projectId) {
    if (!(await this.owns(uid, projectId))) return null;
    const { rows } = await pool.query(
      'SELECT id, name, language, content, updated_at FROM projects.files WHERE project_id = $1 ORDER BY name',
      [projectId]
    );
    return rows;
  },
  async createFile(uid, projectId, name, language, content) {
    if (!(await this.owns(uid, projectId))) return undefined;
    try {
      const { rows } = await pool.query(
        'INSERT INTO projects.files (project_id, name, language, content) VALUES ($1,$2,$3,$4) RETURNING id, name, language, content',
        [projectId, name, language, content]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') return null;
      throw err;
    }
  },
  async updateFile(uid, id, content) {
    const { rows } = await pool.query(
      `UPDATE projects.files f SET content = $3, updated_at = now()
       FROM projects.projects p
       WHERE f.id = $1 AND f.project_id = p.id AND p.owner_id = $2
       RETURNING f.id, f.name, f.language, f.content`,
      [id, uid, content]
    );
    return rows[0];
  },
  async deleteFile(uid, id) {
    const r = await pool.query(
      `DELETE FROM projects.files f USING projects.projects p
       WHERE f.id = $1 AND f.project_id = p.id AND p.owner_id = $2`,
      [id, uid]
    );
    return r.rowCount > 0;
  },
};

init().then(() => {
  const port = process.env.PORT || 4002;
  createApp({ store }).listen(port, () => console.log(`project-service listening on ${port}`));
});
