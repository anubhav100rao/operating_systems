# Problem 12: Scheduler Design for Different Workloads

Designing a CPU scheduler means deciding what gets to run, when, and for how long. Different computer environments have drastically different goals requiring tailored algorithms.

## 1. System Types & Scheduler Goals

### Real-Time Systems (e.g., Pacemaker, Car ABS, Aviation software)
*   **Goal:** Strict, predictable deadlines. Missing a deadline results in system failure or catastrophic consequences.
*   **Design:** Use an **Earliest Deadline First (EDF)** or **Rate Monotonic Scheduling (RMS)** algorithm.
*   **Implementation:** Processes explicitly declare their frequency and deadline mathematically. The scheduler always preempts the current task if a task with an earlier deadline becomes runnable. Fairness is irrelevant; only deadlines matter.

### Interactive Workloads (e.g., Desktop OS, Smartphones)
*   **Goal:** Low latency and responsiveness. The user should not notice lag when clicking a button or moving a mouse.
*   **Design:** Prioritize I/O-bound tasks heavily.
*   **Implementation:** When a user clicks a mouse, the GUI thread wakes up. The scheduler must instantly boost its priority and preempt heavy background computing tasks to process the input.

### Batch Systems (e.g., Scientific Computing, Data processing)
*   **Goal:** Maximum throughput. Complete as many huge jobs as possible over time. Response latency doesn't matter.
*   **Design:** Minimize context switches, as they waste CPU cycles resetting cache lines and TLBs.
*   **Implementation:** Run jobs for very long time slices (quantums) before switching. First-Come, First-Served (FCFS) or Shortest Job Next (SJN); simply crunching data linearly.

---

## 2. Comparing Scheduling Algorithms

### Round Robin (RR)
*   **Mechanism:** Every process gets a fixed time slice (quantum). When the slice expires, it's moved to the back of a First-In-First-Out (FIFO) queue.
*   **Analogy:** A teacher answering children's questions by giving every child exactly 1 minute of attention in a circle, over and over.
*   **Pros:** Simple, extremely fair, completely starvation-free.
*   **Cons:** Terrible for interactive user interfaces. If there are 100 background tasks and 1 UI task, the UI task waits for 100 quantums before acting on a keypress.

### Multi-Level Feedback Queue (MLFQ)
*   **Mechanism:** Maintains multiple queues with different priority levels. 
    *   Top queue has short time slices (for interactive processes).
    *   Bottom queue has extremely long time slices (for batch processes).
    *   **Rule:** If a process uses its full time slice, it gets demoted to a lower priority queue (assumed to be CPU bound). If a process yields the CPU early (waiting for I/O), it stays in a high priority queue.
*   **Analogy:** A hospital ER triage system. If you say "my chest hurts" (short, immediate interactive problem), you jump to priority 1. If the doctor finds out you just have a chronic mild cough that takes hours to check (CPU bound), you are bumped down to the slow queue.
*   **Pros:** Automatically learns if a process is interactive or batch-oriented without needing to be told. It adapts dynamically based on observing historical behavior.

### Linux Completely Fair Scheduler (CFS)
*   **Mechanism:** Instead of strict discrete queues, CFS tracks the continuous "virtual runtime" (`vruntime`) of every process. The scheduler uses a Red-Black tree and always picks the lowest `vruntime`. `vruntime` accrues based on real time spent on the CPU, weighted by priority.
*   **Analogy:** A group of kids sharing a single video game console. The parent looks at a stopwatch recording how long each kid has played entirely across the week. Whoever has the lowest total playtime on the stopwatch gets the controller next.
*   **Pros:** Elegant, incredibly scalable, and handles interactive and batch tasks smoothly by giving I/O bound tasks an naturally lower `vruntime` (because they sleep a lot), ensuring they preempt CPU hogs immediately upon waking up.
