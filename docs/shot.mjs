/**
 * 用 CDP 真实等待页面渲染完成后再截图。
 * 用于反诈页：需要等 /api/analyze 的 SSE 流结束、结果卡片出现。
 *
 * 用法：node docs/shot.mjs <url> <输出路径> <宽> <高> [等待条件JS]
 */

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const [, , url, out, w = "1440", h = "2600", waitFor] = process.argv;
if (!CHROME || !url || !out) {
  console.error("用法: node shot.mjs <url> <out> <w> <h> [waitJS]");
  process.exit(1);
}

const PORT = 9333;
const profile = `${process.cwd()}\\.chrome-cdp`;
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-crash-reporter",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  `--window-size=${w},${h}`,
  "--hide-scrollbars",
  url,
], { stdio: "ignore" });

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("无法连接 CDP");
}

const wsUrl = await endpoint();
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let seq = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true });
  return res.result?.result?.value;
}

await send("Page.enable");
await send("Runtime.enable");

// MOBILE=1 时按真实手机视口渲染（只设 window-size 不会触发移动端布局）
if (process.env.MOBILE === "1") {
  await send("Emulation.setDeviceMetricsOverride", {
    width: Number(w),
    height: Number(h),
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
}

await sleep(800);

const condition = waitFor || "document.readyState === 'complete'";
const deadline = Date.now() + 45000;
let ready = false;
while (Date.now() < deadline) {
  try {
    if (await evaluate(condition)) { ready = true; break; }
  } catch {}
  await sleep(400);
}

// 再等一拍，确保动画和字号重排结束
await sleep(1200);

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log(ready ? "已等待条件成立" : "等待超时，按当前状态截图", "->", out);

ws.close();
chrome.kill();
