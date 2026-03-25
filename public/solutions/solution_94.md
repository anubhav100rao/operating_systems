# Problem 94: What Happens if the Stack Overflows?

Stack overflow is one of the most dramatic failures a running program can experience, and the mechanism by which the OS handles it is elegantly clever. It is also one of the most critically important security vulnerabilities in computing history.

## 1. The Analogy: The Skyscraper With No Foundation Pit Cover

Imagine you're building a tower of stacked book boxes (stack frames) downward into the ground. Each time you call a function, you stack another box below. Your building is assigned floors —1 through -1000 (allowed stack depth).

If your program recurses without stopping, your tower eventually tries to go to floor -1001. There is nothing there — just exposed city bedrock (unmapped memory). When your program's "architect" (the CPU) tries to write a box to that level and discovers it's literally empty ground, the entire construction suddenly collapses in a heap.

## 2. How the Stack is Laid Out

On Linux x86-64, a process's main thread stack typically starts at a high virtual address (e.g., `0x7FFFFFFF0000`) and grows **downward** toward lower addresses.

```
High Address  ┌──────────────────────┐
0x7FFFFFFF0000│  main() frame        │ ← RSP starts here (argv, envp)
              │  func1() frame       │
              │  func2() frame       │
              │  ...deeper calls...  │
              │  funcN() frame       │
              ├──────────────────────┤
              │  GUARD PAGE (4KB)    │ ← mmap'd with NO permissions (PROT_NONE)
              ├──────────────────────┤
              │  [Unmapped / other]  │
Low Address   └──────────────────────┘
```

The OS deliberately places a **Guard Page** (one 4KB page with `PROT_NONE` permissions: no read, no write, no execute) just below the valid stack region.

## 3. The Step-by-Step Overflow Sequence

1. **Infinite Recursion begins.** Each new call to `recurse()` pushes a stack frame (return address, saved `RBP`, local variables) using `push` instructions, lowering the `RSP` (Stack Pointer) register.

2. **Stack grows into the Guard Page.** When `RSP` crosses into the guard page boundary, the CPU attempts to write to a memory address within the guard page.

3. **Hardware raises Page Fault.** The CPU's MMU looks up the address in the Page Table. It finds the permission is `PROT_NONE`— not accessible. The hardware immediately triggers a **Page Fault exception** (interrupt vector 14 on x86).

4. **Kernel's Page Fault Handler (`do_page_fault`) runs.** The kernel inspects the fault address and cross-references it with the process's `vm_area_struct` list. It determines: "This address `0x7FFF...X` is below the bottom of the allowed stack VMA and in the guard page. This is an invalid fault."

5. **Kernel delivers `SIGSEGV`.** The kernel sends a `SIGSEGV` (Segmentation Violation) signal to the offending thread.

6. **Default action = terminate.** Unless the program has installed a custom `SIGSEGV` signal handler (which is dangerous and limited), the process is immediately killed. The kernel prints a message to `dmesg`:  
   `a.out[12345]: segfault at 7fff...aa ip 0000... sp 7fff...bb error 6 in a.out`

## 4. Can You Catch a Stack Overflow?

By default, no. Traditional `SIGSEGV` handlers run on the same stack as the program — which is completely exhausted. The signal handler would immediately cause *another* page fault trying to push its own frame.

**The fix: `sigaltstack()`** — you can register an alternate signal stack in a separately allocated region:

```c
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>

#define ALT_STACK_SIZE (1024 * 64)  // 64KB alternate signal stack

static void sigsegv_handler(int sig) {
    // This code runs on the ALTERNATE stack, not the exhausted main stack!
    write(STDERR_FILENO, "CAUGHT STACK OVERFLOW!\n", 23);
    _exit(1); // Must use _exit(), not exit() — we are in a signal handler
}

int main(void) {
    // Set up an alternate stack
    stack_t alt_stack;
    alt_stack.ss_sp    = malloc(ALT_STACK_SIZE);
    alt_stack.ss_size  = ALT_STACK_SIZE;
    alt_stack.ss_flags = 0;
    sigaltstack(&alt_stack, NULL);

    // Install SIGSEGV handler, specifying it should use the alt stack
    struct sigaction sa = {0};
    sa.sa_handler = sigsegv_handler;
    sa.sa_flags   = SA_ONSTACK;  // <-- CRITICAL FLAG
    sigaction(SIGSEGV, &sa, NULL);

    // Intentionally overflow the stack
    main(); // Infinite recursion!
    return 0;
}
```

## 5. The Security Angle: Classic Stack Buffer Overflow

The term "stack overflow" also refers to the classic **stack buffer overflow exploit** — a completely different but related concept.

```c
void vulnerable(char *input) {
    char buffer[64];
    strcpy(buffer, input); // DANGEROUS: no bounds check!
    // If input > 64 bytes, it overwrites buffer, then the saved RBP,
    // then the RETURN ADDRESS stored on the stack.
    // An attacker crafts `input` so the return address now points to 
    // attacker-controlled shellcode.
}
```

Defenses against this exploit:
*   **Stack Canaries (`-fstack-protector`):** GCC places a secret random value between local variables and the return address. Before returning, it checks the canary. If it's been corrupted, the program terminates (`__stack_chk_fail`).
*   **ASLR:** Randomizes stack base, making the shellcode's address unpredictable.
*   **NX bit (`W^X`):** Marks the stack as non-executable. Even if the attacker injects shellcode, the CPU refuses to execute it.
