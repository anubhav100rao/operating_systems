# Solution 81: Design an In-Memory Cache (Redis-like)

## The Problem
Design an in-memory cache (Redis-like).

---

## 💡 The Analogy: The Brilliant Librarian

Imagine a library with millions of books on eight floors (a slow database). There is one extraordinarily gifted librarian standing at the front desk with a small rolling cart that holds exactly 100 books (the in-memory cache).

Whenever a student asks for a book, the librarian checks the cart first. If it is there (a Cache Hit), she hands it over in under a second. If not (a Cache Miss), she makes the 20-minute trek to the correct floor, retrieves the book, puts it on the cart, and hands it to the student.

When the cart is full and a new book comes in, she has a policy: she looks at which book on the cart has gone the longest without being requested and slides it off to make room.

The librarian's efficiency secret: she can handle 50 students asking at the same time by partitioning the cart into sections, assigning 10 sections to each of the 5 library assistants.

---

## 🔬 Architecture Deep Dive

### Core Data Structures

A Redis-like store is fundamentally a key-value map supporting diverse value types living entirely in RAM. Its raw single-threaded throughput exceeds 100,000 operations per second precisely *because* it never touches a disk for normal operations.

**1. The Hash Map (Primary Index)**
The outermost data structure is a dictionary: `dict<string, robj>`. Redis uses a custom double-hashing implementation with progressive rehashing to avoid stop-the-world pauses when the hash map must grow.

```
key  (string)  →  robj (Redis Object)
                   ├── type: STRING | LIST | HASH | SET | ZSET
                   ├── encoding: raw | int | ziplist | skiplist | ...
                   └── ptr: void* (points to actual data structure)
```

**2. Adaptive Encodings (The Memory Optimizer)**
Redis is obsessive about memory efficiency. A *small* sorted set (≤128 elements) is stored as a `ziplist` — a flattened byte array with no overhead. Once it grows beyond the threshold, it is auto-upgraded to a `skiplist` (a probabilistic multilevel linked list giving $O(\log N)$ ordered operations). This delivers both memory efficiency AND performance.

**3. Expiry: The Lazy + Active Dual Eviction**

Every key can carry a TTL (Time To Live) timestamp.

*   **Lazy Expiry:** When a client requests key `session:abc`, the server checks its internal dictionary. If found, it immediately checks if `now > expiry_timestamp`. If expired, it deletes the key on the spot and returns a nil. This requires zero background work.
*   **Active Expiry:** The main event loop runs a background job ~10 times per second. It randomly samples 20 keys from the expired keys dictionary. If any are expired, it deletes them. If more than 25% were expired, it repeats immediately.

**4. Eviction Policy (LRU / LFU)**
When RAM is full and a new key is set, Redis consults its `maxmemory-policy`:
*   `allkeys-lru`: Evict any key using an approximate LRU algorithm (samples 5–16 random keys, evicts the one with oldest access time).
*   `allkeys-lfu`: Evict the least-frequently-used key (each object carries an LFU counter decremented over time).
*   `volatile-lru`: Only evict keys with a TTL set.

The approximate LRU uses a `24-bit clock field` in each `robj` to store the last-access timestamp at second granularity. This costs only 3 bytes of overhead per key.

### Persistence Options

1.  **RDB (Redis Database Snapshot):** Periodically forks the main process. The child iterates the entire in-memory dataset and writes a compact binary file to disk. Due to CoW semantics on `fork()`, the parent continues serving ALL reads and writes without any stalling — the child gets a frozen snapshot view.
2.  **AOF (Append-Only File):** Every write command is appended to a log file before the command is confirmed to the client. On recovery from a crash, Redis replays the AOF file from the beginning.

### Threading Model: Single-Threaded Event Loop

Redis historically runs a **single-threaded command execution engine** powered by an `epoll` event loop. All commands are serialized, eliminating the need for any locks inside the data structures.

**"Threaded I/O" (Redis 6+):** While command *execution* is still single-threaded, Redis 6 introduced multi-threaded *network I/O*. Multiple background threads handle `read()` from sockets and `write()` to sockets concurrently, then hand the parsed commands off to the single main thread for execution.

---

## 💻 Code Example: A Minimal Thread-Safe LRU Cache in C++

```cpp
#include <unordered_map>
#include <list>
#include <mutex>
#include <optional>

template<typename K, typename V>
class LRUCache {
    int capacity;
    // Front = Most Recently Used, Back = Least Recently Used
    std::list<std::pair<K, V>> lru_list;
    std::unordered_map<K, typename std::list<std::pair<K, V>>::iterator> map;
    std::mutex mu;

public:
    LRUCache(int cap) : capacity(cap) {}

    std::optional<V> get(const K& key) {
        std::lock_guard<std::mutex> lock(mu);
        auto it = map.find(key);
        if (it == map.end()) return std::nullopt; // Cache miss

        // Move to front (mark as Most Recently Used)
        lru_list.splice(lru_list.begin(), lru_list, it->second);
        return it->second->second; // Cache hit
    }

    void put(const K& key, const V& value) {
        std::lock_guard<std::mutex> lock(mu);
        auto it = map.find(key);

        if (it != map.end()) {
            // Key exists: update value and move to front
            it->second->second = value;
            lru_list.splice(lru_list.begin(), lru_list, it->second);
            return;
        }

        // New key: evict LRU if full
        if ((int)lru_list.size() == capacity) {
            auto& lru_entry = lru_list.back();
            map.erase(lru_entry.first);
            lru_list.pop_back();
        }

        lru_list.push_front({key, value});
        map[key] = lru_list.begin();
    }
};
```
