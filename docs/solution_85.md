# Solution 85: Design a System that Handles 1M Concurrent Connections

## The Problem
Design a system that handles 1M concurrent connections.

---

## 💡 The Analogy: The Airport Departure Board

Imagine a single airport information desk staffed by one agent per passenger (the Thread-per-Connection model). If 1,000,000 passengers all arrive at the same time, you need 1,000,000 agents. The staff room is too big to exist.

Now redesign the airport with a giant electronic **Departure Board** (the event loop + `epoll`). A small team of 8 information officers manage the board. When a passenger has a question, they don't stand at a counter — they tap their boarding pass on an NFC pad, leave their question, and wander off to the café. The board lights up when an answer is ready. An officer updates the board for any passenger whose question was resolved. 8 officers serve 1,000,000 passengers concurrently.

---

## 🔬 Architecture Deep Dive: The C10K to C1M Journey

The "C10K Problem" (handling 10,000 concurrent connections) was published in 1999 by Dan Kegel. It exposed the catastrophic failure of the traditional "thread per connection" model and drove the invention of `epoll`. Today the goal is the C1M (1 million connection) problem.

### Why "One Thread Per Connection" Fails

If a server spawns one OS thread per incoming connection:
*   **Stack Memory:** Each thread gets an 8MB virtual stack by default. 1M threads × 8MB = **8,000 GB** virtual address space. This exceeds the 64-bit virtual address space for a single process.
*   **Context Switching Overhead:** The kernel scheduler must cycle through 1M runnable tasks even when 999,990 are simply waiting on the network. This swamps the scheduler and the TLB.
*   **Thread Creation Latency:** Spawning a thread takes microseconds — far too slow for bursts of incoming connections.

### Solution 1: Non-Blocking I/O + `epoll` (The Foundation)

Step 1 of the C1M solution is always eliminating the per-connection thread.

```c
// Server pseudocode using epoll
int server_fd = create_nonblocking_server_socket(8080);
int epoll_fd  = epoll_create1(0);

epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &(struct epoll_event){
    .events = EPOLLIN,
    .data.fd = server_fd
});

while (true) {
    // Block here, sleeping, consuming ZERO CPU
    int n = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

    for (int i = 0; i < n; i++) {
        if (events[i].data.fd == server_fd) {
            // New connection: accept, set non-blocking, register with epoll
            int conn_fd = accept4(server_fd, NULL, NULL, SOCK_NONBLOCK);
            epoll_ctl(epoll_fd, EPOLL_CTL_ADD, conn_fd, &(struct epoll_event){
                .events = EPOLLIN | EPOLLET, // Edge-Triggered!
                .data.fd = conn_fd
            });
        } else {
            // Existing connection: data arrived, read and respond
            handle_connection(events[i].data.fd);
        }
    }
}
```

**Key flags:**
*   `SOCK_NONBLOCK`: All `read()` / `write()` return immediately with `EAGAIN` instead of blocking.
*   `EPOLLET` (Edge-Triggered): Only notified on state *transitions* (data arrived, not just "data available"). Requires draining the socket completely in a loop. Avoids the Level-Triggered's overhead of waking up for every single `read()`.

### Solution 2: Multi-Threading on Top of `epoll`

A single event loop saturates one CPU core. To scale across all 64 CPU cores on a server:
**One `epoll` instance per CPU core + `SO_REUSEPORT`.**

```
Core 0:  epoll instance 0 ─── 12,500 connections ──► Worker Thread 0
Core 1:  epoll instance 1 ─── 12,500 connections ──► Worker Thread 1
...
Core 63: epoll instance 63 ── 12,500 connections ──► Worker Thread 63
```

`SO_REUSEPORT` (see Solution 18) allows 64 independent TCP listener sockets to all bind to port 443. The kernel hashes incoming connections and distributes them evenly — each worker thread's `epoll` only manages its own slice of connections. Zero cross-thread locking for the fast path.

### Solution 3: OS Tuning for 1M Sockets

The kernel itself has numerous per-system caps on sockets that must be raised for the C1M goal.

```bash
# 1. File Descriptor Limit (Each socket = 1 fd)
ulimit -n 1048576
# Or permanently in /etc/security/limits.conf:
# * soft nofile 1048576
# * hard nofile 1048576

# 2. Kernel-wide fd limit
echo 2097152 > /proc/sys/fs/file-max

# 3. TCP Buffer Memory (avoid OOM when 1M sockets buffer data)
# min, default, max in bytes
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"

# 4. epoll event limits
sysctl -w fs.epoll.max_user_watches=524288

# 5. TCP Backlog (number of unaccepted connections in the listen queue)
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535

# 6. Port range for outbound connections (if acting as a proxy/client)
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```

### Solution 4: io_uring (The Future)

`io_uring` (Linux 5.1+) goes beyond `epoll` by allowing async I/O for **all** operations including file I/O and DNS, using two ring buffers in shared memory between kernel and userspace — eliminating even the `epoll_wait` system call overhead for the fast path. Nginx, RocksDB, and storage systems are increasingly adopting it.

### Full System Architecture Diagram

```
                        Internet
                           │
                           │ TCP SYN flood → SYN Cookie protection
                           ▼
                 ┌─────────────────────┐
                 │    Load Balancer     │  L4/L7 (HAProxy / Nginx)
                 │   SO_REUSEPORT      │  Distributes across backends
                 └─────────┬───────────┘
                           │
           ┌───────────────┼───────────────────┐
           │               │                   │
    ┌──────▼──────┐  ┌─────▼──────┐   ┌───────▼──────┐
    │  Server 1   │  │  Server 2  │   │   Server N   │  (64-core, 256GB RAM)
    │  64 threads │  │  64 threads│   │  64 threads  │
    │  64 epolls  │  │  64 epolls │   │  64 epolls   │
    │  ~16K conn/ │  │  ~16K conn/│   │  ~16K conn/  │
    │  per thread │  │  per thread│   │  per thread  │
    └──────┬──────┘  └────────────┘   └──────────────┘
           │
    ┌──────▼──────────────────────┐
    │  Shared State (Redis/Cache) │  Session data, rate limiting
    └─────────────────────────────┘
```
