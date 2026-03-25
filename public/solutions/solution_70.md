# Solution 70: CPU Cache Hierarchy — L1, L2, L3

## The Problem
Cache hierarchy: L1, L2, L3 behavior and their impact on performance.

---

## 💡 The Analogy: The Chef's Workspace

Imagine a professional chef (the CPU Core) cooking a complex meal.
*   **Registers (The Chef's Hands):** The tiny amount of food actively being touched right this second. Access is instantaneous (1 CPU cycle), but he can only hold about 5 things simultaneously.
*   **L1 Cache (The Countertop):** A small cutting board right in front of the chef. He keeps the most-recently-used ingredients here. Blindingly fast to grab (4 cycles), very small (32–64KB per core).
*   **L2 Cache (The Dedicated Pantry Cabinet):** A cabinet right beside the chef's station. Bigger, slightly further away (12 cycles), holds more (256KB – 1MB per core).
*   **L3 Cache (The Walk-In Refrigerator):** Shared by all the chefs in the kitchen (all cores on the CPU die). Takes a short walk (40+ cycles) but holds massive amounts (8–64MB shared).
*   **Main RAM (The Grocery Store):** A car trip away (100+ cycles), holds gigabytes.
*   **SSD (The Drive-Through Distribution Center):** Even further (10,000+ cycles).
*   **HDD (Far Away Warehouse):** 500,000+ cycles. Practically inaccessible during a busy dinner service.

---

## 🔬 Deep Dive: The Hardware Reality

Modern CPUs don't operate on individual bytes from RAM every cycle. The memory bandwidth and latency is astronomically too slow. Instead, they maintain a multilevel hierarchy of tiny, lightning-fast Static RAM (SRAM) caches directly on the CPU die.

### Typical Specifications (Modern Intel/AMD, ~2024)

| Level | Latency | Size | Scope |
|---|---|---|---|
| **Registers** | 0 cycles | ~16 × 8 bytes | Per Core |
| **L1 Cache** | 4–5 cycles | 32KB–64KB | Per Core (split: 32KB I-Cache + 32KB D-Cache) |
| **L2 Cache** | 12–15 cycles | 256KB–1MB+ | Per Core |
| **L3 Cache** | 40–60 cycles | 8MB–192MB | Shared across all cores |
| **DRAM** | ~80–100ns (~300-400 cycles) | GBs | System-wide |

### How the Cache Works: Cache Lines and Hierarchy

The CPU doesn't fetch individual bytes from RAM. Every time any level of the cache needs data, it fetches an entire **Cache Line** (64 bytes contiguously from memory). This aligns with the Spatial Locality principle — if you accessed byte 100, you will very likely access bytes 101–163 shortly after.

**On a Cache Hit (L1):**
CPU asks for the value at address `0xABCD`. L1 checks its tag array (using the upper bits of the address). If found, the data is returned in 4 cycles.

**On an L1 Cache Miss, L2 Hit:**
L1 was searched but not found. The miss is forwarded one level up. L2 is checked. Found! L2 returns the 64-byte cache line to L1 (which evicts an existing cache line based on LRU), and forwards the requested value to the CPU registers.

**On a Full Cache Miss (L3 Miss):**
None of the three cache levels had the data. The CPU's Memory Controller sends a DRAM read request. The DRAM controller locates the physical row and column, opens the row (Row Hammer analogy), amplifies the tiny capacitor charge, and sends 64 bytes back over the memory bus. This has a multi-hundred cycle latency. The CPU stalls — it literally cannot progress the current instruction. This is called **waiting on a Memory Stall**.

### The Shared L3: Core-to-Core Communication
The L3 is shared among all cores on a single physical CPU die. This is crucial for multi-threaded applications:
When **Core 0** writes an integer that **Core 1** also holds a cached copy of, the hardware's **Cache Coherence Protocol** (typically MESI on x86) invalidates Core 1's stale L1/L2 copy. Core 1 then fetches the new value via the L3 interconnect, NOT from DRAM. This makes L3 critical — core-to-core communication latency is bounded by L3 speed.

---

## 💻 Code Example: Cache-Friendly vs Cache-Unfriendly Access

This is one of the most impactful performance differences in systems programming.

```c
#include <stdio.h>
#include <time.h>
#include <stdint.h>

#define N 4096
int matrix[N][N];

// CACHE-FRIENDLY: Row-major traversal (C arrays are row-major)
// Access pattern: [0][0], [0][1], [0][2], ...
// Each step is 4 bytes forward -> stays within the same 64-byte Cache Line.
void row_major() {
    long sum = 0;
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++)
            sum += matrix[i][j];
}

// CACHE-UNFRIENDLY: Column-major traversal
// Access pattern: [0][0], [1][0], [2][0], ...
// Each step jumps 4096 * 4 = 16KB forward -> different Cache Line EVERY TIME.
// Causes ~16 million L1 cache misses, promoting to L3 or DRAM every access.
void col_major() {
    long sum = 0;
    for (int j = 0; j < N; j++)
        for (int i = 0; i < N; i++)
            sum += matrix[i][j];
}

int main() {
    // Typical results on modern hardware with N=4096:
    // row_major() -> ~  30ms  (data is always in L1/L2 cache)
    // col_major() -> ~1200ms  (40x slower due to constant L3/DRAM fetches)
    return 0;
}
```

**False Sharing (Multi-Core Cache Pitfall):**
```c
// Two threads each increment their own counter.
// BUT if both counters land on the same 64-byte Cache Line, 
// incrementing counter_a invalidates the line on Core B's L1,
// and vice versa. Both cores thrash the shared cache line, 
// running SLOWER than a single-threaded solution.
struct {
    int counter_a; // Byte 0-3
    int counter_b; // Byte 4-7 -- SAME cache line as counter_a!
} shared;

// FIX: Pad to separate cache lines:
struct {
    int counter_a;
    char _padding_a[60];  // Push counter_b to the next 64-byte line
    int counter_b;
} padded_shared;
```
