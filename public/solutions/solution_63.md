# Problem 63: Kernel Preemption vs. Non-Preemptive Kernel

The question of whether the kernel itself can be interrupted mid-execution is one of the most fundamental design choices in OS architecture, directly impacting both latency and correctness.

## 1. The Analogy: The Air Traffic Controller

*   **Non-Preemptive Kernel:** An Air Traffic Controller (a kernel thread) is in the middle of issuing a critical landing sequence to three planes (updating core kernel data structures). No matter how urgent another situation becomes—a fuel emergency, a bird strike warning—the controller *cannot be interrupted* until they have completed the current clearance sequence and sit back in their chair (returned to user-space or triggered a scheduling point explicitly). Other controllers, pilots, and alarms queue up helplessly.
*   **Preemptive Kernel:** While the controller is mid-sentence, a supervisor taps them on the shoulder (a timer interrupt fires). The supervisor immediately takes over the radio for a nuclear emergency. The original controller bookmarks exactly what they were saying, steps away, handles the nuclear emergency, and then comes back to finish.

## 2. Non-Preemptive Kernels

In early Unix and early Linux versions (before Linux 2.6 in 2003), kernel code was **non-preemptive** within the kernel itself.

**The Rule:** Once user-space code entered kernel mode (via a system call or a page fault), that thread owned the CPU until:
1. It explicitly called `schedule()` itself (a voluntary yield).
2. It completed the system call and returned to user-space.
3. Hardware interrupted it (but even then, the ISR would run and then return to the interrupted kernel thread immediately).

**Simplicity Advantage:** Because the kernel could not be preempted, kernels were free to manipulate complex, linked data structures (like the process list or VFS inode cache) without worrying that a second kernel thread on the same CPU would swoop in mid-update and see a dangerously inconsistent state. This eliminated an entire class of critical section bugs.

**Latency Problem:** If a high-priority user thread wanted to wake up, it had to wait for whatever kernel thread was currently running to finish, even if it was stuck doing intensive file system work that takes 50ms. This created terrible worst-case latency ("jitter"), which was **completely unacceptable** for real-time audio, medical devices, and robotics.

## 3. Preemptive Kernels (Linux ≥ 2.6)

A preemptive kernel means the scheduler can force-evict a kernel thread *even while it is running kernel code*. When a timer interrupt fires and the scheduler sees a higher-priority thread is runnable, it can preempt the current kernel thread on the spot.

**How correctness is maintained:**
Since the kernel can now be preempted at almost any point, accessing shared data structures is no longer automatically safe. Every shared kernel data structure must now be explicitly protected with a lock (`spinlock_t`, `mutex`, `rw_semaphore`).

The kernel tracks whether a preemption is safe using an atomic per-thread counter: `preempt_count`. If this counter is non-zero (meaning the thread is in a critical section, bottom half handler, or holding a spinlock), preemption is temporarily **disabled** until the counter returns to zero.

```c
// Simplified kernel data access pattern with CONFIG_PREEMPT enabled
spin_lock(&my_data.lock);    // preempt_count++ (disable preemption on this CPU)
my_data.value = 42;          // Safe to modify, no one can sneak in mid-write
spin_unlock(&my_data.lock);  // preempt_count-- (preemption re-enabled)

// The scheduler may now immediately evict this thread here!
```

## 4. Comparison Table

| Feature | Non-Preemptive | Preemptive |
| :--- | :--- | :--- |
| **Latency** | High (can be stuck behind long syscalls) | Low (bounded worst-case) |
| **Real-Time Suitability** | No | Yes (with `PREEMPT_RT` patches) |
| **Kernel Complexity** | Simple (no per-struct locking needed) | Complex (explicit locking everywhere) |
| **Throughput** | Similar / slightly better (no preemption overhead) | Similar |
| **Used In** | Classic Unix, older Windows | Linux ≥ 2.6, macOS, modern Windows |
