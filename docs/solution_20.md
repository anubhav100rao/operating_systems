# Solution 20: Implement a Mutex using Atomic Instructions

## The Problem
Implement a mutex using atomic instructions.

---

## 🔬 Core Concept: The Futex

A naively implemented Mutex simply spins (which we established above is a Spinlock). A true Mutex must yield the CPU if it cannot immediately acquire the lock. 

To build a high-performance userspace Mutex, we must combine:
1.  **Fast Path (Userspace):** Atomic instructions to acquire the lock instantly if no one holds it.
2.  **Slow Path (Kernel space):** A system call to voluntarily sleep (suspend execution) if the lock is held, and to wake up when it is released.

In Linux, the specific syscall designed for this is the **`futex` (Fast User-space Mutex)**.
The trick is managing a shared 3-state integer:
*   `0`: Unlocked
*   `1`: Locked, no one is waiting.
*   `2`: Locked, and at least one thread is asleep waiting for it (meaning we *must* call wake).

---

## 💻 Code Example: A Simple C Mutex

Below is an implementation of a Mutex in C for Linux, utilizing GCC built-in atomic intrinsics and the raw `syscall()` interface to access `futex`.

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <linux/futex.h>
#include <sys/time.h>

// Helper to invoke the futex syscall
static int futex_wait(int *uaddr, int expected_val) {
    return syscall(SYS_futex, uaddr, FUTEX_WAIT, expected_val, NULL, NULL, 0);
}

static int futex_wake(int *uaddr, int num_to_wake) {
    return syscall(SYS_futex, uaddr, FUTEX_WAKE, num_to_wake, NULL, NULL, 0);
}

// Our Mutex Structure
typedef struct {
    // 0 = free
    // 1 = locked (no waiters)
    // 2 = locked (with one or more waiters sleeping)
    int state; 
} my_mutex_t;

void my_mutex_init(my_mutex_t *m) {
    m->state = 0;
}

void my_mutex_lock(my_mutex_t *m) {
    int c;

    // Fast path: Atomic hardware Compare-and-Swap
    // Try to change state from 0 (free) to 1 (locked).
    // If it was 0, cmpxchg succeeds, returns 0, and we own the lock!
    if ((c = __sync_val_compare_and_swap(&m->state, 0, 1)) == 0) {
        return; // Fast path success! Zero syscalls made.
    }

    // Slow path: The lock is already held (state is 1 or 2).
    // We must put ourselves to sleep until it is free.
    do {
        // If the state was 1 or 2, we change it to 2 to record that 
        // we are waiting. We MUST notify the owner that they have waiters.
        // We use an atomic exchange to swap 2 in and check the old value.
        if (c == 2 || __sync_lock_test_and_set(&m->state, 2) != 0) {
            
            // Ask the kernel to put us to sleep.
            // "Go to sleep if m->state is STILL 2"
            // The kernel guarantees this check-and-sleep is atomic.
            futex_wait(&m->state, 2);
        }

        // We woke up! Try to grab the lock by changing 0 to 2.
        // If it was 0, cmpxchg returns 0, we break the loop and own the lock.
    } while ((c = __sync_val_compare_and_swap(&m->state, 0, 2)) != 0);
}

void my_mutex_unlock(my_mutex_t *m) {
    // Fast path: We are releasing the lock. 
    // We atomically decrement/exchange the state. 
    // If the old state was 1, it means NO ONE was waiting.
    // We just subtract 1 (making it 0) and we are done.
    if (__sync_fetch_and_sub(&m->state, 1) == 1) {
        return; // Fast path success! Zero syscalls made.
    }

    // Slow path: We subtracted 1 from 2, so the state is now 1.
    // Since the original state was 2, we know threads are sleeping in the kernel.
    // 1. Force state to 0 so the next woken thread can grab it.
    m->state = 0; 

    // 2. Call the kernel to wake up ONE sleeping thread.
    futex_wake(&m->state, 1);
}
```

### Flow Breakdown

1.  **Thread A** calls `my_mutex_lock()`. `m->state` is `0`, CMpxchg sets it to `1`. Returns immediately. (Fast path).
2.  **Thread B** calls `my_mutex_lock()`. `m->state` is `1`. CMPxchg fails. Enters loop. Swaps `2` in. Calls `futex_wait(2)`. The kernel halts Thread B.
3.  **Thread A** calls `my_mutex_unlock()`. Doing `fetch_and_sub(1)` changes the `2` to `1` and returns `2`. The `if` check fails. Thread A realizes it has waiters. It resets state to `0` and issues a `futex_wake(1)` kernel syscall.
4.  **Thread B** is awoken by the kernel. It loops around, does the CMPxchg `0 -> 2` successfully, and enters the critical section!
