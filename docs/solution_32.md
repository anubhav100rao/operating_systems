# Solution 32: Page Tables and Inverted Page Tables

## The Problem
Multi-level page tables, why are they needed? Explain inverted page tables.

---

## 💡 The Analogy: The City Directory

Imagine a massive, 1,000-page "Directory of Every Street in the World." 

**Single-Level Page Table (The Complete Encyclopedia):**
Every single citizen gets their own personal, complete 1,000-page encyclopedia, even if they only ever travel to two streets in their entire life. Printing 1,000 pages for 10 million citizens requires more paper than exists on Earth. 

**Multi-Level Page Table (The Sparse Bookshelf):**
Instead of a single giant book, the directory is split into volumes. 
You get a 1-page "Master Index" that simply says: "To find streets starting with A through D, look at Volume 1."
If you never visit a street starting with A-D, Volume 1 is never printed for you. You only carry the Master Index and the specific, tiny pamphlets for the exact neighborhoods you use. This saves an astronomical amount of paper.

**Inverted Page Table (The Pager Device):**
Instead of giving citizens books, the Mayor buys 1,000 physical parking spots (Physical Memory Frames). He creates exactly ONE global registry that lists Who is parked in Which Spot. Because there are only 1,000 physical spots, this registry is tiny. To find someone, you quickly search the global registry.

---

## 🔬 Deep Dive: The Need for Multi-Level Paging

A mathematical reality check on why flat (single-level) page tables are physically impossible on modern architectures.

Suppose we have a 32-bit system with 4KB ($2^{12}$) pages.
*   The Virtual Address space is 4GB ($2^{32}$).
*   Number of pages = $\frac{2^{32}}{2^{12}} = 2^{20}$ (1 Million pages).
*   If each Page Table Entry (PTE) is 4 bytes, the flat Page Table is **4 Megabytes**.
*   Since *every single process* has its own virtual address space, every process requires a 4MB page table. If you have 500 processes running, that's **2GB of physical RAM wasted solely on page tables**, even if those processes are only "Hello World" scripts using 10KB of memory!

If you scale this to a 64-bit system, a flat page table would require petabytes of contiguous RAM just to store the translation map.

### How Multi-Level Page Tables Fix This

Modern architectures (x86-64 uses a 4-level or 5-level page table) split the virtual address into chunks.
For a 4-level system, the 64-bit virtual address (actually 48 bits are used) is segmented:
*   9 bits: Page Global Directory (PGD) index
*   9 bits: Page Upper Directory (PUD) index
*   9 bits: Page Middle Directory (PMD) index
*   9 bits: Page Table Entry (PTE) index
*   12 bits: Page Offset

**The Magic:** Only the top-level PGD is allocated when the process starts (just 4KB).
If the process allocates a variable on the heap, the MMU follows the directories down. If the PMD or PTE tables don't exist yet, the kernel allocates just that specific 4KB mapping node dynamically. 
Because most applications use a tiny cluster of memory (a bit for code, a bit for stack, a bit for heap), the vast majority of the tree is unallocated. A "Hello World" app might use just 3 or 4 pages for its entire page table hierarchy, taking 16KB instead of Petabytes.

---

## 🔬 Inverted Page Tables

Multi-level page tables solve the memory bloat per process, but they STILL scale somewhat with Virtual Memory usage. Some architectures (like PowerPC, UltraSPARC, and IA-64) used an entirely different approach: the **Inverted Page Table (IPT)**.

Instead of a table whose size is proportional to the vast *Virtual Address Space*, an IPT is a single, global table whose size is strictly proportional to the installed *Physical RAM*.

### How it Works
If a server has 16GB of RAM and uses 4KB pages, there are exactly 4 Million physical frames.
The Inverted Page Table is an array of exactly 4 Million entries.
`IPT[Physical_Frame_Number] = { Process_ID, Virtual_Page_Number, Permissions }`

**The Reverse Lookup Problem:**
When the CPU tries to access Virtual Address `0xCAFEBABE` for Process ID `5`, it must find the Physical Frame. 
But the array is indexed by Physical Frame! Doing a linear search across 4 Million entries for `(PID 5, 0xCAFEB)` on every memory access would be catastrophically slow.

**The Solution:**
IPT implementations rely heavily on a highly efficient **Hash Table**.
1. The CPU hashes the `(Process_ID, Virtual_Page_Number)`.
2. The hash points to an index in the IPT (or an anchor table).
3. If there is a hash collision, it traverses a short linked-list chain.
4. Once a match is found, the array index itself *is* the Physical Frame Number.

**Why did x86-64 stick to Multi-Level instead of Inverted?**
*   **TLB Misses are Slower:** Hashing and walking collision chains in hardware/software during a TLB miss is more complex and often slower than a simple tree-walk in a traditional multi-level structure.
*   **Shared Memory is Hard:** If two processes map different virtual addresses to the same physical frame (shared memory), an IPT struggles because there is only *one* slot per physical frame. Complex aliasing workarounds are required.
