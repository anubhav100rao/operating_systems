# Problem 93: Can a Program Run Without a Heap?

This is a classic trick question. The short answer is: **Yes, absolutely.** The heap is a convenience, not a requirement for program execution. Understanding this requires knowing exactly what the heap is and where it comes from.

## 1. What is the Heap?

The "heap" is not a hardware concept. The CPU has no knowledge of a "heap." It is a purely software abstraction provided by the C runtime library (`glibc`, `musl`, etc.) by managing a dynamic memory region the OS has allocated.

When your C program calls `malloc(100)`, the C library checks its internal free-list pool. If it has enough memory, it returns a pointer from that pool. If not, it requests more pages from the OS via the `brk()` or `mmap(MAP_ANONYMOUS)` system calls. The range of memory returned by `brk()` is what we traditionally call "the heap."

**Key insight:** The C runtime's heap is just a layer built on top of program memory. And the C runtime itself is optional.

## 2. Running Without a Heap

A program uses no heap as long as it never calls `malloc()`, `calloc()`, `realloc()`, or `free()`, and does not use C++ `new` / `delete`.

### Method 1: Stack-only allocation (Most Common)

```c
// This entire program allocates ZERO bytes on the heap.
#include <stdio.h>

int global_counter = 0;  // In the BSS/Data segment

int fibonacci(int n) {
    // Only uses the stack for local variables and return addresses
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main(void) {
    // All variables below live on the stack
    int result = fibonacci(10);
    char msg[] = "Result:";  // msg is a stack array, not heap
    printf("%s %d\n", msg, result);
    return 0;
}
```

*Verify: `valgrind --tool=massif ./a.out` will show zero heap allocations.*

### Method 2: Static / Global Buffers (Embedded Systems)

In embedded firmware and OS kernels, dynamic allocation is often forbidden entirely. All buffers are statically allocated at compile time in the `.bss` or `.data` ELF segments.

```c
// No #include <stdlib.h>! No malloc anywhere!
#define MAX_PACKETS   64
#define PACKET_SIZE  256

// These arrays are allocated at link time, not runtime
static unsigned char packet_pool[MAX_PACKETS][PACKET_SIZE];
static int           packet_in_use[MAX_PACKETS] = {0};

// A trivial "allocator" from a fixed pool — no brk/mmap syscall ever made
unsigned char* acquire_packet(void) {
    for (int i = 0; i < MAX_PACKETS; i++) {
        if (!packet_in_use[i]) {
            packet_in_use[i] = 1;
            return packet_pool[i];
        }
    }
    return NULL; // Pool exhausted
}

void release_packet(unsigned char *p) {
    int idx = (p - packet_pool[0]) / PACKET_SIZE;
    packet_in_use[idx] = 0;
}
```

### Method 3: mmap directly (Bypassing malloc entirely)

```c
#include <sys/mman.h>
#include <unistd.h>
#include <stdio.h>

int main(void) {
    // Request memory directly from the OS kernel — no glibc heap involved
    size_t size = 4096;
    void *buf = mmap(NULL, size, PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    // Use buf...
    munmap(buf, size);
    // Still zero traditional "heap" allocations (no brk() was ever called)
    return 0;
}
```

## 3. When is "No Heap" Essential?

| Context | Why heap is avoided |
| :--- | :--- |
| **Linux Kernel** | Cannot sleep during allocation (no paging), uses slab allocator instead |
| **Embedded / RTOS** | No `malloc` = deterministic timing = no surprise pauses |
| **Safety-critical (aviation, medical)** | MISRA-C rules ban dynamic allocation — static sizing ensures bounded memory use |
| **High-Frequency Trading (Hot path)** | `malloc`/`free` latency spikes → pre-allocate everything at startup |
