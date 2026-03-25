# Problem 60: User Mode to Kernel Mode — Full Context Switch Cost Breakdown

When a thread transitions from user mode (Ring 3) to kernel mode (Ring 0) and back, the CPU pays a series of performance costs. This is one of the single most important performance considerations in systems programming.

## 1. The Direct Instruction Costs of `syscall`/`sysret`

The `syscall` instruction itself is not free. Each hardware step carries a measurable latency.

| Step | Operation | Cost |
|---|---|---|
| `syscall` | Save `rip` → `rcx`, save `rflags` → `r11`, mask flags, switch CS privilege level, jump to `LSTAR` | ~20–40 cycles |
| `swapgs` | Swap `GS` base register to access per-CPU kernel struct | ~10 cycles |
| Stack switch | Kernel reads the `rsp` for this thread's kernel stack from the TSS (Task State Segment) and sets `rsp` | ~5 cycles |
| `pt_regs` save | Push all user registers onto the kernel stack to build a `pt_regs` frame | ~15–30 cycles |
| ...kernel work... | The actual syscall handler executes (highly variable) | N/A |
| `pt_regs` restore | Pop all registers back from the kernel stack | ~15–30 cycles |
| `sysret` | Restore `rip` from `rcx`, restore `rflags` from `r11`, switch CS back to Ring 3 | ~20–40 cycles |

**Total bare-minimum hardware overhead:** ~100–200 cycles per syscall round-trip, even for a trivially simple syscall like `getpid()` that does almost nothing in the kernel handler.

## 2. The Indirect Cache Effects — The Dominant Cost

The raw instruction cost is actually the *minor* part of the total overhead. The **cache disruption** caused by the transition is often 10–100x more expensive.

### A. TLB Flush (Mitigated: PCID)
In early kernels, every kernel entry flushed the entire Translation Lookaside Buffer (TLB), because the kernel's "upper half" virtual memory mappings are completely different from user mappings. This meant every syscall return caused dozens of TLB misses as the user program resumed.

Modern x86-64 CPUs use **PCID (Process Context Identifiers)** to tag TLB entries with a context ID, allowing user and kernel TLB entries to coexist and avoiding full flushes.

### B. Kernel Page Table Isolation (KPTI / Meltdown Fix)
After the **Meltdown** CPU vulnerability (2018), Linux enabled **KPTI (Kernel Page Table Isolation)** by default. This means:
- In **user mode**: The CPU uses a "user" page table that has almost no kernel mappings (just a tiny trampoline for syscall entry).
- In **kernel mode**: The CPU switches to the full "kernel" page table.

This **page table switch** is a very expensive operation because it requires issuing a `CR3` register write, which on non-PCID-supporting CPUs causes a complete TLB flush.

**Cost of KPTI on a `getpid()` syscall:** Can degrade performance by 5–30% depending on TLB pressure.

### C. Instruction Cache (I-Cache) and Branch Predictor Pollution
The kernel handler runs entirely different code paths than the user program. Once the CPU is executing kernel code, the I-cache lines filled with user code start getting evicted. Upon `sysret`, the user code must be re-fetched from L2/L3 cache, causing instruction cache misses.

Similarly, the CPU's branch predictor (which maintains a history buffer of "which branch target was taken recently") gets contaminated with kernel branch history, causing mispredictions in user code after the syscall returns.

## 3. Full Context Switch (Process Switch) — Additional Costs

A full **context switch** (switching the CPU from Thread A to Thread B) includes all of the above PLUS:

| Additional Cost | Description | Approx. Cost |
|---|---|---|
| **Register save/restore** | Save *all* of Thread A's general-purpose and floating-point registers to memory; restore Thread B's | ~50–200 cycles |
| **CR3 write (page table switch)** | Load Thread B's page table base address into `CR3`, causing a TLB flush | ~200–1000 cycles + TLB miss recovery |
| **Kernel stack switch** | The `current` pointer (pointing to the thread's `task_struct`) changes, which changes the kernel stack | ~5 cycles |
| **Cache warming** | Thread B's working set (its data, its code) is likely cold in L1/L2 cache | **1,000–100,000+ cycles** in induced cache miss latency |

## 4. Real-World Numbers

| Operation | Approximate Latency |
|---|---|
| L1 cache hit | 4 cycles |
| L2 cache hit | 12 cycles |
| Syscall (getpid, cached, no KPTI) | ~100 cycles |
| Syscall (with KPTI enabled) | ~200–400 cycles |
| Full process context switch | ~2,000–10,000 cycles |
| Context switch + full TLB/cache cold-start | ~50,000–500,000 cycles |

## 5. Techniques to Minimize This Overhead

1. **Batch syscalls:** `io_uring` amortizes the cost by submitting hundreds of I/O requests with a single syscall.
2. **`vDSO` (Virtual Dynamic Shared Object):** For read-only kernel data (like current time), Linux maps a kernel page directly into userspace. Calls like `clock_gettime()` read this page directly without a syscall at all — zero transition cost.
3. **Reduce context switches:** Use fewer threads, use `epoll` instead of one thread per connection, use coroutines (cooperative multitasking) within a single thread.
4. **CPU Pinning (Affinity):** Keeping a thread on the same core ensures its data stays in L1/L2 cache between context switches.

## Analogy: The Secure Government Facility
- **Syscall (the quick version):** A cleared employee walks through an electronic keycard turnstile located right inside the building. Fast, but they still have to badge in, badge out, and the security camera system updates its logs.
- **KPTI page table switch:** On top of the keycard, the building now also requires physically swapping your entire security badge set (TLB flush). After Meltdown, every employee must do this. 30% of your day is now just swapping badge sets.
- **Full Context Switch:** Employee A is completely finished for the day. The entire desk gets cleared off completely, all their personal tools are packed into storage, and Employee B's entire toolset, personal preferences, and computer state gets set up from scratch. Even if done quickly, B will spend their first hour looking for their own tools (cache cold-start).
