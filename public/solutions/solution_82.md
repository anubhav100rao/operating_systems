# Solution 82: Design a Message Queue (Kafka-like)

## The Problem
Design a message queue (Kafka-like).

---

## 💡 The Analogy: The Post Office with Sorted Pigeonholes

Imagine a very large, modern post office (Kafka cluster). Publishers (Producers) drop letters into the mail slot. 
Instead of delivering letters one by one to each recipient, the post office sorts every incoming letter into long, numbered pigeonholes (partitions). Each pigeonhole is strictly append-only — new letters always go at the bottom.

Different departments (Consumer Groups) come to collect their letters. Crucially, each department keeps their own personal bookmark (the Consumer Offset) noting the last letter number they've read. 
*   The Marketing department is on letter #10.
*   The Analytics department is on letter #892.
*   Dropping a letter in the pigeonhole is instant.
*   The letters are never destroyed immediately — they are retained for 7 days, letting any slow department catch up at its own pace.

---

## 🔬 Architecture Deep Dive

### Core Concepts

#### 1. Topics, Partitions, and the Log
A **Topic** is a logical stream of events (e.g., `order_placed`, `user_signed_up`). 
A Topic is horizontally split into **Partitions**. Each Partition is a single, ordered, immutable, append-only **log file** on disk.

Every message appended to a partition receives a monotonically increasing 64-bit integer: the **Offset**. The Offset is unique per partition — it is a precise, seekable position in the log file.

**Why a Log File?**
Sequential disk appends are the fastest possible I/O. A single SSD can sustain 600MB/s of sequential writes indefinitely. Using `mmap` and the OS's Page Cache, Kafka can serve reads directly from the Page Cache without any disk I/O at all, as long as consumers are keeping up with producers.

#### 2. The Broker (Kafka Server)
Each physical server in the cluster is called a Broker. A cluster of 3–5 brokers handles petabytes of data. Each broker hosts some partitions as their designated Leader, and maintains replicas of other partitions as Followers.

**Leader Election:** One partition Leader exists per partition. Only the Leader accepts writes from Producers. Followers passively replicate. If a Leader broker goes down, Kafka's Controller (managed by ZooKeeper or KRaft nowadays) promotes one of the in-sync Followers to be the new Leader in seconds.

#### 3. Producer: Partitioning Strategy
When a producer sends a message with a key (e.g., `user_id: 42`), Kafka hashes the key and consistently maps it to one partition: `partition = hash(key) % num_partitions`. This guarantees all events for `user_id: 42` always land in the same partition — ensuring per-key ordering.

Messages without keys are distributed Round-Robin across partitions (maximizing throughput, but sacrificing per-key ordering).

#### 4. Consumer & Consumer Groups
Consumers track their position in each partition using an **Offset**. Reading is just a `seek(offset)` + `read()` on the partition log file. There is no deletion on read.

A **Consumer Group** allows N consumers to cooperatively share the load of a topic. Kafka assigns each partition to exactly one consumer within the group. If the topic has 12 partitions and the consumer group has 4 consumers, each consumer handles 3 partitions. Adding a 5th consumer will trigger a rebalance, redistributing partitions.

#### 5. Durability: Replication and `fsync`
Each partition is replicated across multiple brokers (Replication Factor = 3 is standard). A Producer with `acks=all` waits for the Leader AND all replicas to acknowledge the write before confirming to the application. This guarantees that if a broker catches fire, zero data is lost.

**Retention Policy:**
Kafka never deletes messages on receipt. It deletes based on time (e.g., retain for 7 days) or size (retain up to 50GB per partition). This makes replaying historical data from a specific offset trivial.

### OS-Level Optimizations

*   **`sendfile()` (Zero-Copy):** When serving data to a consumer, Kafka calls `sendfile(socket, log_file_fd, offset, length)`. The OS transfers data directly from the Page Cache buffer to the network socket buffer in kernel space — zero copies through userspace, saving massive CPU cycles.
*   **Page Cache as Write Buffer:** Kafka writes to `mmap`'d log files. The OS's Page Cache absorbs writes in RAM, grouping them for efficient sequential flushing to disk. This decouples write latency from disk latency entirely.
*   **Batching:** Both Producers and Consumers batch messages. The Producer buffers messages in RAM and sends a batch of 1,000 messages in a single TCP frame, amortizing network round-trip and syscall overhead.

---

## 💻 Code Example: A Minimal Partition Log Abstraction in Python

```python
import os
import struct
import threading

# On-disk format per message: [4-byte length][N-byte payload]
HEADER_SIZE = 4

class Partition:
    """An append-only log file backing a single Kafka partition."""
    
    def __init__(self, path: str):
        self.path = path
        self.lock = threading.Lock()
        # Open in append + binary mode so every write goes to end of file
        self.file = open(path, "ab+")
        self._current_offset = self._count_offsets()

    def _count_offsets(self) -> int:
        """Scan the file to determine how many messages exist."""
        count = 0
        with open(self.path, "rb") as f:
            while True:
                header = f.read(HEADER_SIZE)
                if len(header) < HEADER_SIZE:
                    break
                size = struct.unpack(">I", header)[0]
                f.seek(size, os.SEEK_CUR)
                count += 1
        return count

    def append(self, message: bytes) -> int:
        """Append a message. Returns its offset."""
        with self.lock:
            payload = struct.pack(">I", len(message)) + message
            self.file.write(payload)
            self.file.flush()   # Ensure it's in OS page cache
            # os.fsync(self.file.fileno())  # Optionally force to disk
            offset = self._current_offset
            self._current_offset += 1
            return offset

    def read(self, start_offset: int, max_messages: int = 10) -> list:
        """Read up to max_messages starting from start_offset."""
        results = []
        with open(self.path, "rb") as f:
            # Seek to the correct offset position
            current = 0
            while current < start_offset:
                header = f.read(HEADER_SIZE)
                if not header: break
                size = struct.unpack(">I", header)[0]
                f.seek(size, os.SEEK_CUR)
                current += 1

            # Now read up to max_messages
            for _ in range(max_messages):
                header = f.read(HEADER_SIZE)
                if not header: break
                size = struct.unpack(">I", header)[0]
                results.append(f.read(size))
        return results

# Usage:
# part = Partition("/tmp/partition_0.log")
# offset = part.append(b"{'event': 'order_placed', 'id': 123}")
# messages = part.read(start_offset=0)
```
