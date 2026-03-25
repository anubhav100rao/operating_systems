# Solution 69: CPU-Bound vs I/O-Bound Bottlenecks

## The Problem
Identify bottlenecks in CPU-bound vs I/O-bound systems.

---

## 💡 The Analogy: The Fast Chef vs. The Slow Supplier

**CPU-Bound (The Speed Chef):**
You have a world-class Michelin-star chef who can prepare a meal in 30 seconds flat. But your kitchen refrigerator and pantry are always fully stocked. The bottleneck is purely the chef's hands — the limiting factor is raw *processing speed*.

**I/O-Bound (The Waiting Chef):**
You have a moderately skilled chef who takes 5 minutes to prepare a meal, but your pantry is in a warehouse 2 miles away. The chef can assemble the dish in 5 minutes, but has to wait 40 minutes just for the delivery truck to arrive. Adding a second chef does nothing — both chefs just sit around waiting for deliveries.

---

## 🔬 Deep Dive: Understanding the Bottleneck

The absolute first step in performance engineering is correctly identifying the category of the bottleneck.

### CPU-Bound Workloads

A system is CPU-bound when the CPU utilization is chronically near 100% across all cores, and the application's latency or throughput scales perfectly linearly when you add more CPU cores.

**Characteristics:**
*   `top` / `htop` shows user-space CPU usage (`%us`) at 95-100%.
*   `perf stat` shows very high "Instructions Per Cycle" (IPC) and very low "cache-miss" event rates.
*   Adding more threads/processes improves throughput up to the core count, then plateaus.
*   I/O Wait (`%wa` in `top`) is near 0%.

**Common examples:**
*   Image/video transcoding (ffmpeg).
*   Cryptographic operations (TLS handshake, bcrypt hashing).
*   Scientific simulations (matrix multiplication, physics engines).
*   Compression algorithms (gzip, zstd).

**Optimization Strategies:**
1.  **SIMD / Vectorization:** Use AVX2/AVX-512 CPU instructions to process 8 or 16 values in parallel in a single instruction. Compilers can auto-vectorize with `-O3 -march=native`, or you can use intrinsics directly.
2.  **Multi-processing / Parallelism:** Leverage all available CPU cores with multi-threading or multi-processing. Amdahl's Law dictates the speedup ceiling.
3.  **Algorithm Selection:** Replacing an $O(N^2)$ algorithm with $O(N \log N)$ dwarfs any hardware upgrade.
4.  **Profile to find the hot loop:** Use `perf record ./program && perf report` to find the function consuming the most cycles. Optimize that function.

### I/O-Bound Workloads

A system is I/O-bound when the CPU is mostly idle, waiting for data from disk, network, or another service.

**Characteristics:**
*   `top` shows low `%us` CPU, high `%wa` (Wait) CPU. The system is "starving" the CPU.
*   `iostat -x 1` shows disk utilization near 100% and high `await` latency.
*   `netstat` / `ss` shows many connections in `ESTABLISHED` or `WAIT` state.
*   Adding more CPU cores provides zero throughput improvement.

**Common examples:**
*   Web servers serving files or proxying (Nginx, a basic Flask app).
*   Database queries that scan disk data.
*   Applications reading massive log files.
*   Microservices making multiple network API calls before responding.

**Optimization Strategies:**
1.  **Async I/O & Event Loops:** Instead of blocking a thread per connection (which is expensive), use an event-driven model (`epoll`, `io_uring`, Node.js, Python asyncio). A single thread can concurrently manage 100,000 pending I/O operations.
2.  **Caching:** Cache the result of expensive I/O to RAM (Redis, Memcached). The second request for `/api/user/123` skips the database entirely.
3.  **Read-Ahead:** Hint to the OS to prefetch data before it is requested (`posix_fadvise(FADV_SEQUENTIAL)`, `madvise(MADV_WILLNEED)`).
4.  **Faster Hardware:** Replacing an HDD (7,200 RPM, ~100 IOPS) with NVMe SSD (~500,000 IOPS) is transformative for random-read workloads.

---

## 💻 Code Example: Diagnosing in Practice

```bash
# Step 1: Get a real-time view. Is it CPU or IO?
htop
# Look for:
#   High CPU (us + sy) && low wa  -> CPU Bound
#   Low CPU (us + sy)  && high wa -> I/O Bound

# Step 2: If I/O bound, which disk and what's the latency?
iostat -x 1  # Look at %util and await (ms) for each device

# Step 3: If CPU bound, which function is the hotspot?
sudo perf record -g -p <pid> -- sleep 10
sudo perf report                  # Interactive flame-graph-style view

# Step 4: Check for hidden I/O — is the app blocked on network?
sudo strace -p <pid> -e trace=read,write,recv,send -T 2>/dev/null
# -T prints the time spent on each syscall, exposing blocking calls

# For a web server: measure latency distribution
wrk -t 4 -c 200 -d 30s http://localhost:8080/api/endpoint
```
