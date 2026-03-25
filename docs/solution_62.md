# Problem 62: How does `strace` Work? How does `ptrace` Work?

`strace` is an indispensable debugging tool for any Linux systems programmer. It can magically intercept and print every single system call a running process makes, along with the arguments and return values. How? The answer is `ptrace`, a powerful and somewhat frightening kernel syscall.

## 1. The Analogy: The FBI Wiretap

*   **The Target Process:** A suspect (the process you are tracing).
*   **`ptrace`:** A federal court order (syscall) granting permission to tap the suspect's phone (all system calls).
*   **`strace`:** The FBI agent (the tracer) who has set up the wiretapping equipment. They sit in a van outside with headphones, listening to every call the suspect makes, transcribing the conversation, and then allowing the call to proceed.

## 2. What is `ptrace`?

`ptrace` is a Linux system call (`sys_ptrace`) that provides a powerful process inspection and control mechanism. It is the foundational infrastructure upon which:
*   **`strace`** is built (system call tracer)
*   **`gdb`** is built (debugger — setting breakpoints, reading registers)
*   **`valgrind`** uses (memory error detection)
*   **Security sandboxes** like `seccomp-bpf` policies are enforced

Its signature is:
```c
long ptrace(enum __ptrace_request request, pid_t pid, void *addr, void *data);
```

## 3. How `strace` Attaches with `ptrace` 

There are two ways `strace` can observe a process:

### Method 1: Running the command from the start
```bash
strace ls /etc
```
1.  `strace` calls `fork()` to create a child process.
2.  The child immediately calls `ptrace(PTRACE_TRACEME, 0, NULL, NULL)`. This syscall says: "Dear kernel, I am volunteering to be traced by my parent process."
3.  The child then calls `execve("ls", ...)` to replace itself with the `ls` binary.
4.  The kernel, seeing `PTRACE_TRACEME` on this process, automatically sends a `SIGTRAP` signal to the child before executing the very first instruction, causing it to stop and wait.
5.  The `strace` parent process calls `wait()` and sees the child has stopped.

### Method 2: Attaching to an already running process
```bash
strace -p 12345
```
1. `strace` calls `ptrace(PTRACE_ATTACH, 12345, ...)`.
2. The kernel immediately sends `SIGSTOP` to process `12345`, halting it.
3. `strace` calls `waitpid(12345, ...)` to confirm the stop.

## 4. The Syscall Interception Loop

Once attached, `strace` enters its core event loop:

```c
// Simplified strace core loop (illustrative)
ptrace(PTRACE_SYSCALL, child_pid, NULL, NULL); // 1. Tell kernel: resume, but stop at syscall boundary

while(1) {
    wait(&status); // 2. Block until child stops again

    if (WIFEXITED(status)) break; // Child exited, we're done

    // 3. We are now stopped at a SYSCALL entry or exit
    // Peek at the registers to discover which syscall and its arguments
    struct user_regs_struct regs;
    ptrace(PTRACE_GETREGS, child_pid, NULL, &regs);
    
    // On x86-64, the syscall number is in the RAX register at entry
    long syscall_num = regs.orig_rax;
    printf("Syscall #%ld called with arg0=%lld\n", syscall_num, regs.rdi);
    
    // 4. Allow the child to execute the syscall and stop when it returns
    ptrace(PTRACE_SYSCALL, child_pid, NULL, NULL);
    wait(&status);
    
    // 5. Peek again at exit - now RAX contains the return value
    ptrace(PTRACE_GETREGS, child_pid, NULL, &regs);
    printf("  => returned %lld\n", regs.rax);
    
    // 6. Resume until the NEXT syscall
    ptrace(PTRACE_SYSCALL, child_pid, NULL, NULL);
}
```

**The `PTRACE_SYSCALL` magic:** With `PTRACE_SYSCALL`, the kernel allows the traced process to run freely, but sets a special flag in the `task_struct`. The moment the tracee's CPU enters `syscall` (via the `SYSCALL` hardware instruction) or exits it (`SYSRET`), the kernel checks this flag, sends `SIGTRAP` to the tracee, pausing it, and also sends `SIGCHLD` to waken the tracer in its `waitpid()` call.

## 5. The Performance Cost

`strace` makes every single syscall take approximately **6 times longer** than normal, because each syscall now requires:
1. The tracee thread to stop (signal).
2. The tracer thread to wake up from `waitpid`.
3. The tracer to make its own `ptrace(GETREGS)` and `ptrace(SYSCALL)` syscalls.
4. The tracee thread to be scheduled back on the CPU.

Thus, **never run `strace` on a performance-critical production database**. Use it specifically for debugging unexpected behavior.
