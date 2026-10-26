"""纯 Python 实现的 SM3 与 SM2，用于解密前端提交的密码。

为什么要自己实现：虚拟环境里没有 pip，装不了 gmssl / gmssl-python，
而 SM2 是接口文档约定的传输加密方式。SM3 与 SM2 的曲线参数都来自
国标 GB/T 32918，实现固定、没有分支选择，便于逐行核对。

只实现了本项目需要的部分：SM3 摘要、SM2 加解密（C1C3C2），
不包含签名与密钥派生以外的功能。
"""

import secrets

# ---------------------------------------------------------------- SM3

_IV = [0x7380166F, 0x4914B2B9, 0x172442D7, 0xDA8A0600,
       0xA96F30BC, 0x163138AA, 0xE38DEE4D, 0xB0FB0E4E]
_MASK = 0xFFFFFFFF


def _rotl(value, bits):
    bits %= 32
    if bits == 0:
        return value & _MASK
    return ((value << bits) | (value >> (32 - bits))) & _MASK


def _p0(value):
    return value ^ _rotl(value, 9) ^ _rotl(value, 17)


def _p1(value):
    return value ^ _rotl(value, 15) ^ _rotl(value, 23)


def _ff(j, x, y, z):
    if j < 16:
        return x ^ y ^ z
    return (x & y) | (x & z) | (y & z)


def _gg(j, x, y, z):
    if j < 16:
        return x ^ y ^ z
    return (x & y) | ((~x & _MASK) & z)


def _compress(state, block):
    w = [0] * 68
    for i in range(16):
        w[i] = int.from_bytes(block[i * 4:i * 4 + 4], "big")
    for j in range(16, 68):
        w[j] = (_p1(w[j - 16] ^ w[j - 9] ^ _rotl(w[j - 3], 15))
                ^ _rotl(w[j - 13], 7) ^ w[j - 6]) & _MASK
    w1 = [w[j] ^ w[j + 4] for j in range(64)]

    a, b, c, d, e, f, g, h = state
    for j in range(64):
        t = 0x79CC4519 if j < 16 else 0x7A879D8A
        a12 = _rotl(a, 12)
        ss1 = _rotl((a12 + e + _rotl(t, j)) & _MASK, 7)
        ss2 = ss1 ^ a12
        tt1 = (_ff(j, a, b, c) + d + ss2 + w1[j]) & _MASK
        tt2 = (_gg(j, e, f, g) + h + ss1 + w[j]) & _MASK
        d, c, b, a = c, _rotl(b, 9), a, tt1
        h, g, f, e = g, _rotl(f, 19), e, _p0(tt2)

    return [x ^ y for x, y in zip(state, [a, b, c, d, e, f, g, h])]


def sm3(data):
    """返回 32 字节摘要。"""
    if isinstance(data, str):
        data = data.encode("utf-8")
    length = len(data)
    padded = bytearray(data)
    padded.append(0x80)
    while len(padded) % 64 != 56:
        padded.append(0)
    padded += (length * 8).to_bytes(8, "big")

    state = list(_IV)
    for offset in range(0, len(padded), 64):
        state = _compress(state, padded[offset:offset + 64])
    return b"".join(word.to_bytes(4, "big") for word in state)


def sm3_hex(data):
    return sm3(data).hex()


# ---------------------------------------------------------------- SM2 曲线

P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF
A = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC
B = 0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93
N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123
GX = 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7
GY = 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0

INFINITY = None


def _inverse(value, modulus):
    return pow(value % modulus, -1, modulus)


def point_add(p1, p2):
    if p1 is INFINITY:
        return p2
    if p2 is INFINITY:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2:
        if (y1 + y2) % P == 0:
            return INFINITY
        return point_double(p1)
    lam = ((y2 - y1) * _inverse(x2 - x1, P)) % P
    x3 = (lam * lam - x1 - x2) % P
    y3 = (lam * (x1 - x3) - y1) % P
    return (x3, y3)


def point_double(point):
    if point is INFINITY:
        return INFINITY
    x, y = point
    if y == 0:
        return INFINITY
    lam = ((3 * x * x + A) * _inverse(2 * y, P)) % P
    x3 = (lam * lam - 2 * x) % P
    y3 = (lam * (x - x3) - y) % P
    return (x3, y3)


def point_mul(point, scalar):
    scalar %= N
    result = INFINITY
    addend = point
    while scalar:
        if scalar & 1:
            result = point_add(result, addend)
        addend = point_double(addend)
        scalar >>= 1
    return result


G = (GX, GY)


def _on_curve(point):
    if point is INFINITY:
        return False
    x, y = point
    if not (0 <= x < P and 0 <= y < P):
        return False
    return (y * y - (x * x * x + A * x + B)) % P == 0


def _kdf(z, length):
    out = b""
    counter = 1
    while len(out) < length:
        out += sm3(z + counter.to_bytes(4, "big"))
        counter += 1
    return out[:length]


def _parse_public_key(text):
    raw = bytes.fromhex(text) if isinstance(text, str) else text
    if raw[0] == 0x04:
        raw = raw[1:]
    if len(raw) != 64:
        raise ValueError("public key must be 64 or 65 bytes")
    point = (int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    if not _on_curve(point):
        raise ValueError("public key is not on the sm2 curve")
    return point


def encrypt(public_key, message):
    """C1C3C2，输出 04||x||y||C3||C2 的小写 hex。用于自测与生成测试向量。"""
    point = _parse_public_key(public_key)
    data = message.encode("utf-8") if isinstance(message, str) else message
    while True:
        k = secrets.randbelow(N - 1) + 1
        c1 = point_mul(G, k)
        shared = point_mul(point, k)
        if shared is INFINITY:
            continue
        x2 = shared[0].to_bytes(32, "big")
        y2 = shared[1].to_bytes(32, "big")
        t = _kdf(x2 + y2, len(data))
        if not any(t):          # KDF 全零时换一个 k 重来
            continue
        c2 = bytes(a ^ b for a, b in zip(data, t))
        c3 = sm3(x2 + data + y2)
        return (b"\x04" + c1[0].to_bytes(32, "big") + c1[1].to_bytes(32, "big")
                + c3 + c2).hex()


def decrypt(private_key, cipher_text):
    """解密 C1C3C2 密文，返回原文 str。任何异常都表示密文不可信。"""
    if isinstance(private_key, str):
        private = int(private_key, 16)
    else:
        private = private_key
    if not (1 <= private < N):
        raise ValueError("private key out of range")

    raw = bytes.fromhex(cipher_text) if isinstance(cipher_text, str) else cipher_text
    if not raw or raw[0] != 0x04:
        raise ValueError("unsupported cipher text format")
    if len(raw) < 65 + 32:
        raise ValueError("cipher text too short")

    c1 = (int.from_bytes(raw[1:33], "big"), int.from_bytes(raw[33:65], "big"))
    if not _on_curve(c1):
        raise ValueError("C1 is not on the sm2 curve")

    shared = point_mul(c1, private)
    if shared is INFINITY:
        raise ValueError("shared point is infinity")

    x2 = shared[0].to_bytes(32, "big")
    y2 = shared[1].to_bytes(32, "big")
    c3 = raw[65:97]
    c2 = raw[97:]
    if not c2:
        raise ValueError("empty cipher text body")

    t = _kdf(x2 + y2, len(c2))
    message = bytes(a ^ b for a, b in zip(c2, t))
    if sm3(x2 + message + y2) != c3:
        raise ValueError("C3 mismatch, cipher text is corrupted")
    return message.decode("utf-8")


# ---------------------------------------------------------------- 命令行

def _keygen():
    private = secrets.randbelow(N - 1) + 1
    public = point_mul(G, private)
    private_hex = "{:064x}".format(private)
    public_hex = "04{:064x}{:064x}".format(public[0], public[1])
    return private_hex, public_hex


def _main():
    import sys

    command = sys.argv[1] if len(sys.argv) > 1 else "help"

    if command == "keygen":
        private, public = _keygen()
        print("SM2_PRIVATE_KEY=" + private)
        print("SM2_PUBLIC_KEY=" + public)
    elif command == "selftest":
        print("sm3('abc') =", sm3_hex("abc"))
        private, public = _keygen()
        cipher = encrypt(public, "elder2026")
        print("plain       =", decrypt(private, cipher))
        print("cipher len  =", len(cipher))
    else:
        print("用法: python sm2.py keygen|selftest")


if __name__ == "__main__":
    _main()
