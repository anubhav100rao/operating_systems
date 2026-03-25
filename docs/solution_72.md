# Problem 72: Stack vs Heap Overflow — Exploitation and Defenses

Memory corruption vulnerabilities are among the most critical security bugs in systems software. Understanding how they work at the hardware/OS level is essential for both exploitation and defense.

## 1. The Stack: Layout and Stack Overflow

### Memory Layout of a Stack Frame
When a function is called, the CPU pushes a **stack frame** onto the thread's stack (which grows downward in memory on x86):

```
High Address
┌─────────────────────────┐
│  Caller's stack frame   │
├─────────────────────────┤ ← Previous frame pointer (rbp)
│  Saved return address   │ ← CRITICAL: where to jump after return (rip)
│  Saved base pointer     │
├─────────────────────────┤ ← Current rbp
│  Local variable: char   │
│  buf[64]                │ ← Buffer (64 bytes)
│  ...                    │
└─────────────────────────┘
Low Address  (stack grows DOWN)
```

### Stack Buffer Overflow: The Classic Attack
```c
void vulnerable(char *input) {
    char buf[64]; // Fixed-size buffer on the stack
    strcpy(buf, input); // NO bounds checking!
}
```
If `input` is longer than 64 bytes, `strcpy` writes past the end of `buf`, overwriting:
1. Local variables
2. The saved base pointer (`rbp`)
3. Most critically: the **saved return address** (`rip`)

When `vulnerable()` returns, the CPU pops the corrupted return address and jumps to it — straight into attacker-controlled code (a **Return-to-libc** or **ROP (Return-Oriented Programming)** attack).

## 2. The Heap: Layout and Heap Overflow

The heap is a large region of memory managed by `malloc`/`free`. The heap allocator (e.g., `ptmalloc` in glibc) stores metadata **adjacent** to allocated chunks:

```
┌───────────────────────────────────────┐
│ Chunk Header: {size, prev_size, flags} │  ← allocator metadata
├───────────────────────────────────────┤
│ User data (buf[64])                   │  ← what malloc() returns
├───────────────────────────────────────┤
│ Next Chunk Header                     │  ← ADJACENT in memory
├───────────────────────────────────────┤
│ Next User data                        │
└───────────────────────────────────────┘
```

### Heap Buffer Overflow: Metadata Corruption
```c
char *buf = malloc(64);
memcpy(buf, attacker_input, 128); // Overflow! Corrupts next chunk's header
free(buf);        // ptmalloc uses the corrupted metadata during free()
free(next_chunk); // Can trigger arbitrary write primitive during consolidation
```
Overflowing a heap buffer corrupts the **allocator metadata** of adjacent chunks. During subsequent `free()` or `malloc()` calls, the corrupted pointers can be leveraged into an arbitrary write primitive.

## 3. Defenses (Hardware + OS + Compiler)

Modern systems deploy overlapping defense-in-depth layers:

### A. ASLR (Address Space Layout Randomization) — OS Level
The OS randomizes the base address of the stack, heap, and shared libraries on every execution. An attacker cannot hardcode the address of `system()` or their shellcode because it changes each run.
- **Entropy:** 64-bit Linux provides 28–40 bits of randomization for ASLR.
- **Bypass:** Information leak vulnerabilities can defeat ASLR by leaking a single pointer.

```bash
# Check ASLR level (2 = full randomization)
cat /proc/sys/kernel/randomize_va_space
```

### B. Stack Canaries — Compiler Level (`-fstack-protector`)
The compiler inserts a random "canary" value between the local variables and the saved return address. Before the function returns, it checks if the canary is still intact.

```
Stack frame with canary:
│ buf[64]           │
│ CANARY (random)   │  ← __stack_chk_guard
│ saved rbp         │
│ saved rip         │
```
A stack overflow that overwrites `rip` will necessarily also overwrite the canary. The function detects the corruption and calls `abort()`, terminating the program.
- **Bypass:** Requires an information leak to read the canary value first, then overwrite it with the correct known value.

### C. Non-Executable Stack — NX Bit / DEP (OS + Hardware)
The hardware's page table **NX (No-Execute) bit** marks the stack and heap pages as non-executable. Even if an attacker injects shellcode bytes into a buffer, the CPU will raise a fault if execution ever jumps to that page.
- This is why modern exploits use **ROP (Return-Oriented Programming)** — they chain existing `ret` instructions in the executable code to build payloads without needing to inject new executable code.

### D. PIE (Position Independent Executable) — Compiler + Linker
Compiling a binary with `-fPIE -pie` forces even the binary's own code to be loaded at a randomized address (not hardcoded `0x400000`). Combined with ASLR, this means every memory region is unpredictable.

### Defense Summary Table

| Defense | Protects Against | Bypass |
|---|---|---|
| ASLR | Hardcoded addresses | Information leak |
| Stack Canary | Stack buffer overflows | Canary leak + brute force |
| NX/DEP | Shellcode injection | ROP chains |
| PIE | Hardcoded code addresses | Information leak |
| Safe Libraries (`strncpy`, `snprintf`) | Buffer overruns | Missed call sites |
| AddressSanitizer (ASan) | Both stack & heap overflows at runtime | N/A (testing tool only) |
