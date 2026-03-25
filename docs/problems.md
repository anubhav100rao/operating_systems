# OS Concepts Problem Bank

106 unique questions across 16 categories.

Advanced questions: 59.

This file mirrors the in-app question catalog in `src/data/categories.ts`. Repeated problem statements were consolidated so the docs and UI stay aligned.

## Processes, Threads & Scheduling

Processes, threads, context switching, scheduling, and signals.

1. Explain the difference between a process context switch and a thread context switch at the hardware level. What exactly gets saved/restored in each case?
2. How does the Linux CFS (Completely Fair Scheduler) work internally? How does it use a red-black tree and virtual runtime?
3. What happens in the kernel between `fork()` returning and the child process actually executing? Walk through Copy-on-Write mechanics at the page table level.
4. How does `vfork()` differ from `fork()`, and why is it dangerous? When would you still use it?
5. Explain how POSIX signals are delivered to a multithreaded process. Which thread receives the signal and why?
6. Difference between process, thread, fiber, coroutine (with real OS mapping)
7. How does `fork()` differ from `clone()` in Linux?
8. What happens if parent exits before child? Zombie vs orphan processes and how the kernel handles them.
9. How does `exec()` replace process memory?
10. How does a multi-threaded `fork()` behave? What happens if one thread calls `exec()`?
11. Thread cancellation: deferred vs asynchronous. Thread-local storage implementation.
12. Design a scheduler for: real-time systems, interactive workloads, batch systems. Compare Round Robin, MLFQ, CFS.
13. What is CPU affinity and why does it matter? Explain NUMA-aware scheduling.
14. How does Linux avoid starvation in its scheduling?

## Concurrency & Synchronization

Locks, futexes, RCU, atomics, memory ordering, and lock-free programming.

15. Explain the implementation of a futex. How does it avoid syscalls in the uncontended case, and what happens in the contended path?
16. What is priority inversion? Describe priority inheritance and priority ceiling protocols with concrete scenarios.
17. How does RCU (Read-Copy-Update) work? Why is it better than reader-writer locks for read-heavy workloads in the kernel?
18. Explain the thundering herd problem. How does `epoll` with `EPOLLEXCLUSIVE` or `SO_REUSEPORT` mitigate it?
19. What's the difference between a spinlock, a mutex, and a semaphore at the implementation level? When is spinning better than sleeping?
20. Implement a mutex using atomic instructions.
21. Implement a semaphore using mutex + condition variables.
22. Explain lock convoying and its impact on performance.
23. ABA problem in lock-free structures. Hazard pointers vs epoch-based reclamation.
24. Design a wait-free data structure.
25. Memory ordering: Acquire / Release / Seq-Cst. Why does double-checked locking fail?
26. False sharing, how to detect and fix it.

## Memory Management

Virtual memory, page faults, allocators, OOM, `mmap`, and page replacement.

27. Walk through what happens when a process dereferences a virtual address, from the TLB lookup to a page fault to disk I/O. Include the role of the page table walker.
28. Explain the difference between internal and external fragmentation in the context of the buddy allocator and slab allocator. Why does Linux use both?
29. How does the kernel decide which pages to evict under memory pressure? Explain the LRU approximation (active/inactive lists) and how `kswapd` works.
30. What is the OOM killer? How does it score processes, and what are the failure modes of relying on overcommit?
31. How does `mmap()` work at the page table level? Explain the difference between file-backed and anonymous mappings and how demand paging ties in.
32. Multi-level page tables, why are they needed? Explain inverted page tables.
33. Why is LRU impractical? Compare CLOCK vs ARC vs LFU page replacement algorithms.
34. Thrashing detection and mitigation. Explain the working set model.
35. Demand paging vs pre-paging. Memory overcommit in Linux.
36. What is NUMA memory allocation? How does it affect performance?

## Virtual Memory & Address Spaces

KPTI, TLB shootdown, huge pages, and ASLR.

37. Explain how the kernel maps itself into every process's address space (KPTI/Kaiser). Why was this done and what's the performance cost?
38. What is TLB shootdown? When does it happen and why is it expensive on multicore systems?
39. How does Transparent Huge Pages (THP) work? What are the tradeoffs, when does it help and when does it hurt for latency-sensitive workloads?
40. Explain ASLR, what gets randomized, how much entropy is typical, and what attacks does it defend against and fail to defend against?

## File Systems & Storage

VFS, page cache, journaling, `fsync`, `io_uring`, SSDs, and crash recovery.

41. Trace a `write()` call from userspace to disk. Cover the VFS layer, page cache, writeback, I/O scheduler, and block device driver.
42. What is the difference between `O_DIRECT` and buffered I/O? When would a database like Postgres or RocksDB prefer one over the other?
43. Explain journaling in ext4, ordered mode vs writeback mode vs data journaling. What consistency guarantees does each provide?
44. How does `fsync()` actually guarantee durability? What can go wrong, for example disk controller write caches or battery-backed controllers?
45. Explain how `io_uring` works and why it's faster than `epoll` + `read/write` for high-throughput I/O.
46. Inode structure in detail. Soft links vs hard links (edge cases).
47. How does ext4 differ from XFS?
48. What happens during crash recovery in a journaling filesystem?
49. Why are LSM trees used in SSD systems? Explain write amplification and SSD garbage collection.
50. Snapshotting via copy-on-write filesystems like ZFS. Design a distributed file system (like HDFS).

## I/O Systems & Networking

Blocking vs non-blocking I/O, `epoll`, zero-copy, DMA, and kernel networking.

51. Blocking vs non-blocking I/O, explain the kernel mechanics of each.
52. `select()` vs `poll()` vs `epoll()`, edge-triggered vs level-triggered `epoll`.
53. Zero-copy techniques: `sendfile`, `mmap`. When and why are they faster?
54. DMA (Direct Memory Access), how does it work and what does it offload from the CPU?
55. How does the kernel handle a TCP connection? SYN queue vs accept queue.
56. What happens when a server is overloaded? How does the kernel handle packet drops?

## System Calls & Kernel Internals

`syscall`/`sysret`, cgroups, namespaces, interrupts, and kernel debugging.

57. What happens during a system call transition on x86-64? Walk through `syscall`/`sysret`, the kernel stack switch, and how arguments are passed.
58. How do cgroups v2 enforce memory and CPU limits? How does the kernel throttle a process that exceeds its CPU quota?
59. Explain how Linux namespaces work. How does a PID namespace make `init` inside a container think it's PID 1?
60. User mode to kernel mode transition, full context switching cost breakdown.
61. Interrupt handling vs polling, tradeoffs and when to use each.
62. How does `strace` work? How does `ptrace` work?
63. Kernel preemption vs non-preemptive kernel, tradeoffs.

## Virtualization & Containers

Hypervisors, hardware virtualization, Docker internals, namespaces, and cgroups.

64. How do VMs work? Hypervisor Type 1 vs Type 2.
65. Hardware virtualization (Intel VT-x), how does it enable efficient VMs?
66. How does Docker isolate processes? Namespaces (PID, NET, IPC, MOUNT) and cgroups.
67. Container vs VM, fundamental differences and when to use each.
68. How Kubernetes uses OS primitives for container orchestration.

## Performance & Optimization

CPU/IO bottlenecks, cache hierarchy, TLB shootdowns, and reducing context switches.

69. Identify bottlenecks in CPU-bound vs I/O-bound systems.
70. Cache hierarchy: L1, L2, L3 behavior and their impact on performance.
71. How to reduce context switches in a high-performance system?

## Security & Isolation

ASLR, stack/heap overflows, sandboxing, seccomp, and Linux capabilities.

72. Stack vs heap overflow, exploitation and defenses.
73. How does sandboxing work at the OS level?
74. Seccomp in Linux, how does it restrict system calls?
75. Capabilities vs root permissions in Linux.

## Distributed Systems & OS

Clock synchronization, kernel bypass, DPDK, RDMA, and low-latency systems.

76. How does OS scheduling affect distributed systems?
77. Clock synchronization: NTP vs logical clocks.
78. How does the kernel impact latency in trading systems?
79. Kernel bypass: DPDK, RDMA, how and why?

## System Design (OS-Level)

Design logging systems, caches, message queues, thread pools, and async runtimes.

80. Design a high-performance logging system.
81. Design an in-memory cache (Redis-like).
82. Design a message queue (Kafka-like).
83. Build a thread pool implementation.
84. Build an async runtime (like Node.js event loop).
85. Design a system that handles 1M concurrent connections.

## Extremely Hard Questions

Lock-free hash maps, userspace schedulers, mini kernels, and custom allocators.

86. Design a lock-free hash map.
87. Implement a userspace scheduler.
88. Build a mini kernel.
89. Design a page cache system.
90. Implement a copy-on-write file system.
91. Design a kernel module for monitoring.
92. Build a custom memory allocator (jemalloc-style).

## Trick & Edge Case Questions

Surprising behaviors, corner cases, and gotchas interviewers love.

93. Can a program run without a heap?
94. What happens if the stack overflows?
95. Why is recursion dangerous in OS kernel code?
96. What happens if TLB is disabled?
97. Can two processes share memory safely? How?
98. What happens if `malloc()` fails?

## Hands-On / Coding

Implement classic concurrency problems, thread-safe queues, rate limiters, and memory pools.

99. Implement the producer-consumer problem.
100. Implement the readers-writers problem.
101. Implement dining philosophers (deadlock-free).
102. Build a thread-safe queue.
103. Build a rate limiter.
104. Build a memory pool allocator.

## Debugging & Production

Diagnosing memory issues, high `sys` CPU, and production debugging tools.

105. A process is consuming 8GB of RSS but only 500MB is actually in use. What could explain this? How would you diagnose it (for example `/proc/pid/smaps`, `pmap`)?
106. You observe high `sys` CPU time on a server. Walk through your debugging approach, what tools would you use (`perf`, `strace`, `bpftrace`, `/proc/stat`) and what patterns would you look for?
