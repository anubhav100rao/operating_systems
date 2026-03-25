# Problem 40: Explain ASLR (Address Space Layout Randomization)

Before ASLR, a program compiled and run on Linux would look exactly the same in memory every single time it was executed. The stack would start at `<Address A>`, the heap would begin at `<Address B>`, and the C Standard Library (`libc`) would load at `<Address C>`. 

Because computer architecture was deterministic, malicious hackers could predict memory layouts with 100% accuracy and build deadly, reliable exploits. ASLR was introduced to break this predictability.

## 1. The Analogy: The Random Room Museum

Imagine a museum storing a priceless diamond.

*   **Pre-ASLR:** The museum layout is identical in every city. The diamond is always on the 3rd floor, room 402, sitting on a pedestal exactly 15 feet from the door. A blindfolded thief with a stolen blueprint could walk into any museum in the world, pace out 15 feet, and grab the diamond (a "Buffer Overflow" leading to "Return-to-libc").
*   **ASLR:** The museum director completely randomizes the floor plan every single morning. The diamond acts the same, the pedestal works the same, but the room location is completely different. The thief breaks in, walks to room 402 based on old blueprints, and finds a janitor's closet instead. The exploit fails and the museum triggers an alarm (Segfault/Crash).

## 2. What Gets Randomized?

Address Space Layout Randomization scrambles the starting base addresses of major memory segments every time a binary is executed (via `exec()`):

1.  **The Stack:** The starting pointer for the top of the stack is pushed to a random address.
2.  **The Heap:** The return value of the `brk()` system call (where `malloc` gets its memory) is randomized.
3.  **Memory Map Segment (`mmap` base):** The area where dynamic shared libraries (`libc.so`, `libpthread.so`) are loaded into the process. 
4.  **The Executable Code itself (vDSO / Text Segment):** Only works if the program is compiled as a PIE (**Position Independent Executable**). If PIE is disabled, the application's actual code starts at a static address, while the libraries move around it.

## 3. Entropy: The Mathematics of Randomness

The effectiveness of ASLR depends entirely on **Entropy**—how many "bits" of randomness the OS applies to the base addresses.

*   **32-bit Architecture:** Due to the severe limitation of a 4GB address space, 32-bit systems can only spare about **8 to 16 bits of entropy** for ASLR (depending on the segment). This means there are only 256 to 65,536 possible base addresses! 
    * *Failure Mode:* An attacker can write an exploit in a simple `while` loop, crashing the program 30,000 times. On the 30,001st try, they guess the exact address, the exploit lands, and they get root access. Brute-forcing 32-bit ASLR takes seconds or minutes.
*   **64-bit Architecture:** With a 256TB address space, Linux can apply **28 to 32 bits of entropy** (or even more on modern kernels). Meaning there are over 4 Billion possible address locations for a library. Brute-forcing this randomly would take years and terabytes of crashing logs, making guessing mathematically unviable.

## 4. What Attacks Does it Defend Against?

*   **Classic Buffer Overflow (Shellcode injection):** If an attacker injects executable code onto the stack, they must overwrite the Instruction Pointer (RIP) with the exact memory address of where the stack lives to jump to it. Without knowing the Stack base, they can't jump to it.
*   **Return-to-libc:** Overwriting RIP with the address of `system("/bin/sh")` inside `libc`. Because `libc` is loaded dynamically at an ASLR-randomized base address, the attacker cannot know where `system()` is.
*   **ROP (Return-Oriented Programming):** ROP relies on finding tiny snippets of code ending in `ret` (called "gadgets") scattered throughout the executable. If the binary is PIE and libraries are ASLR'ed, the attacker cannot find the gadgets.

## 5. What Does it Fail to Defend Against?

ASLR provides **probabilistic defense**, not mathematical proof. It is famously vulnerable to **Information Leaks**.

If an attacker finds a way to read or leak just *one* valid pointer from the running program (e.g., using a Format String Vulnerability like `printf("%p.%p.%p")` or an uninitialized memory read like Heartbleed), ASLR collapses entirely.

*   **Why? Relative Offsets:** ASLR scrambles the *base* address of an entire library. But the internal layout of the library remains completely static. `system()` is always exactly `0x4F000` bytes away from `printf()` inside the `libc` file.
*   If an attacker leaks the current address of `printf()` (say, `0x7FFF1234F000`), they instantly know the `libc` base address. They can calculate `0x7FFF1234F000 - Offset_of_printf + Offset_of_system`, gaining the exact location of their attack vector, rendering ASLR useless.
