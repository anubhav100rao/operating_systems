# Problem 80: Design a High-Performance Logging System

A high-performance logging system must handle very high write throughput (millions of log lines per second) with minimal impact on application latency, while guaranteeing no log data loss and enabling fast retrieval. This is the architecture used by systems like Kafka, Loki, and Elasticsearch's Logstash pipeline.

## 1. Requirements Analysis

**Functional Requirements:**
- Ingest structured log events from thousands of concurrent producers (application threads, services).
- Persist logs durably to disk.
- Support querying/tailing logs by service, severity, time range.
- Support log rotation and retention policies.

**Non-Functional Requirements:**
- Write latency: **< 1ms P99** (logging must not block the application).
- Write throughput: **>1M events/second** on a single node.
- Zero data loss on crash (fsync durability).
- Low CPU overhead on the application side.

## 2. Core Design Principle: Asynchronous Decoupling

The single most important principle is that **the application thread must never wait for disk I/O**. Logging to disk takes 1–10ms on an HDD or 50–100μs on an NVMe. This is unacceptable inside a hot code path.

**Solution:** Decouple the write path from the flush path using a **lock-free SPSC (Single-Producer Single-Consumer) ring buffer** per thread.

```
Application Thread               Logger Background Thread
      │                                    │
      │  append(event)                     │
      ▼                                    ▼
┌───────────────────┐            ┌──────────────────────┐
│  Thread-Local     │──batch──▶  │  Aggregator Queue     │──▶  Disk Write
│  Ring Buffer      │            │  (lock-free MPSC)     │
│  (SPSC, no locks) │            └──────────────────────┘
└───────────────────┘
```

## 3. Component 1 — Thread-Local Ring Buffer (Lock-Free)

Each application thread writes into its own dedicated ring buffer. Because only one thread writes (Single Producer) and one logger thread reads (Single Consumer), no locking is needed — only memory barriers.

```c
#include <stdatomic.h>
#include <string.h>

#define RING_SIZE 4096 // Must be power of 2

typedef struct {
    char     data[256];
    uint64_t timestamp;
    int      level;
} LogEvent;

typedef struct {
    LogEvent       buffer[RING_SIZE];
    atomic_uint    head; // Writer advances head
    atomic_uint    tail; // Reader advances tail
} SPSCRingBuffer;

// Called by the application thread — NO locks, NO syscalls
int ring_push(SPSCRingBuffer *rb, const LogEvent *event) {
    unsigned h = atomic_load_explicit(&rb->head, memory_order_relaxed);
    unsigned next_h = (h + 1) & (RING_SIZE - 1);

    if (next_h == atomic_load_explicit(&rb->tail, memory_order_acquire))
        return -1; // Buffer full — drop or block

    rb->buffer[h] = *event;
    atomic_store_explicit(&rb->head, next_h, memory_order_release);
    return 0;
}

// Called by the logger background thread
int ring_pop(SPSCRingBuffer *rb, LogEvent *out) {
    unsigned t = atomic_load_explicit(&rb->tail, memory_order_relaxed);
    if (t == atomic_load_explicit(&rb->head, memory_order_acquire))
        return -1; // Empty

    *out = rb->buffer[t];
    atomic_store_explicit(&rb->tail, (t + 1) & (RING_SIZE - 1), memory_order_release);
    return 0;
}
```

**Why memory barriers instead of locks?**
- A lock under contention causes a syscall (`futex`) and a context switch.
- A memory barrier (`memory_order_acquire/release`) is only 1–2 CPU instructions on x86. At 1M events/second, this difference is critical.

## 4. Component 2 — The Aggregator and Write Path

A single background logger thread drains all per-thread ring buffers and batches events.

```
Every 1ms (or when 64KB of data accumulated):
  1. Drain all per-thread ring buffers into a contiguous byte buffer
  2. Format events: JSON / protobuf / custom binary format
  3. write() the buffer to the log file (sequential I/O — very fast)
  4. fsync() if durability guarantee required
  5. Advance the write pointer in the index
```

**Key insight — Sequential I/O:**  
Unlike random I/O (which requires the disk head to physically seek), sequential appends to a single file are extremely fast:
- HDD: ~100–200 MB/s sequential vs ~0.5 MB/s random.
- NVMe: ~5 GB/s sequential, far less for tiny random writes.

Modern logging systems treat the log file as an **append-only sequential data structure** (exactly how Apache Kafka works).

## 5. Component 3 — The Log File Format

Use a structured **binary format** for compact, fast serialization, paired with a separate **index file** for searchability.

```
log_file.bin (append-only):
┌─────────────────────────────────────────────────────┐
│ [len:4B][timestamp:8B][level:1B][service_id:4B][msg] │  ← entry 1
│ [len:4B][timestamp:8B][level:1B][service_id:4B][msg] │  ← entry 2
│ ...                                                   │
└─────────────────────────────────────────────────────┘

log_index.bin (for seeking by time/offset):
┌────────────────────────────────────────┐
│ [timestamp:8B][file_offset:8B]          │  ← every Nth entry
│ ...                                     │
└────────────────────────────────────────┘
```

Searches by time perform a binary search on the index file (O(log N) index reads), then seek to the corresponding offset in the log file.

## 6. Component 4 — Durability and Log Rotation

**Durability:**
```c
// Group commit: batch many events then sync once (like database WAL)
write(log_fd, batch_buffer, batch_size);
fdatasync(log_fd); // Sync only data, not metadata (faster than fsync)
```
`fdatasync()` is faster than `fsync()` because it skips syncing metadata (mtime, atime) to disk if it's not relevant for recovery.

**Log Rotation:**
When the current log segment reaches a size limit (e.g., 256MB), the logger:
1. Renames `current.log` → `segment_00042.log` (atomic `rename()` syscall — O_RENAME is atomic on POSIX).
2. Opens a new `current.log` for writing.
3. Sends older segments for async compression (`zstd`, `lz4`).
4. Deletes segments older than the retention window.

## 7. Full Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   Application Processes                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │Thread-1  │  │Thread-2  │  │Thread-N  │               │
│  │SPSC Ring │  │SPSC Ring │  │SPSC Ring │               │
└──┼──────────┼──┼──────────┼──┼──────────┼───────────────┘
   │          │  │          │  │          │
   └──────────┴──┴──────────┴──┴──────────┘
                            │
                   ┌────────▼────────┐
                   │ Logger Thread   │
                   │ (drains rings,  │
                   │  batches writes)│
                   └────────┬────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        log_file.bin   log_index.bin   metrics.prom
        (sequential    (binary search  (write rate,
         append)        index)          drop rate)
             │
     ┌───────▼────────┐
     │ Log Rotation   │─── compress → S3/GCS
     │ (rename +      │─── delete → retention policy
     │  new segment)  │
     └────────────────┘
```

## Analogy: The Newspaper Printing Operation
- **Thread-local ring buffer:** Each journalist has a physical in-tray on their desk. They drop finished article manuscripts in their own tray without interrupting anyone else.
- **Logger background thread:** The copy editor walks around the entire newsroom every 60 seconds, collects all in-tray manuscripts, and brings them to the printing room as one batch. No journalist had to walk to the printing room individually.
- **Sequential log file:** The printing press only prints in one direction — never skips around the page. This is why it's so much faster than inkjet printers doing random small prints.
- **Log rotation:** Every night, the completed day's newspaper is archived and a fresh blank roll of paper is loaded onto the press.
