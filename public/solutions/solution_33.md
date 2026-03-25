# Solution 33: Page Replacement Algorithms

## The Problem
Why is LRU impractical? Compare CLOCK vs ARC vs LFU page replacement algorithms.

---

## 💡 The Analogy: The Kitchen Refrigerator

You have a tiny fridge (Physical RAM) holding 10 items. When you buy groceries (Disk), you must throw something out to make room.

*   **Pure LRU (The Timestamping Maniac):** Every single time you open the fridge to grab the milk or the butter, you take a label maker and print the exact timestamp, sticking it on the item. When the fridge is full, you look at all 10 items to find the oldest timestamp. Perfect accuracy, but writing timestamps takes longer than actually cooking the meal!
*   **CLOCK (The Sticky Note Method):** You put a blank sticky note on an item if you touch it. When the fridge is full, you scan in a circle. If an item has a sticky note, you take the note off (giving it a second chance) and move to the next. If you find one *without* a note, you throw it out. Almost zero effort, remarkably effective.
*   **ARC (The Smart Fridge):** The fridge splits itself. The left half is for things you buy constantly (Milk/Eggs - Frequency). The right half is for things you just bought recently (Leftover Pizza - Recency). Furthermore, the fridge remembers what you threw out recently. If you complain, "I just threw out the butter and now I need it!", the fridge dynamically makes the Frequency side larger.

---

## 🔬 Deep Dive: Why LRU is Impractical

Least Recently Used (LRU) is mathematically beautiful: throw out the page that hasn't been accessed for the longest time. 

However, "accessed" means executing a CPU instruction (like `MOV RAX, [address]`). A CPU executes billions of these per second. 
To implement pure LRU, the MMU hardware would have to:
1.  Maintain a system-wide linked list of physical frames, and move a node to the front of the list on *every single memory instruction*. (Impossible hardware complexity).
2.  Or, maintain a 64-bit high-resolution cycle counter on every Page Table Entry and update it constantly (Generates immense memory traffic just to track memory traffic).

Because exact tracking is too expensive, operating systems rely on approximations.

---

## 🧠 The Algorithms Compared

### 1. CLOCK (LRU-Approximation / Second Chance)
Instead of timestamps, CLOCK relies on a single **Accessed Bit** (or Reference Bit) present in most modern hardware Page Table Entries.
*   Whenever a page is read or written, the hardware MMU flips this bit to `1`. (Hardware does this for free).
*   The OS keeps all pages in a circular linked list.
*   When memory is full, the "Clock Hand" sweeps around the circle.
*   **If Accessed == 1:** The OS sets it to `0` and moves the hand forward. (The page was used recently, we give it a "second chance").
*   **If Accessed == 0:** The page hasn't been touched since the last time the clock hand swept by. Evict it!

*Verdict:* Highly efficient, completely eliminates the overhead of tracking every access. Used as the foundation for modern Linux `kswapd` routines (Linux actually uses a two-handed clock, tracking an `active` and `inactive` list).

### 2. LFU (Least Frequently Used)
Evict the page that has been used the least number of times overall.
*   Requires a counter that increments.
*   **The Crucial Flaw—Cache Pollution:** If you run a virus scan, it reads every file on disk *exactly once*, rapidly incrementing counters, and pushing your long-running database to disk. Furthermore, a file accessed heavily yesterday will have a massive counter and might *never* be evicted today, even if it's dead.
*   *Verdict:* Rarely used in its pure form due to pollution and aging problems.

### 3. ARC (Adaptive Replacement Cache)
Invented at IBM research (by Megiddo and Modha), ARC is widely considered one of the greatest caching algorithms ever designed (famously implemented in the ZFS filesystem). 

It elegantly solves the problem: *Should we cache things used recently (LRU) or things used frequently (LFU)?*
ARC uses **four** lists to dynamically adapt to the workload:
*   **T1 (Recent):** Cached pages accessed exactly once.
*   **T2 (Frequent):** Cached pages accessed more than once.
*   **B1 (Ghost Recent):** The "Graveyard" of T1. Tracks the metadata/hashes of pages we *recently evicted* from T1.
*   **B2 (Ghost Frequent):** The "Graveyard" of T2. Tracks metadata of pages evicted from T2.

**The Adaptive Magic:**
The cache is split between T1 and T2 (e.g., 50% / 50%).
If a program accesses a page and we suffer a Cache Miss, but we find the metadata in **B1 (Ghost Recent)**, ARC realizes: *"Damn, if my Recent list was just a little bit bigger, that would have been a hit!"*
*   ARC instantly responds by expanding the size of T1 at the expense of T2.
If a hit occurs in **B2 (Ghost Frequent)**, ARC concludes Frequency is more important for this workload and expands T2 at the expense of T1.

*Verdict:* Provides unprecedented hit rates across diverse workloads without manual tuning, gracefully handling sequential scans without polluting the highly-frequent cache.
