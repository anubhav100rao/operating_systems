# Problem 30: The OOM Killer and Memory Overcommit

When all physical RAM and swap space are completely exhausted, the system faces an existential crisis. To prevent the entire Operating System from hard-crashing and freezing permanently, the Linux kernel employs the **OOM (Out of Memory) Killer**.

## 1. Memory Overcommit and Why It Exists

To understand the OOM Killer, you must understand **Overcommit**.
When a process calls `malloc(1GB)`, the Linux kernel replies "Success!" and returns a pointer, but it does *not* actually assign 1GB of physical RAM. It merely promises that the virtual memory space is valid. Physical RAM is only allocated later, exactly when the process actually touches/writes to the pages (Demand Paging).

*   **Why?** Most programs ask for way more memory "just in case" than they ever actually use (e.g., launching an array of sparse matrices). If Linux reserved physical RAM instantly, the system would run out of memory incredibly fast.
*   **Analogy:** An airline (Linux) overbooking a flight. They sell 150 tickets for a 100-seat plane, knowing statistically that 50 people usually cancel or don't show up.

## 2. The Failure Mode of Overcommit

The major failure mode occurs when the statistics are wrong: *What if all 150 people show up?*
If multiple massive processes allocate huge blocks of virtual memory, and then suddenly all decide to actually write data to all of it simultaneously, the kernel runs out of physical RAM and swap space to fulfill its promises.

Since the kernel promised memory it doesn't have, it has only two choices:
1.  **Crash the entire OS (Kernel Panic).**
2.  **Break its promise by murdering a process to steal its memory.** (The OOM Killer).

## 3. How the OOM Killer Scores Processes

The OOM Killer does not just pick a process at random. It calculates an "assassination score" called the `oom_score` for every running process, and kills the process with the highest score.

The scoring heuristic is roughly based on:
1.  **Memory Footprint (The Biggest Factor):** The process consuming the most physical memory gets the highest baseline score. Killing one 10GB process recovers more memory than killing 100 tiny 10MB processes.
2.  **Root/System Processes:** Processes running as `root` (like hardware drivers, systemd, SSH) receive a massive score discount. The kernel prefers to kill user applications rather than core system infrastructure.
3.  **Process Age/Time:** Long-running processes sometimes get slight protections compared to a wildly exploding process that just spawned 2 seconds ago.

### Manual Protection (`oom_score_adj`)
System administrators can manually protect critical processes or paint targets on disposable ones using the `/proc/[pid]/oom_score_adj` file.
*   Setting it to `-1000` makes the process completely utterly immune to the OOM killer (used for critical daemons like `sshd` or `postgres` master nodes).
*   Setting it to `+1000` makes it a prime target.

## 4. Failure Modes of the OOM Killer Strategy
Relying on the OOM killer in production is dangerous:
*   **The Wrong Victim:** It might kill a massive, perfectly innocent database read-replica just because it's large, instead of the tiny, buggy python script that is wildly leaking memory.
*   **System Thrashing:** Right before the OOM killer triggers, the system will desperately try to swap pages to disk to survive. This causes massive disk I/O thrashing, rendering the server completely unresponsive for minutes before the kill finally happens.
*   **Data Corruption:** If a database worker thread is abruptly `SIGKILL`ed mid-transaction, it leaves shared memory segments in an inconsistent state, potentially corrupting application data.
