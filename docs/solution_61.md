# Problem 61: Interrupt Handling vs. Polling — Tradeoffs and When to Use Each

These are the two fundamental strategies the kernel uses to know when a piece of hardware (like a NIC, disk, keyboard, or timer) needs attention. They represent opposite ends of a spectrum: one is reactive, the other is proactive.

## 1. The Analogy: Waiting for a Package Delivery

*   **Polling:** Every 5 minutes, you walk to your front door and open it to check if the FedEx truck arrived. You spend most of your day walking back and forth checking an empty driveway. When the package finally arrives the instant after you last checked, you still have to wait up to 5 minutes to discover it.
*   **Interrupt-Driven:** You don't check anything. You go about your day reading, cooking, working. When the FedEx driver arrives, they ring your doorbell (the hardware interrupt signal). You instantly stop what you're doing, answer the door, sign for the package, and go back to what you were doing.

## 2. The Polling Mechanism

Polling means the CPU actively and repeatedly checks the status register of a hardware device in a tight loop to see if the device is ready.

```c
// Simplified Polling Loop for a Hypothetical Disk Controller
void poll_until_disk_ready(volatile uint8_t *status_register) {
    // BSY bit is bit 7: 0 = not busy, 1 = busy
    // DRQ bit is bit 3: 1 = data ready to transfer
    while ((*status_register & 0x80) != 0) { // While device is busy
        // CPU spins here doing absolutely nothing useful
        // This is also called "Busy Waiting"
    }
    // Now the device is ready; proceed with data transfer
}
```

**Kernel Usage:** Linux uses polling in very specific low-level scenarios:
1. **Early Boot:** During system initialization, the interrupt controller isn't set up yet when some hardware needs to respond (e.g., the initial SATA discovery). The kernel resorts to polling with timeouts.
2. **NAPI (New API for Networking):** A sophisticated adaptive scheme. When the NIC receives its very first packet and raises an interrupt, the kernel interrupt handler immediately *disables further interrupts from that NIC*. Instead, it registers a "poll" function. For the next few milliseconds, the kernel's `ksoftirqd` thread runs that poll function aggressively draining network packets from the NIC ring buffer. If the flow slows down, it re-enables interrupts. This is called **interrupt coalescing** — the holy grail for high-throughput network performance.

## 3. The Interrupt Mechanism

A hardware interrupt is an electrical signal sent from a peripheral device to the CPU via the interrupt controller (APIC on x86).

**The Sequence:**
1.  **The Device signals:** A NIC finishes receiving a network packet and asserts its interrupt line (IRQ line).
2.  **APIC notifies CPU:** The Advanced Programmable Interrupt Controller bundles the interrupt and sends it to the CPU.
3.  **CPU suspends:** The CPU finishes its current instruction. It pushes its entire register state (RIP, RFLAGS, user stack pointer, etc.) onto the **Kernel Stack** of the currently running process.
4.  **IDT Lookup:** The CPU looks up the Interrupt Descriptor Table (IDT) using the IRQ number as an index to find the registered Interrupt Service Routine (ISR) address.
5.  **ISR runs:** The kernel's **Top Half** ISR executes in a special, restricted context. It must run as fast as humanly possible. It acknowledges the interrupt to the interrupt controller (to allow more interrupts), copies data from the device ring buffer, and enqueues a **softirq** or `tasklet`.
6.  **Bottom Half deferred work:** The actual bulk processing (parsing packet headers, routing, delivering to sockets, waking up application threads) is done later, in the safer **Bottom Half** (softirq/tasklet context or `ksoftirqd` thread), where it can run with preemption enabled.

## 4. Side-by-Side Comparison

| Feature | Polling | Interrupt-Driven |
| :--- | :--- | :--- |
| **Latency** | Variable (depends on poll interval) | Low (immediate response) |
| **CPU Usage (Idle)** | Very High (burns cycles even when nothing to do) | Very Low (CPU only activates on event) |
| **CPU Usage (High-traffic)** | Good (no interrupt overhead) | Bad (interrupt storm saturates CPU) |
| **Complexity** | Simple | Complex (ISR, Top Half, Bottom Half) |
| **Best For** | Extreme low-latency (10 GbE or 100 GbE NICs in DPDK) | Interactive/general-purpose devices (keyboard, mouse) |
