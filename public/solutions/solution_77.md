# Problem 77: Clock Synchronization — NTP vs Logical Clocks

In a distributed system, nodes cannot share a single physical clock. Each machine has its own crystal oscillator that drifts slightly over time. Even with synchronization, clocks can be off by milliseconds to seconds. This is a fundamental distributed systems challenge.

## 1. Physical Clocks and Why They Fail

Every server has a hardware Real-Time Clock (RTC). When the OS reads `clock_gettime(CLOCK_REALTIME)`, it reads this physical time.

**The problems:**
- **Clock drift:** Cheap crystals drift ~10–100ms per day. Without correction, two machines diverge.
- **Clock skew:** Two machines showing different times right now.
- **Clock jumps:** NTP can suddenly correct a clock backwards or jump it forward — breaking any assumption that `time.now()` is monotonically increasing.

```c
// WRONG: Measuring elapsed time with wall clock
struct timespec start, end;
clock_gettime(CLOCK_REALTIME, &start);
do_work();
clock_gettime(CLOCK_REALTIME, &end);
// NTP might have adjusted between start and end. end could be BEFORE start!

// CORRECT: Use monotonic clock for elapsed time measurements
clock_gettime(CLOCK_MONOTONIC, &start); // Never jumps backward
do_work();
clock_gettime(CLOCK_MONOTONIC, &end);
long elapsed_ns = (end.tv_sec - start.tv_sec) * 1e9 + (end.tv_nsec - start.tv_nsec);
```

## 2. NTP (Network Time Protocol)

**NTP** is the standard mechanism for synchronizing physical clocks over a network. It uses a hierarchical tree of time servers (`strata`):
- **Stratum 0:** Atomic clocks, GPS receivers, radio clocks (the ground truth).
- **Stratum 1:** Servers directly connected to Stratum 0 hardware.
- **Stratum 2:** Regular servers syncing from Stratum 1 over the internet.
- **Your server:** Likely Stratum 2 or 3.

### How NTP Measures Offset:
```
Client                            NTP Server
  |------ Request (t1) ---------->|
  |                               | (receives at t2)
  |<----- Response (t3, t2, t1) --|
  | (receives at t4)              |

Round-trip delay = (t4 - t1) - (t3 - t2)
Clock offset = ((t2 - t1) + (t3 - t4)) / 2
```
NTP uses this offset to **slowly slew** (gradually adjust) the local clock without jumping. The Linux `adjtimex()` syscall implements this gradual adjustment.

**Accuracy:** LAN: ~1ms. WAN: ~10–50ms. With GPS: ~1 microsecond.

## 3. The Fundamental Limitation of Physical Clocks in Distributed Systems

Even with NTP, two nodes can observe the same event in different orders. If node A's clock is 5ms ahead of node B's clock, an event at A at T=100ms appears to happen **before** an event at B at T=103ms — even if B's event was causally first. This is the **clock skew ordering problem**.

**Consequence:** You cannot sort distributed events by timestamp and trust the order.

## 4. Logical Clocks (Lamport Timestamps)

Leslie Lamport (1978) proposed replacing physical time with a logical counter that captures **causal relationships** rather than real wall-clock time.

### The Rules:
1. Each process maintains a counter, initialized to 0.
2. **Before sending** any message, increment the counter.
3. **On receiving** a message with timestamp `T`, set local counter to `max(local, T) + 1`.

```python
class LamportClock:
    def __init__(self):
        self.time = 0

    def tick(self):
        """Increment before a local event or before sending a message."""
        self.time += 1
        return self.time

    def update(self, received_time):
        """Called on receiving a message."""
        self.time = max(self.time, received_time) + 1
        return self.time

# Example: Two processes
clock_A = LamportClock()
clock_B = LamportClock()

# A does event e1
ts_e1 = clock_A.tick()  # A.time = 1
print(f"A: event e1 at {ts_e1}")  # 1

# A sends message to B (timestamp 1)
ts_send = clock_A.tick()  # A.time = 2

# B receives the message
ts_recv = clock_B.update(ts_send)  # B.time = max(0, 2) + 1 = 3
print(f"B: received message at {ts_recv}")  # 3

# B's events now have a higher timestamp than A's events that preceded the message
```

### What Lamport Clocks Guarantee:
- If `A → B` (A causally happened before B), then `timestamp(A) < timestamp(B)`. ✓
- **But:** If `timestamp(A) < timestamp(B)`, it **does not mean** A happened before B. The converse is not true.

## 5. Vector Clocks — Capturing Full Causality

To fix the limitation of Lamport clocks, **Vector Clocks** use a vector of counters — one per process.

```python
class VectorClock:
    def __init__(self, process_id, num_processes):
        self.pid = process_id
        self.clock = [0] * num_processes

    def tick(self):
        self.clock[self.pid] += 1
        return list(self.clock)

    def update(self, received_vector):
        for i in range(len(self.clock)):
            self.clock[i] = max(self.clock[i], received_vector[i])
        self.clock[self.pid] += 1
        return list(self.clock)

    def happens_before(self, vc_a, vc_b):
        """Returns True if vc_a strictly happened before vc_b."""
        return all(a <= b for a, b in zip(vc_a, vc_b)) and any(a < b for a, b in zip(vc_a, vc_b))
```

With vector clocks:
- `A → B` ↔ `VC(A) < VC(B)` — both directions hold.
- If neither `VC(A) < VC(B)` nor `VC(B) < VC(A)`, the events are **concurrent** (unrelated).

Used in Amazon Dynamo, Riak, and various distributed databases for conflict detection.

## 6. Google's TrueTime (Spanner)

Google Spanner uses **TrueTime**, which exposes time as an interval `[earliest, latest]` rather than a single point. GPS receivers and atomic clocks are in every datacenter, providing a bounded uncertainty window of typically `±4ms`.

Spanner exploits this: before committing a transaction, it simply **waits out the uncertainty window** (up to 7ms). After waiting, it is guaranteed that its timestamp is greater than any previously committed transaction globally. This gives global external consistency without requiring perfectly synchronized clocks.

## Analogy: The Multi-City Meeting Problem
- **NTP:** Every city hall syncs its clock tower with the national observatory. But radio signals take different times to arrive in different cities, so the clocks are slightly off from each other still.
- **Lamport Clock:** Instead of clocks, meetings are numbered. Any meeting that was *informed by* another meeting gets a higher number. If Tokyo meeting 5 sent a fax to London, London's next meeting is at least 6. But two simultaneous, unrelated meetings in Berlin and Paris can't be ordered.
- **Vector Clock:** Each city keeps a scoreboard tracking the meeting count of *every other city*. By comparing scoreboards, you can tell exactly whether one meeting provably influenced another, or whether they were truly independent.
