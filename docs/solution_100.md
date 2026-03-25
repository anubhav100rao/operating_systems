# Solution 100: Implement the Readers-Writers Problem

## The Problem
Implement the readers-writers problem.

---

## 💡 The Analogy: The Public Library Magazine

A popular magazine (shared data) is on display in the library. 

Many readers can read it at the same time with zero issue — they sit around the table, all silently reading their own section. (Multiple concurrent reads are safe).

However, if the journalist (writer) arrives to update an article, they must take the magazine off the rack, lay it flat, and use a Wite-Out pen on the text. If readers try to read during this modification, they would see half-erased sentences (data corruption). The journalist must wait for all current readers to finish, and must have exclusive access.

**The Three Solutions (and their Bias):**

*   **First Readers-Writers Problem (Reader Priority):** No reader shall wait simply because a writer is waiting. Readers can continuously flood in, potentially starving the writer indefinitely.
*   **Second Readers-Writers Problem (Writer Priority):** Once a writer is waiting, no new readers are allowed in. The writer gets priority, but could starve readers.
*   **Third Readers-Writers Problem (Fair):** No starvation for either. A turnstile (additional lock) enforces a fair queue.

---

## 🔬 The Synchronization Design

### Variables Needed:
*   `read_count` (integer): Number of readers currently inside the critical section.
*   `mutex` (mutex): Protects `read_count` itself from race conditions.
*   `write_lock` (mutex/semaphore): Used by writers to get exclusive access. The **last reader out** releases this, and the **first reader in** acquires it.

### The Classic Insight:
*   Only the **first** reader acquires `write_lock`, blocking any waiting writers.
*   Subsequent readers just increment `read_count` without touching `write_lock`.
*   Only the **last** reader releases `write_lock`, finally unblocking a waiting writer.
*   A writer acquires `write_lock` exclusively — but it can be starved if readers never all leave simultaneously (Reader Priority problem).

---

## 💻 Code Example 1: Reader-Priority (Classic Solution C with Pthreads)

```c
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <unistd.h>

int shared_data = 0;   // The "shared resource"
int read_count  = 0;   // # active readers currently reading

pthread_mutex_t mutex      = PTHREAD_MUTEX_INITIALIZER; // Protects read_count
pthread_mutex_t write_lock = PTHREAD_MUTEX_INITIALIZER; // Exclusive writer access

void* reader(void* arg) {
    int id = *((int*)arg);

    pthread_mutex_lock(&mutex);
    read_count++;
    if (read_count == 1) {
        // First reader: block writers by acquiring write_lock
        pthread_mutex_lock(&write_lock);
    }
    pthread_mutex_unlock(&mutex);

    // --- READ CRITICAL SECTION (Multiple readers OK simultaneously) ---
    printf("[Reader  %d] Reading shared_data = %d\n", id, shared_data);
    usleep(50000); // Simulate reading time

    pthread_mutex_lock(&mutex);
    read_count--;
    if (read_count == 0) {
        // Last reader: release write_lock, unblocking waiting writers
        pthread_mutex_unlock(&write_lock);
    }
    pthread_mutex_unlock(&mutex);

    return NULL;
}

void* writer(void* arg) {
    int id = *((int*)arg);

    // Writer must get EXCLUSIVE access — blocks until all readers are done
    pthread_mutex_lock(&write_lock);

    // --- WRITE CRITICAL SECTION (Exclusive: only one writer, no readers) ---
    shared_data++;
    printf("[Writer  %d] Wrote shared_data = %d\n", id, shared_data);
    usleep(100000); // Simulate write time

    pthread_mutex_unlock(&write_lock);

    return NULL;
}

int main() {
    pthread_t threads[10];
    int ids[10];
    // Mix of 7 readers and 3 writers
    int is_writer[] = {0,0,1,0,0,1,0,0,0,1};

    for (int i = 0; i < 10; i++) {
        ids[i] = i + 1;
        if (is_writer[i])
            pthread_create(&threads[i], NULL, writer, &ids[i]);
        else
            pthread_create(&threads[i], NULL, reader, &ids[i]);
        usleep(10000);
    }

    for (int i = 0; i < 10; i++)
        pthread_join(threads[i], NULL);

    return 0;
}
```

---

## 💻 Code Example 2: Fair Solution using a Turnstile (No Starvation C++)

The "turnstile" pattern allows no new readers to enter once a writer is waiting, ensuring writers are never starved.

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <shared_mutex>   // C++17: reader-writer lock built in!

class FairReadersWriters {
    std::shared_mutex rw_mutex; // C++17 native RW lock (fair by implementation)
    int shared_data = 0;

public:
    void read(int reader_id) {
        // shared_lock: multiple concurrent readers allowed
        std::shared_lock<std::shared_mutex> lock(rw_mutex);
        std::cout << "[R" << reader_id << "] data=" << shared_data << "\n";
    }

    void write(int writer_id) {
        // unique_lock: exclusive — blocks until all readers are done
        std::unique_lock<std::shared_mutex> lock(rw_mutex);
        shared_data++;
        std::cout << "[W" << writer_id << "] wrote=" << shared_data << "\n";
    }
};

FairReadersWriters db;

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 5; i++)
        threads.emplace_back([i]() { db.read(i); });
    
    threads.emplace_back([]() { db.write(1); });
    
    for (int i = 5; i < 8; i++)
        threads.emplace_back([i]() { db.read(i); });

    for (auto& t : threads) t.join();
    return 0;
}
```

**`std::shared_mutex` under the hood:**
On Linux, `std::shared_mutex` (like `pthread_rwlock_t`) is backed by `futex` calls. For a shared (read) lock, it atomically increments a reader counter. For a unique (write) lock, it does a `FUTEX_WAIT` until the reader counter reaches zero. Most implementations use the Writer-Preference (second problem) approach to prevent writer starvation.

---

## Comparison of Approaches

| Approach | Concurrency | Fairness | Implementation Complexity |
|---|---|---|---|
| `pthread_mutex_t` only | No concurrent reads | Fair FIFO | Simple |
| Readers-Priority (above) | Concurrent reads | Writers can starve | Moderate |
| Writer-Priority | Concurrent reads | Readers can starve | Moderate |
| Turnstile / Fair RW Lock | Concurrent reads | Fair to both | Complex |
| `std::shared_mutex` (C++17) | Concurrent reads | Writer-Priority (impl. dependent) | Trivial |
