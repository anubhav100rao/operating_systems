# Problem 89: Design a Page Cache System

A page cache is the single most important performance optimization in a modern operating system. When you read a file, the kernel doesn't re-read it from the slow disk on every access. Instead, it stores file pages in unused RAM — the **page cache** — and serves future reads directly from blazing-fast memory.

## 1. The Analogy: The Hotel Concierge's Desk

Imagine a hotel concierge desk that handles information requests from guests.

*   **The Hotel Safe (Disk):** Incredibly authoritative, contains everything. Very slow to access (minutes). 
*   **The Concierge's Desk Binder (Page Cache):** A binder of the most frequently/recently requested information. Very fast. Fits 100 pages.
*   **Cache Hit:** "What's the WiFi password?" — The concierge instantly checks the binder: page is there! Returns it in 1 second.
*   **Cache Miss:** "What's Room 412's minibar price list?" — The concierge sends a bellhop to the safe, retrieves the document, adds a copy to the binder, and answers. This takes 5 minutes.
*   **Eviction:** The binder is full. The concierge looks at the LRU tab: the swimming pool timetable hasn't been asked about in 2 weeks. She removes it, making room for the new page.

## 2. Core Data Structures

```c
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#define PAGE_SIZE    4096
#define CACHE_PAGES  1024   // Total physical pages we manage in the cache

// ── Represents one 4KB cached page ───────────────────────────────────────────
typedef struct PageEntry {
    uint64_t         file_id;    // Which file (inode number or device ID)
    uint64_t         page_index; // Which 4KB chunk of the file (offset / PAGE_SIZE)
    uint8_t          data[PAGE_SIZE];
    bool             dirty;      // Has it been modified since being loaded from disk?
    uint32_t         ref_count;  // Number of active users (pin count)

    // For the LRU doubly-linked list
    struct PageEntry *lru_prev;
    struct PageEntry *lru_next;
} PageEntry;

// ── The page cache itself ─────────────────────────────────────────────────────
typedef struct {
    // Fast lookup: (file_id, page_index) -> PageEntry*
    // Uses a hash map (see solution_86.md for lock-free variant)
    PageEntry  *hash_table[CACHE_PAGES * 2]; // Simple open-addressing

    // LRU list for eviction
    PageEntry  *lru_head;  // Most recently used
    PageEntry  *lru_tail;  // Least recently used (eviction candidate)

    int         total_pages;
    int         used_pages;
} PageCache;
```

## 3. Core Operations

### Lookup

```c
// Returns cached page or NULL on a miss
PageEntry* page_cache_lookup(PageCache *cache, uint64_t file_id, uint64_t page_idx) {
    uint64_t slot = (file_id * 2654435761ULL ^ page_idx) % (CACHE_PAGES * 2);
    PageEntry *p = cache->hash_table[slot];
    if (p && p->file_id == file_id && p->page_index == page_idx) {
        // Cache hit! Bring to front of LRU list.
        lru_move_to_front(cache, p);
        p->ref_count++;
        return p;
    }
    return NULL;  // Cache miss
}
```

### Fill (On Cache Miss — Read-Through)

```c
PageEntry* page_cache_fill(PageCache *cache, uint64_t file_id, uint64_t page_idx) {
    // 1. Evict LRU page if cache is full
    if (cache->used_pages == cache->total_pages) {
        PageEntry *victim = cache->lru_tail;
        if (victim->dirty) {
            disk_write(victim->file_id, victim->page_index, victim->data);
        }
        hash_remove(cache, victim);
        lru_remove(cache, victim);
        cache->used_pages--;
        // Reuse the victim's memory block
    }

    // 2. Allocate a new page entry (or reuse victim's memory)
    PageEntry *p = alloc_page_entry();
    p->file_id    = file_id;
    p->page_index = page_idx;
    p->dirty      = false;
    p->ref_count  = 1;

    // 3. Read from disk (the slow path)
    disk_read(file_id, page_idx, p->data);

    // 4. Insert into hash map and LRU list
    hash_insert(cache, p);
    lru_insert_front(cache, p);
    cache->used_pages++;
    return p;
}
```

### Write (Write-Back pattern)

```c
void page_cache_write(PageCache *cache, uint64_t file_id, uint64_t page_idx,
                      const uint8_t *src, size_t offset, size_t len) {
    PageEntry *p = page_cache_lookup(cache, file_id, page_idx);
    if (!p) p = page_cache_fill(cache, file_id, page_idx);

    memcpy(p->data + offset, src, len);
    p->dirty = true;                 // Mark dirty; disk not updated yet!
    lru_move_to_front(cache, p);     // Recently written = recently used
    // Actual disk write deferred to:
    //   a) page_cache_flush() called explicitly
    //   b) The pdflush/writeback daemon running periodically
    //   c) Eviction time (if dirty, write before reuse)
}
```

## 4. Eviction Policies

| Policy | How it works | Best for |
| :--- | :--- | :--- |
| **LRU** (Linux default approx.) | Evict least recently accessed page | General workloads |
| **LFU** | Evict least frequently accessed page | Workloads with hot/cold data split |
| **Clock (Second Chance)** | Circular scan; evict page whose "accessed" bit is 0 | Fast approximation of LRU |
| **ARC** (macOS / ZFS) | Balances LRU and LFU dynamically | Mixed read/write, re-read heavy |

## 5. The `writeback` Daemon

The kernel's `pdflush` / `writeback` daemon (Linux: `bdi-default` per-device thread) periodically scans the page cache for dirty pages and flushes them to disk. It is triggered:
1. When dirty pages exceed **`dirty_ratio`** (e.g., 20% of total RAM).
2. After **`dirty_expire_centisecs`** milliseconds have passed since a page was first dirtied (default 30 seconds on Linux).
3. When an application calls `fsync()` explicitly.

This gives Linux its famous "write-back" behavior where writes appear instantaneous (hitting the cache) but actual disk writes happen asynchronously, batched for maximum I/O throughput.
