# Problem 106: Diagnosing High `sys` CPU Time on a Production Server

> **Scenario:** You notice `sys` CPU utilization is unexpectedly high (e.g., 40–80%) on a production server. The application's business logic hasn't changed. Walk through your complete debugging approach.

## 1. Understanding `sys` vs `user` vs `iowait`

The Linux kernel exposes per-CPU time accounting in several categories:

```bash
# Read from /proc/stat — updated every jiffy (~10ms)
cat /proc/stat
# cpu  12345 678 99999 8888888 111 22 333 0 0 0
# ^us  ^nice  ^sy  ^idle  ^iow ^irq ^sirq
```

| CPU Mode | Meaning |
|---|---|
| `user` | Application code running in Ring 3 (your program) |
| **`sys`** | Kernel code running in Ring 0 (syscall handlers, interrupt handlers) |
| `iowait` | CPU idle while waiting for disk/network I/O |
| `irq` | Hardware interrupt service routines |
| `softirq` | Software interrupts (`ksoftirqd` — network RX, timers) |

**High `sys` CPU** means the kernel is doing an enormous amount of work on behalf of processes — far more than the workload should require. This is a strong signal of a pathological syscall pattern, kernel contention, or hardware interrupt storm.

## 2. Step 1 — Confirm the Problem with `top` and `vmstat`

```bash
# top: columns us/sy/ni/id/wa/hi/si/st
top

# vmstat 1: rolling 1-second samples
vmstat 1
# r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs  us sy id wa st
# 4  0      0 200000      0 2000000    0    0     0   100 5000 8000  5 45 50  0  0
#                                                         ^in  ^cs
```

Key columns in `vmstat`:
- **`in` (interrupts/sec):** A sudden spike here suggests an interrupt storm (network, disk, or timer).
- **`cs` (context switches/sec):** Very high values (>100,000/s) suggest excessive thread contention or too many sleeping threads being woken up constantly.
- **`sy` (% sys):** Confirms the observation.

## 3. Step 2 — Identify the Offending Process with `perf top`

```bash
# perf top: live sampling of ALL kernel functions consuming CPU
# Shows kernel symbol names in real time
sudo perf top -a

# Narrow to a specific PID
sudo perf top -p <PID>
```

Look at the `Overhead` column. If you see:
- `do_sys_poll`, `ep_poll` (epoll internals) → too many connections polling
- `__lock_text_start`, `mutex_spinlock` → spinlock contention
- `__copy_user_nocache` → massive memory copying through syscalls
- `tcp_sendmsg`, `tcp_recvmsg` → heavy network I/O through the kernel stack
- `page_fault` → excessive memory mapping faults
- `__alloc_pages_nodemask` → memory pressure, heavy page allocation

## 4. Step 3 — Count Syscalls per Second with `perf stat`

```bash
# Profile syscall rate across the entire system for 5 seconds
sudo perf stat -e syscalls:sys_enter_* -a sleep 5

# Or for a specific process
sudo perf stat -e syscalls:sys_enter_write,syscalls:sys_enter_read,\
syscalls:sys_enter_futex,syscalls:sys_enter_epoll_wait -p <PID> sleep 5
```

**What to look for:**
- **`futex` rate > 1M/s:** Lock contention — threads are sleeping on locks and waking each other up constantly. Each futex call is a syscall.
- **`write` rate > 1M/s:** Unbatched writes — writing tiny amounts of data per syscall (e.g., `write(fd, buf, 1)` in a loop) instead of batching.
- **`mmap`/`brk` rate high:** Memory allocator calling the kernel too frequently — consider switching to `jemalloc`.

## 5. Step 4 — `strace` for Detailed Syscall Tracing

```bash
# Attach to a running process and trace all syscalls with timing
sudo strace -p <PID> -T -o /tmp/strace_output.txt

# Count syscalls and their cumulative time
sudo strace -p <PID> -c -f
```

Sample `strace -c` output revealing the root cause:
```
% time     seconds  usecs/call     calls    errors syscall
 62.30    0.412000           1    400000           futex
 18.50    0.122000           0    300000           write
 10.20    0.067000           0    200000           read
  4.10    0.027000          27      1000        20 epoll_wait
  3.40    0.022000           0    100000           mmap
```
Here `futex` consuming 62% of syscall time is the smoking gun — massive lock contention.

## 6. Step 5 — `bpftrace` for Deep Kernel Tracing (Zero Overhead on Hot Paths)

`bpftrace` uses eBPF to attach to kernel events with almost zero overhead — perfect for production.

```bash
# 1. Find which syscalls are most frequent system-wide
sudo bpftrace -e '
tracepoint:raw_syscalls:sys_enter { @[comm, args->id] = count(); }
interval:s:5 { print(@); clear(@); exit(); }
'

# 2. Trace futex calls and their call stacks (find which lock is contended)
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_futex {
    @futex_stacks[ustack] = count();
}
interval:s:5 { print(@futex_stacks); exit(); }
' -p <PID>

# 3. Detect processes making too many tiny writes (< 512 bytes)
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_write /args->count < 512/ {
    @tiny_writes[comm] = count();
}
interval:s:5 { print(@tiny_writes); exit(); }
'
```

## 7. Step 6 — Check for Interrupt Storms (`/proc/interrupts`)

```bash
# Watch interrupt counts grow per CPU core
watch -n 1 'cat /proc/interrupts'

# Sum NIC interrupts (look for runaway IRQ on one core)
grep eth0 /proc/interrupts
# Or for NVMe storage:
grep nvme /proc/interrupts
```

If one CPU core is handling 100% of NIC interrupts while others are idle, the IRQ is not balanced:
```bash
# Check IRQ affinity for a specific interrupt (e.g., IRQ 35)
cat /proc/irq/35/smp_affinity

# Spread NIC IRQ across all cores
echo ff > /proc/irq/35/smp_affinity  # Allow any of the first 8 cores
# Or use irqbalance daemon
systemctl start irqbalance
```

## 8. Step 7 — Full Flame Graph for Root Cause Attribution

A **CPU flame graph** visually shows where kernel time is being spent across all call stacks simultaneously:

```bash
# Record kernel + userspace stacks for 30 seconds
sudo perf record -ag -F 99 -- sleep 30

# Generate the flame graph
sudo perf script | ~/FlameGraph/stackcollapse-perf.pl > stacks.txt
~/FlameGraph/flamegraph.pl stacks.txt > flamegraph.svg

# Open in browser — wide kernel plateaus = high sys time
xdg-open flamegraph.svg
```

## 9. Common Root Causes and Remediation

| Root Cause | `perf top` Signal | Fix |
|---|---|---|
| **Lock contention** | high `futex`, `mutex_spin_lock` | Reduce lock granularity, use lock-free structures |
| **Tiny/unbatched writes** | high `write` syscall rate | Buffer writes, use `writev()` (scatter-gather) |
| **IRQ storm (NIC)** | high `softirq`, `ksoftirqd` in top | Enable multi-queue NIC, `irqbalance`, `SO_REUSEPORT` |
| **Excessive page faults** | high `handle_mm_fault` | Pre-fault with `mlock()`, use huge pages |
| **malloc pressure** | high `brk`, `mmap` | Switch to `jemalloc` or `tcmalloc` |
| **Excessive `mprotect` calls** | high `mprotect` rate | JVM issue; use `-XX:+UseLargePages` |
| **Context switch storm** | high `cs` in `vmstat` | Reduce thread count, use event-driven I/O |
| **NUMA cross-node traffic** | high `__alloc_pages_nodemask` | Pin processes+memory to same NUMA node |

## Analogy: The Firefighter Report
Imagine a firehouse where 40% of all firefighter (CPU) time is being spent filling out paperwork (kernel/sys) rather than fighting fires (user). 
1. **`top`/`vmstat`:** Walk into the firehouse and see piles of paper on every desk (sys% is high).
2. **`perf top`:** Look at the job board and see "Lock Inspection Reports" being filled out at an absurd rate.
3. **`strace -c`:** Check the timesheet — "futex lock calls" accounts for 62% of all logged activity.
4. **`bpftrace`:** Follow a specific firefighter around with a clipboard and record exactly which reports they are filling out and why (per-stack tracing).
5. **Flame graph:** Photograph the entire firehouse from above and see that the "paperwork" table is three times wider than the "fire hose" table.
6. **Fix:** Redesign the reporting workflow so 40 firefighters aren't all signing the same single lock logbook (reduce lock contention).
