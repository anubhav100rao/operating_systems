# Problem 71: Reducing Context Switches in High-Performance Systems

A **context switch** is the act of the OS saving the CPU state of one thread and loading the state of another. While necessary for multitasking, context switches are expensive, costing anywhere from 2,000 to 100,000+ cycles when accounting for cache disruption. Minimizing them is crucial for latency-sensitive and high-throughput systems.

## 1. Why Context Switches Are Expensive (Quick Recap)

| Cost Component | Source |
|---|---|
| Saving/restoring registers | Direct instruction cost: ~100–200 cycles |
| TLB flush (or `CR3` write with KPTI) | ~200–500 cycles + TLB miss cascade |
| L1/L2 cache eviction | New thread's data is cold: **1,000–100,000+ cycles** |
| Branch predictor pollution | History tables cleared implicitly on switch |

The cache cold-start is by far the dominant cost. A thread that was evicted while computing heavy number-crunching will experience dozens of cache misses when it next resumes.

## 2. Technique 1 — Use Fewer Threads (Event-Driven Architecture)

The classic mistake is spawning one thread per connection/client (e.g., "thread-per-request" Apache model). With 10,000 clients, you have 10,000 threads. Since most are blocked on I/O at any given moment, the OS constantly context-switches between them.

**The Fix:** Use a small, fixed thread pool combined with an event notification system (`epoll` on Linux).

```c
// Event-driven server: 1 thread handles thousands of connections
// No per-connection thread, no context switching between them
int epfd = epoll_create1(0);
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &event);

while (1) {
    // Single blocking call — no spinning waste
    int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
    for (int i = 0; i < n; i++) {
        handle_event(events[i]); // Process ready fds immediately
    }
}
```
**Rule of thumb:** The optimal thread count for I/O-bound work is `num_cpu_cores`. For CPU-bound work, it is `num_cpu_cores` (no benefit to more).

## 3. Technique 2 — CPU Pinning (Affinity)

If a thread must always run, pin it to a dedicated CPU core so the OS scheduler never migrates it.

```c
#define _GNU_SOURCE
#include <sched.h>

cpu_set_t set;
CPU_ZERO(&set);
CPU_SET(3, &set); // Dedicate Core 3 entirely to this thread
pthread_setaffinity_np(pthread_self(), sizeof(set), &set);
```

By dedicating Core 3, the thread's data stays hot in that core's L1/L2 cache indefinitely. The OS never touches it. Used extensively in high-frequency trading and real-time audio.

## 4. Technique 3 — Cooperative Scheduling / Coroutines (User-Space)

Instead of the OS violently preempting threads, switch between tasks cooperatively in userspace. Coroutines (like Go goroutines, Rust async, Python `asyncio`) yield control explicitly at I/O boundaries. The scheduler switching between coroutines is simply a function call — no kernel involvement, no TLB flush, no privilege switch.

**Context switch cost comparison:**
- OS thread context switch: ~5–10 microseconds
- Coroutine switch (userspace): ~50–200 nanoseconds (100x cheaper)

## 5. Technique 4 — Busy Polling / Spin Loops (Extreme Latency)

For the absolute lowest latency (e.g., kernel bypass networking with DPDK), completely abandon blocking I/O. A dedicated CPU core sits in a tight `while(1)` loop checking the NIC ring buffer.

```c
while (1) {
    // Poll the NIC ring buffer directly (no syscall, no interrupt, no sleep)
    uint16_t nb_rx = rte_eth_rx_burst(port_id, 0, pkts, BURST_SIZE);
    if (nb_rx > 0) process_packets(pkts, nb_rx);
}
```
There are zero context switches because the thread never sleeps. The CPU core appears 100% busy in `top`, but it is making genuine forward progress.

## 6. Technique 5 — Work Stealing Thread Pools

Reduce idle threads waiting for work by using a **work-stealing** scheduler (like Go's runtime or Intel TBB). If a thread's own queue is empty, it "steals" work from a sibling thread's queue, keeping all cores active with zero OS-level scheduling intervention.

## Analogy: The Restaurant Kitchen
- **One thread per customer (bad):** Hiring 500 chefs for 500 customers. Most chefs stand idle, bumping into each other (thrashing). The manager (OS scheduler) spends all day allocating stations.
- **Event-driven (good):** Hiring 8 chefs (= 8 CPU cores) who each handle many orders by working on whatever is ready next. No idle chefs, no manager overhead.
- **CPU pinning:** One chef owns the grill station permanently. All their tools are pre-positioned. They never waste time finding equipment.
- **Busy polling:** A specialized chef stares at the ticket machine and grabs new orders the instant they print, rather than waiting to be tapped on the shoulder (interrupt).
