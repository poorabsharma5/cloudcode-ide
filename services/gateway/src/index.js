const { createApp } = require('./app');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}

const app = createApp({
  jwtSecret: process.env.JWT_SECRET,
  targets: {
    auth: process.env.AUTH_URL || 'http://auth-service:4001',
    projects: process.env.PROJECTS_URL || 'http://project-service:4002',
    runner: process.env.RUNNER_URL || 'http://runner-service:4003',
  },
});
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`gateway listening on ${port}`));
