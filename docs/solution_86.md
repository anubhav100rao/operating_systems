# Problem 86: Design a Lock-Free Hash Map

A lock-free hash map is one of the most challenging data structures to implement correctly. It must allow concurrent reads and writes from any number of threads without any mutexes, making it a cornerstone of high-performance systems like caches, databases, and trading systems.

## 1. The Analogy: The Self-Organizing Library

Imagine a library where hundreds of readers and writers roam freely at the same time, with no librarian or locking system.

*   **Standard hash map + Mutex:** There is one master key to the entire library. Only one person can enter at a time to read or shelve a book.
*   **Lock-free hash map:** There are no keys. The library has special "atomic shelves." To put a new book in a slot, you carry the book, look at the slot, and use a special robotic arm that can do `Compare-And-Swap` — if the slot is still empty, the robot places your book; if someone else already put a book there, you adjust and retry.

## 2. Core Strategy: Open Addressing with CAS

The most practical approach for a lock-free hash map uses **open addressing** (linear or quadratic probing) for collision resolution, backed by **Compare-And-Swap (CAS)** atomic operations.

Each slot in the backing array stores a key-value pair as two separate atomic 64-bit integers. This avoids needing pointers (which would require solving memory reclamation separately).

### State Encoding per Slot

```c
#define EMPTY   0       // Slot has never been written
#define DELETED 0xDEAD  // Tombstone: item was logically deleted
```

## 3. Full Implementation (C11)

```c
#include <stdatomic.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define CAPACITY    (1 << 20)  // 1M slots, must be power-of-2
#define EMPTY_KEY   0
#define DELETED_KEY UINT64_MAX

typedef struct {
    _Alignas(16) atomic_uint64_t key;
    atomic_uint64_t              value;
} Slot;

typedef struct {
    Slot *slots;
    size_t capacity;
} LockFreeHashMap;

// ── Initialization ────────────────────────────────────────────────────────────
LockFreeHashMap* lf_hashmap_create(size_t capacity) {
    LockFreeHashMap *m = malloc(sizeof(*m));
    m->capacity = capacity;
    m->slots    = calloc(capacity, sizeof(Slot)); // calloc zeroes → EMPTY_KEY=0
    return m;
}

// ── Probing helper ────────────────────────────────────────────────────────────
static inline size_t probe(uint64_t key, size_t i, size_t cap) {
    return (key + i) & (cap - 1); // Linear probing using power-of-2 mask
}

// ── Insert (or Update) ────────────────────────────────────────────────────────
bool lf_hashmap_put(LockFreeHashMap *m, uint64_t key, uint64_t value) {
    for (size_t i = 0; i < m->capacity; i++) {
        size_t idx    = probe(key, i, m->capacity);
        Slot  *slot   = &m->slots[idx];
        uint64_t cur  = atomic_load_explicit(&slot->key, memory_order_acquire);

        if (cur == EMPTY_KEY || cur == DELETED_KEY) {
            // Attempt to claim this slot with CAS
            uint64_t expected = cur;
            if (atomic_compare_exchange_strong_explicit(
                    &slot->key, &expected, key,
                    memory_order_acq_rel, memory_order_acquire)) {
                // We won the slot; publish the value
                atomic_store_explicit(&slot->value, value, memory_order_release);
                return true;
            }
            // Another thread claimed this slot first; re-read and continue probing
            cur = atomic_load_explicit(&slot->key, memory_order_acquire);
        }

        if (cur == key) {
            // Key already exists — update value
            atomic_store_explicit(&slot->value, value, memory_order_release);
            return true;
        }
    }
    return false; // Map is full
}

// ── Lookup ────────────────────────────────────────────────────────────────────
bool lf_hashmap_get(LockFreeHashMap *m, uint64_t key, uint64_t *out_value) {
    for (size_t i = 0; i < m->capacity; i++) {
        size_t   idx = probe(key, i, m->capacity);
        Slot    *slot = &m->slots[idx];
        uint64_t cur  = atomic_load_explicit(&slot->key, memory_order_acquire);

        if (cur == EMPTY_KEY) return false;    // Definitive miss
        if (cur == DELETED_KEY) continue;      // Tombstone; keep probing

        if (cur == key) {
            *out_value = atomic_load_explicit(&slot->value, memory_order_acquire);
            return true;
        }
    }
    return false;
}

// ── Delete (Tombstone) ────────────────────────────────────────────────────────
bool lf_hashmap_delete(LockFreeHashMap *m, uint64_t key) {
    for (size_t i = 0; i < m->capacity; i++) {
        size_t   idx = probe(key, i, m->capacity);
        Slot    *slot = &m->slots[idx];
        uint64_t cur  = atomic_load_explicit(&slot->key, memory_order_acquire);

        if (cur == EMPTY_KEY)   return false;
        if (cur == DELETED_KEY) continue;
        if (cur == key) {
            // Replace key with tombstone — don't set to EMPTY (breaks probing chains)
            uint64_t expected = key;
            return atomic_compare_exchange_strong_explicit(
                &slot->key, &expected, DELETED_KEY,
                memory_order_acq_rel, memory_order_acquire);
        }
    }
    return false;
}
```

## 4. Key Design Decisions Explained

| Decision | Rationale |
| :--- | :--- |
| Power-of-2 capacity | Replaces modulo (`%`) with a fast bitmask (`&`) |
| **Tombstones on delete** | Deleting by setting key to `EMPTY` would break probe chains for other keys that collided. |
| Separate key/value atomics | Allows a lock-free publish: first CAS the key to claim, then store the value. |
| `memory_order_acq_rel` on CAS | Ensures all prior writes by the winner are visible to all subsequent readers of the slot. |
| No memory reclamation needed | Because we never `free()` slots — the map grows, not shrinks per key. |
