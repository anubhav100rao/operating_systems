# Solution 31: `mmap()`, Anonymous vs. File-Backed, and Demand Paging

## The Problem
How does `mmap()` work at the page table level? Explain the difference between file-backed and anonymous mappings and how demand paging ties in.

---

## 💡 The Analogy: The Magic Window

Imagine your computer's virtual memory is a giant, initially empty wall. 
Calling `mmap()` is like outlining a square on the wall and saying, "This is a magic window."

**File-Backed `mmap` (The Library Window):**
You point the window at a specific book in the magical library (a file on disk). At first, the window is totally blank. But the moment you look through a specific pane of the window (dereferencing a pointer), a library assistant (the page fault handler) instantly sprints to the shelf, grabs that specific page of the book, slaps it on the glass, and lets you read it.

**Anonymous `mmap` (The Blank Notepad):**
You don't point the window at any book. You just want temporary scratch space. Again, the window is blank. The moment you press your pen against a pane of glass to write, the assistant sprints to a giant stack of blank, zeroed-out paper (free physical RAM), tapes a purely blank sheet to the glass, and lets you write. When you close the window, the paper is thrown in the trash.

---

## 🔬 Deep Dive: `mmap` at the Page Table Level

The system call `mmap()` (Memory Map) is the absolute foundation of memory allocation in modern Unix. Even `malloc()` internally uses `mmap()` for large allocations.

### 1. What happens during the `mmap()` system call?
Surprisingly, **almost nothing happens to the Page Tables.**
When a process calls `mmap()`, the kernel:
1. Validates the request (alignment, permissions).
2. Finds an empty contiguous range in the process's Virtual Address Space.
3. Creates a new **VMA (Virtual Memory Area)** data structure (in Linux, a `vm_area_struct`).
4. Adds this VMA to the process's red-black tree of memory areas. 

**Critical concept:** At this exact moment, **no physical RAM has been allocated**. The Page Table Entries (PTEs) for this vast new virtual range are all marked as `Invalid` (Not Present). `mmap()` simply returns the starting virtual address and the syscall finishes in microseconds.

### 2. File-Backed vs. Anonymous Mappings

VMAs store exactly *what* backs the memory if it is accessed.

*   **File-Backed Mappings (`MAP_SHARED` or `MAP_PRIVATE` with a file descriptor):**
    The VMA stores a pointer to the `struct file` and the inode. 
    *Use cases:* Loading the `.text` segment of an executable, reading large databases without `read()` syscalls, or shared memory between processes via a file.
*   **Anonymous Mappings (`MAP_ANONYMOUS`):**
    The VMA has no file backing it. It is entirely backed by RAM (and eventually swap space if RAM runs out). 
    *Use cases:* Allocating the process heap, the thread stacks, or shared memory between a parent and child process.

### 3. Demand Paging to the Rescue

The moment the application actually tries to read or write to the pointer returned by `mmap()`, the CPU looks at its Page Table, sees the `Present` bit is 0, and throws a **Page Fault**.

**The Page Fault Handler Workflow:**
1. The kernel looks up the faulting Virtual Address in the process's VMA Red-Black tree.
2. It finds our VMA and sees we *are* allowed to access it.
3. **If it's File-Backed:** 
   The kernel asks the filesystem to fetch the missing 4KB block from the disk and put it into the **Page Cache** in physical RAM. It then updates the PTE to point to this cached page, sets `Present=1`, and resumes the CPU.
4. **If it's Anonymous:**
   The kernel pulls a 4KB frame from the physical free list, zeroes it out (for security, so you don't read old process data), updates the PTE to point to this new frame, sets `Present=1`, and resumes.

*(Note: Linux uses an optimization called the "Zero Page" for anonymous mappings. On a read fault, it maps the PTEs read-only to a single pre-zeroed global page. Only upon a *write* fault will it actually allocate a unique frame. This is Anonymous Copy-on-Write!)*

---

## 💻 Code Example: File-Backed vs Anonymous

```c
#include <stdio.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>

int main() {
    // 1. ANONYMOUS MAPPING (Like malloc)
    // Map 4MB of RAM, readable/writable, not backed by a file.
    char *anon = mmap(NULL, 1024 * 4096, PROT_READ | PROT_WRITE, 
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
                      
    // Page Fault happens exactly on this next line when we write!
    strcpy(anon, "This is anonymous RAM."); 
    printf("%s\n", anon);


    // 2. FILE-BACKED MAPPING
    int fd = open("example.txt", O_RDWR | O_CREAT, 0666);
    write(fd, "Hello Disk!", 11);
    
    // Map the file directly into our address space
    char *file_mem = mmap(NULL, 4096, PROT_READ | PROT_WRITE, 
                          MAP_SHARED, fd, 0);
                          
    // We can read/modify the file via pointers! No read()/write() needed!
    // Triggers a Page Fault -> pulls file into Page Cache.
    printf("File contents before: %s\n", file_mem);
    
    // Triggers a Write Fault -> modifies Page Cache (flushed to disk later).
    strncpy(file_mem, "Goodbye Disk!", 13); 

    return 0;
}
```
