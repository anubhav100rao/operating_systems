# Problem 88: Build a Mini Kernel

Building a mini kernel from scratch is the deepest possible dive into systems programming. It forces you to understand everything the OS normally hides from you: hardware initialization, interrupt vectors, memory segmentation, and context switching.

## 1. The Analogy: Building a city from bare land

When a standard OS boots, it inherits a fully built city: roads (memory allocator), electricity (interrupt handlers), police (scheduler). Building a mini kernel means you arrive with only raw dirt and must construct the city yourself, in a specific order, because each piece depends on the last.

## 2. The Boot Journey (What happens before `main()`)

A real kernel cannot simply begin executing `int main()`. It must first survive the chaotic hardware initialization phase.

```
Power On
   │
   ▼
[CPU RESET] → CS:IP = 0xFFFF:0000 → Executes BIOS/UEFI ROM
   │
   ▼
[BIOS] → POST (Power-On Self-Test), initializes chipset, finds bootable disk
   │
   ▼
[Bootloader: GRUB / custom MBR] → loaded at 0x7C00 by BIOS
   │  - Switches CPU from Real Mode (16-bit) to Protected Mode (32-bit)
   │  - Sets up a temporary GDT (Global Descriptor Table)
   │  - Loads kernel binary from disk into memory (e.g., at 0x100000)
   │  - Jumps to kernel entry point
   ▼
[Kernel Entry: _start in assembly]
   │  - Sets up stack pointer (ESP)
   │  - Clears BSS segment (zero-initialize globals)
   │  - Calls kernel_main() in C
   ▼
[kernel_main()]
```

## 3. Key Subsystems to Implement (Bottom-up order)

### Step 1: VGA Text Output (printf equivalent)
Before any serial ports or complex drivers, you need to be able to print messages. The VGA text buffer at physical address `0xB8000` is a 2-byte-per-character grid of 80x25 characters directly readable by the display hardware.
```c
#define VGA_BASE 0xB8000
volatile uint16_t *vga = (uint16_t *)VGA_BASE;
void kputc(char c, uint8_t color, int row, int col) {
    vga[row * 80 + col] = (uint16_t)c | ((uint16_t)color << 8);
}
```

### Step 2: GDT (Global Descriptor Table)
The CPU uses the GDT to define "segments" of memory. In a flat 32-bit model, you set up three descriptors: a null descriptor (required), a kernel code segment, and a kernel data segment, all covering the full 4GB address space.
```c
typedef struct __attribute__((packed)) {
    uint16_t limit_low;
    uint16_t base_low;
    uint8_t  base_mid;
    uint8_t  access;       // Privilege level, type, present bit
    uint8_t  granularity;  // Limit high nibble, 4KB granularity flag
    uint8_t  base_high;
} GDTEntry;
```

### Step 3: IDT (Interrupt Descriptor Table)
An interrupt is the hardware's way of getting your kernel's attention (keyboard press, timer tick, page fault). The IDT is an array of 256 entries, each pointing to an **Interrupt Service Routine (ISR)**. When interrupt N fires, the CPU saves state and jumps to `IDT[N].handler`.
```c
typedef struct __attribute__((packed)) {
    uint16_t offset_low;
    uint16_t selector;  // Points to kernel code segment in GDT
    uint8_t  zero;
    uint8_t  type_attr;
    uint16_t offset_high;
} IDTEntry;
```

### Step 4: IRQ Remapping (PIC)
By default, the 8259 PIC sends hardware interrupt IRQ0 (timer) through IRQ7 (parallel port) to CPU interrupt vectors 0x08-0x0F. These clash with CPU exception vectors (e.g., 0x08 = Double Fault). You must remap the PIC to use vectors 0x20-0x2F.
```c
void pic_remap(void) {
    outb(0x20, 0x11); // Initialize master PIC
    outb(0xA0, 0x11); // Initialize slave PIC
    outb(0x21, 0x20); // Master PIC: vectors 0x20-0x27
    outb(0xA1, 0x28); // Slave PIC: vectors 0x28-0x2F
    // ... cascade, 8086 mode settings, unmask
}
```

### Step 5: Physical Memory Manager (Bitmap Allocator)
Parse the BIOS memory map (passed by bootloader in a `multiboot_info_t` struct). Maintain a bitset where each bit represents a 4KB physical page frame. `alloc_frame()` finds the first `0` bit, sets it to `1`, and returns the physical address.

### Step 6: Virtual Memory (Paging)
Set up a Page Directory and Page Tables to enable paging (`CR0 |= 0x80000000`). Map the kernel's physical addresses to the higher half (`0xC0000000+`), following the "higher half kernel" convention used by Linux.

### Step 7: Keyboard Driver (IRQ1)
Register an ISR for IRQ 1 (keyboard). When a key is pressed:
1. Read the scan code from I/O port `0x60`.
2. Translate scan code to ASCII using a lookup table.
3. Enqueue the character in a circular buffer.
4. A user-level `kgetc()` call dequeues from the ring buffer.

### Step 8: Preemptive Scheduler
Program the PIT (Programmable Interval Timer) to fire IRQ0 at 100Hz. In the IRQ0 handler, save the current process's register state (via an `iret` frame on the stack), run a scheduler (round-robin), restore the next process's registers, and `iret` to resume it.

## 4. Reference: Minimal Kernel Entry Point (Assembly)

```asm
; kernel_entry.asm — bare-metal x86 entry
BITS 32
global _start
extern kernel_main

MULTIBOOT_MAGIC    equ 0x1BADB002
MULTIBOOT_FLAGS    equ 0x00000003
MULTIBOOT_CHECKSUM equ -(MULTIBOOT_MAGIC + MULTIBOOT_FLAGS)

section .multiboot
align 4
    dd MULTIBOOT_MAGIC
    dd MULTIBOOT_FLAGS
    dd MULTIBOOT_CHECKSUM

section .bss
align 16
stack_bottom:
    resb 16384         ; 16KB kernel stack
stack_top:

section .text
_start:
    mov esp, stack_top ; Set stack pointer
    push ebx           ; Pass multiboot info pointer to kernel_main
    call kernel_main   ; Call C kernel entry
    cli
.halt:
    hlt
    jmp .halt
```

*Build with NASM + GCC cross-compiler targeting `i686-elf`, link with a custom `linker.ld`, and boot in QEMU: `qemu-system-i386 -kernel kernel.bin`*
