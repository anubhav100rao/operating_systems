# Problem 87: Implement a Userspace Scheduler

A userspace scheduler multiplexes many logical tasks (coroutines / green threads / fibers) onto a small, fixed pool of real OS threads, bypassing the expensive kernel scheduler for task switching.

This is the core of all modern async runtimes: **Go's goroutine scheduler (GMP model)**, **Tokio (Rust)**, **Node.js event loop**, and **Erlang's BEAM VM**.

## 1. The Analogy: The Film Studio

*   **OS Threads:** Camera crews (expensive; each one costs a big salary = 8MB stack).
*   **Coroutines / Green Threads:** Actors (cheap; dozens on set at once, most idle).
*   **Userspace Scheduler:** A director who constantly tells each camera crew which actor to follow. An actor finishes a scene (`I/O wait`) and sits in a chair. The director immediately points the camera crew at another active actor.

## 2. Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Run Queue (MPMC)                     │
│  [Task A] [Task B] [Task C] [Task D] [Task E] ...      │
└────────────┬───────────────────────────────────────────┘
             │  pop(task)
   ┌─────────▼────────┐    ┌────────────────────┐
   │  OS Thread 0     │    │  OS Thread 1        │
   │  (Worker)        │    │  (Worker)           │
   │  executes Task A │    │  executes Task B    │
   └─────────┬────────┘    └────────────┬────────┘
             │                          │
             │ Task A calls await_io()  │
             │ → suspends, pushes self  │
             │   to I/O poller          │
             │ → pops Task C from queue │
             ▼                          ▼
```

## 3. Full Implementation in C (using `ucontext.h`)

The key to a userspace scheduler is the ability to **save and restore an execution context** (stack pointer, instruction pointer, registers) without a kernel syscall. On Linux, `makecontext` and `swapcontext` provide this.

```c
#define _GNU_SOURCE
#include <ucontext.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <stdint.h>

#define MAX_TASKS    64
#define STACK_SIZE   (64 * 1024)   // 64KB per task stack (vs 8MB for OS thread)

typedef enum { RUNNABLE, WAITING, DONE } TaskState;

typedef struct Task {
    ucontext_t  ctx;
    char       *stack;
    TaskState   state;
    int         id;
} Task;

// ── Scheduler State ───────────────────────────────────────────────────────────
static Task      tasks[MAX_TASKS];
static int       task_count   = 0;
static int       current_task = -1;
static ucontext_t scheduler_ctx;  // The scheduler's own context

// ── Yield: voluntarily give up the CPU ───────────────────────────────────────
void task_yield(void) {
    // Save this task's context; resume the scheduler loop
    swapcontext(&tasks[current_task].ctx, &scheduler_ctx);
}

// ── Task wrapper ──────────────────────────────────────────────────────────────
// ucontext functions return void, so we need a wrapper to mark task as DONE
static void task_wrapper(uint32_t hi, uint32_t lo) {
    // Reconstruct function pointer from two uint32 args (portable trick)
    uintptr_t ptr = ((uintptr_t)hi << 32) | lo;
    void (*fn)(void) = (void(*)(void))ptr;
    fn();
    tasks[current_task].state = DONE;
    swapcontext(&tasks[current_task].ctx, &scheduler_ctx); // Return to scheduler
}

// ── Spawn a new task ──────────────────────────────────────────────────────────
void task_spawn(void (*fn)(void)) {
    int id = task_count++;
    Task *t = &tasks[id];
    t->id    = id;
    t->state = RUNNABLE;
    t->stack = malloc(STACK_SIZE);

    getcontext(&t->ctx);
    t->ctx.uc_stack.ss_sp   = t->stack;
    t->ctx.uc_stack.ss_size = STACK_SIZE;
    t->ctx.uc_link          = NULL;  // We handle returns manually

    // Pass function pointer as two uint32 args (required by POSIX makecontext)
    uintptr_t ptr = (uintptr_t)fn;
    makecontext(&t->ctx, (void(*)(void))task_wrapper, 2,
                (uint32_t)(ptr >> 32), (uint32_t)(ptr & 0xFFFFFFFF));
}

// ── Round-Robin Scheduler Loop ────────────────────────────────────────────────
void scheduler_run(void) {
    while (true) {
        bool any_runnable = false;
        for (int i = 0; i < task_count; i++) {
            if (tasks[i].state == RUNNABLE) {
                any_runnable = true;
                current_task = i;
                // Suspend scheduler; resume task i exactly where it left off
                swapcontext(&scheduler_ctx, &tasks[i].ctx);
                // We return here when task i calls task_yield() or finishes
            }
        }
        if (!any_runnable) break; // All tasks are DONE or WAITING
    }
    printf("Scheduler: all tasks complete.\n");
}

// ── Example tasks ─────────────────────────────────────────────────────────────
void task_a(void) {
    printf("[Task A] Step 1\n");
    task_yield();
    printf("[Task A] Step 2\n");
    task_yield();
    printf("[Task A] Done!\n");
}

void task_b(void) {
    printf("[Task B] Step 1\n");
    task_yield();
    printf("[Task B] Step 2\n");
}

int main(void) {
    task_spawn(task_a);
    task_spawn(task_b);
    scheduler_run();
    // Output (interleaved):
    // [Task A] Step 1
    // [Task B] Step 1
    // [Task A] Step 2
    // [Task B] Step 2
    // [Task A] Done!
    return 0;
}
```
*Compile with:* `gcc -o sched solution_87.c -g`

## 4. How Production Schedulers Extend This

| Feature | How it's done |
| :--- | :--- |
| M:N threading | Spawn N OS threads, each running the scheduler loop above |
| Work stealing | When a worker's run queue is empty, steal tasks from another worker's queue |
| I/O integration | Block I/O operations register an `epoll` fd; a dedicated I/O thread  moves the task back to RUNNABLE when the fd is ready |
| Preemption | A `SIGALRM` timer signal force-yields a task that holds the CPU too long |
