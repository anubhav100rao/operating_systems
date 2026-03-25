# Problem 57: The `syscall`/`sysret` Transition on x86-64

Every time a user program reads a file, sends data over the network, or creates a thread, it transitions from unprivileged **Ring 3** (userspace) to privileged **Ring 0** (kernel space). On modern x86-64 systems, this is done via the `syscall` instruction, which is dramatically faster than the old `int 0x80` software interrupt it replaced.

## 1. Setting Up: The `STAR`, `LSTAR`, and `SFMASK` MSRs

Before any syscall can be handled, the kernel programs three special CPU registers called **Model Specific Registers (MSRs)** at boot:
- **`LSTAR` (Long STAR):** Holds the 64-bit virtual address of the kernel's syscall entry point handler — the function the CPU must jump to.
- **`STAR`:** Encodes which **Code Segment (CS)** and **Stack Segment (SS)** selectors to load for both kernel entry and the return to userspace.
- **`SFMASK`:** A bitmask of CPU flags (like the Interrupt flag `IF`) to automatically clear on syscall entry, preventing interrupts from firing before the kernel is ready.

## 2. The `syscall` Instruction — Step by Step

When userspace calls `syscall(2, ...)` (e.g., `open()`):

### In Userspace (before the instruction)
The C library (`glibc`) places arguments in specific registers per the x86-64 Linux calling convention:
```
rax = syscall number (e.g., 2 for open)
rdi = arg 1
rsi = arg 2
rdx = arg 3
r10 = arg 4  (note: NOT rcx, which the syscall instruction clobbers)
r8  = arg 5
r9  = arg 6
```

### The Hardware Transition (what the CPU does automatically)
1. Saves the current **return address** (`rip`) into the `rcx` register.
2. Saves the current CPU **flags** (`rflags`) into the `r11` register.
3. Masks `rflags` using `SFMASK` (disabling interrupts, etc.).
4. Switches `CS` to the kernel code segment (Ring 0 privilege).
5. Jumps to the address stored in `LSTAR` — the kernel handler.
> **Note: The CPU does NOT automatically switch the stack pointer (`rsp`)!** The kernel's first job is to manually switch to the kernel stack.

### Inside the Kernel Entry Handler (`entry_SYSCALL_64`)
```asm
; Kernel entry point (simplified from arch/x86/entry/entry_64.S)
ENTRY(entry_SYSCALL_64):
    swapgs                  ; Swap GS base to access per-CPU kernel data
    movq   %rsp, saved_rsp  ; Save userspace stack pointer
    movq   kernel_stack, %rsp ; Switch to this thread's kernel stack
    pushq  $USER_DS         ; Push segment info
    pushq  saved_rsp        ; Push user rsp
    pushq  %r11             ; Push saved rflags
    pushq  $USER_CS         ; Push user CS
    pushq  %rcx             ; Push user return address (rip)
    ; Now build a pt_regs struct on the kernel stack (saves all registers)
    call   do_syscall_64    ; Dispatch to the C handler
```

### Dispatching to the Handler (`do_syscall_64`)
```c
// Simplified kernel C code
void do_syscall_64(struct pt_regs *regs) {
    unsigned long nr = regs->orig_ax; // syscall number from rax
    // Bounds check
    if (nr < NR_syscalls) {
        regs->ax = sys_call_table[nr](regs); // Look up function pointer & call
    }
}
```
The `sys_call_table` is a simple array of function pointers indexed by syscall number.

## 3. The `sysret` Instruction — Returning to Userspace

After the kernel handler completes:
1. It restores registers from the `pt_regs` struct on the kernel stack.
2. Puts the return value in `rax`.
3. Executes `sysret`, which atomically:
   - Restores `rip` from `rcx` (the saved user return address).
   - Restores `rflags` from `r11`.
   - Switches `CS` back to Ring 3 (user privilege level).
   - **Does not restore `rsp`** — the kernel already restored it before `sysret`.

## 4. The Kernel Stack

Every process/thread in Linux has a small, dedicated **kernel stack** (typically 8 KB or 16 KB). When a thread makes a syscall, the kernel handler runs on *that thread's kernel stack*, not a global shared stack. This is why multiple threads can be inside syscalls simultaneously — each has its own private kernel stack.

## Analogy: The Embassy Checkpoint
- **Userspace (Ring 3):** A normal street accessible to anyone.
- **Kernel (Ring 0):** The secure inner embassy grounds.
- **`LSTAR` register:** The single, predefined gate phone number for the embassy.
- **`syscall` instruction:** Calling the phone number. You identify yourself (syscall number in `rax`), explain your request (args in registers), and wait at the gate.
- **`swapgs` / stack switch:** The guard checks your identity, gives you a temporary embassy ID badge (switches to kernel stack), and logs your entry (saves `pt_regs`).
- **`sysret`:** The guard escorts you back out, takes the badge, and the gate closes (Ring 3 restored).
