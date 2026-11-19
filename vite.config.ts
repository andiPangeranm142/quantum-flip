import react from "@vitejs/plugin-react";
import { HttpsProxyAgent } from "https-proxy-agent";
import { defineConfig } from "vite";

// The public REST APIs send no CORS headers, so the browser reaches them
// through the dev (and preview) server: /lcd-testnet and /lcd-mainnet are
// forwarded to each network's REST endpoint (see REST_PROXY in src/App.tsx).
// In production, serve the app behind a proxy that does the same.
//
// The dev/preview server's own HTTP proxy (http-proxy) does not read the
// https_proxy environment variable, so in a sandbox whose egress goes
// through a forward proxy the upstream TLS handshake fails (HTTP 500,
// "wrong version number") and the window-status panel can never load.
// When https_proxy is set, route the upstream connection through it;
// otherwise the proxy connects directly, as before.
const egressProxy = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? "";
const proxyAgent = egressProxy ? new HttpsProxyAgent(egressProxy) : undefined;
const rest = (target: string) => ({
  target,
  changeOrigin: true,
  ...(proxyAgent ? { agent: proxyAgent } : {}),
  rewrite: (p: string) => p.replace(/^\/lcd-(testnet|mainnet)/, ""),
});
const proxy = {
  "/lcd-testnet": rest("https://api-testnet.qore.host"),
  "/lcd-mainnet": rest("https://api.qore.host"),
};

export default defineConfig({
  plugins: [react()],
  // The live demo is served from the /quantum-flip/ subpath on GitHub
  // Pages — WITHOUT this base, a plain `npm run build` emits root-absolute
  // asset URLs (/assets/...) that 404 on the live site. (A rebuild on
  // 15 Nov 2026 without the base broke the demo this way; the base is now
  // part of the config so it cannot happen again.)
  base: "/quantum-flip/",
  server: { port: 5173, proxy },
  preview: { proxy },
});
