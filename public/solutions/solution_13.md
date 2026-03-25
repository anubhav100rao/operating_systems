# Problem 13: CPU Affinity and NUMA-Aware Scheduling

## 1. CPU Affinity

**CPU Affinity** (or CPU pinning) is the process of binding a specific process or thread to one or more specific CPU cores. By default, the OS scheduler will freely move threads across any available core to balance the load throughout the entire system. Setting affinity forces the thread to stay exclusively on the assigned cores.

### Why Does It Matter?
If a thread runs on Core 0, the L1 and L2 caches of Core 0 get filled with the thread's data and instructions over time. If the OS suddenly migrates the thread to Core 3, the thread suffers a massive performance hit because Core 3's caches are completely cold regarding that thread's data (cache misses spike).

Setting CPU affinity ensures **cache locality**. It is absolutely critical for:
*   High-frequency trading platforms minimizing microseconds.
*   Real-time audio/video processing avoiding jitter.
*   Database engines running specific workers.

### Analogy
Imagine working in an office with unassigned desks (hot-desking). Every day you sit at a new desk. You have to spend 20 minutes pulling your files from a remote cabinet to your new desk. If you have **affinity** for Desk 4, you sit there every single day. Your files are always right there in the drawers, allowing you to start fast instantly.

### Code Example (Linux)

```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <unistd.h>

int main() {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);      // Clear the CPU set
    CPU_SET(2, &cpuset);    // Pin to Core 2

    // Apply affinity to current process (PID 0)
    if (sched_setaffinity(0, sizeof(cpu_set_t), &cpuset) == -1) {
        perror("sched_setaffinity failed");
        return 1;
    }
    
    printf("Process mathematically bound to CPU Core 2.\n");
    while(1) { /* Intensive work benefiting from L1 cache */ }
    return 0;
}
```

---

## 2. NUMA (Non-Uniform Memory Access)

In modern dual-socket server architectures, CPUs don't share a single pool of motherboard RAM equally via a generic bus anymore.
Instead, the architecture is categorized dynamically as **NUMA**:
*   CPU Socket 0 has its own local RAM bank physically close to it.
*   CPU Socket 1 has its own local RAM bank physically close to it.

Both CPUs can technically access *all* memory on the machine, but CPU 0 accessing CPU 1's RAM requires traveling across an interconnect bus (like Intel QPI or AMD Infinity Fabric), which adds severe latency and reduces bandwidth. 

### NUMA-Aware Scheduling
A standard ignorant scheduler might schedule a thread on CPU 0, but allocate its memory on CPU 1's RAM node. Every memory read incurs a cross-bus latency penalty.

A **NUMA-aware scheduler**:
1.  **Memory First:** When a thread allocates memory (`malloc`), the OS physically allocates RAM pages from the node local to the CPU the thread is currently executing on.
2.  **Scheduling First:** The operating system scheduler attempts to keep the thread pinned strictly to the NUMA node where the majority of its memory resides to avoid inter-node traffic.

### Analogy
Two massive office buildings (CPU 0 and CPU 1) are connected by a bridge. Building A has a massive library (RAM A), Building B has a library (RAM B). A worker in Building A can walk across the bridge to get a book from Building B, but it takes 10 extra minutes. A intelligent NUMA-aware HR department ensures that if you are stationed to work in Building A, all your necessary reference books are explicitly stocked in Building A's library.
