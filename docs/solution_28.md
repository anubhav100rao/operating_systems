# Problem 28: Internal vs External Fragmentation, Buddy and Slab Allocators

Memory fragmentation occurs when free memory is available but cannot be effectively used by the system because of how it is distributed.

## 1. Fragmentation Types

### Internal Fragmentation
*   **What it is:** Wasted space *inside* an allocated block of memory. The allocator gives the process a larger block than it requested, and the leftover space inside that block goes completely unused.
*   **Example:** You request 9 KB of memory. The memory allocator only works in 16 KB chunks. You receive a 16 KB block. The remaining 7 KB inside that block is wasted (internally fragmented).

### External Fragmentation
*   **What it is:** Wasted space *between* allocated blocks of memory. There is enough total free memory to satisfy a request, but it is scattered in tiny, non-contiguous holes across the RAM, so a large contiguous request fails.
*   **Example:** You have 10 MB of total free RAM, but it exists as ten separate 1 MB holes separated by in-use memory. If a process requests a contiguous 3 MB chunk, the allocation fails.

## 2. The Buddy Allocator (Combats External Fragmentation)

The **Buddy Allocator** manages the system's physical pages. It works by repeatedly dividing memory blocks in half (creating "buddies") until it finds the smallest block that fits the power-of-two request dynamically.
*   **How it works:** Memory is divided into blocks of $2^0, 2^1, ... 2^{10}$ pages. If you need 3 pages, it finds a 4-page block. If it only has an 8-page free block, it splits it into two 4-page buddies. It gives you one, and keeps the other free.
*   **The Magic:** When you free your 4-page block, the allocator immediately checks if its mathematical "buddy" is also free. If so, it organically merges them back into an 8-page block, then checks the 16-page buddy, and so on.
*   **Pros:** This constant coalescing (merging) fiercely prevents **External Fragmentation**. Large contiguous blocks are easily reformed.
*   **Cons:** It causes horrific **Internal Fragmentation**. If you request 65 KB, you must be given a 128 KB block, wasting 63 KB inherently!

## 3. The Slab Allocator (Combats Internal Fragmentation)

The kernel frequently needs to allocate tiny, fixed-size data structures (e.g., a massive number of 104-byte `inode` structs or 256-byte `task_structs`). Using the Buddy allocator for this would waste immense amounts of memory.

The **Slab Allocator** sits seamlessly on top of the Buddy Allocator.
*   **How it works:** The Slab allocator asks the Buddy allocator for a large, raw contiguous chunk of memory (e.g., a 4 KB page). It then acts as a highly specialized butcher, carving that 4 KB page into a "cache" of exactly thirty-nine 104-byte structs, mathematically placed back-to-back with zero gaps perfectly.
*   **Pros:** It completely eliminates **Internal Fragmentation** for high-frequency kernel structs because the objects perfectly fit the carved slots.
*   **Cons:** Slab allocators are restricted to objects of identical sizes effectively.

## 4. Why Linux Uses Both

Linux uses a layered architectural approach:
1.  The **Buddy Allocator** is the foundational bedrock manager. It handles large-scale physical memory, hands out whole pages, and completely eliminates gross external fragmentation gracefully.
2.  The **Slab/Slub Allocator** acts as a specialized retail middleman. It buys memory "in bulk" (entire pages) from the Buddy allocator, carves it into precise molecular pieces entirely, and serves tiny kernel structs inherently, eliminating internal fragmentation effectively.

### Analogy: The Lumberjack and the Carpenter
*   **Buddy Allocator (Lumberjack):** Cuts trees strictly into logs of 8 meters, 4 meters, or 2 meters. If you need a 3-meter log, he gives you a 4-meter log and you throw 1 meter in the trash (Internal Fragmentation). But because he cuts so uniformly properly, the forest is always neatly organized (No External Fragmentation).
*   **Slab Allocator (Carpenter):** Takes a 4-meter log carefully from the lumberjack and builds perfectly exact 0.5-meter chairs out of it. There are exactly 8 chairs produced, and not a single wood chip naturally is wasted reliably.
