# Problem 75: Linux Capabilities vs Root Permissions

The classic Unix permission model is binary: you are either `root` (uid=0, omnipotent) or a regular user (limited). This all-or-nothing model violates the **Principle of Least Privilege**: processes should have only the minimum permissions they need to function.

**Linux Capabilities** solve this by splitting the traditionally monolithic root privilege into around 41 distinct, individually grantable and revocable pieces.

## 1. The Problem with Traditional Root

Consider a program like `ping`. It needs to send raw ICMP packets, which requires creating a raw socket — historically a root-only operation. Before capabilities, the only option was to make `ping` a **setuid-root** binary:

```bash
ls -la /bin/ping
# -rwsr-xr-x 1 root root 72776 ... /bin/ping
#    ^-- setuid bit: ping runs as root for EVERY user
```

This means `ping` — a program the average user runs casually — has **complete, unrestricted root access**. Any bug in `ping`'s code is a bug in a root-privileged program.

## 2. Linux Capabilities: Splitting the Root Atom

Capabilities allow you to grant only the specific privilege `ping` needs (`CAP_NET_RAW`) without granting full root.

### Important Capability Examples

| Capability | What It Grants |
|---|---|
| `CAP_NET_BIND_SERVICE` | Bind to ports below 1024 (like port 80) without being root |
| `CAP_NET_RAW` | Create raw and packet sockets (used by `ping`, `tcpdump`) |
| `CAP_SYS_PTRACE` | Use `ptrace()` to inspect other processes (used by `strace`, `gdb`) |
| `CAP_SYS_ADMIN` | Broad "admin" capability: mount filesystems, change namespaces, etc. |
| `CAP_CHOWN` | Change file ownership |
| `CAP_KILL` | Send signals to processes owned by other users |
| `CAP_SYS_TIME` | Set the system clock |
| `CAP_DAC_OVERRIDE` | Bypass regular file permission checks (read/write/execute) |
| `CAP_NET_ADMIN` | Configure network interfaces, routes, firewall rules |
| `CAP_SYS_RAWIO` | Access `/dev/mem`, read/write raw memory (very dangerous) |

## 3. Capability Sets Per Process

Each process actually has **five** distinct capability sets:

| Set | Description |
|---|---|
| **Permitted** | The maximum set of capabilities this process can ever have. |
| **Effective** | The capabilities currently active (kernel checks these). |
| **Inheritable** | Capabilities that can pass to `exec()`'d child processes. |
| **Bounding** | Hard ceiling; caps can never be added beyond this set. |
| **Ambient** | Capabilities automatically inherited by non-setuid children (Linux 4.3+). |

## 4. Granting Capabilities Without Root

### Via `setcap` (File Capabilities)
```bash
# Compile ping without setuid
gcc -o my_ping ping.c

# Grant it only the ONE capability it needs
sudo setcap cap_net_raw+ep ./my_ping
# +ep = add to Effective and Permitted sets on exec

# Verify
getcap ./my_ping
# ./my_ping cap_net_raw=ep

# Now any user can run it without it being fully setuid root
./my_ping google.com  # Works! Only has CAP_NET_RAW, nothing else.
```

### Via Programmatic Dropping (`cap_drop`)
A process starting as root can immediately drop capabilities it doesn't need:

```c
#include <sys/capability.h>
#include <stdio.h>

int main() {
    // Get current capabilities
    cap_t caps = cap_get_proc();
    printf("Before drop: %s\n", cap_to_text(caps, NULL));

    // Build a new set with only CAP_NET_BIND_SERVICE
    cap_t new_caps = cap_from_text("cap_net_bind_service=eip");
    cap_set_proc(new_caps); // Apply it — all other caps are gone

    printf("After drop: %s\n", cap_to_text(cap_get_proc(), NULL));
    // Only cap_net_bind_service remains

    cap_free(caps);
    cap_free(new_caps);
    return 0;
}
```
```bash
gcc -o cap_demo cap_demo.c -lcap
sudo ./cap_demo
```

## 5. Capabilities in Docker and Kubernetes

Docker drops several dangerous capabilities by default from all containers:

```bash
# Docker's default: drop ALL, then re-add safe ones
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE my_webserver

# Kubernetes equivalent in a pod spec:
# securityContext:
#   capabilities:
#     drop: ["ALL"]
#     add: ["NET_BIND_SERVICE"]
```

This means even if a container is compromised and code runs as root *inside* the container, it cannot:
- Call `ptrace()` on host processes (no `CAP_SYS_PTRACE`)
- Load kernel modules (no `CAP_SYS_MODULE`)
- Mount filesystems (no `CAP_SYS_ADMIN`)
- Change system time (no `CAP_SYS_TIME`)

## 6. Side-by-Side Comparison

| Aspect | Traditional Root | Linux Capabilities |
|---|---|---|
| Granularity | All-or-nothing | 41 individually grantable bits |
| Principle of Least Privilege | Violated | Enforced |
| Exploit blast radius | Full system compromise | Limited to the granted cap scope |
| `ping` implementation | Runs as root via setuid | Granted only `CAP_NET_RAW` |
| Container default | Often `root` inside | Root inside + all dangerous caps dropped |

## Analogy: The Master Keyring vs. Individual Keys
- **Traditional Root:** A building super with a single master key that opens every single lock in the building — janitor closets, main vault, server room, every apartment. Losing this key is catastrophic.
- **Linux Capabilities:** Instead of a master key, each employee carries only the specific keys their job demands. The network engineer has a key for the server room and router closet only. The security guard has a key for every floor's stairwell. If the network engineer is mugged, the thief only gains access to the server room — not the vault or any apartments.
