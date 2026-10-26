/* =========================================================
   银龄无诈 · 前端加密工具（零依赖）
   SM3 摘要 + SM2 公钥加密（C1C3C2），与后端 server/sm2.py 一一对应。
   不需要 npm 包，<script src="js/crypto.js"></script> 直接可用。

   用法：
     YinLingCrypto.encryptPassword("elder2026")
       -> "04ab12...9f"（小写 hex，每次都不一样）

   注意：SM2 只能加密，解密需要私钥，私钥只在服务端。
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.YinLingCrypto = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* 公钥：与 server/.env 里的 SM2_PRIVATE_KEY 配对。
     换密钥对时两边必须同时改，否则登录会失败。 */
  var PUBLIC_KEY =
    "04ef6d3c38a8559e5e818c3fe15a9d09ea478ab1f4da150a891c40f98211b56f33" +
    "63a3269366372796e71d7557bcf5762520029da5f0d23e0c7cb4f83cf071759d";

  /* ------------------------------------------------------ SM3 */

  var IV = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
            0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e];

  function rotl(x, n) {
    n &= 31;
    if (n === 0) return x >>> 0;
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  function p0(x) { return (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0; }
  function p1(x) { return (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0; }

  function compress(state, block, offset) {
    var w = new Array(68);
    var i, j;
    for (i = 0; i < 16; i++) {
      w[i] = ((block[offset + i * 4] << 24) |
              (block[offset + i * 4 + 1] << 16) |
              (block[offset + i * 4 + 2] << 8) |
              block[offset + i * 4 + 3]) >>> 0;
    }
    for (j = 16; j < 68; j++) {
      w[j] = (p1((w[j - 16] ^ w[j - 9] ^ rotl(w[j - 3], 15)) >>> 0) ^
              rotl(w[j - 13], 7) ^ w[j - 6]) >>> 0;
    }
    var w1 = new Array(64);
    for (j = 0; j < 64; j++) w1[j] = (w[j] ^ w[j + 4]) >>> 0;

    var a = state[0], b = state[1], c = state[2], d = state[3];
    var e = state[4], f = state[5], g = state[6], h = state[7];

    for (j = 0; j < 64; j++) {
      var t = j < 16 ? 0x79cc4519 : 0x7a879d8a;
      var a12 = rotl(a, 12);
      var ss1 = rotl((a12 + e + rotl(t, j)) >>> 0, 7);
      var ss2 = (ss1 ^ a12) >>> 0;
      var ff = j < 16 ? (a ^ b ^ c) : ((a & b) | (a & c) | (b & c));
      var gg = j < 16 ? (e ^ f ^ g) : ((e & f) | (~e & g));
      var tt1 = (ff + d + ss2 + w1[j]) >>> 0;
      var tt2 = (gg + h + ss1 + w[j]) >>> 0;

      d = c;
      c = rotl(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = rotl(f, 19);
      f = e;
      e = p0(tt2);
    }

    state[0] = (state[0] ^ a) >>> 0;
    state[1] = (state[1] ^ b) >>> 0;
    state[2] = (state[2] ^ c) >>> 0;
    state[3] = (state[3] ^ d) >>> 0;
    state[4] = (state[4] ^ e) >>> 0;
    state[5] = (state[5] ^ f) >>> 0;
    state[6] = (state[6] ^ g) >>> 0;
    state[7] = (state[7] ^ h) >>> 0;
  }

  function sm3(bytes) {
    var length = bytes.length;
    var total = Math.ceil((length + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[length] = 0x80;
    var bits = length * 8;
    var hi = Math.floor(bits / 4294967296);
    var lo = bits >>> 0;
    buf[total - 8] = (hi >>> 24) & 0xff;
    buf[total - 7] = (hi >>> 16) & 0xff;
    buf[total - 6] = (hi >>> 8) & 0xff;
    buf[total - 5] = hi & 0xff;
    buf[total - 4] = (lo >>> 24) & 0xff;
    buf[total - 3] = (lo >>> 16) & 0xff;
    buf[total - 2] = (lo >>> 8) & 0xff;
    buf[total - 1] = lo & 0xff;

    var state = IV.slice();
    for (var offset = 0; offset < total; offset += 64) {
      compress(state, buf, offset);
    }

    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i * 4] = (state[i] >>> 24) & 0xff;
      out[i * 4 + 1] = (state[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (state[i] >>> 8) & 0xff;
      out[i * 4 + 3] = state[i] & 0xff;
    }
    return out;
  }

  /* ------------------------------------------------------ SM2 曲线 */

  var P = 0xfffffffeffffffffffffffffffffffffffffffff00000000ffffffffffffffffn;
  var A = 0xfffffffeffffffffffffffffffffffffffffffff00000000fffffffffffffffcn;
  var B = 0x28e9fa9e9d9f5e344d5a9e4bcf6509a7f39789f515ab8f92ddbcbd414d940e93n;
  var N = 0xfffffffeffffffffffffffffffffffff7203df6b21c6052b53bbf40939d54123n;
  var GX = 0x32c4ae2c1f1981195f9904466a39c9948fe30bbff2660be1715a4589334c74c7n;
  var GY = 0xbc3736a2f4f6779c59bdcee36b692153d0a9877cc62a474002df32e52139f0a0n;

  function mod(value, m) {
    var r = value % m;
    return r >= 0n ? r : r + m;
  }

  function inverse(value) {
    var a = mod(value, P);
    var b = P;
    var x0 = 1n, x1 = 0n;
    while (b !== 0n) {
      var q = a / b;
      var t = a - q * b; a = b; b = t;
      t = x0 - q * x1; x0 = x1; x1 = t;
    }
    return mod(x0, P);
  }

  function pointAdd(p1, p2) {
    if (p1 === null) return p2;
    if (p2 === null) return p1;
    if (p1[0] === p2[0]) {
      if (mod(p1[1] + p2[1], P) === 0n) return null;
      return pointDouble(p1);
    }
    var lam = mod((p2[1] - p1[1]) * inverse(p2[0] - p1[0]), P);
    var x3 = mod(lam * lam - p1[0] - p2[0], P);
    var y3 = mod(lam * (p1[0] - x3) - p1[1], P);
    return [x3, y3];
  }

  function pointDouble(point) {
    if (point === null || point[1] === 0n) return null;
    var lam = mod((3n * point[0] * point[0] + A) * inverse(2n * point[1]), P);
    var x3 = mod(lam * lam - 2n * point[0], P);
    var y3 = mod(lam * (point[0] - x3) - point[1], P);
    return [x3, y3];
  }

  function pointMul(point, scalar) {
    var k = mod(scalar, N);
    var result = null;
    var addend = point;
    while (k > 0n) {
      if (k & 1n) result = pointAdd(result, addend);
      addend = pointDouble(addend);
      k >>= 1n;
    }
    return result;
  }

  var G = [GX, GY];

  /* ------------------------------------------------------ 工具 */

  function bytesToBigInt(bytes) {
    var value = 0n;
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8n) | BigInt(bytes[i]);
    }
    return value;
  }

  function bigIntToBytes(value, length) {
    var hex = value.toString(16);
    while (hex.length < length * 2) hex = "0" + hex;
    var out = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function concat(chunks) {
    var total = 0;
    var i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var offset = 0;
    for (i = 0; i < chunks.length; i++) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return out;
  }

  function toHex(bytes) {
    var text = "";
    for (var i = 0; i < bytes.length; i++) {
      text += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    }
    return text;
  }

  function utf8(text) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text);
    }
    return new Uint8Array(Buffer.from(text, "utf8"));
  }

  function randomScalar() {
    var bytes = new Uint8Array(32);
    if (typeof globalThis !== "undefined" && globalThis.crypto &&
        globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      // 仅在 Node 环境下走到这里（命令行测试用）
      var nodeCrypto = require("crypto");
      var buffer = nodeCrypto.randomBytes(32);
      for (var i = 0; i < 32; i++) bytes[i] = buffer[i];
    }
    return mod(bytesToBigInt(bytes), N - 1n) + 1n;
  }

  function kdf(z, length) {
    var out = new Uint8Array(0);
    var pieces = [];
    var counter = 1;
    while (out.length < length) {
      var ct = new Uint8Array(4);
      ct[0] = (counter >>> 24) & 0xff;
      ct[1] = (counter >>> 16) & 0xff;
      ct[2] = (counter >>> 8) & 0xff;
      ct[3] = counter & 0xff;
      out = concat([out, sm3(concat([z, ct]))]);
      counter += 1;
    }
    return out.slice(0, length);
  }

  function parsePublicKey(text) {
    var hex = String(text).toLowerCase().replace(/^0x/, "");
    if (hex.length === 130 && hex.slice(0, 2) === "04") hex = hex.slice(2);
    if (hex.length !== 128) throw new Error("公钥长度不对，需要 64 或 65 字节");
    var x = BigInt("0x" + hex.slice(0, 64));
    var y = BigInt("0x" + hex.slice(64));
    var left = mod(y * y, P);
    var right = mod(x * x * x + A * x + B, P);
    if (left !== right) throw new Error("公钥不在 SM2 曲线上");
    return [x, y];
  }

  /* ------------------------------------------------------ SM2 加密 */

  function encrypt(publicKey, plainText) {
    var point = parsePublicKey(publicKey);
    var data = utf8(plainText);

    while (true) {
      var k = randomScalar();
      var c1 = pointMul(G, k);
      var shared = pointMul(point, k);
      if (shared === null) continue;

      var x2 = bigIntToBytes(shared[0], 32);
      var y2 = bigIntToBytes(shared[1], 32);
      var t = kdf(concat([x2, y2]), data.length);

      var zero = true;
      for (var i = 0; i < t.length; i++) {
        if (t[i] !== 0) { zero = false; break; }
      }
      if (zero) continue;

      var c2 = new Uint8Array(data.length);
      for (var j = 0; j < data.length; j++) c2[j] = data[j] ^ t[j];

      var c3 = sm3(concat([x2, data, y2]));
      return toHex(concat([
        new Uint8Array([0x04]),
        bigIntToBytes(c1[0], 32),
        bigIntToBytes(c1[1], 32),
        c3,
        c2
      ]));
    }
  }

  return {
    publicKey: PUBLIC_KEY,
    encrypt: encrypt,
    encryptPassword: function (plainText) {
      return encrypt(PUBLIC_KEY, String(plainText));
    },
    sm3Hex: function (text) {
      return toHex(sm3(utf8(String(text))));
    }
  };
});

/* 命令行自测：node js/crypto.js --encrypt elder2026 */
if (typeof module === "object" && module.exports &&
    typeof process !== "undefined" && process.argv &&
    process.argv[2] === "--encrypt") {
  var cryptoModule = module.exports;
  console.log(cryptoModule.encryptPassword(process.argv[3] || "elder2026"));
}
