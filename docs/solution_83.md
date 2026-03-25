# Solution 83: Build a Thread Pool Implementation

## The Problem
Build a thread pool implementation.

---

## 💡 The Analogy: The Restaurant Kitchen

Running a new thread for each incoming request is like hiring and firing a new chef for every single order at a restaurant. The overhead (recruitment, training, uniform fitting) often takes longer than actually cooking the meal (task execution).

A thread pool is a permanent team of professional chefs (pre-allocated threads) working in the kitchen. When an order comes in (a task is submitted), the manager (the dispatcher thread) writes the order on a ticket and places it in the "Orders In" queue (the task queue). Whenever a chef finishes a dish, they look at the queue, grab the next ticket, and start cooking. If there are no orders, the chefs relax in the break room (wait, blocked on the queue), consuming zero CPU.

---

## 🔬 Architecture Deep Dive

A thread pool has three core components:
1.  **Worker Threads:** Pre-allocated, long-lived threads running a perpetual `dequeue → execute → loop` cycle.
2.  **Task Queue:** A thread-safe bounded FIFO queue of pending work items (function pointers + their arguments).
3.  **Synchronization:** A mutex + condition variable pair to safely signal workers when new work arrives.

### Why Not Just Spawn Threads on Demand?

Thread creation is expensive:
1.  `clone()` syscall invocation.
2.  Kernel allocates a private stack (default 8MB virtual address space per thread).
3.  Kernel initializes the Task struct, scheduling entities, etc.

A thread pool pays this cost **once at startup** and amortizes it across thousands or millions of tasks.

### Advanced Features

**Work Stealing:**
A naive pool has one global task queue. Under contention, all N threads hammer the mutex simultaneously to dequeue the next task. This causes CPU cache-line bouncing and lock contention.

Java's `ForkJoinPool` and Go's scheduler use **Work Stealing**: each worker thread gets its *own private double-ended queue*. A thread always takes from its own local queue (no contention, no locks). Only after exhausting its own queue does it "steal" work from the tail of another thread's queue — a rare, infrequent operation.

**Backpressure:**
When the task queue is full (e.g., at capacity 1,000), submitting more work must either:
*   Block the caller (backpressure propagates upstream).
*   Return an error/exception immediately.
*   Spawn a temporary "overflow" thread (like Java's `ThreadPoolExecutor` with `CallerRunsPolicy`).

### The OS Angle: Condition Variables
The blocking/waking of idle threads without busy-waiting is achieved via **POSIX Condition Variables** (internally implemented with `futex` syscalls). An idle worker blocks on `pthread_cond_wait()`. When a new task arrives, the dispatcher calls `pthread_cond_signal()`, waking exactly one sleeping worker. This is the kernel's `FUTEX_WAKE` operation.

---

## 💻 Code Example: A Full C Thread Pool

```c
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <stdbool.h>

#define QUEUE_SIZE 256
#define NUM_THREADS 4

typedef void (*task_fn)(void*);

typedef struct {
    task_fn fn;
    void* arg;
} Task;

typedef struct {
    Task       queue[QUEUE_SIZE];
    int        head, tail, count;
    pthread_mutex_t lock;
    pthread_cond_t  not_empty;
    pthread_cond_t  not_full;
    bool       shutdown;
    pthread_t  workers[NUM_THREADS];
} ThreadPool;

// The perpetual worker loop: dequeue and execute tasks
static void* worker_loop(void* pool_ptr) {
    ThreadPool* pool = (ThreadPool*)pool_ptr;

    while (true) {
        pthread_mutex_lock(&pool->lock);

        // Condition variable: sleep until there's work OR shutdown requested
        while (pool->count == 0 && !pool->shutdown) {
            pthread_cond_wait(&pool->not_empty, &pool->lock);
        }

        if (pool->shutdown && pool->count == 0) {
            pthread_mutex_unlock(&pool->lock);
            return NULL; // Clean exit
        }

        // Dequeue the task
        Task t = pool->queue[pool->head];
        pool->head = (pool->head + 1) % QUEUE_SIZE;
        pool->count--;

        // Signal that there's a free slot in the queue
        pthread_cond_signal(&pool->not_full);
        pthread_mutex_unlock(&pool->lock);

        // Execute the task OUTSIDE the lock — critical for parallelism!
        t.fn(t.arg);
    }
    return NULL;
}

ThreadPool* pool_create() {
    ThreadPool* pool = calloc(1, sizeof(ThreadPool));
    pthread_mutex_init(&pool->lock, NULL);
    pthread_cond_init(&pool->not_empty, NULL);
    pthread_cond_init(&pool->not_full, NULL);
    pool->shutdown = false;

    for (int i = 0; i < NUM_THREADS; i++) {
        pthread_create(&pool->workers[i], NULL, worker_loop, pool);
    }
    return pool;
}

// Submit a task; blocks if the queue is full (backpressure)
void pool_submit(ThreadPool* pool, task_fn fn, void* arg) {
    pthread_mutex_lock(&pool->lock);

    while (pool->count == QUEUE_SIZE) { // Block if queue is full
        pthread_cond_wait(&pool->not_full, &pool->lock);
    }

    pool->queue[pool->tail] = (Task){fn, arg};
    pool->tail = (pool->tail + 1) % QUEUE_SIZE;
    pool->count++;

    pthread_cond_signal(&pool->not_empty); // Wake one sleeping worker
    pthread_mutex_unlock(&pool->lock);
}

void pool_shutdown(ThreadPool* pool) {
    pthread_mutex_lock(&pool->lock);
    pool->shutdown = true;
    pthread_cond_broadcast(&pool->not_empty); // Wake ALL workers to exit
    pthread_mutex_unlock(&pool->lock);

    for (int i = 0; i < NUM_THREADS; i++)
        pthread_join(pool->workers[i], NULL); // Wait for all to finish

    pthread_mutex_destroy(&pool->lock);
    free(pool);
}

// --- Usage ---
void my_task(void* arg) {
    int id = *((int*)arg);
    printf("Task %d running on thread %lu\n", id, pthread_self());
}

int main() {
    ThreadPool* pool = pool_create();
    int ids[20];
    for (int i = 0; i < 20; i++) {
        ids[i] = i;
        pool_submit(pool, my_task, &ids[i]);
    }
    pool_shutdown(pool);
    return 0;
}
```
