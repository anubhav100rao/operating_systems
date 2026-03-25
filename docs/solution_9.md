# Problem 9: How does `exec()` replace process memory?

In Unix-like systems, process creation is beautifully decoupled into two steps: `fork()` and `exec()`. We use `fork()` to create a duplicate process, and `exec()` to radically transform that process into a brand new program.

## 1. The Analogy: Remodeling a House

*   **`fork()`:** Buys the empty plot of land next door and builds an exact replica of your house (`Copy-on-Write`). 
*   **`exec()`:** You hire a demolition crew. They show up to your replica house, completely gut the interior, throw away your furniture, strip the paint, and then bring in entirely new furniture, install a new kitchen, and hand you a new set of rules. However, the physical address of the house (the Process ID - PID) stays exactly the same. They also left a safe box in the corner untouched (open file descriptors).

## 2. The Internal Mechanics of `exec()`

`exec()` is not a single function, but a family of functions (`execl`, `execv`, `execle`, `execvp`, etc.) that all eventually call the `execve` system call. Let's trace what the kernel does when `execve` is invoked.

### Step 1: Locating and Parsing the Executable
The kernel takes the path provided, locates the file on disk (via the Virtual File System layer), checks if you have execute permissions, and reads the binary header. In modern Linux, it checks if it's an ELF file (Executable and Linkable Format) or a script with a `#!/bin/bash` shebang.

### Step 2: Demolishing the Old Memory Space
The kernel unmaps all the existing virtual memory regions associated with the current `task_struct`. The old stack, heap, code (text), and data segments are unlinked and sent back to the OS pool of free memory (assuming no one else, like a parent, is sharing them via Copy-on-Write).

### Step 3: Loading the New Binary
Instead of physically copying the entire binary file from the hard drive into RAM (which would be slow), the kernel uses `mmap` (Memory Mapping). It maps the new program's Code (Text) and initialized Data segments directly into the process's new virtual address space.
*   The actual loading into physical RAM happens later via **demand paging** (as the process executes instructions that touch the mapped pages, page faults pull them in from disk).

### Step 4: Setting up the New Stack
The kernel provisions a fresh, blank stack memory segment. Crucially, it copies `argv` (the array of command-line arguments) and `envp` (the environment variables) from kernel space onto the very top of this new stack.

### Step 5: Setting the Instruction Pointer (RIP)
Finally, the kernel modifies the saved CPU registers for this process. It takes the "Entry Point" address parsed from the ELF header (typically the `_start` function in glibc, which later calls `main()`), and sets the Instruction Pointer (e.g., the `RIP` register on x86-64) to that address.

When the system call returns from kernel mode to user mode, the CPU blindly starts executing instructions at the new entry point. The old program is fully obliterated.

## 3. What Survives an `exec()`?

It's vital to know what survives the "house remodeling":
1.  **The Process ID (PID) & Parent Process ID (PPID):** Unchanged.
2.  **Open File Descriptors:** Any file sockets, pipes, or files opened previously remain open! This is how a shell passes `stdin`, `stdout`, and `stderr` to the new program. 
    *   *Security Note:* If you open a sensitive database file and call `exec()` on a third-party untrusted bash script, that bash script now has access to the open database connection! You must set the `O_CLOEXEC` (Close-On-Exec) flag on sensitive file descriptors to prevent this.
3.  **Current Working Directory:** Unchanged.

## 4. Code Example (C)

```c
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>

int main() {
    printf("I am the original program executing! My PID is %d\n", getpid());

    // Creating the argument list for the new program
    char *args[] = {"/bin/echo", "Hello from the other side!", NULL};

    // Call execve (or the wrapper execv)
    // The first argument is the path to the executable
    int result = execv("/bin/echo", args);

    // --- EVERYTHING BELOW THIS LINE IS DESTROYED ---
    
    // If exec() succeeds, this line of code literally ceases to exist in the 
    // process's memory space and will never be executed.
    
    // It only returns -1 if the file path was wrong or permissions denied.
    if (result == -1) {
        perror("exec failed!");
        exit(1);
    }

    return 0;
}
```
