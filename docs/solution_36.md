# Problem 36: What is NUMA Memory Allocation? How does it affect performance?

As servers grew to support dozens or hundreds of CPU cores, the traditional motherboard architecture hit a physical bottleneck. If 64 cores all try to read from the exact same central bank of RAM over a single shared bus, a massive traffic jam occurs.

To solve this, hardware designers created NUMA: **Non-Uniform Memory Access**.

## 1. The Analogy: The Multi-Office Tech Company

Imagine a company with two separate, large office buildings (CPU Socket 0 and CPU Socket 1) situated across the street from each other.

*   Each building has its own local filing cabinet (Local RAM bank).
*   There is an underground pneumatic tube connecting the two buildings (the QPI / HyperTransport interconnect).
*   **The Problem:** If Alice (Core in Socket 0) needs a document, checking her own building's filing cabinet takes 5 seconds. However, if the document she needs is stored in the *other* building's filing cabinet, she has to use the underground tube. This "remote access" takes 15 seconds.
*   **The OS Role:** A smart OS (the office manager) ensures that Alice is assigned to a desk in the same building where her project's documents are stored.

## 2. How NUMA Works

In a NUMA system, CPU cores are grouped into "Nodes" (typically mapped to physical CPU sockets). Each Node has its own dedicated physical block of RAM directly attached to it. 

*   **Uniform Memory Access (UMA):** Historical architecture. All CPUs map to one central memory controller. Latency is the same for everyone.
*   **NUMA:** A CPU can access *any* memory on the system. However, the access latency is **Non-Uniform**. Accessing memory belonging to its own Node might take ~70ns. Accessing memory on an adjacent Node requires crossing an interconnect bus (like Intel's QPI - QuickPath Interconnect), which might take ~120ns. 

## 3. The "First Touch" Policy

The most critical OS mechanism governing NUMA performance is the **First-Touch Allocation Policy**.

When you call `malloc(1024 * 1024)` to allocate 1MB of memory, the OS doesn't actually give you physical RAM right away. It just gives you virtual address space.

Physical memory is only assigned the very first time a thread actually writes data to that pointer (causing a page fault). *Crucially, the Linux kernel looks at which CPU core caused the page fault, and attempts to allocate the physical memory from that specific CPU's local NUMA node.*

## 4. Performance Pitfalls

If you are unaware of NUMA, you can destroy a server's performance.

**The Initialization Anti-Pattern:**
Imagine a heavy multi-threaded application doing matrix multiplication. 

```c
#include <stdlib.h>
#include <pthread.h>

#define SIZE 100000000
int *data;

// Thread 0 runs this function first
void init_data() {
    data = malloc(SIZE * sizeof(int));
    // DANGER: First Touch!
    // Thread 0 is running on CPU Node 0. It iterates over the entire array.
    // The OS allocates the ENTIRE massive array onto Node 0's physical RAM.
    for (int i = 0; i < SIZE; i++) {
        data[i] = 0; 
    }
}

// 64 different worker threads across both Node 0 and Node 1 run this
void compute_data(int start, int end) {
    for (int i = start; i < end; i++) {
        data[i] = data[i] * 2; // Node 1 threads must cross the slow interconnect!
    }
}
```

**Why it fails:** 
The main initialization thread (running on Node 0) touched all the memory first. Therefore, 100% of the memory physically lives on Node 0. When 32 worker threads spun up on Node 1 try to read their chunk of the array, all 32 threads blast the QPI interconnect link with requests, causing massive latency and saturating the hardware bus limit.

**The Fix:**
You must initialize the memory *in parallel* using the threads that will actually compute it.
```c
void init_and_compute_data(int start, int end) {
    // Each worker thread touches its specific chunk of the array first.
    // The array gets physically split across Node 0 and Node 1 perfectly!
    for (int i = start; i < end; i++) {
        data[i] = 0; 
    }
    // ... later compute
}
```

## 5. Controlling NUMA

On Linux, administrators and developers use explicit tools to control this:

*   **`numactl`:** A command-line tool to force a process to run on a specific node or allocate memory from a specific node.
    *   `numactl --interleave=all ./my_app` (Forces pages to be round-robined across all nodes to prevent bus saturation if you can't optimize your code).
*   **`libnuma` / `get_mempolicy()`:** C library functions to query and pin thread affinity directly in code.
