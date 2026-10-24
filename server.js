/* 零依赖本地预览服务器：node server.js */
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
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("禁止访问");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
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
