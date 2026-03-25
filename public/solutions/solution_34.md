# Solution 34: Thrashing and the Working Set Model

## The Problem
Thrashing detection and mitigation. Explain the working set model.

---

## 💡 The Analogy: The Tiny Desk and the Homework

Imagine a student trying to write a research paper. 
They need an Encyclopedia, a Dictionary, a Notebook, and a Textbook to write a single paragraph. 
However, their physical desk is so tiny it can only hold **two books** at a time. The rest must be kept on a shelf across the room.

To write a sentence:
1. They bring the Encyclopedia and Textbook to the desk.
2. They realize they need to write in the Notebook. So they walk to the shelf, swap the Encyclopedia for the Notebook.
3. They realize they need a definition. They walk to the shelf, swap the Textbook for the Dictionary.
4. Now they need the Encyclopedia again to finish the thought...

**The Result:** The student spends 95% of their time walking across the room swapping books, and 5% of their time actually studying.
This is **Thrashing**.

---

## 🔬 Deep Dive: What is Thrashing?

In an operating system, thrashing occurs when the system spends more CPU time swapping (paging) data into and out of physical RAM from the hard drive than it does executing actual application code.

The system slows to an absolute crawl. The hard drive LED turns solid white, moving the mouse stutters, and the system appears completely locked up. 

### Why Does It Happen?

Thrashing is a symptom of **extreme memory overcommitment paired with competing active workloads.**
When Physical RAM is full, the OS must evict a page to disk to load a requested page. If the evicted page is needed again a microsecond later, it triggers another page fault, causing another eviction, causing an infinite cycle of disk I/O.

---

## 🧠 The Working Set Model

To understand and mitigate thrashing, Peter Denning introduced the **Working Set Model** in 1968.

The OS assumes that programs exhibit **Locality of Reference**—they only need a specific subset of their total memory at any given phase of execution. 
*   A 4GB video game doesn't need all 4GB in RAM at once. To render Level 1, it only needs a "Working Set" of 500MB.

**Definition:** 
The Working Set $WS(t, \Delta)$ is the set of pages successfully referenced by a process in the most recent time window $\Delta$.
*   If $\Delta$ is too small, we might miss pages needed sporadically.
*   If $\Delta$ is too large, the working set includes dead pages from previous phases of the program.

**The Thrashing Mathematical Equation:**
Let $D = \sum |WS_i|$ (The total demand: the sum of the size of the working sets of all active processes).

*   If $D \leq \text{Available Physical Memory}$: The system operates happily.
*   If $D > \text{Available Physical Memory}$: **Thrashing is mathematically guaranteed.** The active subset of memory needed right now simply cannot physically fit in RAM.

---

## 🛠 Mitigation Strategies

If $D > \text{RAM}$, optimizing page replacement algorithms (like LRU or ARC) is completely useless. You cannot optimize your way out of physics. The only solution is to reduce $D$ by altering the multiprogramming level.

### 1. Mid-Term Scheduling (Swapping)
Traditional UNIX systems used a mid-term scheduler. If the kernel detected thrashing (by noticing a skyrocketed global page-fault rate), the scheduler would select a victim process and **suspend it entirely**, swapping its entire working set to disk. 
This removes the victim's demand from $D$, allowing the remaining processes to comfortably fit in RAM, finish their work, and exit. Once RAM frees up, the suspended process is brought back.

### 2. The Linux OOM Killer Approach
Linux historically prefers a more brutal approach instead of suspension scheduling. Under extreme thrashing (or absolute memory exhaustion without swap space), the kernel invokes the **Out Of Memory (OOM) Killer**.
It calculates a "badness" score for every process (based heavily on memory usage) and sends a `SIGKILL` to the worst offender. 
Killing one heavy process instantly frees its Working Set, curing the thrashing at the cost of program destruction. 

### 3. Local vs. Global Page Replacement
Windows NT utilizes a local page replacement policy enforcing Working Set trims. Each process is given a Working Set maximum quota. If Process A faults and exceeds its quota, it must evict *one of its own pages*, rather than stealing a page from Process B. This elegantly isolates thrashing: a badly behaving program will thrash itself, but the rest of the OS remains perfectly responsive.
