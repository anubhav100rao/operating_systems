# Problem 58: cgroups v2 — Memory and CPU Limit Enforcement

**Control Groups (cgroups)** are a Linux kernel feature that allows the system to partition processes into hierarchical groups and attach resource limits (CPU, memory, disk I/O) to those groups. They are the backbone of containers (Docker, Kubernetes pods).

## 1. How cgroups v2 Are Structured

In cgroups v2, everything is exposed through a hierarchical **pseudo-filesystem** (`cgroupfs`) typically mounted at `/sys/fs/cgroup`. You create a cgroup simply by making a directory, and configure it by writing to special virtual files inside it.

```bash
# Create a new cgroup for a "batch-job" process group
mkdir /sys/fs/cgroup/batch-job

# Add the current shell process (and all its future children) to this cgroup
echo $$ > /sys/fs/cgroup/batch-job/cgroup.procs

# Set limits (explored below)
echo "512M" > /sys/fs/cgroup/batch-job/memory.max
```

## 2. Memory Limits and Enforcement

### Setting a Limit
The `memory.max` file sets the hard memory ceiling for all processes in the cgroup:
```bash
# Processes in this group cannot collectively consume more than 512 MB
echo "536870912" > /sys/fs/cgroup/batch-job/memory.max
```

### How the Kernel Enforces It
1. **Page Allocation Hook:** Every time a process calls `malloc()` or accesses a new anonymous page, the kernel's page allocator calls `mem_cgroup_charge()` to add the new page's cost to the cgroup's memory counter.
2. **Limit Check:** If the new total exceeds `memory.max`, the kernel does **not** simply fail the allocation.
3. **Memory Reclaim First:** The kernel first tries to reclaim memory *within* that specific cgroup — evicting cached file pages belonging to processes in that group.
4. **OOM Kill:** If reclaim is insufficient, the kernel invokes the per-cgroup **OOM killer**, selecting the most memory-hungry process *within that cgroup* to kill. Critically, this targeted OOM kill does not threaten other cgroups or the rest of the system.

## 3. CPU Limits and Throttling

### Setting a CPU Quota
CPU limits are configured via two files:
- `cpu.max`: Format is `"quota period"` in microseconds. This means the cgroup gets at most `quota` microseconds of CPU time every `period` microseconds.

```bash
# Allow this cgroup to use at most 50% of one CPU core
# (50000 microseconds of CPU every 100000 microseconds)
echo "50000 100000" > /sys/fs/cgroup/batch-job/cpu.max

# Or limit to 2 full CPU cores across any number of physical CPUs
echo "200000 100000" > /sys/fs/cgroup/batch-job/cpu.max
```

### How the Kernel Enforces CPU Throttling
The CPU scheduler (CFS) integrates this via the **CFS Bandwidth Controller**:
1. **Token Bucket:** The kernel maintains a per-cgroup **bandwidth pool** (the quota). Each period, this pool is refilled with `quota` microseconds of CPU time.
2. **Deduction:** Every time a thread in the cgroup runs on a CPU core, the kernel deducts the wall-clock time elapsed from the pool.
3. **Throttling:** When the pool hits zero, the kernel removes all threads in that cgroup from all runqueues. They are placed into a **throttled state** and will be invisible to the scheduler.
4. **Unthrottling:** At the start of the next period, the pool is fully refilled and all throttled threads are placed back onto the runqueues.

### Analogy: The Office Electricity Meter
Each tenant (cgroup) in an office building has a pre-paid electricity meter on their floor.
- **memory.max:** A physical breaker that trips if the floor uses too many amps simultaneously, disconnecting the biggest power-sucker (OOM kill).
- **cpu.max:** A pre-paid electricity allowance. The tenant gets 50 kWh per day. Once they hit 50 kWh, the power on their entire floor is cut until midnight when the meter resets. The rest of the building is completely unaffected.

## 4. Observing Throttling

```bash
# Check if a cgroup is being throttled
cat /sys/fs/cgroup/batch-job/cpu.stat
# Output includes:
#   nr_throttled    15       <- throttled 15 times this period
#   throttled_usec  234000   <- wasted 234ms waiting for quota refill
```
