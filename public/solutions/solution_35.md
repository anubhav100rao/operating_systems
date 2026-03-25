# Solution 35: Demand Paging, Pre-Paging, and Memory Overcommit

## The Problem
Demand paging vs pre-paging. Memory overcommit in Linux.

---

## 💡 The Analogy: The Airline and the Buffet

**Demand Paging vs Pre-Paging (The Buffet):**
*   **Pre-Paging:** You go to a buffet, and the waiter immediately stacks your table with 20 plates of random food based on what previous customers usually eat. You might eat it all (great success!), or you might not be hungry and 15 plates go to waste (wasted memory and I/O bandwidth).
*   **Demand Paging:** You go to a buffet, and the table is completely empty. The waiter only brings a plate of food *exactly when you ask for it*. Zero wasted food, but you have to wait a few minutes every single time you want a new dish (Latency).

**Memory Overcommit (The Airline Overbooking):**
An airline sells 200 tickets for a flight that only has 150 physical seats. Why? Because decades of statistics show that 30% of passengers never show up (allocating memory but never using it). By overbooking, the airline maximizes profits and efficiency.
But what happens during Thanksgiving when all 200 people show up? The airline panics and forcibly drags 50 people off the plane (The Overcommit Failure / OOM Killer).

---

## 🔬 Deep Dive: Paging Strategies

### 1. Demand Paging
This is the foundational strategy of almost all modern OSs. When a process starts, or when you call `mmap()`, the OS allocates **Page Table Entries (Virtual Memory)** but assigns **zero Physical RAM**.
*   **How it works:** Memory is strictly allocated lazily via Page Faults.
*   **Pros:** Perfectly efficient memory utilization. Start-up times are instantaneous because we don't load the entire multi-gigabyte executable from disk into RAM.
*   **Cons:** Incurs hundreds of micro-latencies (Page Fault overhead) as the program executes and touches new memory.

### 2. Pre-Paging (Read-Ahead)
Demand paging is slow if you are sequentially reading an array or a massive video file. The OS realizes that if you faulted on Page 1, you are extremely likely to fault on Page 2, 3, and 4 in the next microsecond. 
*   **How it works:** The OS I/O scheduler issues a DMA read for multiple sequential pages ahead of time.
*   **Pros:** Hides disk latency entirely for predictable, sequential workloads.
*   **Cons:** In unpredictable (random access) workloads, it pollutes the page cache with useless data and wastes disk bandwidth.

*(Note: Linux allows standard Demand Paging but aggressively enables kernel Read-Ahead for file operations. Developers can also manually trigger pre-paging using `madvise(MADV_WILLNEED)` to warm up the cache).*

---

## 🛑 Memory Overcommit in Linux

Linux has a famously controversial philosophy: **"Assume they don't really mean it."**

When you call `malloc(10 * 1024 * 1024 * 1024)` (Ask for 10 GB of RAM), a strict OS (like early Solaris) will calculate: `Total RAM + Swap - Currently Used`. If you only have 8GB free, it returns `NULL`. The application panics and crashes.

Linux, by default, utilizes **Overcommit**. It will instantly return a valid virtual pointer for the 10GB allocation, even if the system only has 2GB of physical RAM left.

### Why on earth does Linux do this?
1.  **The `fork()` problem:** When a 5GB database engine forks a child to handle a background task, `fork()` magically "duplicates" the 5GB address space. If the OS was strict, `fork()` would fail if the system didn't have another free 5GB of RAM. But because of Copy-on-Write, the child will probably only ever write to 10MB of memory before calling `exec()`. Rejecting the `fork()` is needlessly pessimistic.
2.  **Sparse Arrays:** Programmers allocate massive data structures "just in case" but only populate a fraction of them. Thanks to Demand Paging, untouched virtual memory consumes zero physical RAM frames.

### The Catastrophic Failure Mode
Overcommit is a gamble. What if the C programmer decides to `memset(ptr, 0, 10GB)`? They are now formally demanding the physical frames.
The system will rapidly hit 100% RAM exhaustion. Because the kernel already promised the memory to the application, it cannot suddenly return `NULL` (the application already moved past the `if (ptr == NULL)` check long ago).

The kernel has its back against the wall. It must invoke the **OOM (Out Of Memory) Killer**.
The OOM Killer pauses the entire system, algorithmically targets the process consuming the most memory (or the one that grew fastest), and sends a brutal, uncatchable `SIGKILL`. 
Your 10-hour database job is instantly vaporized to save the OS from kernel panic.

### Controlling Overcommit
Administrators can tune this via `sysctl vm.overcommit_memory`:
*   `0`: (Default) Heuristic overcommit. The kernel tries to be smart and rejects obviously absurd requests (like asking for 100 Terabytes).
*   `1`: Always overcommit. Never say no.
*   `2`: Strict accounting. The total allocated virtual memory cannot exceed `Swap + (RAM * overcommit_ratio)`. Safer, but massively increases `malloc` failures.
