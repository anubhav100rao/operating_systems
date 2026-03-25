# Problem 21: Implement a Semaphore using a Mutex and Condition Variables

A **semaphore** is a synchronization primitive that holds an integer value. It's often used to control access to a pool of perfectly identical resources (like a connection pool or fixed-size buffer). Standard operations include `wait()` (decrement, also known as P or down) and `post()` (increment, also known as V or up).

If your system only provides mutexes and condition variables, you can build a robust custom semaphore yourself.

## 1. The Analogy: The Nightclub Bouncer

Imagine an exclusive nightclub with a strict maximum capacity of 5 people. 

*   **The Semaphore Value (`count`):** The number of available spots inside the club. Starts at 5.
*   **The Mutex (`mutex`):** The bouncer's clipboard and the velvet rope. Only one person can talk to the bouncer and look at the clipboard at a time to avoid chaos.
*   **The Condition Variable (`cv`):** The waiting line outside. If the club is full (count == 0), the bouncer tells the person to go stand in the waiting line and listen for an announcement.
*   **`wait()` / Down:** A person arrives. They grab the bouncer's attention (lock mutex). If `count == 0`, they go to the waiting line (wait on cv). If `count > 0`, they decrease the count and walk in (unlock mutex).
*   **`post()` / Up:** A person leaves the club. They tap the bouncer's shoulder (lock mutex), increase the available count, and yell to the waiting line "Hey, a spot opened up!" (signal cv). (unlock mutex).

## 2. The Implementation (C with Pthreads)

To implement this, we need an internal state `struct` to group the count, the mutex, and the condition variable together.

```c
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>

// 1. Define the Semaphore Structure
typedef struct {
    int count;
    pthread_mutex_t mutex;
    pthread_cond_t cond;
} my_semaphore_t;

// 2. Initialization
void my_semaphore_init(my_semaphore_t *sem, int initial_count) {
    sem->count = initial_count;
    pthread_mutex_init(&sem->mutex, NULL);
    pthread_cond_init(&sem->cond, NULL);
}

// 3. The Wait Function (P / Down)
void my_semaphore_wait(my_semaphore_t *sem) {
    // Exclusively access the internal state
    pthread_mutex_lock(&sem->mutex);
    
    // IMPORTANT: We MUST use a while loop, not an "if"!
    // This protects against "Spurious Wakeups" (when a thread wakes up 
    // even though no one signaled it) and "Thundering Herds/Stolen Wakeups"
    // (someone else grabbed the resource before this thread fully woke up).
    while (sem->count <= 0) {
        // pthread_cond_wait atomically releases the mutex and puts 
        // the thread to sleep. When it wakes back up, it automatically 
        // re-acquires the mutex before returning.
        pthread_cond_wait(&sem->cond, &sem->mutex);
    }
    
    // We finally have a token. Claim it.
    sem->count--;
    
    // Release exclusive access
    pthread_mutex_unlock(&sem->mutex);
}

// 4. The Post Function (V / Up)
void my_semaphore_post(my_semaphore_t *sem) {
    // Exclusively access the internal state to add a token safely
    pthread_mutex_lock(&sem->mutex);
    
    sem->count++;
    
    // Wake up at least one sleeping thread (if any exist) waiting on this condition.
    // We signal while holding the lock (though signaling after unlock is also valid).
    pthread_cond_signal(&sem->cond);
    
    // Release exclusive access
    pthread_mutex_unlock(&sem->mutex);
}

// 5. Cleanup
void my_semaphore_destroy(my_semaphore_t *sem) {
    pthread_mutex_destroy(&sem->mutex);
    pthread_cond_destroy(&sem->cond);
}
```

## 3. Crucial Detail: The `while` Loop

The most common mistake when implementing this is using an `if` statement instead of a `while` loop inside `wait()`:
```c
// WRONG! Very dangerous!
if (sem->count <= 0) {
    pthread_cond_wait(&sem->cond, &sem->mutex);
}
```
**Why is it wrong?** Imagine Thread A calls `post()`, increasing the count to `1` and sending a signal. Thread B wakes up. However, before Thread B can physically execute the next line of code, Thread C (who wasn't sleeping, just newly arrived) grabs the mutex, sees `count = 1`, changes it to `0`, and leaves. Now, Thread B resumes executing, assumes the count is still > 0 because it broke past the `if`, decrements it to `-1`, and crashes your program logic. 

The `while` loop ensures that *every time* a thread wakes up, it re-evaluates the condition to make sure the resource is genuinely still available.
