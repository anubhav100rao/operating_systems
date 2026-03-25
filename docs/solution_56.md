# Problem 56: Server Overload and Kernel Packet Drops

When a server receives more incoming network traffic than it can process, the kernel must make critical decisions about how to handle the excess. Understanding this requires tracing the path of a TCP packet from the NIC all the way to a user process.

## 1. The Two Queues in the TCP Handshake

Linux maintains two completely separate queues for TCP connections:

### SYN Queue (Incomplete Queue)
When a client sends the initial `SYN` packet, the kernel creates a lightweight entry in the **SYN queue** (also called the "incomplete connections queue") and replies with a `SYN-ACK`.
- This queue holds half-open connections waiting for the final `ACK` from the client.
- Controlled by `net.ipv4.tcp_max_syn_backlog` (default: 1024 on most systems).

### Accept Queue (Complete Queue)
When the three-way handshake completes (the client's final `ACK` arrives), the kernel moves the connection from the SYN queue to the **accept queue**.
- This queue holds fully established connections waiting for `accept()` to be called by the application.
- Controlled by the `backlog` parameter in the `listen(fd, backlog)` syscall.
- System-wide max is `net.core.somaxconn` (default: 4096).

```c
// The backlog parameter here sets the accept queue depth
int server_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(server_fd, ...);
listen(server_fd, 128); // Up to 128 fully established connections can wait
```

## 2. What Happens Under Overload

### Scenario A: Accept Queue Full
If the application is too slow calling `accept()`, the accept queue fills up completely.
When a new `SYN-ACK-ACK` arrives and the accept queue is full, the kernel **silently drops the final ACK**.
- The client's stack interprets this as packet loss and retransmits the final ACK (with exponential backoff).
- If it never gets through, the TCP connection times out on the client side.
- This is a "soft" drop — the client can recover through retransmission.

### Scenario B: SYN Queue Full (SYN Flood Attack)
If an attacker sends millions of fake SYN packets but never completes the handshake, the SYN queue overflows. This is the classic **SYN flood DDoS attack**.
- **Defense: SYN Cookies** (`net.ipv4.tcp_syncookies=1`): Instead of allocating memory for a SYN queue entry, the kernel encodes connection state cryptographically into the sequence number of the SYN-ACK. This allows the kernel to handle millions of SYN packets with zero per-connection memory overhead.

### Scenario C: NIC Ring Buffer Full (Hard Drops)
Before packets even reach the TCP layer, the NIC hardware places them into a **ring buffer** in RAM (allocated during driver init with DMA). The kernel's network softirq (`ksoftirqd`) drains this ring buffer.
- If `ksoftirqd` can't drain the ring buffer fast enough (CPU is buried), the NIC hardware simply overwrites old packets. These are **hard drops** — no retransmission, no notification.
- Visible in: `ethtool -S eth0 | grep drop` or `ss -s`.

## 3. Mitigation Strategies

| Problem | Mitigation |
|---|---|
| Accept queue full | Increase `listen(fd, backlog)` and `net.core.somaxconn`|
| SYN flood | Enable `tcp_syncookies` |
| NIC buffer drops | Increase NIC ring buffer with `ethtool -G eth0 rx 4096` |
| CPU softirq bottleneck | Use `SO_REUSEPORT` to spread connections across multiple sockets/threads |
| Single-core bottleneck | Use RSS (Receive Side Scaling) to spread IRQs across CPU cores |

## Analogy: The Airport Security Checkpoint
- **NIC Ring Buffer:** The physical hallway leading to the security checkpoint. If people are packed in so tightly there's literally no room left in the hallway, new arrivals physically cannot enter the building at all (hard drops).
- **SYN Queue:** People who have approached the checkpoint but not completed the scan yet.
- **Accept Queue:** People who have completed all security checks and are waiting inside for a gate agent to escort them to their gate (the `accept()` call).
- **Overloaded gate agents** (slow application): People pile up at the finished-security area. Eventually, even fully cleared passengers spill back into the security lines, causing chaos everywhere.
