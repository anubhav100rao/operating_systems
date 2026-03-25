# Solution 5: POSIX Signals in Multithreaded Processes

## The Problem
Explain how POSIX signals are delivered to a multithreaded process. Which thread receives the signal and why?

---

## 💡 The Analogy: The Corporate Mailroom

Imagine a company (the Process) with many employees working at different desks (the Threads). 
A courier delivers a letter (a Signal). 

*   **Synchronous Letter (A physical injury to an employee):** 
    If Employee Alice drops a heavy box on her own foot (a Hardware Exception like a Segfault or Divide-by-Zero), the pain goes specifically and only to Alice. She has to deal with it.
*   **Asynchronous Targeted Letter (Direct Email):** 
    If the boss sends an email explicitly addressed to "Employee Bob" (`pthread_kill`), the message is delivered strictly to Bob's computer.
*   **Asynchronous General Letter (A letter to "The Company"):**
    If a court summons or a general "Fire Alarm" letter arrives addressed simply to the "Company HQ" (e.g., a user pressing `Ctrl+C` generating a `SIGINT` sent to the Process ID), the mailroom doesn't care who opens it. The mailroom simply walks through the office and hands it to the **very first employee they see who isn't wearing noise-canceling headphones** (the first thread that does not have that signal blocked). 

---

## 🔬 Deep Dive: Signal Delivery Mechanics

Before POSIX threads (pthreads), signals were simple: an OS event interrupts the single stream of execution, triggering a signal handler. With multithreading, multiple execution streams exist simultaneously, creating a complex delivery matrix.

### The Two Types of Signals

1.  **Synchronous Signals (Thread-Directed by nature)**
    *   **Cause:** Arise from the execution of a specific machine instruction by a specific thread.
    *   **Examples:** `SIGSEGV` (invalid memory access), `SIGFPE` (divide by zero), `SIGILL` (illegal instruction), `SIGTRAP` (breakpoint).
    *   **Delivery Rules:** The kernel figures out exactly which thread caused the hardware exception and delivers the signal **directly and exclusively to that specific thread**.

2.  **Asynchronous Signals (Process-Directed OR Thread-Directed)**
    *   **Cause:** Generated externally (by another process, the kernel, or the user).
    *   **Examples:** `SIGINT` (Ctrl+C), `SIGTERM` (terminate), `SIGCHLD` (child died).
    *   **Delivery Rules:** 
        *   If directed to a specific thread via `pthread_kill(tid, sig)`, it goes only to that thread.
        *   If directed to the general process (e.g., via `kill(pid, sig)` or a terminal keystroke), the POSIX standard states the kernel must deliver it to **exactly ONE arbitrary thread within the process capable of receiving it**.

### How Does the Kernel Choose the "Arbitrary Thread"?

Every thread maintains its own **Signal Mask** (configured via `pthread_sigmask()`). The mask is a bitmap defining which signals the thread refuses to receive (blocks).

When an asynchronous process-directed signal arrives:
1.  The kernel looks at the list of all threads in the process.
2.  It checks the signal mask for Thread 1. Is the signal blocked? If No -> Deliver to Thread 1. Done.
3.  If Yes -> Check Thread 2. Is it blocked? If No -> Deliver to Thread 2. Done.
4.  If *all* threads have the signal blocked, the signal sits in a "pending" queue at the process level until some thread unblocks it.

**The Chaos Factor:** If multiple threads have the signal unblocked, the kernel chooses one *non-deterministically* (often based on scheduling queues, or whichever thread is currently in kernel space). This makes debugging a nightmare, as different threads will get interrupted on different runs.

### The Best Practice: The Dedicated Signal Thread

Because asynchronous signal handlers are incredibly restrictive (they can only call "Async-Signal-Safe" functions—you can't even safely call `malloc()` or `printf()` inside them without risking deadlocks), the multithreaded design pattern standard is: **The Dedicated Signal Waiter**.

1.  In `main()`, *before* creating any threads, block all asynchronous signals (`SIGINT`, `SIGTERM`, etc.) using `pthread_sigmask`.
2.  When you call `pthread_create()`, child threads inherit the parent's signal mask. Now, *no threads* can be interrupted by signals.
3.  Spawn one dedicated thread whose sole job is to call `sigwait()` on those signals. `sigwait()` halts the thread until a signal arrives, and then safely processes it in a normal, non-interrupt context where `malloc` and locks are perfectly safe.

---

## 💻 Code Example: The Proper Way to Handle Signals in Threads

This C/Pthreads example demonstrates blocking signals globally and waiting for them on a dedicated loop.

```c
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <signal.h>
#include <unistd.h>

// Worker thread: completely oblivious to signals
void* worker_thread(void* arg) {
    int id = *((int*)arg);
    while (1) {
        printf("Worker %d doing important, uninterruptible work...\n", id);
        sleep(2);
    }
    return NULL;
}

// Dedicated signal handling thread
void* signal_handler_thread(void* arg) {
    sigset_t *set = (sigset_t *)arg;
    int sig;

    printf("Signal handler thread waiting for signals...\n");
    
    // sigwait suspends this thread until a signal in 'set' arrives
    while (1) {
        sigwait(set, &sig); // Synchronously wait! No async handlers needed.
        
        if (sig == SIGINT) {
            printf("\n[Signal Thread] Caught SIGINT (Ctrl+C). Cleaning up safely.\n");
            // Perfectly safe to use printf, mutexes, malloc here!
            exit(0); 
        } else if (sig == SIGTERM) {
            printf("\n[Signal Thread] Caught SIGTERM. Shutting down.\n");
            exit(0);
        }
    }
    return NULL;
}

int main() {
    sigset_t set;
    pthread_t sig_thread, worker1, worker2;
    int id1 = 1, id2 = 2;

    // 1. Initialize the signal set to include SIGINT and SIGTERM
    sigemptyset(&set);
    sigaddset(&set, SIGINT);
    sigaddset(&set, SIGTERM);

    // 2. BLOCK these signals for the main thread.
    // ANY thread created after this point will inherit this mask!
    pthread_sigmask(SIG_BLOCK, &set, NULL);

    // 3. Create a dedicated thread to wait on the blocked signals.
    // We pass the set so it knows what to wait for.
    pthread_create(&sig_thread, NULL, signal_handler_thread, (void*)&set);

    // 4. Create worker threads. They inherited the mask, so they will NEVER
    // be interrupted by SIGINT. The OS is forced to pass them to the sig_thread.
    pthread_create(&worker1, NULL, worker_thread, &id1);
    pthread_create(&worker2, NULL, worker_thread, &id2);

    pthread_join(sig_thread, NULL);
    return 0;
}
```

In this architecture, when you press `Ctrl+C`, the kernel looks for a thread to deliver `SIGINT` to. The workers have it blocked. So the signal is consumed by `sigwait` in our dedicated thread safely, entirely bypassing the legacy async interrupt mechanism.
