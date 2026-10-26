"""极简限流：按 IP 的滑动窗口，进程内存实现。

单个进程够用；多进程部署时每个 worker 各算各的，精度会打折，
但足以挡住「一个脚本狂刷」的场景。
"""

import threading
import time
from collections import deque

_lock = threading.Lock()
_buckets = {}


def hit(key, limit, window=60):
    """返回 (是否放行, 建议等待秒数)。"""
    now = time.time()
    with _lock:
        bucket = _buckets.get(key)
        if bucket is None:
            bucket = deque()
            _buckets[key] = bucket

        while bucket and now - bucket[0] > window:
            bucket.popleft()

        if len(bucket) >= limit:
            return False, max(1, int(window - (now - bucket[0])) + 1)

        bucket.append(now)

        if len(_buckets) > 5000:
            for name in [name for name, item in _buckets.items() if not item]:
                _buckets.pop(name, None)

        return True, 0


def reset():
    with _lock:
        _buckets.clear()
