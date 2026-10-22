const { createApp } = require('./app');
const { pool, init } = require('./db');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}

const store = {
  async createUser(username, hash) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO auth.users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [username, hash]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') return null; // unique violation
      throw err;
    }
  },
  async findUser(username) {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash FROM auth.users WHERE username = $1',
      [username]
    );
    return rows[0];
  },
};

init().then(() => {
  const port = process.env.PORT || 4001;
  createApp({ store, jwtSecret }).listen(port, () => console.log(`auth-service listening on ${port}`));
});
