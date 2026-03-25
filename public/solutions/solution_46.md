# Solution 46: Inode Structure and Links

## The Problem
Inode structure in detail. Soft links vs hard links (edge cases).

---

## 💡 The Analogy: The Library Card Catalog

Imagine a file system is a giant, chaotic library.
*   **The Inode (Index Node):** This is the physical index card in the wooden card catalog. It contains all the metadata about a book: the author, publication date, permissions (can it be checked out?), and explicitly lists the *exact shelf numbers* where the pages of the book are stored. 
*   **The Filename (Directory Entry):** This is simply a sticky note stuck on a wall that says "Harry Potter -> Card #542". The filename itself contains zero data about the file, it just points to the inode.
*   **The Data Blocks:** The actual pages of the book sitting on the shelves.

---

## 🔬 Deep Dive: The Inode Structure

An inode is a fixed-size data structure (often 256 bytes in ext4) stored in an "inode table" on the disk. It tracks every detail about a file **except its filename**.

### Core Fields of an Inode (POSIX `struct stat`)
1.  **File Mode:** Type (file, directory, socket, symlink) and Permissions (rwx).
2.  **Ownership:** User ID (UID) and Group ID (GID).
3.  **Size:** Total size of the file in bytes.
4.  **Timestamps:** 
    *   `atime`: Last Access time.
    *   `mtime`: Last Modification time (data was changed).
    *   `ctime`: Last Status Change time (inode metadata was changed, e.g., permissions).
5.  **Link Count:** How many filenames strictly point to this exact inode.
6.  **Data Pointers (The most critical part):**
    *   *Classic Ext2/3 approach:* 15 pointers. The first 12 point directly to physical data blocks. Pointer 13 is a "Singly Indirect Block" (points to a block filled with more pointers). Pointer 14 is "Doubly Indirect". Pointer 15 is "Triply Indirect" (allowing for multi-terabyte files).
    *   *Modern Ext4 approach:* Uses **Extents**. Instead of pointing to 1,000 individual blocks for a 4MB file, it stores a single Extent tree node `[Start Block: 1000, Length: 1000]`. This drastically reduces metadata for large sequential files.

---

## 🔗 Hard Links vs. Soft Links

Because a "Filename" is just an entry mapping a string to an Inode ID, we can manipulate this mapping to create links.

### Hard Links
A Hard Link simply creates a second directory entry (a second sticky note) that points to the **exact same underlying Inode ID**.

```bash
touch original.txt
ln original.txt hardlink.txt
```
*   **What happens:** The kernel looks up `original.txt`, finds it is Inode `12345`. It creates a new directory entry "hardlink.txt" and maps it to Inode `12345`. It increments the `link_count` inside Inode `12345` to `2`.
*   **The "Delete" Edge Case:** If you run `rm original.txt`, the OS deletes that specific directory entry and decrements the `link_count` to `1`. **The data is not deleted.** The file will continue to exist perfectly via `hardlink.txt`. The OS actually only deletes data blocks when `link_count == 0` AND all file descriptors to the file are closed.
*   **The Filesystem Edge Case:** You **cannot** hard link across different partitions or hard drives. Inode `12345` on `/dev/sda` is completely meaningless on `/dev/sdb`.
*   **The Directory Edge Case:** You **cannot** hard link directories (except the kernel managing `.` and `..`). If a user hard-linked a parent directory into a child directory, `find` or `fsck` would get caught in an infinite recursive loop traversing the graph.

### Soft (Symbolic) Links
A Soft Link is a brand new file with a distinct Inode, but its data content is just a text string of a path to another file.

```bash
ln -s original.txt softlink.txt
```
*   **What happens:** The kernel creates Inode `99999` for `softlink.txt`. It marks the File Mode as "Symlink". Inside the data blocks for Inode `99999`, it writes the literal text string `"original.txt"`.
*   **The "Delete" Edge Case:** If you `rm original.txt`, `original.txt` is destroyed. `softlink.txt` survives, but its text string now points to nothing. It is a "dangling link" and trying to `cat` it will throw a "No such file or directory" error.
*   **Capabilities:** Because it's just a text path, soft links can bridge across entirely different hard drives, filesystems, and network mounts, and they can freely link to directories.
