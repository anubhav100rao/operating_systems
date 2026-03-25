# Solution 66: Docker Process Isolation — Namespaces & cgroups

## The Problem
How does Docker isolate processes? Namespaces (PID, NET, IPC, MOUNT) and cgroups.

---

## 💡 The Analogy: The Corporate Building with Illusions

Imagine a single large office building (the Linux host machine). One floor at a time is leased to different startup companies (containers). Each company believes they have their own:
*   **Their own private numbering system for desks** (PID Namespace — employee IDs restart at 1).
*   **Their own mailbox and phone extension** (Network Namespace — private IP/ports).
*   **Their own locked filing cabinet for internal memos** (IPC Namespace — no one else can read their whiteboards).
*   **Their own keycard-restricted view of the building** (Mount Namespace — each company sees a different floor plan).

However, they all share the same physical building resources (the actual CPU time and RAM). To prevent one startup from monopolizing the air conditioning (CPU), the building manager uses a system of thermostats and circuit breakers (cgroups) to cap each floor's usage.

---

## 🔬 Deep Dive: Linux Namespaces

Namespaces are a Linux kernel feature that partitions kernel resources so that one set of processes sees one set of resources, while another set of processes sees a different set. When Docker creates a container, it wraps a process inside **seven** namespaces.

### 1. PID Namespace
Inside a container, the first process started always gets PID 1. This is crucial because PID 1 is considered `init` — the parent of all other processes. Tools like `ps aux` inside the container neatly list only PIDs 1, 2, 3, etc.

On the host, that same container `init` process might be PID 14832. The host kernel tracks the true PID, but inside the namespace, the process sees only its virtualized PID 1.

*   **Why it matters:** If the "container PID 1" crashes, the kernel implements `init`-like container reaping: all other processes inside the namespace are also killed and cleaned up, providing clean lifecycle management.

### 2. Network Namespace
Each container gets a completely independent network stack:
*   Its own pair of virtual Ethernet interfaces (`veth`).
*   Its own routing tables and iptables rules.
*   Its own private localhost (`127.0.0.1`).
*   Its own set of ports (the container can bind to port 80 without conflicting with the host's port 80).

**Implementation:** Docker creates a virtual interface pair `(veth0, veth1)`. One end (`veth1`) is placed inside the container's net namespace. The other (`veth0`) connects to a virtual bridge (the `docker0` bridge) on the host, acting like a virtual Ethernet switch linking all containers to NAT to the outside world.

### 3. Mount Namespace
Each container gets its own private filesystem view. Docker:
1.  Takes a read-only base image (layers of UnionFS/OverlayFS).
2.  Adds a thin, writable "Scratch" layer on top for the running container.
3.  Places this combined filesystem into the container's Mount Namespace.

The container sees `/usr/bin/python3` as its version, while the host has an entirely different path. Neither can see or interfere with the other.

### 4. IPC Namespace
Isolates inter-process communication primitives — shared memory segments (`shmget`), message queues, and POSIX semaphores. A process inside one container cannot attach to or signal a named shared memory segment created by a process in a different container.

### 5. UTS Namespace
Allows each container to have its own unique hostname (e.g., `web-server-abc123`) independent of the physical machine's hostname.

---

## 🔬 Deep Dive: cgroups (Control Groups)

Namespaces provide **isolation** (what you can *see*). cgroups provide **resource control** (what you can *use*). A container could be perfectly isolated but still eat 100% CPU and kill the host without cgroups.

A cgroup is a hierarchical tree of resource controllers. Docker specifies limits when creating a container:
```bash
docker run --memory="512m" --cpus="1.5" nginx
```

This translates precisely to kernel cgroup configurations:

```bash
# /sys/fs/cgroup/memory/docker/<container_id>/
memory.limit_in_bytes = 536870912  # 512MB in bytes

# /sys/fs/cgroup/cpu/docker/<container_id>/
cpu.cfs_quota_us  = 150000  # 1.5 cores = 150ms of CPU per 100ms period
cpu.cfs_period_us = 100000
```

**How CPU Throttling Works:**
The Linux CFS scheduler enforces the quota. If the container's processes have consumed their 150ms of CPU within the current 100ms period, the scheduler takes the processes off the run queue entirely until the next period begins. They literally cannot run until the period resets, no matter how many idle CPU cores are available.

**How Memory Limiting Works:**
When a process inside the container calls `malloc`, it eventually maps to a Page Fault. The kernel's page allocator checks if the memory.limit is exceeded. If yes, it invokes the cgroup-local OOM killer — it kills processes *inside the container* without touching other containers or the host.

---

## 💻 Code Example: Creating Isolation Manually

Docker is ultimately just a wrapper. You can replicate a container's isolation with raw Linux kernel commands:

```bash
# 1. Create a new process inside new PID, Net, IPC, and Mount namespaces.
# unshare: the tool to manually create namespaces.
sudo unshare --pid --net --ipc --mount --fork --mount-proc /bin/bash

# You are now inside namespaces! 
ps aux        # Only shows PID 1 (your bash) and PID 2 (ps itself)!
ip link show  # Only shows 'lo' (loopback) — isolated network!
hostname      # Shows the host's hostname until you change it

# 2. In another terminal, apply cgroup resource limits to the unshared PID
echo "10485760" > /sys/fs/cgroup/memory/mygroup/memory.limit_in_bytes
echo $$ > /sys/fs/cgroup/memory/mygroup/cgroup.procs  # Add PID to cgroup
```
