# Problem 102: Build a Thread-Safe Queue

A thread-safe queue allows multiple producer threads to enqueue items and multiple consumer threads to dequeue items concurrently — without data corruption or race conditions.

## 1. Approach 1 — Mutex + Condition Variables (Blocking Queue)

This is the canonical, correct implementation. Producers block when the queue is full; consumers block when it is empty.

```c
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#define QUEUE_CAPACITY 1024

typedef struct {
    int             data[QUEUE_CAPACITY];
    int             head;       // Index of next item to dequeue
    int             tail;       // Index where next item will be enqueued
    int             count;      // Current number of items
    pthread_mutex_t lock;
    pthread_cond_t  not_empty;  // Signaled when an item is added
    pthread_cond_t  not_full;   // Signaled when an item is removed
} BoundedQueue;

void queue_init(BoundedQueue *q) {
    q->head = q->tail = q->count = 0;
    pthread_mutex_init(&q->lock, NULL);
    pthread_cond_init(&q->not_empty, NULL);
    pthread_cond_init(&q->not_full,  NULL);
}

// Enqueue blocks if the queue is full
void queue_push(BoundedQueue *q, int item) {
    pthread_mutex_lock(&q->lock);

    // Wait until there is space — releases lock while sleeping
    while (q->count == QUEUE_CAPACITY)
        pthread_cond_wait(&q->not_full, &q->lock);

    q->data[q->tail] = item;
    q->tail = (q->tail + 1) % QUEUE_CAPACITY;
    q->count++;

    pthread_cond_signal(&q->not_empty); // Wake a waiting consumer
    pthread_mutex_unlock(&q->lock);
}

// Dequeue blocks if the queue is empty
int queue_pop(BoundedQueue *q) {
    pthread_mutex_lock(&q->lock);

    // Wait until there is data — releases lock while sleeping
    while (q->count == 0)
        pthread_cond_wait(&q->not_empty, &q->lock);

    int item = q->data[q->head];
    q->head = (q->head + 1) % QUEUE_CAPACITY;
    q->count--;

    pthread_cond_signal(&q->not_full); // Wake a waiting producer
    pthread_mutex_unlock(&q->lock);
    return item;
}

// Non-blocking try-dequeue: returns false instead of blocking
bool queue_try_pop(BoundedQueue *q, int *out) {
    pthread_mutex_lock(&q->lock);
    if (q->count == 0) {
        pthread_mutex_unlock(&q->lock);
        return false;
    }
    *out = q->data[q->head];
    q->head = (q->head + 1) % QUEUE_CAPACITY;
    q->count--;
    pthread_cond_signal(&q->not_full);
    pthread_mutex_unlock(&q->lock);
    return true;
}
```

### Why `while` not `if` for the condition check?
```c
// WRONG: spurious wakeups can occur on some OS implementations
if (q->count == 0) pthread_cond_wait(&q->not_empty, &q->lock);

// CORRECT: always re-check the predicate after waking up
while (q->count == 0) pthread_cond_wait(&q->not_empty, &q->lock);
```
POSIX allows **spurious wakeups** — a thread can return from `pthread_cond_wait()` without anyone having called `pthread_cond_signal()`. The `while` loop guards against this.

## 2. Approach 2 — Lock-Free SPSC Queue (Single Producer, Single Consumer)

When there is exactly one producer and one consumer, no locks are needed at all. Only **memory ordering** is required.

```cpp
#include <atomic>
#include <vector>
#include <optional>

// Lock-free SPSC ring buffer — zero mutex overhead
template<typename T, size_t Size>
class SPSCQueue {
    static_assert((Size & (Size - 1)) == 0, "Size must be power of 2");

    alignas(64) std::atomic<size_t> head_{0}; // Consumer reads
    alignas(64) std::atomic<size_t> tail_{0}; // Producer writes
    // Separate cache lines to prevent false sharing between producer & consumer
    T buffer_[Size];

public:
    // Called by producer thread ONLY
    bool push(const T& item) {
        size_t tail = tail_.load(std::memory_order_relaxed);
        size_t next = (tail + 1) & (Size - 1);
        if (next == head_.load(std::memory_order_acquire))
            return false; // Full
        buffer_[tail] = item;
        tail_.store(next, std::memory_order_release);
        return true;
    }

    // Called by consumer thread ONLY
    std::optional<T> pop() {
        size_t head = head_.load(std::memory_order_relaxed);
        if (head == tail_.load(std::memory_order_acquire))
            return std::nullopt; // Empty
        T item = buffer_[head];
        head_.store((head + 1) & (Size - 1), std::memory_order_release);
        return item;
    }
};
```

## 3. Choosing the Right Implementation

| Scenario | Recommended |
|---|---|
| Multiple producers + consumers | Mutex + Condition Variables |
| Single producer + single consumer, latency critical | Lock-Free SPSC |
| MPSC (many producers, single consumer) | Atomic linked list or `rte_ring` (DPDK) |
| Need bounded backpressure | Bounded mutex queue with `not_full` condition |

## Analogy
Think of the queue as a post office with a counter (the mutex). Customers (producers) drop off packages, clerks (consumers) pick them up. 
- `not_empty` condition: a clerk waiting at an empty counter. When a package arrives, the clerk is paged (`cond_signal`).
- `not_full` condition: a customer waiting outside when the counter is full. When a clerk clears a package, the waiting customer is allowed in.
- SPSC lock-free: a direct conveyor belt between one factory worker and one sorter — no clerk, no waiting, no counter at all.
