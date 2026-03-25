# Solution 1: Process vs. Thread Context Switch

## The Problem
Explain the difference between a process context switch and a thread context switch at the hardware level. What exactly gets saved/restored in each case?

---

## 💡 The Analogy: The Kitchen and the Chefs

Imagine a restaurant where chefs (execution units) cook meals (execute code) following recipes (programs). 

**Process Context Switch (Changing the entire kitchen):**
You have two completely separate kitchens (Processes A and B) across the street from each other. Chef Alice is cooking in Kitchen A. Her shift ends, and she has to be replaced by Chef Bob, who needs to cook in Kitchen B. 
To do this:
1. Alice must leave her utensils exactly where they are, note down which step of the recipe she is on, and step out.
2. The entire building is locked, and we must walk across the street to Kitchen B.
3. We have to completely swap out the layout, the ingredients, and the pantry access so Bob can step in and resume his recipe.
*This is incredibly heavy and takes significant time.*

**Thread Context Switch (Swapping chefs in the same kitchen):**
Now, Alice and Bob are working in the *same* kitchen (multithreading within one process). They share the same pantry, the same oven, and the same ingredients (shared memory).
To swap from Alice to Bob:
1. Alice just puts down her specific knife (CPU registers) and notes her current step (Program Counter).
2. Bob steps in, grabs his own knife, looks at his own sticky note for where he left off, and continues.
3. The pantry, ingredients, and layout (Memory Space/Page Tables) *do not change*.
*This is fast and efficient.*

---

## 🔬 Deep Dive: Hardware-Level Differences

At the hardware level, context switching is the process of saving the state of the old running task and loading the state of the new task. The core differentiator between a process and a thread switch relies on **Virtual Memory** and the **Translation Lookaside Buffer (TLB)**.

### 1. What Gets Saved/Restored in a THREAD Context Switch?

Since threads belong to the same process, they share the same memory address space. Therefore, a thread context switch only requires swapping the **architectural CPU state**.

**Saved/Restored:**
*   **General Purpose Registers (GPRs):** `rax`, `rbx`, `rcx`, etc., in x86. These hold the current local variables and transient calculations.
*   **Program Counter (PC) / Instruction Pointer (RIP):** Points to the exact next machine instruction this thread needs to execute.
*   **Stack Pointer (SP / RSP) & Base Pointer (BP / RBP):** Points to the thread's distinct execution stack (since every thread has its own stack for local variables and function call history).
*   **Processor Status Register (EFLAGS):** Holds flags like condition codes (Zero flag, Carry flag) from recent ALU operations.

**Crucially NOT Swapped:**
*   The Page Directory Base Register (e.g., `CR3` on x86) remains the same.
*   The TLB (Translation Lookaside Buffer) is untouched.

### 2. What Gets Saved/Restored in a PROCESS Context Switch?

A process switch includes **everything a thread switch does, PLUS the memory layout**. Because processes have isolated virtual address spaces, the hardware must be reconfigured to map virtual addresses to a completely different set of physical frames.

**Saved/Restored:**
*   *Everything from the thread switch (Registers, PC, SP, EFLAGS).*
*   **Page Table Base Register (PTBR):** On x86, this is the `CR3` register. Changing `CR3` points the MMU (Memory Management Unit) to a completely different set of Page Tables.

### The True Cost: The TLB Flush penalty

The actual CPU instructions to swap registers are fast (a few nanoseconds). The *real* performance killer in a process switch is the **TLB**.

The TLB caches recent Virtual-to-Physical memory translations. When `CR3` is changed during a process switch:
1.  The hardware recognizes the old mapping is no longer valid.
2.  **The entire TLB is flushed (invalidated).**
3.  When the new process starts executing, almost every memory access results in a **TLB Miss**.
4.  The MMU must perform expensive "Page Table Walks" in main memory to rebuild the TLB. This severely degrades performance for thousands of cycles after the switch.

*(Note: Modern CPUs mitigate this slightly using Address Space Identifiers (ASIDs) or Process-Context Identifiers (PCIDs), which tag TLB entries with a process ID, avoiding a full flush, but cache locallity is still disrupted).*

---

## 💻 Code Example: Conceptually Modeling the Switch

While actual context switching happens in kernel assembly code, here is a conceptual C-like pseudocode representation of what the OS scheduler does at the hardware boundary.

```c
// CPU Context structure (Thread level)
struct cpu_context {
    uint64_t rip; // Program Counter
    uint64_t rsp; // Stack Pointer
    uint64_t rbx, r12, r13, r14, r15; // Callee-saved registers
};

// Thread Control Block
struct tcb {
    struct cpu_context context;
    struct process *parent_process;
};

// Process Control Block
struct process {
    uint64_t cr3; // Page Table Base Register
    // ... file descriptors, signals, etc.
};

void context_switch(struct tcb *prev, struct tcb *next) {
    // 1. Check if we need a PROCESS switch or just a THREAD switch
    if (prev->parent_process != next->parent_process) {
        // PROCESS SWITCH: Change the memory map
        // This writes to the CR3 register on x86, causing a TLB flush!
        write_cr3(next->parent_process->cr3); 
    }

    // 2. THREAD SWITCH: Always happens. Swap the CPU registers.
    // This is usually implemented in pure assembly (e.g., `switch_to` in Linux)
    // Conceptually:
    // push registers to prev's stack
    // prev->context.rsp = current_stack_pointer
    // current_stack_pointer = next->context.rsp
    // pop registers from next's stack
    swap_registers(&prev->context, &next->context);
    
    // As soon as swap_registers returns, it returns to 'next's Instruction Pointer!
}
```

## Summary
- **Thread Match:** Swaps CPU registers (PC, SP). Fast. No memory disruption.
- **Process Match:** Swaps CPU registers + Swaps Memory Address Space (CR3 register). Slow. Flushes/Invalidates the TLB, causing memory access delays immediately following the switch.
