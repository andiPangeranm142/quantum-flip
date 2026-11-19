/**
 * render-check.mjs - verify the Quantum Flip demo renders without errors.
 *
 * Usage: `node scripts/render-check.mjs [url] [screenshot]`. Defaults to
 * the live GitHub Pages demo. Pass a local preview URL (e.g. after
 * `npm run build` + `npx vite preview --port 4173`) to check a local build.
 *
 * Exits non-zero if the page shows a fatal error, if any console error or
 * page error occurs, or if the expected content is missing. Writes a
 * screenshot to /tmp/qf-render.png by default.
 *
 * Playwright is not a dependency of this repo: it is resolved from the
 * shared install at ~/workspace/codegeist/video-recorder/node_modules
 * via createRequire (NODE_PATH does not work for ESM imports).
 *
 * Chromium cannot use the VM's egress proxy directly (it resolves only to
 * an IPv6 address, and the proxy MITM-signs TLS with its own CA), so the
 * script runs a localhost TCP forwarder (127.0.0.1:<port> -> proxy
 * IPv6:3128) and launches Chromium through it with ignoreHTTPSErrors.
 * Forwarder port: RENDER_CHECK_PORT env, default 3130 (3129 is often in
 * use by another agent's recorder).
 *
 * Note: the totals and leaderboard only render for a connected wallet on
 * the testnet, so this check (no wallet) verifies the unconnected view:
 * title, connect prompt, the simulated mock flip, the on-chain streak
 * badges (public reads), and the honest-randomness footer. Live totals
 * are verified separately with eth_call against the contract.
 */
import { createRequire } from "node:module";
import net from "node:net";
import dns from "node:dns/promises";

const require = createRequire("/home/hatch/workspace/codegeist/video-recorder/package.json");
const { chromium } = require("playwright");

const FORWARDER_PORT = Number(process.env.RENDER_CHECK_PORT ?? 3130);

async function startForwarder(localPort) {
  const raw = process.env.https_proxy || process.env.HTTPS_PROXY || "";
  const u = new URL(raw);
  const target = await dns.lookup(u.hostname, { family: 6 });
  const server = net.createServer((client) => {
    const upstream = net.connect({ host: target.address, port: Number(u.port) || 3128 });
    client.pipe(upstream);
    upstream.pipe(client);
    const onErr = () => { client.destroy(); upstream.destroy(); };
    client.on("error", onErr);
    upstream.on("error", onErr);
  });
  await new Promise((resolve, reject) => {
    server.listen(localPort, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  return server;
}

const url = process.argv[2] ?? "https://andipangeranm142.github.io/quantum-flip/";
const screenshotPath = process.argv[3] ?? "/tmp/qf-render.png";

const forwarder = await startForwarder(FORWARDER_PORT);
const browser = await chromium.launch({
  proxy: { server: `http://127.0.0.1:${FORWARDER_PORT}`, bypass: "localhost,127.0.0.1" },
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  ignoreHTTPSErrors: true, // egress proxy MITM-signs TLS (see header)
});
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ""}`));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(5000);
// The streak-badges section reads live chain data; give it time to arrive
// before screenshotting (its absence is a failure, checked below).
await page.waitForFunction(
  () => document.body.innerText.includes("Double Up"),
  { timeout: 30000 },
).catch(() => {});
await page.screenshot({ path: screenshotPath, fullPage: true });

const text = await page.evaluate(() => document.body.innerText);
const checks = {
  "title Quantum Flip": text.includes("Quantum Flip"),
  "intro (post-quantum authorisation window)": text.includes("post-quantum authorisation window"),
  "connect prompt": text.includes("Connect a wallet to play"),
  "mock mode labelled simulated": text.includes("Try it without a wallet (simulated)") && text.includes("SIMULATED"),
  "mock mode honest disclaimer": text.includes("not an on-chain transaction"),
  "streak badges section": text.includes("Streak badges"),
  "badge tiers listed": text.includes("Hat Trick") && text.includes("Hot Streak"),
  "real on-chain badge shown (Double Up)": text.includes("Double Up"),
  "honest-randomness footer": text.includes("fully simulatable"),
  "no fatal error text": !/something went wrong|failed to load|white screen|not deployed yet/i.test(text),
};
let ok = true;
for (const [name, passed] of Object.entries(checks)) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) ok = false;
}
if (errors.length) {
  console.log("ERRORS:");
  for (const e of errors) console.log(`  ${e}`);
  ok = false;
} else {
  console.log("PASS no console/page/request errors");
}
console.log(`screenshot: ${screenshotPath}`);
await browser.close();
forwarder.close();
process.exit(ok ? 0 : 1);
