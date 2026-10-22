# Server setup (home server, k3s + Cloudflare Tunnel)

1. **k3s** single node is already installed. Images are pulled from GHCR (`ghcr.io/poorabsharma5/cloudcode-*`), so the packages must be public.
2. **Self-hosted runner** (label `home-server`) runs the `deploy` job of `cd.yml`. It runs as an unprivileged user that can use `kubectl`.
   Deploy jobs only run on pushes to `main`, never on pull requests, so outside contributors cannot execute code on the server.
3. **Cloudflare Tunnel** ingress rule in `/etc/cloudflared/config.yml` (placed above the wildcard rule):
   ```yaml
   - hostname: ide.poorabsharma.site
     service: http://localhost:30480
   ```
   DNS: `cloudflared tunnel route dns <tunnel> ide.poorabsharma.site`
4. Secrets (`cloudcode-secrets`: JWT secret, Postgres password) are generated on the server on first deploy and never stored in Git.
