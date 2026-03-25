# Solution 3: `fork()` and Copy-on-Write (CoW) Mechanics

## The Problem
What happens in the kernel between `fork()` returning and the child process actually executing? Walk through Copy-on-Write mechanics at the page table level.

---

## 💡 The Analogy: The Roommate and the Netflix Account

Imagine you live with a roommate, and you have a giant filing cabinet (Memory).
When you `fork()` a new roommate (the child process), historically, you would have to go to Office Max, buy a completely new filing cabinet, and photocopy every single piece of paper perfectly (Naive `fork()`). This takes forever, and most of the time, the new roommate just throws all the papers in the trash to start their own cabinet immediately anyway (calling `exec()`).

**Copy-on-Write (CoW)** is smarter. 
Instead of photocopying, you just give your roommate a key to the *same* cabinet. You put a strict **"Read-Only"** sticky note on every drawer.
As long as you both just *read* the papers, everything is perfectly shared, taking zero extra space and zero setup time.
However, the moment either of you pulls out a pen and tries to *write* on a paper, a magic alarm goes off (Page Fault). A lawyer (the Kernel) runs into the room, says "Hold on!", photocopies *that specific piece of paper*, gives the copy to the person holding the pen, removes the "Read-Only" restriction on both copies, and leaves. You then resume writing as if nothing happened.

---

## 🔬 Deep Dive: Copy-on-Write at the Page Table Level

When you call `fork()`, the kernel creates a new task structure (`struct task_struct` in Linux), assigns a new PID, and sets up execution state. But the critical magic happens in **Memory Management (Virtual Memory)**.

### Step 1: During `fork()`
1.  **Duplicate VMA (Virtual Memory Areas):** The kernel iterates through the parent process's memory regions (Heap, Stack, Code, Data) and creates identical VMA descriptors for the child.
2.  **Duplicate Page Tables, NOT Pages:** The kernel creates a new set of Page Directories/PTEs (Page Table Entries) for the child. 
3.  **Point to the Same Physical Frames:** The child's PTEs are configured to point to the *exact same underlying physical memory frames* as the parent.
4.  **The CoW Magic - Mark as Read-Only:** The kernel deliberately alters the permissions in *both* the parent's and the child's Page Tables. It clears the `W` (Write) bit on all writable pages (like stack, heap, and bss) and increments the reference count of the physical pages.

At this split second, `fork()` returns. The parent and child are running in totally separate virtual address spaces, but they map 100% to the exact same physical RAM.

### Step 2: Child or Parent Executes and Tries to Write
Let's assume the child process executes `x = 5;` where `x` is a global variable.

1.  **The CPU MMU Checks Permissions:** The CPU looks at the Virtual Address of `x`, walks the child's Page Table, and finds the corresponding Physical Frame.
2.  **Hardware Exception (Page Fault):** The CPU sees that the `W` (Write) bit in the PTE is `0` (Read-only). Because the instruction is trying to write, the CPU blocks the instruction and raises a Hardware Exception: **Page Fault (Trap 14 on x86)**.
3.  **Kernel Intervenes (`do_page_fault` -> `handle_mm_fault` -> `do_wp_page`):** 
    *   The kernel's trap handler takes over. It looks at the causing address and checks the VMA permissions. 
    *   The VMA says "This region *should* be writable by the user" but the PTE says "Read-Only". The kernel realizes this is a **Copy-on-Write** scenario, not a segmentation fault.
4.  **Allocating the Copy:** 
    *   The kernel allocates a brand new, empty 4KB physical frame from the free memory pool.
    *   It physically copies the 4KB of data from the shared page into the new page.
5.  **Fixing the Page Tables:**
    *   The kernel updates the child's PTE to point to the *new* physical frame.
    *   It restores the `W` (Write) bit to `1` in the child's PTE.
    *   It decrements the reference count of the original physical page. (If the reference count hits 1, it changes the parent's PTE back to writable as well, since they are no longer sharing it).
6.  **Resume Execution:** The kernel issues an `iret` (interrupt return) instruction, placing the CPU exactly back on the `x = 5;` instruction.
7.  **Success:** This time, the MMU checks the PTE, sees it is writable, and the write succeeds on the child's private copy of the page. The application is completely unaware this interruption happened.

---

## 💻 Code Example: Proving CoW Exists in Userspace

We can't easily see the page tables in C without kernel modules, but we can measure the *time* the page fault takes to prove CoW. 
Reading shared memory is fast. Writing to it the *first time* incurs the CoW page fault penalty.

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>
#include <time.h>

#define SIZE (100 * 1024 * 1024) // 100 MB array

// Helper to get nanoseconds
uint64_t get_ns() {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

int main() {
    // Allocate 100MB and fill it. This forces the OS to map real physical pages.
    char *buffer = malloc(SIZE);
    for (int i = 0; i < SIZE; i++) buffer[i] = 'A';

    pid_t pid = fork();

    if (pid == 0) {
        // --- CHILD PROCESS ---
        
        // 1. READ TEST (No Page Faults, very fast)
        uint64_t start = get_ns();
        char dummy = 0;
        for (int i = 0; i < SIZE; i += 4096) { // Read one byte per page
            dummy += buffer[i]; 
        }
        printf("Child: Time to READ 100MB: %llu ns\n", get_ns() - start);

        // 2. WRITE TEST (Triggers thousands of Page Faults and memory allocations!)
        start = get_ns();
        for (int i = 0; i < SIZE; i += 4096) { // Write one byte per page
            buffer[i] = 'B'; // <--- PAGE FAULT AND ALLOCATION HAPPENS HERE
        }
        printf("Child: Time to WRITE 100MB (CoW Penalty): %llu ns\n", get_ns() - start);

        exit(0);
    } else {
        wait(NULL);
    }
    return 0;
}
```

**Expected Output:**
You will notice the "WRITE" time is exponentially slower than the "READ" time in the child, because the hardware is trapping to the kernel every 4096 bytes (every page boundary) to allocate and copy a physical page.
