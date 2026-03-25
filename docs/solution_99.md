# Solution 99: Implement the Producer-Consumer Problem

## The Problem
Implement the producer-consumer problem.

---

## 💡 The Analogy: The Assembly Line

Henry Ford's assembly line is the textbook producer-consumer. Workers at the stamping station (Producers) stamp out car doors and place them on a conveyor belt (the shared Buffer). Workers at the installation station (Consumers) take doors off the belt and bolt them onto car bodies.

**The Synchronization Challenges:**
1.  **Empty Buffer:** If Consumers try to take a door when the belt is completely empty, they must wait until a Producer puts something on. (Blocking on empty).
2.  **Full Buffer:** If the belt can only hold 10 doors and Producers keep stamping, the Producers must stop until a Consumer clears space. (Blocking on full).
3.  **Race Condition:** If two Consumers both see "one door left" and both lunge for it simultaneously, they will corrupt the data structure (need mutual exclusion).

---

## 🔬 Synchronization Design

The producer-consumer problem requires exactly three concurrency primitives:

1.  **`mutex`:** For mutual exclusion — only one thread manipulates the queue at a time.
2.  **`not_full` (Condition Variable):** Producers wait here when the buffer is full.
3.  **`not_empty` (Condition Variable):** Consumers wait here when the buffer is empty.

A **Semaphore-based** alternative avoids the explicit mutex+condvar combo by using two semaphores (`empty_slots`, `filled_slots`) plus a binary mutex semaphore, but the condvar approach is more explicit and flexible.

---

## 💻 Code Example 1: Classic POSIX Pthreads (C)

```c
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <unistd.h>

#define BUFFER_SIZE 5
#define NUM_ITEMS   15

int buffer[BUFFER_SIZE];
int head = 0, tail = 0, count = 0;

pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t  not_full  = PTHREAD_COND_INITIALIZER;
pthread_cond_t  not_empty = PTHREAD_COND_INITIALIZER;

void produce(int item) {
    pthread_mutex_lock(&mutex);

    // Wait while buffer is FULL
    while (count == BUFFER_SIZE) {
        printf("  [Producer] Buffer full, waiting...\n");
        pthread_cond_wait(&not_full, &mutex); // Atomically unlocks mutex and sleeps
    }

    buffer[tail] = item;
    tail = (tail + 1) % BUFFER_SIZE;
    count++;
    printf("[Producer] Produced item %d (buffer: %d/%d)\n",
           item, count, BUFFER_SIZE);

    pthread_cond_signal(&not_empty); // Wake a sleeping consumer
    pthread_mutex_unlock(&mutex);
}

int consume() {
    pthread_mutex_lock(&mutex);

    // Wait while buffer is EMPTY
    while (count == 0) {
        printf("  [Consumer] Buffer empty, waiting...\n");
        pthread_cond_wait(&not_empty, &mutex);
    }

    int item = buffer[head];
    head = (head + 1) % BUFFER_SIZE;
    count--;
    printf("[Consumer] Consumed item %d (buffer: %d/%d)\n",
           item, count, BUFFER_SIZE);

    pthread_cond_signal(&not_full); // Wake a sleeping producer
    pthread_mutex_unlock(&mutex);
    return item;
}

void* producer_fn(void* arg) {
    for (int i = 0; i < NUM_ITEMS; i++) {
        usleep(100000); // Simulate production time (100ms)
        produce(i + 1);
    }
    return NULL;
}

void* consumer_fn(void* arg) {
    for (int i = 0; i < NUM_ITEMS; i++) {
        usleep(200000); // Consumer is slower (200ms) — will drain buffer
        consume();
    }
    return NULL;
}

int main() {
    pthread_t prod, cons;
    pthread_create(&prod, NULL, producer_fn, NULL);
    pthread_create(&cons, NULL, consumer_fn, NULL);
    pthread_join(prod, NULL);
    pthread_join(cons, NULL);
    return 0;
}
```

**Why must we use `while` not `if` for the wait condition?**
This is the most critical correctness subtlety: **Spurious Wakeups**. The POSIX standard explicitly permits `pthread_cond_wait` to return even when the condition has not been signaled (due to low-level kernel/hardware complexities). Using `if` would miss this case. Using `while` re-checks the condition after every wakeup, making the code bulletproof.

---

## 💻 Code Example 2: Modern Python with `asyncio` (Async version)

```python
import asyncio

BUFFER_SIZE = 5
queue = asyncio.Queue(maxsize=BUFFER_SIZE)

async def producer(num_items: int):
    for i in range(num_items):
        await asyncio.sleep(0.1)  # Simulate async production
        # queue.put() sleeps the coroutine (not thread!) if full
        await queue.put(i + 1)
        print(f"[Producer] Produced {i+1} | Queue size: {queue.qsize()}")

async def consumer(num_items: int):
    for _ in range(num_items):
        await asyncio.sleep(0.2)  # Consumer is slower
        # queue.get() sleeps the coroutine if empty
        item = await queue.get()
        print(f"[Consumer] Consumed {item} | Queue size: {queue.qsize()}")
        queue.task_done()

async def main():
    NUM_ITEMS = 10
    await asyncio.gather(
        producer(NUM_ITEMS),
        consumer(NUM_ITEMS)
    )

asyncio.run(main())
```
