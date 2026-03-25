# Problem 8: What happens if parent exits before child? Zombie vs Orphan processes

The lifecycle of a process in an operating system resembles family dynamics. A "parent" spawns "children", and under ideal circumstances, the parent outlives the child just long enough to record its death. When this order breaks down, we get "Zombies" and "Orphans."

## 1. The Analogy: The Playground Manager

*   **Normal Case:** A manager (parent process) drops a teenager (child process) at the playground to do some work (e.g., paint a fence). When the teenager finishes, the teenager waits by the gate (zombie state). The manager drives by, asks how the work went, logs it in their notebook (reaps it), and then the teenager goes home (removed from OS).
*   **The Orphan Scenario:** The manager gets fired (exits) while the teenager is still painting the fence.
*   **The Zombie Scenario:** The teenager finishes the fence and waits by the gate, but the manager is stuck in traffic and never drives by to log the work.

## 2. Orphan Processes (The Parent Dies First)

If a parent process exits before its children finish executing, those children become **Orphans**. 

*   **The Problem:** The OS hierarchy dictates that every process must have a parent because children rely on parents to collect their exit status.
*   **The OS Kernel's Handling:** When the kernel's `do_exit()` function runs for the parent, it iterates through all of the exiting process's children. It must "reparent" them. 
*   **The Adoption Agency (`init` or Subreaper):** The kernel historically changes the parent PID (PPID) of all orphan processes to PID 1, which on modern Linux is usually `systemd`. PID 1 is the "great-grandfather" of all processes. It has a permanent loop running that specifically waits for adopted children to exit and automatically reaps them. In modern Linux, processes can also designate themselves as "subreapers" via `prctl(PR_SET_CHILD_SUBREAPER)`, acting as mini-adopters for their specific process tree.

## 3. Zombie Processes (The Child Dies First)

A **Zombie Process** (or "defunct" process) is a process that has completed its execution (via an `exit()` call) but still has an entry in the process table.

*   **Why they exist:** When a child process terminates, it doesn't instantly vanish from RAM. The kernel keeps a tiny shell of the process (essentially its exit status code and run-time statistics in the `task_struct`) just in case the parent process wants to call `wait()` or `waitpid()` to see if the work was successful or failed.
*   **The Danger:** A zombie consumes no CPU and no memory, *except* for its spot in the kernel's process ID table. If a buggy parent spawns thousands of children and never `wait()`s on them, the system fills up its PID namespace and refuses to start new processes ("fork: Resource temporarily unavailable").
*   **How they are cleared:** As soon as the parent calls `wait()`, the OS delivers the exit code and completely eradicates the child's `task_struct`. If a parent never calls `wait()`, but eventually dies itself, the zombie becomes an *orphan zombie*, and then PID 1 immediately adopts it and reaps it.

## 4. Code Example (C)

### Simulating an Orphan
```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    pid_t pid = fork();
    if (pid > 0) {
        printf("Parent (PID %d) is exiting immediately.\n", getpid());
        exit(0); // Parent dies, child is inherited by PID 1
    } else if (pid == 0) {
        sleep(5); // Child lives on for 5 seconds
        // When parent exits, getppid() will suddenly return 1 (systemd)
        printf("Orphan (PID %d) finished. My new parent PID is %d.\n", getpid(), getppid());
    }
    return 0;
}
```

### Simulating a Zombie
```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    pid_t pid = fork();
    if (pid > 0) {
        printf("Parent (PID %d) is sleeping for a long time...\n", getpid());
        sleep(60); // Parent goes AWOL and doesn't call wait()
    } else if (pid == 0) {
        printf("Child (PID %d) exiting completely but I will become a zombie.\n", getpid());
        exit(0); // Child dies instantly
    }
    return 0;
}
```
*If you run the Zombie code and type `ps aux | grep Z` in another terminal, you will see the child listed with a 'Z' / `<defunct>` status!*
