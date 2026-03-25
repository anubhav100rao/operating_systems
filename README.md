# OS Concepts

A curated operating systems question bank with one markdown solution file per problem.

## Quick Links

- [Problem Bank](./docs/problems.md)
- [Run the app locally](#run-locally)
- [Solutions Directory](./docs/)

## Run Locally

```bash
npm install
npm run sync:solutions
npm start
```

## Problem Index

## Processes, Threads & Scheduling

Processes, threads, context switching, scheduling, and signals.

### 1. Explain the difference between a process context switch and a thread context switch at the hardware level. What exactly gets saved/restored in each case?

<a href="./docs/solution_1.md"><kbd>Show Solution</kbd></a>

### 2. How does the Linux CFS (Completely Fair Scheduler) work internally? How does it use a red-black tree and virtual runtime?

<a href="./docs/solution_2.md"><kbd>Show Solution</kbd></a>

### 3. What happens in the kernel between `fork()` returning and the child process actually executing? Walk through Copy-on-Write mechanics at the page table level.

<a href="./docs/solution_3.md"><kbd>Show Solution</kbd></a>

### 4. How does `vfork()` differ from `fork()`, and why is it dangerous? When would you still use it?

<a href="./docs/solution_4.md"><kbd>Show Solution</kbd></a>

### 5. Explain how POSIX signals are delivered to a multithreaded process. Which thread receives the signal and why?

<a href="./docs/solution_5.md"><kbd>Show Solution</kbd></a>

### 6. Difference between process, thread, fiber, coroutine (with real OS mapping)

<a href="./docs/solution_6.md"><kbd>Show Solution</kbd></a>

### 7. How does `fork()` differ from `clone()` in Linux?

<a href="./docs/solution_7.md"><kbd>Show Solution</kbd></a>

### 8. What happens if parent exits before child? Zombie vs orphan processes and how the kernel handles them.

<a href="./docs/solution_8.md"><kbd>Show Solution</kbd></a>

### 9. How does `exec()` replace process memory?

<a href="./docs/solution_9.md"><kbd>Show Solution</kbd></a>

### 10. How does a multi-threaded `fork()` behave? What happens if one thread calls `exec()`?

<a href="./docs/solution_10.md"><kbd>Show Solution</kbd></a>

### 11. Thread cancellation: deferred vs asynchronous. Thread-local storage implementation.

<a href="./docs/solution_11.md"><kbd>Show Solution</kbd></a>

### 12. Design a scheduler for: real-time systems, interactive workloads, batch systems. Compare Round Robin, MLFQ, CFS.

<a href="./docs/solution_12.md"><kbd>Show Solution</kbd></a>

### 13. What is CPU affinity and why does it matter? Explain NUMA-aware scheduling.

<a href="./docs/solution_13.md"><kbd>Show Solution</kbd></a>

### 14. How does Linux avoid starvation in its scheduling?

<a href="./docs/solution_14.md"><kbd>Show Solution</kbd></a>

## Concurrency & Synchronization

Locks, futexes, RCU, atomics, memory ordering, and lock-free programming.

### 15. Explain the implementation of a futex. How does it avoid syscalls in the uncontended case, and what happens in the contended path?

<a href="./docs/solution_15.md"><kbd>Show Solution</kbd></a>

### 16. What is priority inversion? Describe priority inheritance and priority ceiling protocols with concrete scenarios.

<a href="./docs/solution_16.md"><kbd>Show Solution</kbd></a>

### 17. How does RCU (Read-Copy-Update) work? Why is it better than reader-writer locks for read-heavy workloads in the kernel?

<a href="./docs/solution_17.md"><kbd>Show Solution</kbd></a>

### 18. Explain the thundering herd problem. How does `epoll` with `EPOLLEXCLUSIVE` or `SO_REUSEPORT` mitigate it?

<a href="./docs/solution_18.md"><kbd>Show Solution</kbd></a>

### 19. What's the difference between a spinlock, a mutex, and a semaphore at the implementation level? When is spinning better than sleeping?

<a href="./docs/solution_19.md"><kbd>Show Solution</kbd></a>

### 20. Implement a mutex using atomic instructions.

<a href="./docs/solution_20.md"><kbd>Show Solution</kbd></a>

### 21. Implement a semaphore using mutex + condition variables.

<a href="./docs/solution_21.md"><kbd>Show Solution</kbd></a>

### 22. Explain lock convoying and its impact on performance.

<a href="./docs/solution_22.md"><kbd>Show Solution</kbd></a>

### 23. ABA problem in lock-free structures. Hazard pointers vs epoch-based reclamation.

<a href="./docs/solution_23.md"><kbd>Show Solution</kbd></a>

### 24. Design a wait-free data structure.

<a href="./docs/solution_24.md"><kbd>Show Solution</kbd></a>

### 25. Memory ordering: Acquire / Release / Seq-Cst. Why does double-checked locking fail?

<a href="./docs/solution_25.md"><kbd>Show Solution</kbd></a>

### 26. False sharing, how to detect and fix it.

<a href="./docs/solution_26.md"><kbd>Show Solution</kbd></a>

## Memory Management

Virtual memory, page faults, allocators, OOM, `mmap`, and page replacement.

### 27. Walk through what happens when a process dereferences a virtual address, from the TLB lookup to a page fault to disk I/O. Include the role of the page table walker.

<a href="./docs/solution_27.md"><kbd>Show Solution</kbd></a>

### 28. Explain the difference between internal and external fragmentation in the context of the buddy allocator and slab allocator. Why does Linux use both?

<a href="./docs/solution_28.md"><kbd>Show Solution</kbd></a>

### 29. How does the kernel decide which pages to evict under memory pressure? Explain the LRU approximation (active/inactive lists) and how `kswapd` works.

<a href="./docs/solution_29.md"><kbd>Show Solution</kbd></a>

### 30. What is the OOM killer? How does it score processes, and what are the failure modes of relying on overcommit?

<a href="./docs/solution_30.md"><kbd>Show Solution</kbd></a>

### 31. How does `mmap()` work at the page table level? Explain the difference between file-backed and anonymous mappings and how demand paging ties in.

<a href="./docs/solution_31.md"><kbd>Show Solution</kbd></a>

### 32. Multi-level page tables, why are they needed? Explain inverted page tables.

<a href="./docs/solution_32.md"><kbd>Show Solution</kbd></a>

### 33. Why is LRU impractical? Compare CLOCK vs ARC vs LFU page replacement algorithms.

<a href="./docs/solution_33.md"><kbd>Show Solution</kbd></a>

### 34. Thrashing detection and mitigation. Explain the working set model.

<a href="./docs/solution_34.md"><kbd>Show Solution</kbd></a>

### 35. Demand paging vs pre-paging. Memory overcommit in Linux.

<a href="./docs/solution_35.md"><kbd>Show Solution</kbd></a>

### 36. What is NUMA memory allocation? How does it affect performance?

<a href="./docs/solution_36.md"><kbd>Show Solution</kbd></a>

## Virtual Memory & Address Spaces

KPTI, TLB shootdown, huge pages, and ASLR.

### 37. Explain how the kernel maps itself into every process's address space (KPTI/Kaiser). Why was this done and what's the performance cost?

<a href="./docs/solution_37.md"><kbd>Show Solution</kbd></a>

### 38. What is TLB shootdown? When does it happen and why is it expensive on multicore systems?

<a href="./docs/solution_38.md"><kbd>Show Solution</kbd></a>

### 39. How does Transparent Huge Pages (THP) work? What are the tradeoffs, when does it help and when does it hurt for latency-sensitive workloads?

<a href="./docs/solution_39.md"><kbd>Show Solution</kbd></a>

### 40. Explain ASLR, what gets randomized, how much entropy is typical, and what attacks does it defend against and fail to defend against?

<a href="./docs/solution_40.md"><kbd>Show Solution</kbd></a>

## File Systems & Storage

VFS, page cache, journaling, `fsync`, `io_uring`, SSDs, and crash recovery.

### 41. Trace a `write()` call from userspace to disk. Cover the VFS layer, page cache, writeback, I/O scheduler, and block device driver.

<a href="./docs/solution_41.md"><kbd>Show Solution</kbd></a>

### 42. What is the difference between `O_DIRECT` and buffered I/O? When would a database like Postgres or RocksDB prefer one over the other?

<a href="./docs/solution_42.md"><kbd>Show Solution</kbd></a>

### 43. Explain journaling in ext4, ordered mode vs writeback mode vs data journaling. What consistency guarantees does each provide?

<a href="./docs/solution_43.md"><kbd>Show Solution</kbd></a>

### 44. How does `fsync()` actually guarantee durability? What can go wrong, for example disk controller write caches or battery-backed controllers?

<a href="./docs/solution_44.md"><kbd>Show Solution</kbd></a>

### 45. Explain how `io_uring` works and why it's faster than `epoll` + `read/write` for high-throughput I/O.

<a href="./docs/solution_45.md"><kbd>Show Solution</kbd></a>

### 46. Inode structure in detail. Soft links vs hard links (edge cases).

<a href="./docs/solution_46.md"><kbd>Show Solution</kbd></a>

### 47. How does ext4 differ from XFS?

<a href="./docs/solution_47.md"><kbd>Show Solution</kbd></a>

### 48. What happens during crash recovery in a journaling filesystem?

<a href="./docs/solution_48.md"><kbd>Show Solution</kbd></a>

### 49. Why are LSM trees used in SSD systems? Explain write amplification and SSD garbage collection.

<a href="./docs/solution_49.md"><kbd>Show Solution</kbd></a>

### 50. Snapshotting via copy-on-write filesystems like ZFS. Design a distributed file system (like HDFS).

<a href="./docs/solution_50.md"><kbd>Show Solution</kbd></a>

## I/O Systems & Networking

Blocking vs non-blocking I/O, `epoll`, zero-copy, DMA, and kernel networking.

### 51. Blocking vs non-blocking I/O, explain the kernel mechanics of each.

<a href="./docs/solution_51.md"><kbd>Show Solution</kbd></a>

### 52. `select()` vs `poll()` vs `epoll()`, edge-triggered vs level-triggered `epoll`.

<a href="./docs/solution_52.md"><kbd>Show Solution</kbd></a>

### 53. Zero-copy techniques: `sendfile`, `mmap`. When and why are they faster?

<a href="./docs/solution_53.md"><kbd>Show Solution</kbd></a>

### 54. DMA (Direct Memory Access), how does it work and what does it offload from the CPU?

<a href="./docs/solution_54.md"><kbd>Show Solution</kbd></a>

### 55. How does the kernel handle a TCP connection? SYN queue vs accept queue.

<a href="./docs/solution_55.md"><kbd>Show Solution</kbd></a>

### 56. What happens when a server is overloaded? How does the kernel handle packet drops?

<a href="./docs/solution_56.md"><kbd>Show Solution</kbd></a>

## System Calls & Kernel Internals

`syscall`/`sysret`, cgroups, namespaces, interrupts, and kernel debugging.

### 57. What happens during a system call transition on x86-64? Walk through `syscall`/`sysret`, the kernel stack switch, and how arguments are passed.

<a href="./docs/solution_57.md"><kbd>Show Solution</kbd></a>

### 58. How do cgroups v2 enforce memory and CPU limits? How does the kernel throttle a process that exceeds its CPU quota?

<a href="./docs/solution_58.md"><kbd>Show Solution</kbd></a>

### 59. Explain how Linux namespaces work. How does a PID namespace make `init` inside a container think it's PID 1?

<a href="./docs/solution_59.md"><kbd>Show Solution</kbd></a>

### 60. User mode to kernel mode transition, full context switching cost breakdown.

<a href="./docs/solution_60.md"><kbd>Show Solution</kbd></a>

### 61. Interrupt handling vs polling, tradeoffs and when to use each.

<a href="./docs/solution_61.md"><kbd>Show Solution</kbd></a>

### 62. How does `strace` work? How does `ptrace` work?

<a href="./docs/solution_62.md"><kbd>Show Solution</kbd></a>

### 63. Kernel preemption vs non-preemptive kernel, tradeoffs.

<a href="./docs/solution_63.md"><kbd>Show Solution</kbd></a>

## Virtualization & Containers

Hypervisors, hardware virtualization, Docker internals, namespaces, and cgroups.

### 64. How do VMs work? Hypervisor Type 1 vs Type 2.

<a href="./docs/solution_64.md"><kbd>Show Solution</kbd></a>

### 65. Hardware virtualization (Intel VT-x), how does it enable efficient VMs?

<a href="./docs/solution_65.md"><kbd>Show Solution</kbd></a>

### 66. How does Docker isolate processes? Namespaces (PID, NET, IPC, MOUNT) and cgroups.

<a href="./docs/solution_66.md"><kbd>Show Solution</kbd></a>

### 67. Container vs VM, fundamental differences and when to use each.

<a href="./docs/solution_67.md"><kbd>Show Solution</kbd></a>

### 68. How Kubernetes uses OS primitives for container orchestration.

<a href="./docs/solution_68.md"><kbd>Show Solution</kbd></a>

## Performance & Optimization

CPU/IO bottlenecks, cache hierarchy, TLB shootdowns, and reducing context switches.

### 69. Identify bottlenecks in CPU-bound vs I/O-bound systems.

<a href="./docs/solution_69.md"><kbd>Show Solution</kbd></a>

### 70. Cache hierarchy: L1, L2, L3 behavior and their impact on performance.

<a href="./docs/solution_70.md"><kbd>Show Solution</kbd></a>

### 71. How to reduce context switches in a high-performance system?

<a href="./docs/solution_71.md"><kbd>Show Solution</kbd></a>

## Security & Isolation

ASLR, stack/heap overflows, sandboxing, seccomp, and Linux capabilities.

### 72. Stack vs heap overflow, exploitation and defenses.

<a href="./docs/solution_72.md"><kbd>Show Solution</kbd></a>

### 73. How does sandboxing work at the OS level?

<a href="./docs/solution_73.md"><kbd>Show Solution</kbd></a>

### 74. Seccomp in Linux, how does it restrict system calls?

<a href="./docs/solution_74.md"><kbd>Show Solution</kbd></a>

### 75. Capabilities vs root permissions in Linux.

<a href="./docs/solution_75.md"><kbd>Show Solution</kbd></a>

## Distributed Systems & OS

Clock synchronization, kernel bypass, DPDK, RDMA, and low-latency systems.

### 76. How does OS scheduling affect distributed systems?

<a href="./docs/solution_76.md"><kbd>Show Solution</kbd></a>

### 77. Clock synchronization: NTP vs logical clocks.

<a href="./docs/solution_77.md"><kbd>Show Solution</kbd></a>

### 78. How does the kernel impact latency in trading systems?

<a href="./docs/solution_78.md"><kbd>Show Solution</kbd></a>

### 79. Kernel bypass: DPDK, RDMA, how and why?

<a href="./docs/solution_79.md"><kbd>Show Solution</kbd></a>

## System Design (OS-Level)

Design logging systems, caches, message queues, thread pools, and async runtimes.

### 80. Design a high-performance logging system.

<a href="./docs/solution_80.md"><kbd>Show Solution</kbd></a>

### 81. Design an in-memory cache (Redis-like).

<a href="./docs/solution_81.md"><kbd>Show Solution</kbd></a>

### 82. Design a message queue (Kafka-like).

<a href="./docs/solution_82.md"><kbd>Show Solution</kbd></a>

### 83. Build a thread pool implementation.

<a href="./docs/solution_83.md"><kbd>Show Solution</kbd></a>

### 84. Build an async runtime (like Node.js event loop).

<a href="./docs/solution_84.md"><kbd>Show Solution</kbd></a>

### 85. Design a system that handles 1M concurrent connections.

<a href="./docs/solution_85.md"><kbd>Show Solution</kbd></a>

## Extremely Hard Questions

Lock-free hash maps, userspace schedulers, mini kernels, and custom allocators.

### 86. Design a lock-free hash map.

<a href="./docs/solution_86.md"><kbd>Show Solution</kbd></a>

### 87. Implement a userspace scheduler.

<a href="./docs/solution_87.md"><kbd>Show Solution</kbd></a>

### 88. Build a mini kernel.

<a href="./docs/solution_88.md"><kbd>Show Solution</kbd></a>

### 89. Design a page cache system.

<a href="./docs/solution_89.md"><kbd>Show Solution</kbd></a>

### 90. Implement a copy-on-write file system.

<a href="./docs/solution_90.md"><kbd>Show Solution</kbd></a>

### 91. Design a kernel module for monitoring.

<a href="./docs/solution_91.md"><kbd>Show Solution</kbd></a>

### 92. Build a custom memory allocator (jemalloc-style).

<a href="./docs/solution_92.md"><kbd>Show Solution</kbd></a>

## Trick & Edge Case Questions

Surprising behaviors, corner cases, and gotchas interviewers love.

### 93. Can a program run without a heap?

<a href="./docs/solution_93.md"><kbd>Show Solution</kbd></a>

### 94. What happens if the stack overflows?

<a href="./docs/solution_94.md"><kbd>Show Solution</kbd></a>

### 95. Why is recursion dangerous in OS kernel code?

<a href="./docs/solution_95.md"><kbd>Show Solution</kbd></a>

### 96. What happens if TLB is disabled?

<a href="./docs/solution_96.md"><kbd>Show Solution</kbd></a>

### 97. Can two processes share memory safely? How?

<a href="./docs/solution_97.md"><kbd>Show Solution</kbd></a>

### 98. What happens if `malloc()` fails?

<a href="./docs/solution_98.md"><kbd>Show Solution</kbd></a>

## Hands-On / Coding

Implement classic concurrency problems, thread-safe queues, rate limiters, and memory pools.

### 99. Implement the producer-consumer problem.

<a href="./docs/solution_99.md"><kbd>Show Solution</kbd></a>

### 100. Implement the readers-writers problem.

<a href="./docs/solution_100.md"><kbd>Show Solution</kbd></a>

### 101. Implement dining philosophers (deadlock-free).

<a href="./docs/solution_101.md"><kbd>Show Solution</kbd></a>

### 102. Build a thread-safe queue.

<a href="./docs/solution_102.md"><kbd>Show Solution</kbd></a>

### 103. Build a rate limiter.

<a href="./docs/solution_103.md"><kbd>Show Solution</kbd></a>

### 104. Build a memory pool allocator.

<a href="./docs/solution_104.md"><kbd>Show Solution</kbd></a>

## Debugging & Production

Diagnosing memory issues, high `sys` CPU, and production debugging tools.

### 105. A process is consuming 8GB of RSS but only 500MB is actually in use. What could explain this? How would you diagnose it (for example `/proc/pid/smaps`, `pmap`)?

<a href="./docs/solution_105.md"><kbd>Show Solution</kbd></a>

### 106. You observe high `sys` CPU time on a server. Walk through your debugging approach, what tools would you use (`perf`, `strace`, `bpftrace`, `/proc/stat`) and what patterns would you look for?

<a href="./docs/solution_106.md"><kbd>Show Solution</kbd></a>
