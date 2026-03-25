# Problem 59: Linux Namespaces and PID Namespaces

Linux **Namespaces** are the kernel mechanism that gives processes an isolated, virtualized view of system resources. While cgroups limit *how much* of a resource a process can use, namespaces control *what* a process can see. Together, they form the foundation of containers.

## 1. The Different Namespace Types

| Namespace | Flag | Isolates |
|---|---|---|
| **PID** | `CLONE_NEWPID` | Process IDs — a process thinks it's PID 1 |
| **Network** | `CLONE_NEWNET` | Network interfaces, IP addresses, routing tables, firewall rules |
| **Mount** | `CLONE_NEWNS` | Filesystem mount points (each container has its own `/proc`, `/sys`) |
| **UTS** | `CLONE_NEWUTS` | Hostname and domain name |
| **IPC** | `CLONE_NEWIPC` | System V IPC, POSIX message queues |
| **User** | `CLONE_NEWUSER` | User and group IDs (allows root inside a container to map to non-root outside) |
| **Cgroup** | `CLONE_NEWCGROUP` | The root of the cgroup filesystem hierarchy |

## 2. How the PID Namespace Works

The PID namespace answers the question: **why does `/bin/sh` inside a Docker container think it is PID 1?**

### The PID Tree
The kernel maintains a global PID tree. Every process has a PID in the **root namespace**. But a process can also be a member of a **child PID namespace**, inside which a completely separate PID counter starts from 1.

A process in a child PID namespace:
- Knows only about itself and its own descendants.
- Cannot see or send signals to processes in the parent namespace.
- Its PID *within* the container is 1 (or 2, 3, etc.), but its *true* PID in the host's root namespace is, say, 14532.

### Creating a PID Namespace (Code Example)
```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <unistd.h>

int child_main(void *arg) {
    printf("Inside child namespace: my PID is %d\n", getpid());
    // Output: "Inside child namespace: my PID is 1"
    // This process IS PID 1 inside its new PID namespace.
    return 0;
}

#define STACK_SIZE (1024 * 1024)
char child_stack[STACK_SIZE];

int main() {
    printf("Parent PID: %d\n", getpid());

    // clone() is like fork() but creates the child in a NEW PID namespace
    pid_t pid = clone(child_main,
                      child_stack + STACK_SIZE,
                      CLONE_NEWPID | SIGCHLD,
                      NULL);

    printf("Host-visible PID of child: %d\n", pid);
    // Output: "Host-visible PID of child: 15003"
    // The same process has PID 1 inside the namespace, PID 15003 outside.

    waitpid(pid, NULL, 0);
    return 0;
}
```

### Why PID 1 is Special Inside a Container
In the Linux root namespace, PID 1 is `init` (or `systemd`). It has special responsibilities:
- **Orphan reparenting:** When any process dies, its orphaned children are reparented to PID 1.
- **Signal handling:** The kernel will *not* send `SIGKILL` or `SIGTERM` to PID 1 unless the process has registered a handler. This means if the container's `CMD` process (running as PID 1 inside the container) does not handle `SIGTERM` explicitly, `docker stop` will wait 10 seconds then hard-`SIGKILL` it, potentially corrupting data.

This is why many containers use a lightweight init system like `tini` as their actual PID 1, which properly forwards signals and reaps zombie processes.

## 3. Network Namespaces: Full Network Stack Isolation
Each network namespace has its own:
- `lo` (loopback) and virtual ethernet interfaces (`veth` pairs)
- Routing table and ARP table
- iptables/nftables rules
- Port space (container can bind to port 80 without conflicting with host's port 80)

Docker connects a container to the host network by creating a virtual ethernet cable (`veth pair`): one end is placed inside the container's network namespace, the other is connected to a bridge (`docker0`) in the host's network namespace.

## Analogy: The Embassy with Different Realities
Think of each namespace as a container being placed inside a holographic reality chamber.
- **PID Namespace:** Inside the chamber, there are only 3 people. Person 1 believes they are the President of a country. Outside the chamber, they are truly Employee #5892 in a company of 50,000.
- **Network Namespace:** The chamber has its own phone switchboard, its own phone numbers, and its own internet router. It cannot even conceptually call numbers that exist outside.
- **Mount Namespace:** The chamber has its own bookshelves. Even if you remove all books from the bookshelf outside, the books inside the chamber are completely unaffected.
