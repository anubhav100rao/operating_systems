# Problem 6: Difference between Process, Thread, Fiber, and Coroutine

Understanding the distinction between these four concurrency models is crucial for designing performant and scalable systems. They all allow us to execute multiple sequences of instructions, but they differ fundamentally in **who** manages them (OS vs. User Space) and **what** state they share.

## 1. The Analogy: The Restaurant

Let's use a restaurant as our conceptual model:

*   **Process (The Restaurant Building):** A process is the entire restaurant. It has its own address (memory space), its own kitchen equipment (resources), and its own front door (security boundary). If one restaurant catches fire (crashes), it doesn't burn down the restaurant next door. Building a new restaurant is expensive and slow (`fork()`).
*   **Thread (The Chef / Waiter):** A thread is a worker inside the restaurant. Multiple chefs (threads) share the same kitchen (memory space). If one chef drops a knife on another chef's foot (data race/segfault), the whole restaurant might shut down. Hiring a new chef is faster than building a new restaurant, but the restaurant manager (the OS Scheduler) still has to coordinate their shifts.
*   **Fiber (The Cooperative Assembly Line Worker):** Think of workers in a very tight assembly line who agree among themselves when to pass the work to the next person. The manager (OS) doesn't schedule them individually; the manager just schedules the whole line (the thread). The workers explicitly yield to one another.
*   **Coroutine (The Recipe/Task Instructions):** A coroutine is like a recipe that a chef follows. When the recipe says "wait 10 minutes for the cake to bake", the chef doesn't stand there staring at the oven (blocking). Instead, the chef bookmarks where they are in the recipe (suspends the coroutine) and goes to chop some onions for a different recipe.

---

## 2. Process

A **Process** is an instance of an executing program. It is the fundamental unit of resource allocation providing hardware protection.

*   **Memory mapping:** Each process gets its own distinct virtual address space.
*   **OS Mapping (Linux):** Represented by a `task_struct` where the `mm_struct` points to a unique Page Global Directory (PGD).
*   **Context Switch Cost:** Extremely high. Requires saving/restoring CPU registers, switching the page table pointer (CR3 on x86), and flushing the TLB (Translation Lookaside Buffer), which causes subsequent memory accesses to be slow until the TLB warms up again.
*   **Example Code (C):**
    ```c
    #include <unistd.h>
    #include <stdio.h>

    int main() {
        pid_t pid = fork();
        if (pid == 0) {
            printf("I am the child process with my own memory space!\n");
        } else {
            printf("I am the parent process.\n");
        }
        return 0;
    }
    ```

## 3. Thread

A **Thread** is the fundamental unit of *execution* and CPU scheduling. Multiple threads exist within a single process.

*   **Memory mapping:** Threads share the same virtual address space (code, data, heap) but have their own execution stack, registers, and program counter.
*   **OS Mapping (Linux):** Linux doesn't strictly distinguish between processes and threads at the kernel level. Both are represented by a `task_struct`. However, threads belonging to the same process will have their `mm_struct` pointers pointing to the *same* memory descriptor. They are created using the `clone()` system call with flags like `CLONE_VM` (share virtual memory).
*   **Context Switch Cost:** Medium. Requires saving/restoring registers. However, since the memory space is the same, there's no need to switch page tables or flush the TLB.
*   **Example Code (C):**
    ```c
    #include <pthread.h>
    #include <stdio.h>

    void* my_thread(void* arg) {
        printf("Thread executing in shared memory space.\n");
        return NULL;
    }

    int main() {
        pthread_t thread;
        pthread_create(&thread, NULL, my_thread, NULL);
        pthread_join(thread, NULL);
        return 0;
    }
    ```

## 4. Fiber

A **Fiber** is a lightweight, user-space thread. Unlike OS threads, the OS kernel knows nothing about fibers. They are scheduled synchronously by the application itself.

*   **Scheduling:** Cooperative. A fiber must explicitly call a `yield` function to hand over CPU time to another fiber. The OS schedules the underlying Thread, and the application's runtime schedules the Fibers on top of that Thread.
*   **Memory mapping:** Like threads, pieces of execution sharing the same memory, but the user-space runtime allocates distinct stack boundaries for each fiber.
*   **OS Mapping:** The OS sees a standard Thread. Windows provides a first-class Fiber API (`ConvertThreadToFiber`, `CreateFiber`, `SwitchToFiber`). On Linux, they can be implemented using `makecontext` and `swapcontext`.
*   **Context Switch Cost:** Very Low. Only involves saving and restoring physical CPU registers in user space. No system calls are necessary.

## 5. Coroutine

A **Coroutine** is a language-level concurrency construct (often seen as `async/await`). It is fundamentally a state machine generated by the compiler or interpreter.

*   **Operation:** When a coroutine hits an `await` statement on a non-blocking I/O operation (like a network socket), it suspends itself, saves its local variables into a heap-allocated object (the state machine), and returns control to an Event Loop.
*   **Comparison to Fibers:** Fibers retain their entire call stack when suspended. Coroutines are often "stackless" (they only save the variables needed for the current function scope) and rely on the host thread's stack when running.
*   **OS Mapping:** Completely invisible to the OS. They purely exist as data structures executed by a runtime Event Loop on a regular Thread.
*   **Example Code (Python):**
    ```python
    import asyncio

    async def fetch_data():
        print("Start fetching...")
        await asyncio.sleep(1) # Yields control to event loop; doesn't block OS thread
        print("Done fetching!")
        return {"data": 42}

    async def main():
        # Both coroutines can run concurrently on a SINGLE OS thread
        await asyncio.gather(fetch_data(), fetch_data())

    asyncio.run(main())
    ```

## Summary Table

| Feature | Process | Thread | Fiber | Coroutine |
| :--- | :--- | :--- | :--- | :--- |
| **Managed By** | OS Kernel | OS Kernel | User Space Runtime | Programming Language / Event Loop |
| **Scheduling** | Preemptive | Preemptive | Cooperative | Cooperative |
| **Memory Isolation**| Yes (Own memory space) | No (Shares process memory) | No (Shares process memory) | No (Shares process memory) |
| **Context Switch** | Extremely Slow (Syscall, TLB flush) | Medium (Syscall, No TLB flush) | Fast (No syscall, keeps call stack) | Blazing Fast (No syscall, state machine) |
| **Hardware Mapping**| `CR3` register (Page Table) | CPU core context | None directly | None directly |
