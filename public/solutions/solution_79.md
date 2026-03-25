# Problem 79: Kernel Bypass — DPDK and RDMA

Kernel bypass is the technique of allowing userspace applications to directly communicate with network hardware, completely skipping the Linux kernel's network stack. This eliminates the dominant sources of latency and CPU overhead in high-throughput, low-latency systems.

## 1. Why Bypass the Kernel?

The standard kernel network path for a received packet:

```
NIC → DMA into kernel ring buffer → Hardware Interrupt → ksoftirqd/NAPI poll
→ sk_buff allocation → TCP/IP stack processing → socket buffer copy
→ wake userspace thread → recvmsg() syscall → copy to userspace buffer
```

**Problems with this path:**
- **2 memory copies:** data is copied from DMA buffer to `sk_buff`, then from `sk_buff` to userspace.
- **Multiple syscalls:** each requiring a user/kernel mode transition.
- **Interrupt overhead:** hardware interrupt handling interrupts the CPU mid-execution.
- **Lock contention:** socket buffers use spinlocks that serialize access.
- **Extra CPU involvement:** the kernel consumes CPU cycles doing pure bookkeeping.

**Total overhead:** ~5–20 μs and ~30% of a CPU core at 10 Gbps line rate.

## 2. DPDK (Data Plane Development Kit)

**DPDK** is an open-source set of libraries developed by Intel (now maintained by the Linux Foundation) that enables userspace packet processing by mapping NIC hardware resources directly into userspace memory.

### How DPDK Works

**Step 1 — Bind the NIC to a userspace PMD driver:**
```bash
# Unbind the NIC from the kernel driver
echo "0000:02:00.0" > /sys/bus/pci/devices/0000:02:00.0/driver/unbind

# Bind to the DPDK-compatible vfio-pci or uio_pci_generic driver
echo "vfio-pci" > /sys/bus/pci/devices/0000:02:00.0/driver_override
echo "0000:02:00.0" > /sys/bus/pci/drivers/vfio-pci/bind
```

The NIC is now invisible to the kernel. Linux cannot use it for normal networking.

**Step 2 — DPDK application takes full ownership:**
```c
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>

int main(int argc, char *argv[]) {
    // Initialize DPDK environment abstraction layer (EAL)
    // This pins threads to cores and sets up hugepage memory
    rte_eal_init(argc, argv);

    // Create a memory pool for packet buffers (backed by 2MB huge pages)
    struct rte_mempool *mbuf_pool = rte_pktmbuf_pool_create(
        "MBUF_POOL", 8192, 256, 0, RTE_MBUF_DEFAULT_BUF_SIZE,
        rte_socket_id());

    // Configure and start the NIC port (port 0)
    rte_eth_dev_configure(0, 1, 1, &port_conf);
    rte_eth_rx_queue_setup(0, 0, 128, rte_eth_dev_socket_id(0), NULL, mbuf_pool);
    rte_eth_dev_start(0);

    // The tight polling loop — ZERO interrupts, ZERO syscalls
    struct rte_mbuf *pkts[32];
    while (1) {
        // Directly poll the NIC's RX ring buffer from userspace
        uint16_t nb_rx = rte_eth_rx_burst(0, 0, pkts, 32);
        for (int i = 0; i < nb_rx; i++) {
            process_packet(pkts[i]);     // Your application logic
            rte_pktmbuf_free(pkts[i]);   // Return buffer to pool
        }
    }
}
```

### Key Architectural Benefits

| Feature | Mechanism | Benefit |
|---|---|---|
| **Zero-copy** | NIC DMA's directly to hugepage pool; userspace reads in-place | Eliminates the kernel→userspace copy |
| **Poll mode (no interrupts)** | CPU busy-polls the NIC ring buffer continuously | Eliminates interrupt latency (5–50 μs) |
| **Lockless ring buffers** | `rte_ring` uses CAS instructions, no mutexes | Eliminates lock contention |
| **Huge pages** | 2MB pages for packet buffers | Eliminates TLB misses on packet memory |
| **CPU affinity** | DPDK pins worker threads to dedicated cores | Eliminates scheduler jitter |

**Result:** Latency drops from **10–20 μs** (kernel path) to **200–500 ns** (DPDK). Throughput scales to **100+ Gbps** on a single core.

## 3. RDMA (Remote Direct Memory Access)

While DPDK accelerates packet processing on a *single* machine, **RDMA** provides a fundamentally different abstraction: the ability for one machine to **directly read from or write to the RAM of another machine** across a network — without involving either machine's CPU or OS kernel.

### Standard TCP/IP Message Flow (without RDMA):
```
Machine A (Sender)                     Machine B (Receiver)
App writes to send buf → copy to kernel sk_buff
→ kernel TCP/IP processes it → NIC transmits
                                       NIC receives → DMA to kernel buffer
                                       CPU copies to socket buffer
                                       App calls recv() → kernel copies to userspace buf
Total CPU involvement on B: significant
```

### RDMA Flow (with InfiniBand / RoCE):
```
Machine A                              Machine B
App posts a WRITE Work Request (WR)    (CPU on B is doing something ELSE entirely)
→ RDMA NIC picks up WR directly
→ NIC reads app's source buffer via DMA
→ Packet sent over wire
                                       RDMA NIC receives
                                       → NIC DMA's data directly to target vaddr in B's RAM
                                       → Posts completion to A's Completion Queue
Machine A's CPU notified of success
```

**Machine B's CPU never participated.** The data just appeared in its memory.

### RDMA Verbs API (Simplified):
```c
// Posting a two-sided SEND (sender sends, receiver must have posted a RECV)
struct ibv_send_wr wr = {
    .opcode     = IBV_WR_SEND,
    .send_flags = IBV_SEND_SIGNALED,
    .sg_list    = &sge,  // scatter-gather element pointing to source buffer
    .num_sge    = 1,
};
ibv_post_send(qp, &wr, &bad_wr); // Post to the Queue Pair (bypasses OS)

// One-sided RDMA WRITE (write directly to remote memory, other CPU uninvolved)
struct ibv_send_wr wr = {
    .opcode      = IBV_WR_RDMA_WRITE,
    .wr.rdma.remote_addr = remote_address, // Target virtual address on Machine B
    .wr.rdma.rkey        = remote_key,     // Memory region key for authorization
    .sg_list     = &sge,
    .num_sge     = 1,
};
ibv_post_send(qp, &wr, &bad_wr);
```

### RDMA Use Cases
- **HPC (High-Performance Computing):** MPI over InfiniBand for distributed scientific computing.
- **Distributed databases:** Apache Flink, Microsoft FaRM use RDMA for inter-node data shuffles.
- **Machine Learning:** GPU-to-GPU data transfer in distributed training (combined with NVLink and NCCL).

## 4. DPDK vs RDMA — When to Use Which

| | DPDK | RDMA |
|---|---|---|
| **Layer** | Userspace packet processing | Remote memory access |
| **Primary Use** | Routing, firewalls, packet brokers, HFT | DB replication, HPC, ML training |
| **Requires** | Any commodity NIC with DPDK PMD driver | Special RDMA-capable NIC (Mellanox/InfiniBand) |
| **Abstraction** | Raw Ethernet packets | Memory read/write primitives |
| **Typical Latency** | 200–500 ns | 1–3 μs |

## Analogy

- **Standard kernel networking:** Sending a package via USPS. The package goes through multiple sorting facilities (kernel stack layers), each facility scans it, re-labels it, and hands it to a different department. The recipient must go to the post office to collect it (syscall to recv).
- **DPDK:** Having your own private courier who drives directly from your warehouse to the customer's warehouse with no post office stops. Your courier (poll-mode driver) is always on the road checking for packages.
- **RDMA:** A magic teleportation device that makes an item appear directly inside the target warehouse's inventory shelf — without the target warehouse staff ever moving, signing for it, or even knowing it arrived until they look at the shelf.
