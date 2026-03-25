# Solution 97: Can Two Processes Share Memory Safely? How?

## The Problem
Can two processes share memory safely? How?

---

## 💡 The Analogy: The Shared Whiteboard with a Turn Marker

Two coworkers (processes) work across the room from each other. There is one shared whiteboard between them. 
If both run up and start writing at the same time, the result is illegible scribbles (a data race). 
They establish three rules:
1.  They use a magnetic token on the board — whoever holds the token can write.
2.  If you need to write, grab the token first. If it is on the board, pick it up (acquire the lock). If someone else is holding it, wait your turn.
3.  When done writing, put the token back on the board (release the lock).

**This is Shared Memory + a Synchronization Primitive.** Sharing is safe. Sharing *without* any coordination is not.

---

## 🔬 Deep Dive: Mechanisms for Shared Memory

Normally, every process gets a completely isolated virtual address space. The OS and MMU guarantee that Process A cannot read or write Process B's memory. However, there are OS-provided escape hatches to intentionally share physical frames between processes.

### Method 1: POSIX Shared Memory (`shm_open` + `mmap`)

This is the modern, recommended approach.

**How it works at the kernel level:**
1.  Process A calls `shm_open("/my_shm", O_CREAT|O_RDWR, 0666)`. The kernel creates an "anonymous file" backed entirely by the Tmpfs filesystem (RAM) and returns a file descriptor.
2.  Process A calls `ftruncate(fd, 4096)` to set its size to 4KB.
3.  Process A calls `mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0)`. The kernel creates a VMA and maps the physical RAM frames of the shared memory object into Process A's virtual address space.
4.  Process B opens the same `/my_shm` name and also calls `mmap`. The kernel maps the **exact same physical RAM frames** into Process B's virtual address space at a (likely different) virtual address.

Both processes now write to different virtual addresses that resolve to the **same physical DRAM cells**. A CPU write from Process A is instantly visible to Process B.

### Method 2: Anonymous `mmap` with `MAP_SHARED` after `fork()`

When a parent uses `mmap(MAP_SHARED | MAP_ANONYMOUS)` to allocate a region **before** calling `fork()`, the child inherits the mapping. Critically, because it is `MAP_SHARED` (not `MAP_PRIVATE`), writes by the child are directly visible to the parent without any CoW copy. This is a simple parent-child communication channel.

### Method 3: `shmget` / `shmat` (System V Shared Memory — Legacy)

An older POSIX API. Functionally identical but uses numeric keys instead of filenames. Widely used in old database systems like PostgreSQL (for its `pg_shmem` segment).

---

## ⚠️ The Critical Part: Thread Safety Between Processes

Sharing physical memory is the easy part. **Preventing data corruption is the hard part.**

Because the two processes run on potentially different CPU cores simultaneously, you *must* use synchronization primitives placed inside the shared region itself, initialized with **`PTHREAD_PROCESS_SHARED`**.

Standard mutexes and condition variables default to process-private (faster, but only work within one process). To work across process boundaries, they must be explicitly configured:

```c
pthread_mutexattr_t attr;
pthread_mutexattr_init(&attr);
// This is the key setting that makes the mutex live in shared memory
pthread_mutexattr_setpshared(&attr, PTHREAD_PROCESS_SHARED);
pthread_mutex_init(shared_mutex_ptr, &attr);
```

---

## 💻 Code Example: A Full POSIX Shared Memory Example

### Process A (Writer/Server)
```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <pthread.h>
#include <unistd.h>
#include <string.h>

#define SHM_NAME "/example_shm"
#define BUF_SIZE 256

typedef struct {
    pthread_mutex_t mutex;   // Must be in shared memory!
    char data[BUF_SIZE];
    int  data_ready;
} SharedRegion;

int main() {
    // 1. Create shared memory object
    int fd = shm_open(SHM_NAME, O_CREAT | O_RDWR, 0666);
    ftruncate(fd, sizeof(SharedRegion));

    // 2. Map it into our address space
    SharedRegion *shm = mmap(NULL, sizeof(SharedRegion),
                             PROT_READ | PROT_WRITE,
                             MAP_SHARED, fd, 0);

    // 3. Initialize the mutex WITH the PROCESS_SHARED attribute
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_setpshared(&attr, PTHREAD_PROCESS_SHARED);
    pthread_mutex_init(&shm->mutex, &attr);
    shm->data_ready = 0;

    // 4. Write data safely
    pthread_mutex_lock(&shm->mutex);
    strncpy(shm->data, "Hello from Process A!", BUF_SIZE);
    shm->data_ready = 1;
    pthread_mutex_unlock(&shm->mutex);

    printf("Process A: wrote data. Sleeping to let Process B read.\n");
    sleep(5);

    // 5. Cleanup
    pthread_mutex_destroy(&shm->mutex);
    munmap(shm, sizeof(SharedRegion));
    shm_unlink(SHM_NAME);  // Remove the shm name from the filesystem
    return 0;
}
```

### Process B (Reader/Client)
```c
#include <stdio.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <pthread.h>

#define SHM_NAME "/example_shm"
#define BUF_SIZE 256

typedef struct {
    pthread_mutex_t mutex;
    char data[BUF_SIZE];
    int  data_ready;
} SharedRegion;

int main() {
    // 1. Open the existing shared memory object (no O_CREAT)
    int fd = shm_open(SHM_NAME, O_RDWR, 0666);

    // 2. Map the same physical frames into THIS process's address space
    SharedRegion *shm = mmap(NULL, sizeof(SharedRegion),
                             PROT_READ | PROT_WRITE,
                             MAP_SHARED, fd, 0);

    // 3. Safely read from shared memory using the cross-process mutex
    pthread_mutex_lock(&shm->mutex);
    if (shm->data_ready) {
        printf("Process B: read '%s'\n", shm->data);
    }
    pthread_mutex_unlock(&shm->mutex);

    munmap(shm, sizeof(SharedRegion));
    return 0;
}
```

**Compile and run:**
```bash
gcc process_a.c -o proc_a -lpthread -lrt
gcc process_b.c -o proc_b -lpthread -lrt
./proc_a &  # Start writer in background
./proc_b    # Read from shared memory
```
