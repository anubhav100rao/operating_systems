# Problem 92: Build a Custom Memory Allocator (jemalloc-style)

`malloc` and `free` are the most called functions in most C programs. The default `glibc` allocator (`ptmalloc2`) has well-known weaknesses in multi-threaded systems: a single global lock causes severe lock convoying. `jemalloc` (used by Facebook, Firefox, FreeBSD) and `tcmalloc` (used by Google) were designed to fix this.

## 1. The Analogy: The Office Supply Closet

*   **glibc `ptmalloc2`:** One central supply closet with a single lock. Every employee (thread) who needs a pen must queue at the closet, grab one, and walk back. At peak hours (high multi-thread load), enormous queues form.
*   **jemalloc / tcmalloc style:** Every employee has a small personal drawer in their desk (**Thread Cache**). For common items (small allocations), they grab from their own drawer instantly — no waiting, no locks. Only when their drawer runs empty do they bulk-restock from the central closet. The central closet is visited far less often, drastically reducing contention.

## 2. The Three-Tier Architecture

```
Thread Request: malloc(32)
     │
     ▼
┌─────────────────────────────┐
│ Tier 1: Thread Cache (TLS)  │  ← Per-thread, lock-free, O(1)
│  "Small bin for 32B objects" │
│  [ptr] → [ptr] → [ptr]      │
└──────────┬──────────────────┘
           │ Cache empty? refill from ↓
           ▼
┌─────────────────────────────┐
│ Tier 2: Arena / Size Class  │  ← Per-CPU arena, short-lived lock
│  Manages "slabs" (2MB runs)  │
│  of same-sized objects       │
└──────────┬──────────────────┘
           │ Arena out of slabs? request from ↓
           ▼
┌─────────────────────────────┐
│ Tier 3: OS (mmap/brk)       │  ← System call, slowest path
│  Returns large page-aligned  │
│  memory regions              │
└─────────────────────────────┘
```

## 3. Size Classes and Slabs

jemalloc bins objects into discrete **size classes** (e.g., 8, 16, 32, 48, 64, 80, 96, 128... bytes). Every allocation is rounded up to the next size class. This eliminates external fragmentation entirely for small objects.

A **slab** (or "run" in jemalloc terminology) is a 64KB to 2MB chunk of memory managed entirely for one size class. It contains a bitmap indicating which slots are free.

```c
// Simplified slab for 32-byte objects within a 4096-byte page
#define SLAB_SIZE   4096
#define OBJ_SIZE      32
#define SLAB_CAPACITY (SLAB_SIZE / OBJ_SIZE)  // 128 objects

typedef struct Slab {
    uint8_t    data[SLAB_SIZE];
    uint64_t   free_bitmap[2];  // 128-bit bitmap (1 = free)
    struct Slab *next;
} Slab;

void* slab_alloc(Slab *slab) {
    // Find the first set bit (free object) using a hardware bit-scan instruction
    int idx = __builtin_ctzll(slab->free_bitmap[0]);  // Count trailing zeros
    if (idx >= 64) {
        idx = __builtin_ctzll(slab->free_bitmap[1]) + 64;
    }
    if (idx >= SLAB_CAPACITY) return NULL;  // Slab is full

    // Clear the bit (mark slot as allocated)
    if (idx < 64) slab->free_bitmap[0] &= ~(1ULL << idx);
    else          slab->free_bitmap[1] &= ~(1ULL << (idx - 64));

    return slab->data + idx * OBJ_SIZE;
}

void slab_free(Slab *slab, void *ptr) {
    int idx = ((uint8_t *)ptr - slab->data) / OBJ_SIZE;
    // Set the bit (mark slot as free)
    if (idx < 64) slab->free_bitmap[0] |= (1ULL << idx);
    else          slab->free_bitmap[1] |= (1ULL << (idx - 64));
}
```

## 4. Thread-Local Cache (Lock-Free Fast Path)

The per-thread cache holds a small free-list of recently freed objects for each size class.

```c
// Thread-local state — one per OS thread, no locking needed!
typedef struct {
    void *free_list[32]; // LIFO stack of free pointers for this size class
    int   count;
} TCachebin;

// Each thread has its own array of bins, one per size class
static __thread TCachebin tcache[NUM_SIZE_CLASSES];

void* tc_alloc(size_t size) {
    int sc = size_to_class(size);  // Round up to nearest size class index
    TCachebin *bin = &tcache[sc];

    if (bin->count > 0) {
        // ⚡ Fast path: no lock, no syscall, O(1)
        return bin->free_list[--bin->count];
    }

    // Slow path: refill from arena (involves a short lock)
    return arena_alloc(sc);
}

void tc_free(void *ptr, size_t size) {
    int sc = size_to_class(size);
    TCachebin *bin = &tcache[sc];

    if (bin->count < 32) {
        // ⚡ Fast path: just push onto the local LIFO stack
        bin->free_list[bin->count++] = ptr;
        return;
    }

    // Slow path: flush half the cache back to the arena
    arena_bulk_free(bin->free_list, 16, sc);
    bin->count -= 16;
    bin->free_list[bin->count++] = ptr;
}
```

## 5. Large Allocation Path

For objects larger than ~32KB (configurable), jemalloc skips the slab system entirely and calls `mmap(MAP_ANONYMOUS)` directly for each allocation. These are tracked in a separate red-black tree indexed by their address, allowing `O(log N)` lookup during `free()` to find the total size to unmap.

## 6. Outcomes vs. glibc ptmalloc2

| Metric | glibc ptmalloc2 | jemalloc |
| :--- | :--- | :--- |
| **Multi-thread contention** | High (global lock) | Low (per-thread cache) |
| **Fragmentation** | High (variable bins) | Low (exact size classes) |
| **RSS Blowup** | Common (arena hoarding) | Mitigated (decay-based purging) |
| **`free()` complexity** | `O(log N)` | `O(1)` for small (tcache hit) |
