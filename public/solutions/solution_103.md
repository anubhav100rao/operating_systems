# Problem 103: Build a Rate Limiter

A **rate limiter** controls how frequently an operation can be performed. It is a critical building block in API gateways, network traffic shapers, and distributed systems to protect services from being overwhelmed.

## 1. The Three Core Algorithms

### Algorithm 1 — Token Bucket (Most Common)

The token bucket works like a bucket that fills with tokens at a constant rate. Each request consumes one token. If the bucket is empty, the request is rejected or queued.

**Characteristics:**
- Allows **bursting** up to the bucket capacity.
- Traffic is smoothed at the refill rate over time.
- Used by Linux `tc` (traffic control), AWS API Gateway, and most rate limiters.

```cpp
#include <chrono>
#include <mutex>
#include <algorithm>

class TokenBucketRateLimiter {
    const double   rate_;      // Tokens added per second (e.g., 100 req/s)
    const double   capacity_;  // Max tokens (burst size)
    double         tokens_;    // Current token count
    std::chrono::steady_clock::time_point last_refill_;
    std::mutex     mu_;

public:
    TokenBucketRateLimiter(double rate_per_sec, double burst_capacity)
        : rate_(rate_per_sec), capacity_(burst_capacity),
          tokens_(burst_capacity), last_refill_(std::chrono::steady_clock::now()) {}

    // Returns true if request is allowed, false if rate limit exceeded
    bool allow() {
        std::lock_guard<std::mutex> lock(mu_);

        // Calculate tokens accumulated since last call
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double>(now - last_refill_).count();
        last_refill_ = now;

        // Refill the bucket (cap at capacity)
        tokens_ = std::min(capacity_, tokens_ + elapsed * rate_);

        if (tokens_ >= 1.0) {
            tokens_ -= 1.0; // Consume one token
            return true;    // Request allowed
        }
        return false; // Rate limit exceeded
    }
};

// Usage:
// TokenBucketRateLimiter limiter(100.0, 200.0); // 100 req/s, burst of 200
// if (limiter.allow()) { serve_request(); }
// else                 { return HTTP_429_TOO_MANY_REQUESTS; }
```

### Algorithm 2 — Fixed Window Counter

Divide time into fixed windows (e.g., 1 second each). Count requests per window. Reject if the count exceeds the limit.

**The Problem:** A burst at the boundary of two windows can double the effective rate.

```
Window 1: [0s — 1s]  | Window 2: [1s — 2s]
Last 500ms: 100 reqs  | First 500ms: 100 reqs
                      |
                      ^ In the 1-second window [0.5s — 1.5s], 200 reqs passed!
```

```cpp
#include <atomic>
#include <chrono>

class FixedWindowRateLimiter {
    const int    limit_;
    std::atomic<int>    count_{0};
    std::atomic<long>   window_start_{0}; // epoch seconds

public:
    FixedWindowRateLimiter(int requests_per_second) : limit_(requests_per_second) {}

    bool allow() {
        long now = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();

        long ws = window_start_.load();
        if (now != ws) {
            // New window: reset counter
            if (window_start_.compare_exchange_strong(ws, now))
                count_.store(0);
        }
        return count_.fetch_add(1) < limit_;
    }
};
```

### Algorithm 3 — Sliding Window Log

Maintain a log of timestamps for recent requests. Count how many fall within `[now - window, now]`.

- Most accurate — no boundary burst problem.
- Memory-intensive: stores one timestamp per request.
- Best for low-volume, high-accuracy rate limiting.

```python
from collections import deque
import time, threading

class SlidingWindowRateLimiter:
    def __init__(self, limit, window_secs):
        self.limit = limit
        self.window = window_secs
        self.log = deque()  # timestamps of past requests
        self.lock = threading.Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        with self.lock:
            # Evict expired timestamps
            while self.log and self.log[0] <= now - self.window:
                self.log.popleft()

            if len(self.log) < self.limit:
                self.log.append(now)
                return True
            return False  # Rate limit exceeded
```

## 2. Distributed Rate Limiting

In a multi-server system, a per-process rate limiter is insufficient. All API servers must share a single counter. The standard solution is an atomic counter stored in **Redis**:

```python
import redis, time

r = redis.Redis()

def is_allowed(user_id: str, limit: int, window_secs: int) -> bool:
    key = f"rate_limit:{user_id}"
    pipe = r.pipeline()
    now = time.time()

    # Sliding window log in Redis sorted set
    pipe.zremrangebyscore(key, 0, now - window_secs)  # Remove old entries
    pipe.zadd(key, {str(now): now})                    # Add current request
    pipe.zcard(key)                                     # Count requests in window
    pipe.expire(key, window_secs)                       # Auto-expire the key
    results = pipe.execute()

    return results[2] <= limit  # results[2] is the count
```

## 3. Algorithm Comparison

| Algorithm | Burst Handling | Memory | Boundary Problem | Use Case |
|---|---|---|---|---|
| Token Bucket | ✅ Yes, controlled | O(1) | None | APIs, network shaping |
| Fixed Window | ✅ Yes, uncontrolled | O(1) | Yes (2x at boundary) | Simple counters |
| Sliding Window Log | ❌ No burst | O(requests) | None | Strict accuracy needed |
| Sliding Window Counter | Limited burst | O(1) | Minimal | Good balance |

## Analogy
- **Token Bucket:** A turnstile that refills one coin into a dispenser tray every 10ms. You can pre-accumulate 10 coins for a burst. Empty tray = you wait.
- **Fixed Window:** A bouncer who counts how many people entered this calendar hour. At exactly midnight, the counter resets — a rush of 100 people can enter in the last 30 seconds of the hour and 100 more in the first 30 seconds of the new hour.
- **Sliding Window:** The bouncer watches a rolling 1-hour backwards window using a real stopwatch, always counting the exact number of people who entered in the true last 60 minutes.
