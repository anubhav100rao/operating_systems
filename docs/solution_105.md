# Problem 105: Process Consuming 8GB RSS but Only 500MB is Actually In Use

> **Scenario:** A process shows 8GB of RSS (Resident Set Size) in `top` or `ps`, but profiling suggests only ~500MB of actual working data. What could explain this? How would you diagnose it?

This is a classic production memory mystery. RSS (the amount of physical RAM a process's pages are currently occupying) can substantially exceed a process's actual "useful" data for several distinct reasons.

## 1. What RSS Actually Measures

```
Virtual Memory (VAS): All virtual address ranges mapped (can be terabytes)
RSS (Resident Set Size):  Subset of VAS that is currently backed by physical RAM pages
Working Set / Active:  Pages touched in the last N seconds
```

RSS being large doesn't mean the data is being *used*, only that the pages are still loaded in RAM and haven't been evicted yet.

## 2. Root Causes of Inflated RSS

### A. Memory Leaks (Most Common)
The process allocates objects on the heap and loses all references to them without calling `free()`. The heap grows. Even though the data is semantically garbage, the pages remain in RAM until the process exits or is killed.

**Detection:** Watch RSS grow monotonically over time with `watch -n 1 'ps -o rss= -p <PID>'`. If it only ever goes up, there is a leak.

### B. Memory Fragmentation
`malloc` can hold onto freed memory internally rather than returning it to the OS via `brk()`. After a burst of allocations followed by frees of varying sizes, the `ptmalloc` heap becomes highly fragmented. The pages are "free" from the application's perspective but still physically resident (RSS is still high) because `malloc` hasn't called `munmap()` to release them.

**Detection:** High discrepancy between `Heap` size in `/proc/PID/smaps` and `mallinfo()`'s reported in-use bytes.

### C. Shared Library Mappings
`ldd my_program` shows dozens of shared libraries (`.so` files) mapped via `mmap`. Their `.text` and `.data` sections contribute to RSS even if only 1% of their code is ever called.

**Detection:** `pmap -x <PID>` shows each mapped region's RSS contribution. You'll see huge chunks attributed to `libc.so`, `libstdc++`, OpenSSL, etc.

### D. Memory-Mapped Files (`mmap`)
If the process maps a large file but only ever reads tiny sections of it, the OS page fault handler loads pages on demand. Over time, many scattered pages from the large file accumulate in RAM. This can look like a huge RSS with very little active computation.

**Detection:** Look for `file` vs `anon` mappings in `/proc/PID/smaps`.

### E. JVM / Runtime Over-Allocation
Java, Go, and Python runtimes pre-allocate large heap arenas. The JVM's G1GC, for example, maps the entire `-Xmx` value (e.g., 8GB) upfront over time even if only 500MB of live objects exist. Similarly, Go's runtime can keep pages mapped even after objects are GC'd.

### F. Huge Pages / THP Inflation
Transparent Huge Pages (THP) allocates 2MB pages even if only a few KB of data is accessed within that huge page. Many huge pages = inflated RSS.

## 3. Diagnosis Toolkit — Step by Step

### Step 1: Get a High-Level View
```bash
# Quick overview: VSZ (virtual), RSS (resident), %MEM
ps aux | grep <process_name>

# Or live and updating
top -p <PID>
```

### Step 2: `pmap` — Per-Mapping Breakdown
```bash
# -x for extended info: size, RSS, dirty pages per mapped region
pmap -x <PID> | sort -k3 -n | tail -30
```
This shows each memory mapping sorted by RSS. You'll immediately see which `.so` libraries or `anon` regions are the biggest offenders.

### Step 3: `/proc/PID/smaps` — Full Forensic Detail
This virtual file gives the most detailed breakdown of every virtual memory area (VMA):
```bash
cat /proc/<PID>/smaps | grep -A 20 "heap"
```
Key fields to look for:
```
Size:           8388608 kB   <- Virtual size of this region
Rss:            7890432 kB   <- Physically resident pages
Pss:            3945216 kB   <- Proportional (shared pages counted once)
Shared_Clean:         0 kB
Shared_Dirty:         0 kB
Private_Clean:        0 kB
Private_Dirty:  7890432 kB   <- HUGE private dirty -> heap or anonymous allocations
Swap:                 0 kB
Referenced:     7890432 kB   <- Pages accessed at least once
Anonymous:      7890432 kB   <- Heap/stack (not backed by a file)
```
If `Private_Dirty` and `Anonymous` are both huge for a region labeled `[heap]`, it confirms actual heap allocations (not just mapped files).

### Step 4: `/proc/PID/smaps_rollup` — Summary of All VMAs
```bash
cat /proc/<PID>/smaps_rollup
```
Gives a single-line summary aggregating all VMAs: total RSS, PSS, Anonymous, File-backed. Useful for quick comparison.

### Step 5: Detect Leaks with `valgrind` or `AddressSanitizer`
```bash
# Valgrind memcheck: catches use-after-free and leaks at exit
valgrind --leak-check=full --show-leak-kinds=all ./myprogram

# AddressSanitizer (compile-time instrumentation, faster than valgrind)
gcc -fsanitize=address -g ./myprogram.c -o myprogram
./myprogram  # Reports leaks and corruptions automatically
```

### Step 6: `bpftrace` — Runtime Heap Monitoring
For production processes where you cannot restart, use eBPF to trace `malloc`/`free` calls live without modifying the binary:
```bash
# Trace the top allocators in real time
bpftrace -e '
uprobe:/lib/x86_64-linux-gnu/libc.so.6:malloc {
    @alloc_stacks[ustack] = sum(arg0);
}
interval:s:10 { print(@alloc_stacks); clear(@alloc_stacks); }
'
```

### Step 7: `heaptrack` or `jemalloc` Profiling
```bash
# heaptrack: records all heap allocations and produces a flamegraph
heaptrack ./myprogram
heaptrack_print heaptrack.myprogram.*.gz | less
```

## 4. Remediation by Root Cause

| Root Cause | Fix |
|---|---|
| Memory leak | Fix the bug; use RAII / smart pointers in C++ |
| `malloc` fragmentation | Call `malloc_trim(0)` periodically; or switch to `jemalloc`/`tcmalloc` |
| Shared libraries | Lazy-load rarely-used `.so`s; strip unused symbols |
| JVM over-allocation | Tune `-Xms`, `-Xmx`, `MaxHeapFreeRatio`; use aggressive GC flags |
| THP inflation | Disable THP: `echo madvise > /sys/kernel/mm/transparent_hugepage/enabled` |
| `mmap` accumulation | Call `madvise(ptr, len, MADV_DONTNEED)` on regions no longer needed |

## 5. The `MADV_DONTNEED` Pattern
If the application holds a huge pre-allocated buffer but stops using most of it, it can voluntarily tell the kernel to evict those pages without losing the virtual address range:
```c
// Signal to kernel: "I'm done with these pages, you can reclaim them"
// The virtual mapping still exists, but pages are freed from RAM
// Next access will trigger a page fault and reload fresh (zeroed) pages
madvise(buffer + (512 * 1024 * 1024), // Start at 500MB mark
        (8UL * 1024 * 1024 * 1024) - (512 * 1024 * 1024), // Remaining 7.5GB
        MADV_DONTNEED);
// After this call, RSS drops from 8GB to ~500MB
```

## Analogy: The Overstuffed Office
A company has rented 40 offices (virtual memory) and has employees actively using 2 of them (working set). The remaining 38 offices still have furniture and old files inside from previous tenants (fragmented heap, stale mapped pages). The building manager's ledger shows 40 occupied offices (RSS = 8GB), but only 2 have anyone actively working in them.

**Diagnosis:** Walk down the hallway with a clipboard (`pmap -x`). Open each office door (`/proc/PID/smaps`) and count if anyone is inside (Referenced/Dirty pages). **Remediation:** Throw out the old files (`MADV_DONTNEED`) or actually evict the empty offices (fix leaks).
