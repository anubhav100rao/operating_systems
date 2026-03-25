# Solution 98: What Happens If `malloc()` Fails?

## The Problem
What happens if `malloc()` fails?

---

## 💡 The Analogy: The ATM Out of Cash

You go to an ATM (call `malloc`). You request $500 (request memory). The ATM says it is completely out of cash (returns `NULL`). 

**Scenario 1 — Responsible customer:**
You check the screen, see the error, put your card back in your wallet, and walk to the nearest bank branch to try a different approach.

**Scenario 2 — The Nightmare:** 
You ignore the "Out of Cash" screen, grab the money slot, and try to stuff the bills that don't exist into your pocket. You crash through the wall and end up in the adjacent pizza place, stealing slices (Undefined Behavior / Segmentation Fault).

---

## 🔬 Deep Dive: What `malloc` Actually Does on Failure

### The Return Value Contract

`malloc()` (and its cousins `calloc`, `realloc`) return `NULL` upon failure. This is guaranteed by the C standard (ISO/IEC 9899). 

```c
void *ptr = malloc(size);
if (ptr == NULL) {
    // DO NOT proceed.
}
```

### When Does `malloc` fail?

**1. Physical Memory Exhaustion (Most obvious):**
The system has no more Virtual Memory for this process (heap exhaustion), or the OS refuses to commit new pages.

**2. Linux Overcommit (The Subtle Trap):**
As discussed in Solution 35, Linux overcommits by default. `malloc(10GB)` on a system with only 512MB of RAM will often **succeed** and return a non-NULL pointer! The OS is lying — it hasn't actually allocated any physical frames yet. The OOM Killer will strike when the process actually tries to write to that memory. You cannot rely on `NULL` return to detect overcommit exhaustion on Linux.

**3. Heap Fragmentation:**
Even if 100MB of heap memory is theoretically free, if it is fragmented into thousands of tiny non-contiguous chunks, a request for a contiguous 10MB block will fail. The allocator cannot satisfy the request even though free memory exists.

**4. `ENOMEM` from `brk()` / `mmap()`:**
When the heap's current arena is full, `malloc` itself calls `brk()` (to expand the data segment) or `mmap(MAP_ANONYMOUS)` to get more memory from the OS. If these syscalls fail (returning `ENOMEM`), `malloc` returns `NULL`.

---

## 💀 The Undefined Behavior of Dereferencing `NULL`

If you do not check the return value and immediately dereference the pointer:

```c
int *buf = malloc(n * sizeof(int));
buf[0] = 42; // NULL dereference if malloc failed!
```

1.  `buf` is `NULL` (the address `0x0`).
2.  The CPU attempts to access virtual address `0x0`.
3.  On all modern operating systems, the first page of virtual address space (address 0–4095) is intentionally left **unmapped and unreadable**. This is called the "NULL page guard".
4.  The CPU immediately raises a **Page Fault exception**.
5.  The kernel's page fault handler looks up the faulting address in the process's VMA list. The address `0x0` matches no VMA.
6.  The kernel determines this is an illegal access and sends `SIGSEGV` (Segmentation Fault) to the process.
7.  The default handler for `SIGSEGV` terminates the process and dumps core.

*(Note: On some embedded RTOSes without memory protection, NULL == address 0 might be a valid, mapped hardware register. Dereferencing NULL on these systems can flip physical hardware bits — a catastrophically silent bug).*

---

## 💻 Code Example: Robust Error Handling Patterns

### Pattern 1: Check-and-Abort (Simplest, Acceptable for Non-Critical Code)

```c
void* safe_malloc(size_t size) {
    void *ptr = malloc(size);
    if (ptr == NULL) {
        // perror prints "malloc: Cannot allocate memory"
        perror("malloc");
        // abort() generates a core dump and exits — fail loudly, fail early
        abort();
    }
    return ptr;
}
```

### Pattern 2: Graceful Degradation (For Servers and Daemons)

A long-running server cannot crash on every malloc failure (e.g., a temporary spike). It must handle it gracefully:

```c
#include <errno.h>

int handle_http_request(int client_fd) {
    // Estimate: allocate a 16KB buffer for the response body
    char *buf = malloc(16384);
    if (buf == NULL) {
        // Log the error with context
        fprintf(stderr, "malloc failed for response buffer: %s\n", strerror(errno));
        
        // Gracefully send a 503 error to the client instead of crashing
        const char *err = "HTTP/1.1 503 Service Unavailable\r\n\r\nOut of memory.";
        send(client_fd, err, strlen(err), 0);
        
        return -1; // Signal failure up the call chain
    }
    
    // ... use buf safely ...
    free(buf);
    return 0;
}
```

### Pattern 3: `new_handler` in C++ (The C++ Way)

In C++, the `new` operator throws `std::bad_alloc` by default on failure (since `new` never returns `NULL`). You can set a custom handler:

```cpp
#include <new>
#include <cstdlib>

void out_of_memory_handler() {
    std::fprintf(stderr, "FATAL: Out of memory! Aborting.\n");
    std::abort();
}

int main() {
    std::set_new_handler(out_of_memory_handler);
    
    // If 'new' fails, out_of_memory_handler is called automatically
    // before std::bad_alloc is thrown.
    int *big_array = new int[1'000'000'000];
    return 0;
}
```

### The `realloc` Trap (A Classic Bug)

```c
// BUG: If realloc fails, it returns NULL but the original pointer is NOT freed.
// Assigning NULL back to 'data' causes a MEMORY LEAK.
data = realloc(data, new_size);

// CORRECT: Use a temporary pointer to preserve the original on failure.
void *tmp = realloc(data, new_size);
if (tmp == NULL) {
    // 'data' is still valid and can be used or freed here
    free(data);
    handle_error();
    return;
}
data = tmp; // Safe to reassign now
```
