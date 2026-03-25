import { Category, Question } from "../types";
import { availableSolutionNumbers } from "./solutionManifest";

/**
 * To add a new category:
 *   1. Add a new Category object to this array.
 *
 * To add a new question:
 *   1. Push a Question into the relevant category's `questions` array.
 *   2. Optionally add `content` (markdown) for the answer/explanation.
 *
 * That's it — the UI picks everything up automatically.
 */
function normalizeQuestionTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[`'"?.,:/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeCategories(categories: Category[]) {
  const seenQuestions = new Set<string>();

  return categories
    .map((category) => {
      const questions = category.questions.filter((question: Question) => {
        const normalizedTitle = normalizeQuestionTitle(question.title);

        if (seenQuestions.has(normalizedTitle)) {
          return false;
        }

        seenQuestions.add(normalizedTitle);
        return true;
      });

      return {
        ...category,
        questions,
      };
    })
    .filter((category) => category.questions.length > 0);
}

const availableSolutionNumberSet = new Set<number>(availableSolutionNumbers);

function attachQuestionMetadata(categories: Category[]) {
  let problemNumber = 1;

  return categories.map((category) => ({
    ...category,
    questions: category.questions.map((question) => {
      const enrichedQuestion: Question = {
        ...question,
        problemNumber,
      };

      if (availableSolutionNumberSet.has(problemNumber)) {
        enrichedQuestion.solutionPath = `/solutions/solution_${problemNumber}.md`;
      }

      problemNumber += 1;
      return enrichedQuestion;
    }),
  }));
}

const rawCategories: Category[] = [
  {
    id: "process-thread",
    name: "Processes, Threads & Scheduling",
    description:
      "Processes, threads, context switching, scheduling, and signals.",
    icon: "⚙️",
    color: "#38bdf8",
    questions: [
      {
        id: "pt-1",
        title:
          "Explain the difference between a process context switch and a thread context switch at the hardware level. What exactly gets saved/restored in each case?",
        difficulty: "advanced",
        tags: ["context-switch", "hardware"],
      },
      {
        id: "pt-2",
        title:
          "How does the Linux CFS (Completely Fair Scheduler) work internally? How does it use a red-black tree and virtual runtime?",
        difficulty: "advanced",
        tags: ["scheduler", "cfs", "linux"],
      },
      {
        id: "pt-3",
        title:
          "What happens in the kernel between fork() returning and the child process actually executing? Walk through Copy-on-Write mechanics at the page table level.",
        difficulty: "advanced",
        tags: ["fork", "cow", "page-table"],
      },
      {
        id: "pt-4",
        title:
          "How does vfork() differ from fork(), and why is it dangerous? When would you still use it?",
        difficulty: "intermediate",
        tags: ["fork", "vfork"],
      },
      {
        id: "pt-5",
        title:
          "Explain how POSIX signals are delivered to a multithreaded process. Which thread receives the signal and why?",
        difficulty: "advanced",
        tags: ["signals", "threads", "posix"],
      },
      {
        id: "pt-6",
        title:
          "Difference between process, thread, fiber, coroutine (with real OS mapping)",
        difficulty: "intermediate",
        tags: ["process", "thread", "fiber", "coroutine"],
      },
      {
        id: "pt-7",
        title: "How does fork() differ from clone() in Linux?",
        difficulty: "intermediate",
        tags: ["fork", "clone", "linux"],
      },
      {
        id: "pt-8",
        title: "What happens if parent exits before child? Zombie vs orphan processes and how the kernel handles them.",
        difficulty: "intermediate",
        tags: ["zombie", "orphan", "process"],
      },
      {
        id: "pt-9",
        title: "How does exec() replace process memory?",
        difficulty: "intermediate",
        tags: ["exec", "memory"],
      },
      {
        id: "pt-10",
        title: "How does a multi-threaded fork() behave? What happens if one thread calls exec()?",
        difficulty: "advanced",
        tags: ["fork", "threads", "exec"],
      },
      {
        id: "pt-11",
        title: "Thread cancellation: deferred vs asynchronous. Thread-local storage implementation.",
        difficulty: "advanced",
        tags: ["threads", "cancellation", "tls"],
      },
      {
        id: "pt-12",
        title: "Design a scheduler for: real-time systems, interactive workloads, batch systems. Compare Round Robin, MLFQ, CFS.",
        difficulty: "advanced",
        tags: ["scheduler", "design", "mlfq"],
      },
      {
        id: "pt-13",
        title: "What is CPU affinity and why does it matter? Explain NUMA-aware scheduling.",
        difficulty: "advanced",
        tags: ["cpu-affinity", "numa", "scheduling"],
      },
      {
        id: "pt-14",
        title: "How does Linux avoid starvation in its scheduling?",
        difficulty: "intermediate",
        tags: ["scheduling", "starvation", "linux"],
      },
    ],
  },
  {
    id: "concurrency",
    name: "Concurrency & Synchronization",
    description:
      "Locks, futexes, RCU, atomics, memory ordering, and lock-free programming.",
    icon: "🔒",
    color: "#f472b6",
    questions: [
      {
        id: "cs-1",
        title:
          "Explain the implementation of a futex. How does it avoid syscalls in the uncontended case, and what happens in the contended path?",
        difficulty: "advanced",
        tags: ["futex", "syscall"],
      },
      {
        id: "cs-2",
        title:
          "What is priority inversion? Describe priority inheritance and priority ceiling protocols with concrete scenarios.",
        difficulty: "intermediate",
        tags: ["priority-inversion", "scheduling"],
      },
      {
        id: "cs-3",
        title:
          "How does RCU (Read-Copy-Update) work? Why is it better than reader-writer locks for read-heavy workloads in the kernel?",
        difficulty: "advanced",
        tags: ["rcu", "locking"],
      },
      {
        id: "cs-4",
        title:
          "Explain the thundering herd problem. How does epoll with EPOLLEXCLUSIVE or SO_REUSEPORT mitigate it?",
        difficulty: "intermediate",
        tags: ["thundering-herd", "epoll"],
      },
      {
        id: "cs-5",
        title:
          "What's the difference between a spinlock, a mutex, and a semaphore at the implementation level? When is spinning better than sleeping?",
        difficulty: "intermediate",
        tags: ["spinlock", "mutex", "semaphore"],
      },
      {
        id: "cs-6",
        title: "Implement a mutex using atomic instructions.",
        difficulty: "advanced",
        tags: ["mutex", "atomics", "implementation"],
      },
      {
        id: "cs-7",
        title: "Implement a semaphore using mutex + condition variables.",
        difficulty: "intermediate",
        tags: ["semaphore", "condition-variable"],
      },
      {
        id: "cs-8",
        title: "Explain lock convoying and its impact on performance.",
        difficulty: "advanced",
        tags: ["lock-convoying", "performance"],
      },
      {
        id: "cs-9",
        title: "ABA problem in lock-free structures. Hazard pointers vs epoch-based reclamation.",
        difficulty: "advanced",
        tags: ["aba", "lock-free", "hazard-pointers"],
      },
      {
        id: "cs-10",
        title: "Design a wait-free data structure.",
        difficulty: "advanced",
        tags: ["wait-free", "lock-free", "design"],
      },
      {
        id: "cs-11",
        title: "Memory ordering: Acquire / Release / Seq-Cst. Why does double-checked locking fail?",
        difficulty: "advanced",
        tags: ["memory-ordering", "acquire-release", "dcl"],
      },
      {
        id: "cs-12",
        title: "False sharing — how to detect and fix it.",
        difficulty: "intermediate",
        tags: ["false-sharing", "cache-line", "performance"],
      },
    ],
  },
  {
    id: "memory",
    name: "Memory Management",
    description:
      "Virtual memory, page faults, allocators, OOM, mmap, and page replacement.",
    icon: "🧠",
    color: "#a78bfa",
    questions: [
      {
        id: "mm-1",
        title:
          "Walk through what happens when a process dereferences a virtual address — from the TLB lookup to a page fault to disk I/O. Include the role of the page table walker.",
        difficulty: "advanced",
        tags: ["tlb", "page-fault", "page-table"],
      },
      {
        id: "mm-2",
        title:
          "Explain the difference between internal and external fragmentation in the context of the buddy allocator and slab allocator. Why does Linux use both?",
        difficulty: "intermediate",
        tags: ["fragmentation", "buddy", "slab"],
      },
      {
        id: "mm-3",
        title:
          "How does the kernel decide which pages to evict under memory pressure? Explain the LRU approximation (active/inactive lists) and how kswapd works.",
        difficulty: "advanced",
        tags: ["lru", "kswapd", "eviction"],
      },
      {
        id: "mm-4",
        title:
          "What is the OOM killer? How does it score processes, and what are the failure modes of relying on overcommit?",
        difficulty: "intermediate",
        tags: ["oom", "overcommit"],
      },
      {
        id: "mm-5",
        title:
          "How does mmap() work at the page table level? Explain the difference between file-backed and anonymous mappings and how demand paging ties in.",
        difficulty: "advanced",
        tags: ["mmap", "demand-paging"],
      },
      {
        id: "mm-6",
        title: "Multi-level page tables — why are they needed? Explain inverted page tables.",
        difficulty: "intermediate",
        tags: ["page-table", "inverted"],
      },
      {
        id: "mm-7",
        title: "Why is LRU impractical? Compare CLOCK vs ARC vs LFU page replacement algorithms.",
        difficulty: "advanced",
        tags: ["lru", "clock", "arc", "page-replacement"],
      },
      {
        id: "mm-8",
        title: "Thrashing detection and mitigation. Explain the working set model.",
        difficulty: "intermediate",
        tags: ["thrashing", "working-set"],
      },
      {
        id: "mm-9",
        title: "Demand paging vs pre-paging. Memory overcommit in Linux.",
        difficulty: "intermediate",
        tags: ["demand-paging", "overcommit"],
      },
      {
        id: "mm-10",
        title: "What is NUMA memory allocation? How does it affect performance?",
        difficulty: "advanced",
        tags: ["numa", "allocation", "performance"],
      },
    ],
  },
  {
    id: "virtual-memory",
    name: "Virtual Memory & Address Spaces",
    description:
      "KPTI, TLB shootdown, huge pages, and ASLR.",
    icon: "📦",
    color: "#34d399",
    questions: [
      {
        id: "vm-1",
        title:
          "Explain how the kernel maps itself into every process's address space (KPTI/Kaiser). Why was this done and what's the performance cost?",
        difficulty: "advanced",
        tags: ["kpti", "meltdown"],
      },
      {
        id: "vm-2",
        title:
          "What is TLB shootdown? When does it happen and why is it expensive on multicore systems?",
        difficulty: "intermediate",
        tags: ["tlb", "multicore"],
      },
      {
        id: "vm-3",
        title:
          "How does Transparent Huge Pages (THP) work? What are the tradeoffs — when does it help and when does it hurt (e.g., latency-sensitive workloads)?",
        difficulty: "advanced",
        tags: ["thp", "huge-pages"],
      },
      {
        id: "vm-4",
        title:
          "Explain ASLR — what gets randomized, how much entropy is typical, and what attacks does it defend against (and fail to)?",
        difficulty: "intermediate",
        tags: ["aslr", "security"],
      },
    ],
  },
  {
    id: "io-filesystems",
    name: "File Systems & Storage",
    description:
      "VFS, page cache, journaling, fsync, io_uring, SSDs, and crash recovery.",
    icon: "💾",
    color: "#fb923c",
    questions: [
      {
        id: "io-1",
        title:
          "Trace a write() call from userspace to disk. Cover the VFS layer, page cache, writeback, I/O scheduler, and block device driver.",
        difficulty: "advanced",
        tags: ["write", "vfs", "page-cache"],
      },
      {
        id: "io-2",
        title:
          "What is the difference between O_DIRECT and buffered I/O? When would a database like Postgres or RocksDB prefer one over the other?",
        difficulty: "intermediate",
        tags: ["o-direct", "buffered-io"],
      },
      {
        id: "io-3",
        title:
          "Explain journaling in ext4 — ordered mode vs. writeback mode vs. data journaling. What consistency guarantees does each provide?",
        difficulty: "advanced",
        tags: ["ext4", "journaling"],
      },
      {
        id: "io-4",
        title:
          "How does fsync() actually guarantee durability? What can go wrong (e.g., disk controller write caches, battery-backed controllers)?",
        difficulty: "intermediate",
        tags: ["fsync", "durability"],
      },
      {
        id: "io-5",
        title:
          "Explain how io_uring works and why it's faster than epoll + read/write for high-throughput I/O.",
        difficulty: "advanced",
        tags: ["io-uring", "epoll"],
      },
      {
        id: "io-6",
        title: "Inode structure in detail. Soft links vs hard links (edge cases).",
        difficulty: "intermediate",
        tags: ["inode", "links"],
      },
      {
        id: "io-7",
        title: "How does ext4 differ from XFS?",
        difficulty: "intermediate",
        tags: ["ext4", "xfs"],
      },
      {
        id: "io-8",
        title: "What happens during crash recovery in a journaling filesystem?",
        difficulty: "advanced",
        tags: ["crash-recovery", "journaling"],
      },
      {
        id: "io-9",
        title: "Why are LSM trees used in SSD systems? Explain write amplification and SSD garbage collection.",
        difficulty: "advanced",
        tags: ["lsm-tree", "ssd", "write-amplification"],
      },
      {
        id: "io-10",
        title: "Snapshotting via copy-on-write filesystems like ZFS. Design a distributed file system (like HDFS).",
        difficulty: "advanced",
        tags: ["zfs", "cow", "hdfs", "distributed"],
      },
    ],
  },
  {
    id: "io-networking",
    name: "I/O Systems & Networking",
    description:
      "Blocking vs non-blocking I/O, epoll, zero-copy, DMA, and kernel networking.",
    icon: "🌐",
    color: "#06b6d4",
    questions: [
      {
        id: "in-1",
        title: "Blocking vs non-blocking I/O — explain the kernel mechanics of each.",
        difficulty: "intermediate",
        tags: ["blocking", "non-blocking", "io"],
      },
      {
        id: "in-2",
        title: "select() vs poll() vs epoll() — edge-triggered vs level-triggered epoll.",
        difficulty: "advanced",
        tags: ["select", "poll", "epoll"],
      },
      {
        id: "in-3",
        title: "Zero-copy techniques: sendfile, mmap. When and why are they faster?",
        difficulty: "advanced",
        tags: ["zero-copy", "sendfile", "mmap"],
      },
      {
        id: "in-4",
        title: "DMA (Direct Memory Access) — how does it work and what does it offload from the CPU?",
        difficulty: "intermediate",
        tags: ["dma", "hardware"],
      },
      {
        id: "in-5",
        title: "How does the kernel handle a TCP connection? SYN queue vs accept queue.",
        difficulty: "advanced",
        tags: ["tcp", "syn-queue", "networking"],
      },
      {
        id: "in-6",
        title: "What happens when a server is overloaded? How does the kernel handle packet drops?",
        difficulty: "intermediate",
        tags: ["overload", "packet-drops", "networking"],
      },
    ],
  },
  {
    id: "syscalls-kernel",
    name: "System Calls & Kernel Internals",
    description:
      "syscall/sysret, cgroups, namespaces, interrupts, and kernel debugging.",
    icon: "🔧",
    color: "#facc15",
    questions: [
      {
        id: "sk-1",
        title:
          "What happens during a system call transition on x86-64? Walk through syscall/sysret, the kernel stack switch, and how arguments are passed.",
        difficulty: "advanced",
        tags: ["syscall", "x86-64"],
      },
      {
        id: "sk-2",
        title:
          "How do cgroups v2 enforce memory and CPU limits? How does the kernel throttle a process that exceeds its CPU quota?",
        difficulty: "advanced",
        tags: ["cgroups", "containers"],
      },
      {
        id: "sk-3",
        title:
          "Explain how Linux namespaces work. How does a PID namespace make init inside a container think it's PID 1?",
        difficulty: "intermediate",
        tags: ["namespaces", "containers"],
      },
      {
        id: "sk-5",
        title: "User mode to kernel mode transition — full context switching cost breakdown.",
        difficulty: "intermediate",
        tags: ["user-mode", "kernel-mode", "context-switch"],
      },
      {
        id: "sk-6",
        title: "Interrupt handling vs polling — tradeoffs and when to use each.",
        difficulty: "intermediate",
        tags: ["interrupts", "polling"],
      },
      {
        id: "sk-7",
        title: "How does strace work? How does ptrace work?",
        difficulty: "advanced",
        tags: ["strace", "ptrace", "debugging"],
      },
      {
        id: "sk-8",
        title: "Kernel preemption vs non-preemptive kernel — tradeoffs.",
        difficulty: "advanced",
        tags: ["preemption", "kernel"],
      },
    ],
  },
  {
    id: "virtualization",
    name: "Virtualization & Containers",
    description:
      "Hypervisors, hardware virtualization, Docker internals, namespaces, and cgroups.",
    icon: "🐳",
    color: "#60a5fa",
    questions: [
      {
        id: "virt-1",
        title: "How do VMs work? Hypervisor Type 1 vs Type 2.",
        difficulty: "intermediate",
        tags: ["vm", "hypervisor"],
      },
      {
        id: "virt-2",
        title: "Hardware virtualization (Intel VT-x) — how does it enable efficient VMs?",
        difficulty: "advanced",
        tags: ["vt-x", "hardware-virtualization"],
      },
      {
        id: "virt-3",
        title: "How does Docker isolate processes? Namespaces (PID, NET, IPC, MOUNT) and cgroups.",
        difficulty: "intermediate",
        tags: ["docker", "namespaces", "cgroups"],
      },
      {
        id: "virt-4",
        title: "Container vs VM — fundamental differences and when to use each.",
        difficulty: "beginner",
        tags: ["container", "vm", "comparison"],
      },
      {
        id: "virt-5",
        title: "How Kubernetes uses OS primitives for container orchestration.",
        difficulty: "advanced",
        tags: ["kubernetes", "containers", "orchestration"],
      },
    ],
  },
  {
    id: "performance",
    name: "Performance & Optimization",
    description:
      "CPU/IO bottlenecks, cache hierarchy, TLB shootdowns, and reducing context switches.",
    icon: "⚡",
    color: "#fbbf24",
    questions: [
      {
        id: "perf-1",
        title: "Identify bottlenecks in CPU-bound vs I/O-bound systems.",
        difficulty: "intermediate",
        tags: ["bottleneck", "cpu-bound", "io-bound"],
      },
      {
        id: "perf-2",
        title: "Cache hierarchy: L1, L2, L3 behavior and their impact on performance.",
        difficulty: "intermediate",
        tags: ["cache", "l1", "l2", "l3"],
      },
      {
        id: "perf-4",
        title: "How to reduce context switches in a high-performance system?",
        difficulty: "intermediate",
        tags: ["context-switch", "optimization"],
      },
    ],
  },
  {
    id: "security",
    name: "Security & Isolation",
    description:
      "ASLR, stack/heap overflows, sandboxing, seccomp, and Linux capabilities.",
    icon: "🔐",
    color: "#f87171",
    questions: [
      {
        id: "sec-2",
        title: "Stack vs heap overflow — exploitation and defenses.",
        difficulty: "advanced",
        tags: ["stack-overflow", "heap-overflow", "exploits"],
      },
      {
        id: "sec-3",
        title: "How does sandboxing work at the OS level?",
        difficulty: "intermediate",
        tags: ["sandboxing", "isolation"],
      },
      {
        id: "sec-4",
        title: "Seccomp in Linux — how does it restrict system calls?",
        difficulty: "advanced",
        tags: ["seccomp", "syscall", "linux"],
      },
      {
        id: "sec-5",
        title: "Capabilities vs root permissions in Linux.",
        difficulty: "intermediate",
        tags: ["capabilities", "root", "linux"],
      },
    ],
  },
  {
    id: "distributed",
    name: "Distributed Systems & OS",
    description:
      "Clock synchronization, kernel bypass, DPDK, RDMA, and low-latency systems.",
    icon: "🌍",
    color: "#4ade80",
    questions: [
      {
        id: "dist-1",
        title: "How does OS scheduling affect distributed systems?",
        difficulty: "advanced",
        tags: ["scheduling", "distributed"],
      },
      {
        id: "dist-2",
        title: "Clock synchronization: NTP vs logical clocks.",
        difficulty: "intermediate",
        tags: ["ntp", "logical-clocks", "time"],
      },
      {
        id: "dist-3",
        title: "How does the kernel impact latency in trading systems?",
        difficulty: "advanced",
        tags: ["latency", "trading", "kernel"],
      },
      {
        id: "dist-4",
        title: "Kernel bypass: DPDK, RDMA — how and why?",
        difficulty: "advanced",
        tags: ["dpdk", "rdma", "kernel-bypass"],
      },
    ],
  },
  {
    id: "system-design",
    name: "System Design (OS-Level)",
    description:
      "Design logging systems, caches, message queues, thread pools, and async runtimes.",
    icon: "🚀",
    color: "#c084fc",
    questions: [
      {
        id: "sd-1",
        title: "Design a high-performance logging system.",
        difficulty: "advanced",
        tags: ["logging", "design"],
      },
      {
        id: "sd-2",
        title: "Design an in-memory cache (Redis-like).",
        difficulty: "advanced",
        tags: ["cache", "redis", "design"],
      },
      {
        id: "sd-3",
        title: "Design a message queue (Kafka-like).",
        difficulty: "advanced",
        tags: ["message-queue", "kafka", "design"],
      },
      {
        id: "sd-4",
        title: "Build a thread pool implementation.",
        difficulty: "intermediate",
        tags: ["thread-pool", "concurrency"],
      },
      {
        id: "sd-5",
        title: "Build an async runtime (like Node.js event loop).",
        difficulty: "advanced",
        tags: ["async", "event-loop", "runtime"],
      },
      {
        id: "sd-6",
        title: "Design a system that handles 1M concurrent connections.",
        difficulty: "advanced",
        tags: ["c10k", "scalability", "design"],
      },
    ],
  },
  {
    id: "hard-questions",
    name: "Extremely Hard Questions",
    description:
      "Lock-free hash maps, userspace schedulers, mini kernels, and custom allocators.",
    icon: "🧨",
    color: "#ef4444",
    questions: [
      {
        id: "hq-1",
        title: "Design a lock-free hash map.",
        difficulty: "advanced",
        tags: ["lock-free", "hash-map", "design"],
      },
      {
        id: "hq-2",
        title: "Implement a userspace scheduler.",
        difficulty: "advanced",
        tags: ["scheduler", "userspace"],
      },
      {
        id: "hq-3",
        title: "Build a mini kernel.",
        difficulty: "advanced",
        tags: ["kernel", "os-dev"],
      },
      {
        id: "hq-4",
        title: "Design a page cache system.",
        difficulty: "advanced",
        tags: ["page-cache", "design"],
      },
      {
        id: "hq-5",
        title: "Implement a copy-on-write file system.",
        difficulty: "advanced",
        tags: ["cow", "filesystem"],
      },
      {
        id: "hq-6",
        title: "Design a kernel module for monitoring.",
        difficulty: "advanced",
        tags: ["kernel-module", "monitoring"],
      },
      {
        id: "hq-7",
        title: "Build a custom memory allocator (jemalloc-style).",
        difficulty: "advanced",
        tags: ["allocator", "jemalloc", "memory"],
      },
    ],
  },
  {
    id: "edge-cases",
    name: "Trick & Edge Case Questions",
    description:
      "Surprising behaviors, corner cases, and gotchas interviewers love.",
    icon: "🎯",
    color: "#e879f9",
    questions: [
      {
        id: "ec-1",
        title: "Can a program run without a heap?",
        difficulty: "intermediate",
        tags: ["heap", "memory"],
      },
      {
        id: "ec-2",
        title: "What happens if the stack overflows?",
        difficulty: "intermediate",
        tags: ["stack", "overflow"],
      },
      {
        id: "ec-3",
        title: "Why is recursion dangerous in OS kernel code?",
        difficulty: "intermediate",
        tags: ["recursion", "kernel"],
      },
      {
        id: "ec-4",
        title: "What happens if TLB is disabled?",
        difficulty: "advanced",
        tags: ["tlb", "hardware"],
      },
      {
        id: "ec-5",
        title: "Can two processes share memory safely? How?",
        difficulty: "intermediate",
        tags: ["shared-memory", "ipc"],
      },
      {
        id: "ec-6",
        title: "What happens if malloc() fails?",
        difficulty: "beginner",
        tags: ["malloc", "memory"],
      },
    ],
  },
  {
    id: "hands-on",
    name: "Hands-On / Coding",
    description:
      "Implement classic concurrency problems, thread-safe queues, rate limiters, and memory pools.",
    icon: "🧪",
    color: "#2dd4bf",
    questions: [
      {
        id: "ho-1",
        title: "Implement the producer-consumer problem.",
        difficulty: "intermediate",
        tags: ["producer-consumer", "concurrency"],
      },
      {
        id: "ho-2",
        title: "Implement the readers-writers problem.",
        difficulty: "intermediate",
        tags: ["readers-writers", "concurrency"],
      },
      {
        id: "ho-3",
        title: "Implement dining philosophers (deadlock-free).",
        difficulty: "advanced",
        tags: ["dining-philosophers", "deadlock"],
      },
      {
        id: "ho-4",
        title: "Build a thread-safe queue.",
        difficulty: "intermediate",
        tags: ["thread-safe", "queue", "concurrency"],
      },
      {
        id: "ho-5",
        title: "Build a rate limiter.",
        difficulty: "intermediate",
        tags: ["rate-limiter", "design"],
      },
      {
        id: "ho-6",
        title: "Build a memory pool allocator.",
        difficulty: "advanced",
        tags: ["memory-pool", "allocator"],
      },
    ],
  },
  {
    id: "debugging",
    name: "Debugging & Production",
    description:
      "Diagnosing memory issues, high sys CPU, and production debugging tools.",
    icon: "🐛",
    color: "#fb7185",
    questions: [
      {
        id: "db-1",
        title:
          "A process is consuming 8GB of RSS but only 500MB is actually in use. What could explain this? How would you diagnose it (e.g., /proc/pid/smaps, pmap)?",
        difficulty: "advanced",
        tags: ["memory", "debugging", "smaps"],
      },
      {
        id: "db-2",
        title:
          "You observe high sys CPU time on a server. Walk through your debugging approach — what tools would you use (perf, strace, bpftrace, /proc/stat) and what patterns would you look for?",
        difficulty: "advanced",
        tags: ["cpu", "perf", "strace"],
      },
    ],
  },
];

export const categories = attachQuestionMetadata(dedupeCategories(rawCategories));

export const totalQuestions = categories.reduce(
  (sum, category) => sum + category.questions.length,
  0
);

export const advancedQuestions = categories.reduce(
  (sum, category) =>
    sum +
    category.questions.filter((question) => question.difficulty === "advanced")
      .length,
  0
);
