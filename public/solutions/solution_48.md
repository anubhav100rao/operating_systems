# Solution 48: Crash Recovery in a Journaling Filesystem

## The Problem
What happens during crash recovery in a journaling filesystem?

---

## 💡 The Analogy: The Surgeon and the Whiteboard

**Pre-Journaling (The Chaos):**
Imagine a surgeon (the OS) replacing a heart in a patient (the Hard Drive). Suddenly, the hospital loses power mid-surgery, and the surgeon vanishes. The next day, a new surgeon arrives. To figure out if the patient is safe, the new surgeon must essentially scan the entire human body head-to-toe with a magnifying glass to check if any arteries were left unplugged (`fsck` - File System Check). This takes 8 hours.

**Journaling (The Whiteboard):**
Now, before the surgeon touches the patient, they write their exact plan on a whiteboard in the corner. 
1. "I am going to cut the artery. (Planned)"
2. "I am going to insert the valve. (Planned)"
3. **"COMMIT: I am officially starting."**

If power dies mid-surgery, the new surgeon the next day walks in, completely ignores the patient, and looks strictly at the tiny whiteboard.
*   If the whiteboard says "Planned" but has no "COMMIT", they know the surgeon never actually touched the patient. They erase the board (Discard).
*   If the whiteboard has a "COMMIT", but the surgery looks unfinished, they just read the steps on the board and legally finish the exact surgery described (Replay).
This takes 2 seconds.

---

## 🔬 Deep Dive: Write-Ahead Logging (WAL)

Journaling is the implementation of Write-Ahead Logging for filesystem metadata to prevent corruption. 

Creating a simple file "hello.txt" actually requires three distinct physical writes to separate sectors of the disk:
1.  **Block Bitmap:** Mark a data block as 'used'. 
2.  **Inode:** Allocate an inode and record file metadata (size, block pointers).
3.  **Directory Entry:** Add "hello.txt" to the parent directory pointing to the inode.

If a power failure kernel panic occurs between step 2 and 3, you have a "Ghost Inode"—space is marked used, the inode exists, but no filename points to it. This is a severe inconsistency.

### The Journaling Workflow

The filesystem dedicates a small, contiguous circular ring buffer on the disk called the **Journal** (or Log).

1.  **Journal Write:** The OS writes the intent to modify the Bitmap, Inode, and Directory Block into the Journal.
2.  **Commit Block:** Crucially, the OS issues an `fsync` equivalent to the hardware to ensure the journal writes are physically on disk. Once confirmed, it writes a tiny, single-sector **Commit Block** to the journal. The transaction is now atomic.
3.  **Checkpointing:** The OS slowly writes the actual data to the real Bitmap, Inode, and Directory sectors across the disk.
4.  **Free Journal:** Once checkpointing is complete, the journal space is marked as free.

### The Crash Recovery Process

When the server reboots after a hard crash, the OS refuses to mount the filesystem immediately. It invokes an automated recovery phase inside the kernel.

**Step 1: Scan the Journal**
The OS reads the small 128MB journal from start to finish. It looks for transaction sequences.

**Step 2: Undo (Discard Uncommitted)**
If the OS finds a transaction in the log (e.g., Transaction ID 405), but is missing the final Commit Block, it knows the crash happened while writing to the journal itself. It asserts that no data ever made it to the real disk (because checkpointing happens *after* the commit). The OS simply discards Transaction 405.

**Step 3: Redo (Replay Committed)**
If the OS finds a complete transaction (e.g., Transaction ID 406) WITH a Commit Block, it means the system crashed during Checkpointing. Some metadata might have been written to the real disk, some might not. 
Because the journal contains the *exact blocks* that were supposed to be written, the OS simply **re-executes** the writes linearly from the journal to the main disk. It overwrites whatever was there. (This operation is idempotent).

**Result:** In less than a second, the filesystem is restored to a mathematically perfect, consistent state, and the mount process resumes.

### Data Journaling vs. Ordered Mode
*   **Ordered Mode (Default in ext4):** Only *metadata* (inodes, bitmaps) is written to the journal. File content (the actual text in "hello.txt") is written straight to the disk *before* the metadata commit block. Protects filesystem structure, but heavily writing to a file during a crash might leave garbage at the end of the file.
*   **Data Journaling:** Both metadata AND the literal file content are written to the journal, and then copied again to the main disk. Provides 100% data integrity, but essentially cuts disk write speed in half.
