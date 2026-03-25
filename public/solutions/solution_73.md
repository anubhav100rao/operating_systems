# Problem 73: How Sandboxing Works at the OS Level

Sandboxing is the practice of running untrusted code in a constrained environment where it has access only to the resources it legitimately needs. At the OS level, sandboxing is not a single mechanism but a composition of multiple kernel enforcement points.

## 1. The Core Problem Sandboxing Solves

When you install a browser extension, open a PDF in a viewer, or run a third-party plugin, the code you are executing is potentially untrusted. Without sandboxing, that code runs with full access to everything your user account can access — your files, network, camera, clipboard.

**Goal:** Confine the untrusted code so that even if it is completely compromised, the blast radius is contained.

## 2. Layer 1 — Process Isolation (The Baseline)

The most fundamental sandbox is simply a **separate process**. Each process has:
- Its own virtual address space (can't read another process's memory).
- File descriptors that are not shared unless explicitly passed.
- Separate uid/gid (can't impersonate other users).

Modern browsers (Chrome, Firefox) use **multi-process architecture** precisely for this reason. Each tab runs in its own renderer process, sandboxed from other tabs and from the browser process itself.

## 3. Layer 2 — Namespaces (Restricting Visibility)

By placing a process in new namespaces, you strip its view of system resources:

```c
#include <sched.h>
// Launch the untrusted process in isolated namespaces
int pid = clone(untrusted_main,
    stack + STACK_SIZE,
    CLONE_NEWPID  |  // Can't see host processes
    CLONE_NEWNET  |  // Has no network access unless given a veth
    CLONE_NEWNS   |  // Has its own mount points
    CLONE_NEWUSER |  // uid 0 inside maps to unprivileged uid outside
    SIGCHLD,
    NULL);
```
- **PID namespace:** The sandboxed process cannot see or signal host processes.
- **Network namespace:** No network unless explicitly granted via a virtual interface.
- **Mount namespace + `chroot`/`pivot_root`:** The process's filesystem root is changed to a minimal image — it cannot navigate to `/etc/passwd` on the host.
- **User namespace:** Root inside the sandbox maps to a regular unprivileged UID on the host, so even if code escapes the sandbox it has zero host privileges.

## 4. Layer 3 — Seccomp (Restricting Syscalls)

Even inside a container with all namespaces applied, the sandboxed process can still call any system call in the kernel. A malicious process might call `ptrace()` to introspect the host, or exploit a kernel bug via a rarely-used syscall like `keyctl()`.

**Seccomp** (covered in detail in Problem 74) installs a BPF filter that whitelist or blacklists specific syscalls. Chrome's renderer processes, for example, are only allowed a tiny allow-list of ~15 syscalls after startup, making kernel exploit surface area minimal.

## 5. Layer 4 — Mandatory Access Control (SELinux / AppArmor)

**Discretionary Access Control (DAC)** — the standard Unix permission bits — is enforced based on who *you are* (uid/gid). **MAC (Mandatory Access Control)** enforces policy based on *what the process is doing*, its type/label context.

- **SELinux:** Every process and file has a **security label** (e.g., `system_u:system_r:httpd_t`). The kernel consults a policy database on each system call. Even if `nginx` runs as `root`, SELinux policy can deny it from writing to `/etc/passwd` because it has the wrong label context.
- **AppArmor:** Path-based profiles that confine a specific executable to a whitelist of files it can read/write/execute.

## 6. Google Chrome's Multi-Layer Sandbox (Real-World Example)

Chrome's renderer sandbox (the engine that parses untrusted HTML/JS) uses all layers simultaneously:

```
[Browser Process (Trusted, Full Access)]
         │
         │  IPC (Mojo)
         ▼
[Renderer Process (Untrusted)]
  ├── Separate process (address space isolation)
  ├── Runs as a different uid (Linux user isolation)
  ├── Seccomp-BPF filter (whitelist of ~15 syscalls)
  ├── New namespaces (no network, no pid visibility)
  └── Capabilities dropped to zero
```

If a remote code execution exploit fires in the renderer via a JavaScript bug, the attacker executes their code inside this cage. They can't directly access files, network, or other processes. They must then find a *second* vulnerability (a "sandbox escape") to break out.

## Analogy: Airport Security Zones
- **Separate process:** Ticket holders and staff are in different sections of the airport.
- **Namespaces (chroot):** Passengers in the international departure lounge can only see their own gate area — they have no access to the baggage handling area.
- **Seccomp:** Passengers are physically unable to operate the flight controls — they literally do not have the physical interface available to them.
- **SELinux/AppArmor:** Even a ground crew member with a runway pass still cannot open the captain's cockpit briefcase — the policy explicitly denies it regardless of their physical badge level.
