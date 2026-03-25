# Problem 7: How does `fork()` differ from `clone()` in Linux?

In standard POSIX systems, `fork()` is the classic way to create a new execution context, while POSIX threads (`pthreads`) are used for multithreading. However, Linux takes a unique and elegant approach: under the hood, there are no strict boundaries between a "process" and a "thread." Instead, the Linux kernel provides a single underlying workhorse called `clone()`.

## 1. The Analogy 

*   **`fork()`:** Imagine a chef making an exact photocopy of a recipe book, giving it to an apprentice, and locking them in a completely separate kitchen. If the apprentice scribbles notes in their book, the main chef’s book remains untouched.
*   **`clone()`:** Imagine a chef handing their actual recipe book to the apprentice in the *same* kitchen. If the apprentice scribbles notes, the main chef sees them immediately. However, `clone()` gives you granular control: maybe the apprentice gets to share the kitchen, but they get their own set of cooking utensils (file descriptors) and their own timer (signals).

## 2. `fork()`: The Traditional Process Creator

When you call `fork()`, the kernel creates a child process that is an almost exact duplicate of the parent. 

*   **What it does:** It creates a new process ID (PID) and a completely separate virtual address space.
*   **Copy-on-Write (CoW):** Historically, `fork()` physically copied all memory, which was incredibly slow. Modern Linux uses CoW: the child’s page tables point to the exact same physical memory pages as the parent, but the pages are marked as "read-only." If *either* the parent or child tries to write to a page, a page fault occurs, the kernel intercepts it, duplicates that specific 4KB page in RAM, updates the page table, and then allows the write.
*   **Under the hood:** In modern Linux kernels, calling the `fork()` syscall actually just invokes the `sys_clone()` (or `kernel_clone()`) function with a specific set of default flags.

## 3. `clone()`: The Swiss Army Knife

`clone()` is a Linux-specific system call (not POSIX compliant) that allows you to specify exactly what resources the parent and child should share. Instead of an exact duplicate or an entirely shared state, you can pick and choose using bitmask flags.

*   `CLONE_VM`: Share the virtual memory space (this is how threads are made!).
*   `CLONE_FILES`: Share the table of open file descriptors.
*   `CLONE_FS`: Share filesystem information (root layout, current working directory).
*   `CLONE_SIGHAND`: Share the table of signal handlers.
*   `CLONE_NEWPID`: Create the child in a new PID namespace (crucial for Docker containers).

When the GNU C Library (glibc) `pthread_create()` function wants to spawn a new thread on Linux, it does not call some special `create_thread()` syscall. It simply calls `clone()` heavily loaded with sharing flags.

## 4. Code Examples

### Doing it the `fork()` way (Standard POSIX)
```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int shared_data = 100; // Global data

int main() {
    pid_t pid = fork();

    if (pid == 0) { // Child
        shared_data = 500; // Triggers Copy-on-Write; parent's variable is unaffected
        printf("Child: shared_data = %d\n", shared_data); // Prints 500
    } else { // Parent
        wait(NULL);
        printf("Parent: shared_data = %d\n", shared_data); // Prints 100
    }
    return 0;
}
```

### Doing it the `clone()` way (Linux-specific Magic)
*Note: Using raw clone is highly discouraged in normal applications (use pthreads). This demonstrates kernel behavior.*

```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>

int shared_data = 100;

// The function the cloned child will execute
int child_func(void* arg) {
    shared_data = 500; // Since CLONE_VM is used, this modifies the parent's memory!
    printf("Clone Child: shared_data = %d\n", shared_data); // Prints 500
    return 0;
}

int main() {
    // clone requires a manually allocated stack for the child
    void* stack = malloc(1024 * 1024); // 1MB stack
    void* stack_top = (char*)stack + 1024 * 1024;

    // Use clone to create a "thread" (sharing Memory and File table)
    int flags = CLONE_VM | CLONE_FILES | SIGCHLD;
    pid_t pid = clone(child_func, stack_top, flags, NULL);

    waitpid(pid, NULL, 0); // Wait for child to finish

    // Because of CLONE_VM, the parent observes the child's write
    printf("Clone Parent: shared_data = %d\n", shared_data); // Prints 500
    
    free(stack);
    return 0;
}
```

## 5. Summary Connection to the OS Kernel

In the Linux kernel source tree (e.g., `kernel/fork.c`), both `sys_fork` and `sys_clone` ultimately call a core function named `kernel_clone` (formerly `_do_fork`). 

*   A **Process** is just a `task_struct` created by `clone` with few sharing flags, resulting in a distinct `mm_struct` (memory descriptor).
*   A **Thread** is just a `task_struct` created by `clone` with `CLONE_VM`, where its `mm_struct` pointer simply points back to the parent's memory descriptor. 

Thus, in Linux, threads and processes are simply two ends of a spectrum of sharing, governed entirely by the `clone()` system call.
