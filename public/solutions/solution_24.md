# Problem 24: Design a Wait-Free Data Structure

Concurrent systems have varying levels of "liveness" guarantees. Understanding the difference between Lock-Free and Wait-Free is paramount for building high-performance, real-time software.

## 1. Lock-Free vs Wait-Free: The Analogy

*   **Lock-Free (The Hunger Games Cornucopia):** Imagine 100 people sprinting to grab exactly one backpack in the center of an arena. The rules state that *at least one person* will successfully grab the backpack (system-wide progress). However, an individual person might fail on their first try, get pushed back, fail on their second try, and theoretically starve forever due to bad luck. (A `CAS` loop).
*   **Wait-Free (The Deli Ticket Machine):** You walk into a deli. There are 100 people. Instead of fighting, there is a ticket machine. You pull a lever and get a numbered ticket. This guarantees that *every single person* completes their operation (getting a ticket number) in a strictly bounded number of steps, regardless of what anyone else is doing. There is zero starvation. (A `Fetch-And-Add`).

## 2. Theoretical Breakdown

*   **Lock-Free (`Compare-And-Swap` loops):**
    ```c
    do {
        old_val = atomic_load(&val);
        new_val = old_val + 1;
    } while (!atomic_compare_exchange(&val, &old_val, new_val)); 
    // ^ Another thread could constantly interrupt us, causing an infinite spin.
    ```
*   **Wait-Free (`Fetch-And-Add`):** 
    ```c
    atomic_fetch_add(&val, 1); // Returns immediately in 1 hardware instruction.
    ```

## 3. Designing a Wait-Free Single-Producer, Single-Consumer (SPSC) Ring Buffer

Designing a complex wait-free data structure (like a multi-producer, multi-consumer queue) is historically one of the hardest problems in computer science. However, a SPSC Ring Buffer is beautifully simple and inherently wait-free.

It is wait-free because the Producer ONLY modifies the `write_index`, and the Consumer ONLY modifies the `read_index`. They never fight over the same variables using a `CAS` loop.

### Code Example (C11)

```c
#include <stdatomic.h>
#include <stdbool.h>
#include <stddef.h>

#define BUFFER_SIZE 256 // Must be a power of 2 for fast modulo arithmetic

typedef struct {
    int data[BUFFER_SIZE];
    
    // Aligned to cache lines (64 bytes) to prevent "False Sharing"
    // Since Producer and Consumer run on different cores, we don't want 
    // their variables ping-ponging in the L1 cache.
    _Alignas(64) atomic_size_t read_index;
    _Alignas(64) atomic_size_t write_index;
} wait_free_queue_t;

void queue_init(wait_free_queue_t* q) {
    atomic_init(&q->read_index, 0);
    atomic_init(&q->write_index, 0);
}

// ---------------------------------------------------------
// PRODUCER ONLY (Never blocks, never loops retrying CAS)
// ---------------------------------------------------------
bool queue_push(wait_free_queue_t* q, int value) {
    // Acquire order matches the Consumer's Release order
    size_t current_read = atomic_load_explicit(&q->read_index, memory_order_acquire);
    size_t current_write = atomic_load_explicit(&q->write_index, memory_order_relaxed);

    // If the next write index would overlap the read index, it's full.
    size_t next_write = (current_write + 1) & (BUFFER_SIZE - 1);
    if (next_write == current_read) {
        return false; // Queue full. Operation completes immediately (Wait-Free).
    }

    // Write the actual data.
    q->data[current_write] = value;

    // Publish the write index securely. (Release ensures the data 
    // write is visible before the index update is visible).
    atomic_store_explicit(&q->write_index, next_write, memory_order_release);
    return true;
}

// ---------------------------------------------------------
// CONSUMER ONLY (Never blocks, never loops retrying CAS)
// ---------------------------------------------------------
bool queue_pop(wait_free_queue_t* q, int* out_value) {
    size_t current_read = atomic_load_explicit(&q->read_index, memory_order_relaxed);
    // Acquire ensures we see the Producer's data write if we see the index update.
    size_t current_write = atomic_load_explicit(&q->write_index, memory_order_acquire);

    // If read catches up to write, it's empty.
    if (current_read == current_write) {
        return false; // Queue empty. Operation completes immediately (Wait-Free).
    }

    // Read the actual data.
    *out_value = q->data[current_read];

    // Publish that we consumed.
    size_t next_read = (current_read + 1) & (BUFFER_SIZE - 1);
    atomic_store_explicit(&q->read_index, next_read, memory_order_release);
    return true;
}
```

## Why is it Wait-Free?
Analyze the code: there are zero `while` loops. There are zero locks. There are zero `CAS` instructions that could fail. Every single time `queue_push` or `queue_pop` is called, it executes roughly 10 CPU instructions and returns a determinable result, guaranteeing absolute real-time predictability.
