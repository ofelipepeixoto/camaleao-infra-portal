import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const directory = resolve(".ui-test-dist");
const server = createServer(async (req, res) => {
  const path = resolve(directory, "." + new URL(req.url, "http://127.0.0.1").pathname);
  if (path !== directory && !path.startsWith(directory + "/")) { res.writeHead(404).end(); return; }
  try {
    const file = path === directory ? join(path, "index.html") : path;
    const content = await readFile(file);
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[extname(file)] || "application/octet-stream");
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(join(tmpdir(), "camaleao-ui-"));
const browser = spawn(process.env.CHROME_BIN || "google-chrome", [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-background-networking", "--no-first-run",
  "--disable-component-update", "--remote-debugging-port=0", "--user-data-dir=" + profile,
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome DevTools unavailable")), 15000);
    browser.once("error", error => { clearTimeout(timer); reject(error); });
    let output = "";
    browser.stderr.on("data", data => {
      output += data;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const debug = new URL(endpoint);
  const target = await (await fetch("http://" + debug.host + "/json/new?about:blank", { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    const item = pending.get(message.id);
    if (item) { pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
  };
  function call(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  }
  await call("Page.enable");
  for (const width of [1280, 320]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: "http://127.0.0.1:" + server.address().port + "/?width=" + width });
    let result;
    for (let count = 0; count < 160; count++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const evaluation = await call("Runtime.evaluate", { expression: "window.__uiResult", returnByValue: true });
      result = evaluation.result?.value;
      if (result && result.status !== "running") break;
    }
    assert.equal(result?.status, "passed", JSON.stringify(result || { error: "Browser checks timed out" }));
    console.log(JSON.stringify({ viewport: width, ...result }));
  }
} finally {
  socket?.close();
  const stopped = new Promise(resolve => browser.once("exit", resolve));
  browser.kill("SIGTERM");
  await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
  if (browser.exitCode === null) browser.kill("SIGKILL");
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Chromium's helper processes can finish flushing the profile just after the
  // parent exits. Retry bounded cleanup instead of failing successful UI checks.
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
