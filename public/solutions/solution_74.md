# Problem 74: Seccomp in Linux — Restricting System Calls

**Seccomp (Secure Computing Mode)** is a Linux kernel feature that allows a process to voluntarily restrict the set of system calls it is permitted to make. Once a seccomp filter is installed, any call to a non-allowed syscall results in the kernel immediately killing the process (or returning an error, depending on the action configured).

## 1. The Two Modes of Seccomp

### Mode 1: Strict Mode (`SECCOMP_MODE_STRICT`)
The original, simplest mode. A process calls `prctl(PR_SET_SECCOMP, SECCOMP_MODE_STRICT)` and is instantly confined to exactly **four** syscalls: `read`, `write`, `_exit`, and `sigreturn`. Any other syscall causes an immediate `SIGKILL`.

This is too restrictive for most applications but useful for computational "computation-only" worker processes that need no OS interaction beyond reading input and writing output.

```c
#include <sys/prctl.h>
#include <linux/seccomp.h>

// After this call, only read/write/exit/sigreturn are allowed
prctl(PR_SET_SECCOMP, SECCOMP_MODE_STRICT);
```

### Mode 2: BPF Filter Mode (`SECCOMP_MODE_FILTER`)
The modern and flexibly useful mode. The process installs a **BPF (Berkeley Packet Filter)** program that the kernel runs on every syscall to decide the action.

## 2. How Seccomp-BPF Filters Work

BPF is a tiny, safe, sandboxed virtual machine built into the Linux kernel. Originally designed for network packet filtering (`tcpdump`), it was extended for seccomp.

When a process makes a syscall, the kernel:
1. Prepares a `seccomp_data` struct containing the syscall number and its first 6 arguments.
2. Runs the installed BPF program against this struct.
3. The BPF program returns an **action code** that tells the kernel what to do.

### Action Codes

| Return Value | Behavior |
|---|---|
| `SECCOMP_RET_ALLOW` | Permit the syscall. Execution continues normally. |
| `SECCOMP_RET_KILL_PROCESS` | Immediately kill the entire process group with `SIGSYS`. |
| `SECCOMP_RET_ERRNO` | Block the syscall; return a specific `errno` to userspace. |
| `SECCOMP_RET_TRACE` | Notify an attached `ptrace` tracer (useful for debugging). |
| `SECCOMP_RET_TRAP` | Send `SIGSYS` to the process; the process can handle it. |

## 3. Code Example: Installing a Seccomp Filter with libseccomp

Writing raw BPF bytecode is tedious. The `libseccomp` library provides a clean C API:

```c
#include <seccomp.h>
#include <stdio.h>
#include <unistd.h>

int main() {
    // Create a filter context: default action is to KILL
    scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL);

    // Whitelist specific syscalls we know this program needs
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read),   0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write),  0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit),   0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit_group), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(brk),    0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(mmap),   0);
    // Allow open() only if the flags argument does NOT include O_WRONLY
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(open), 1,
        SCMP_A1(SCMP_CMP_MASKED_EQ, O_WRONLY, 0));

    // Load the filter into the kernel — irrevocable after this
    seccomp_load(ctx);
    seccomp_release(ctx);

    printf("Seccomp filter active. Only whitelisted syscalls allowed.\n");

    // This would be allowed:
    read(STDIN_FILENO, NULL, 0);

    // This would immediately kill the process:
    // socket(AF_INET, SOCK_STREAM, 0);

    return 0;
}
```
```bash
# Compile and link against libseccomp
gcc -o secure_app secure_app.c -lseccomp
```

## 4. Argument-Level Filtering

A powerful feature of seccomp-BPF is that filters can inspect individual **syscall arguments**, not just the syscall number. For example:
```c
// Only allow mmap() if it does NOT request PROT_EXEC (no executable mappings)
seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(mmap), 1,
    SCMP_A2(SCMP_CMP_MASKED_EQ, PROT_EXEC, PROT_EXEC));
```
This blocks an attacker from using `mmap(PROT_EXEC)` to create shellcode pages even if `mmap` is otherwise allowed.

## 5. Seccomp in the Real World

- **Docker/Containerd:** Uses a default seccomp profile that blocks ~44 dangerous syscalls (`keyctl`, `ptrace`, `reboot`, `kexec_load`, etc.) for all containers.
- **Chrome/Chromium:** The renderer sandox is hardened with a whitelist of ~15 syscalls. Any kernel exploit attempt that requires an unlisted syscall is immediately neutralized.
- **OpenSSH:** Uses seccomp in strict mode for the `ssh-agent` process.
- **systemd:** Services can be hardened with `SystemCallFilter=` in unit files.

## Analogy: The Casino Security Guard at Each Table
- **No Seccomp:** Any player can walk up to any game table, use the ATM, enter the vault, access the kitchen. No restrictions.
- **Seccomp (Whitelist Mode):** Each player is given a laminated card listing the exact 5 tables they are allowed to sit at. Any attempt to approach Table 6 results in the security guard immediately escorting them out of the building (SIGKILL), regardless of what their intent was.
- **Argument-Level Filtering:** One of the 5 allowed tables only permits bets under $100. Even though the player is allowed at the table, a $500 bet triggers the guard.
