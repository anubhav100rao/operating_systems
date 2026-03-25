# Problem 90: Implement a Copy-on-Write Filesystem

Copy-on-Write (CoW) is the foundational design principle behind ZFS, Btrfs, APFS (macOS), and the snapshot/fork mechanism in many databases like PostgreSQL. It is also used in Docker image layers and virtual machine snapshotting.

Instead of modifying data in place, every change writes new data to a new, unused location and updates the metadata tree to point to the new blocks. Old blocks are never overwritten until no snapshot references them.

## 1. The Analogy: The Git Version Control System

*   **Traditional filesystem (overwrite-in-place):** Word 2003's "Save" button. The new content directly replaces the old file on disk. The original is gone forever.
*   **CoW filesystem:** Git. When you commit, Git never modifies the old files. Instead, it writes the new content as entirely new blob objects, updates the tree objects to point at them, creates a new commit that points to the new tree, and advances the branch pointer. Your entire history is perfectly preserved in old blobs.

## 2. The Core Data Structures

```
                      [Superblock]
                           │
                           ▼
              [Root Tree Node / Root Inode]
                    /               \
            [Dir Node]          [Dir Node]  
               /   \
        [File Inode] [File Inode]
              │
       [Data Block Pointers]
         /        \
   [Block 0]   [Block 1]     ← Actual 4KB data blocks
```

The filesystem is organized as a **B-Tree** (or similar) of nodes. Each node occupies exactly one 4KB block on disk.

```c
#define BLOCK_SIZE     4096
#define MAX_BLOCKS     65536   // 256MB toy filesystem

typedef uint32_t BlockID;
#define NULL_BLOCK  0   // Sentinel: block 0 = no block

// Generic tree node that can represent directories or file extents
typedef struct {
    uint32_t  magic;         // Validation magic number
    uint32_t  num_children;
    BlockID   children[127]; // Children: data blocks or other tree nodes
    // For directories, child metadata is stored here too (name, inode id)
} TreeNode;

typedef struct {
    uint64_t  file_size;
    uint64_t  inode_id;
    uint32_t  ref_count;   // Number of snapshots referencing this inode
    BlockID   root_block;  // Points to the root TreeNode for this file's data
} Inode;

typedef struct {
    BlockID   root_inode_block;  // Where the root directory inode lives
    uint64_t  generation;        // Increments on every transaction commit
    uint64_t  total_blocks;
    uint64_t  free_blocks;
} Superblock;
```

## 3. The CoW Write Path (The Key Insight)

The defining property of a CoW filesystem is that **modifying a block never overwrites it** — it always allocates a new block and propagates the change upward through the tree.

```c
// Simplified CoW write: update byte range in a file
BlockID cow_write_block(BlockID old_block, const uint8_t *new_data, 
                        BlockAlloc *alloc) {
    // 1. Allocate a completely fresh, unused block
    BlockID new_block = alloc_new_block(alloc);
    
    // 2. Copy the old block's content into the new block
    uint8_t buf[BLOCK_SIZE];
    disk_read(old_block, buf);
    
    // 3. Apply mutations to the in-memory copy
    memcpy(buf, new_data, BLOCK_SIZE); 
    
    // 4. Write the modified content to the BRAND NEW location
    disk_write(new_block, buf);
    
    // The old block is NOT freed yet — snapshots may still reference it!
    return new_block;  // The caller updates its pointer to use new_block
}
```

**The propagation (the "cascade" up the tree):**
When a single data block changes, the B-tree node pointing to it must also be rewritten (to update the child pointer to the new block). This makes the B-tree node itself a new block. Now its parent must be rewritten... and so on all the way up to the Root and Superblock.

```
Before Write:                   After CoW Write to Block X:
                                                            
SuperBlock ──► Root              NewSuperBlock ──► NewRoot
              │                                    │
              ├─► Dir1           (Old root and     ├─► NewDir  ──► NewInodeA
              │     └─► InodeA   dir still exist   │               └─► NewBlock X'
              │           └─► Block X              │
              └─► Dir2           for snapshots)    └─► Dir2 (SHARED! unchanged)
                    └─► InodeB
```

## 4. Atomic Snapshots in O(1)

The breathtaking beauty of CoW: creating a snapshot is **instantaneous**.

```c
Snapshot create_snapshot(Superblock *sb) {
    Snapshot snap;
    snap.root_inode_block = sb->root_inode_block; // Just copy the pointer!
    snap.generation       = sb->generation;
    return snap; // Done. Zero disk writes needed.
}
```

Because data is never modified in place, after a snapshot is captured, any subsequent file system write creates new blocks on new disk locations. The snapshot's `root_inode_block` still points to the original tree of blocks, which is perfectly preserved and untouched. Reference counting on blocks prevents premature freeing.

## 5. Reference Counting for Block Reclamation

To know when an old block is truly safe to free, each block has a reference count. When a block's count drops to zero (no snapshot or live inode references it), it is added back to the free block pool.

```c
void free_block_if_unreferenced(BlockID blk, RefCountTable *rct) {
    rct->counts[blk]--;
    if (rct->counts[blk] == 0) {
        // No snapshot or live inode points here anymore; safe to reuse
        free_block(blk, alloc);
    }
}
```

*This is precisely how ZFS "destroy snapshot" works — it walks the snapshot's B-tree, decrements reference counts, and lazily recycles blocks.*
