# ---- build stage: install production dependencies only ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime stage: small, non-root ----
FROM node:20-alpine
ENV NODE_ENV=production PORT=4003
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN rm -f src/*.test.js \
    # the runtime only needs `node`: drop npm/yarn/corepack (bundled node-tar has a CRITICAL CVE, smaller attack surface)
    && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
       /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node
EXPOSE 4003
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4003/healthz || exit 1
CMD ["node", "src/index.js"]
