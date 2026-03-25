# Solution 50: Copy-on-Write Filesystems and Distributed Storage

## The Problem
Snapshotting via copy-on-write filesystems like ZFS. Design a distributed file system (like HDFS).

---

## Part 1: Snapshotting in ZFS (Copy-on-Write)

### 💡 The Analogy: Git Branching
If you have a 1GB codebase and you `git checkout -b feature`, Git doesn't physically copy 1GB of text files on your hard drive. It just creates a tiny pointer pointing to the current state of the files. The moment you edit one file (e.g., `main.c`), Git saves a new copy of *just* `main.c`, leaving all other files pointing to the shared original data. 
ZFS does this mathematically at the block level for your entire hard drive.

### 🔬 Deep Dive: ZFS Architecture
Traditional filesystems (ext4) overwrite data in-place. If you edit a file, the old block is permanently destroyed.

**ZFS uses a Copy-on-Write (CoW) Merkle Tree:**
1.  All data blocks are leaves of a massive tree. Above them are indirect blocks, culminating in a single root node: the **Uberblock**.
2.  When an application wants to overwrite Block A (which currently says "Hello"), ZFS *never overwrites it*.
3.  Instead, ZFS allocates a completely brand new, free block on the disk (Block B) and writes "Goodbye" there.
4.  ZFS then updates the parent pointer to point to Block B. Because the parent pointer changed, the parent block must be rewritten. This chains all the way up to the root Uberblock.

**How Snapshots Work Instantly:**
To take a snapshot in ZFS, you don't copy anything. 
The kernel simply takes the current Uberblock, labels it `@snapshot1`, and locks it in place (preventing it or any of its children from being added to the free-space list). 
When the system continues writing, entirely new blocks and a new Uberblock are created for the active filesystem. 
The snapshot perfectly preserves the exact disk state at that millisecond, taking exactly **0 bytes** of extra space upon creation, because the active filesystem and the snapshot 100% share the underlying physical blocks. Space is only consumed as the files diverge (active deletes blocks that the snapshot must retain).

---

## Part 2: Designing a Distributed File System (HDFS)

How do you store a 50 Terabyte log file when the biggest hard drive at Best Buy is 20 Terabytes? You build a distributed file system like the Hadoop Distributed File System (HDFS), pioneered by Google (GFS).

### System Architecture
The cluster consists of thousands of commodity (cheap, highly failure-prone) servers dynamically connected over a network. 

#### 1. The NameNode (The Master Brain)
There is only one NameNode (often with a standby). It contains absolutely **zero file data**. It exists strictly in RAM for lightning-fast lookups.
It maintains the massive lookup map:
*   File `logs.txt` $\rightarrow$ composed of `[Block_1, Block_2, Block_3]`
*   `Block_1` $\rightarrow$ located physically on `[DataNode_A, DataNode_F, DataNode_Z]`

#### 2. The DataNode (The Dumb Storage)
Thousands of worker machines. They do not know what a "file directory" or a "filename" is. They simply have huge hard drives that store raw chunks of binary data (Blocks) uniquely identified by UUIDs. They constantly send "Heartbeats" (I'm alive!) and "Block Reports" (Here is a list of blocks I currently hold) to the NameNode.

### Core Mechanics

**1. Massive Block Sizes**
Unlike ext4 which uses 4KB blocks, HDFS uses **128MB or 256MB blocks**. 
Why? Because network latency is terrible. Searching a NameNode for 4KB chunks for a 50TB file would crash the Master instantly. Massive blocks minimize metadata, turning the network architecture into a massive sequential-streaming engine rather than a random-access engine. 

**2. Fault Tolerance (Replication Factor)**
Commodity servers die constantly. Hard drives catch fire. HDFS assumes hardware failure is the norm.
When a client uploads a file, HDFS slices it into 128MB chunks. The NameNode instructs the client to write Block 1 to a specific DataNode. 
That DataNode pipelines the block to a second DataNode, which pipelines it to a third. 
**Replication Factor = 3.**
*   Replica 1: On the local rack.
*   Replica 2: On the same rack, different node.
*   Replica 3: On a completely different physical rack (switch-level fault tolerance).

**3. Self-Healing**
If Node F's motherboard fries, its Heartbeat stops. The NameNode detects the timeout. 
It looks in RAM and realizes: "Node F held Block 1. Block 1 is now under-replicated (only 2 copies exist: on A and Z)."
The NameNode instantly sends an instruction: "Node Z, send a copy of Block 1 to Node Q."
The cluster self-heals in the background without any human intervention, raising the replication factor back to 3.
