/* 零依赖本地预览服务器：node server.js
 *
 * 干净的地址：/ 、/fraud 、/services 、/learn 、/profile
 * 两种写法都认：/fraud 和 /fraud/ 都返回同一页（页面内部一律用 / 开头的绝对路径，
 * 所以带不带结尾斜杠都能正确加载 css、js、音频）。
 * 旧地址 301 过去：/fraud.html -> /fraud，/index.html -> /
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT) || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// 只有这些名字会被当成页面（防止 /css 这类路径被误拼成 css.html）
const PAGES = new Set(["index", "fraud", "services", "learn", "profile"]);

function sendText(response, status, text, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(text);
}

function redirect(response, location, search) {
  response.writeHead(301, {
    Location: location + (search || ""),
    "Cache-Control": "no-cache",
  });
  response.end();
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    sendText(response, 400, "地址格式不正确");
    return;
  }

  // 1) 旧地址统一 301：/fraud.html -> /fraud，/index* -> /
  if (/\.html$/i.test(pathname)) {
    const name = pathname.slice(1, -5).toLowerCase();
    if (name === "index") redirect(response, "/", requestUrl.search);
    else if (PAGES.has(name)) redirect(response, `/${name}`, requestUrl.search);
    else sendText(response, 404, "页面没有找到");
    return;
  }
  if (pathname === "/index" || pathname === "/index/") {
    redirect(response, "/", requestUrl.search);
    return;
  }

  // 2) 页面：/ 、/fraud 、/fraud/ 都映射到对应 html
  let relative = null;
  if (pathname === "/") {
    relative = "index.html";
  } else {
    const trimmed = pathname.replace(/\/+$/, ""); // /fraud/ -> /fraud
    const name = trimmed.slice(1).toLowerCase();
    if (PAGES.has(name)) relative = `${name}.html`;
    else if (/^[a-z0-9_-]+$/i.test(trimmed.slice(1)) && !path.extname(trimmed)) {
      // 不存在的页面名：明确 404，不回落到静态文件
      sendText(response, 404, "页面没有找到");
      return;
    } else {
      relative = pathname.replace(/^\/+/, ""); // 静态资源
    }
  }

  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root + path.sep)) {
    sendText(response, 403, "禁止访问");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面没有找到</title><body style="font-family:Microsoft YaHei,sans-serif;padding:48px;background:#f5f0e5;color:#20312a"><h1>页面没有找到</h1><p><a href="/">回到银龄无诈首页</a></p></body></html>'
      );
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`银龄无诈 · 本地预览：http://127.0.0.1:${port}`);
});
