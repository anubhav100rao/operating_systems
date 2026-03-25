# Problem 11: Thread Cancellation and Thread-Local Storage (TLS)

## 1. Thread Cancellation: Deferred vs. Asynchronous

When you want to stop a thread before it has completed its normal execution path, you perform **thread cancellation**. The thread being canceled has a choice in how it handles this request depending on its state and type.

### Asynchronous Cancellation
In **asynchronous cancellation**, the thread can be terminated at *any exact moment* by the operating system, regardless of what it is doing.

*   **The Danger:** If the thread holds a lock, it dies without releasing it (leading to deadlocks). If it is in the middle of a `malloc()`, the heap might be left in a corrupted state.
*   **Analogy:** A boss walks up to an employee and immediately fires them, escorting them out the door. The employee was midway through writing an important email, and now that draft is stuck open forever on their computer.

### Deferred Cancellation (The Default)
In **deferred cancellation**, the cancellation request remains pending until the thread reaches a specific **cancellation point**. Cancellation points are well-defined functions (like `sleep()`, `read()`, `write()`, `pthread_cond_wait()`) where it is known to be safe for the thread to terminate.

*   **The Benefit:** The thread can use cleanup handlers to release locks, free memory, and gracefully exit securely.
*   **Analogy:** A boss hands an employee a termination notice, but says "You can finish your current task and pack your desk properly before you leave."

### Code Example (Pthreads)

```c
#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

void* worker_thread(void* arg) {
    // Set cancellation type to deferred (which is the default anyway)
    pthread_setcancelstate(PTHREAD_CANCEL_ENABLE, NULL);
    pthread_setcanceltype(PTHREAD_CANCEL_DEFERRED, NULL);

    while (1) {
        printf("Working...\n");
        // sleep is a cancellation point
        sleep(1); 
    }
    return NULL;
}

int main() {
    pthread_t thread;
    pthread_create(&thread, NULL, worker_thread, NULL);
    
    sleep(3); // Let it work for a bit
    printf("Sending cancellation request...\n");
    pthread_cancel(thread); // Request cancellation
    
    pthread_join(thread, NULL); // Wait for thread to actually die
    printf("Thread canceled safely.\n");
    return 0;
}
```

---

## 2. Thread-Local Storage (TLS)

**Thread-Local Storage (TLS)** allows you to declare global or static variables that are unique to each thread. Even though all threads share the same virtual address space, a TLS variable has a separate memory location for every thread.

### How is it Implemented?

At the OS/Architecture level (e.g., x86-64 Linux):
1.  **Segment Registers:** The OS uses the `fs` or `gs` segment registers to point to a special memory region uniquely allocated for the current thread.
2.  **Thread Control Block (TCB):** When a thread is created, the system allocates a TLS block near its Thread Control Block.
3.  **Context Switch:** When the OS context-switches to a thread, it updates the `fs`/`gs` register to point to that specific thread's TLS block.
4.  **Addressing:** When you access a TLS variable, the compiler generates instructions like `mov eax, DWORD PTR fs:[0x10]`. It accesses an offset relative to the thread-specific segment register.

### Code Example (TLS)

```c
#include <pthread.h>
#include <stdio.h>

// The _Thread_local (or thread_local in C++, __thread in GCC) keyword makes this variable TLS.
_Thread_local int my_counter = 0;

void* thread_func(void* arg) {
    my_counter++; // Modifies ONLY this thread's copy
    printf("Thread %ld counter: %d\n", (long)arg, my_counter);
    return NULL;
}

int main() {
    pthread_t t1, t2;
    pthread_create(&t1, NULL, thread_func, (void*)1);
    pthread_create(&t2, NULL, thread_func, (void*)2);
    
    pthread_join(t1, NULL);
    pthread_join(t2, NULL);
    return 0;
}
```
*Output:* Both threads will print `counter: 1` because they each get a newly initialized local copy of `my_counter`, rather than stepping on a shared global variable.
