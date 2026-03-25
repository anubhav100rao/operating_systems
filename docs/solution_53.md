# Problem 53: Zero-copy Techniques: `sendfile` and `mmap`

When building high-throughput applications like web servers (Nginx) or message brokers (Kafka), the primary operation is often taking a file from a hard drive and sending it out over a network socket. 

## 1. The Analogy: The Inefficient Delivery Warehouse

*   **Traditional I/O (`read` + `write`):** A forklift takes a pallet from the loading dock truck (Disk) and moves it into the Kernel Warehouse. A worker then painfully unpacks the entire pallet, walks into the Manager's Office (User Space), drops the boxes on the floor, realizes they don't need to change anything, picks the boxes back up, carries them *back* out to the Kernel Warehouse, and puts them on the outbound FedEx truck (Network Card).
*   **Zero-Copy (`sendfile`):** The manager stays in the office. They yell out the window to the forklift driver: "Take pallet #54 from the inbound truck and drop it directly onto the outbound FedEx truck!" The boxes never enter the office.

## 2. The Traditional Approach (4 Context Switches, 4 Data Copies)

```c
char buf[1024];
read(file_fd, buf, 1024);
write(socket_fd, buf, 1024);
```
**Step-by-step overhead:**
1.  **Syscall `read()`:** Context switch from User to Kernel.
2.  **DMA Copy 1:** Hardware DMA copies data from the Hard Drive to the Kernel Page Cache.
3.  **CPU Copy 2:** The CPU explicitly copies the data from the Kernel Page Cache into the `buf` array in User Space.
4.  **Syscall Return:** Context switch from Kernel back to User Space.
5.  **Syscall `write()`:** Context switch from User back to Kernel.
6.  **CPU Copy 3:** The CPU explicitly copies the data from the user `buf` array into the Kernel Socket Buffer.
7.  **Syscall Return:** Context switch Kernel to User.
8.  **DMA Copy 4:** The Network Interface Card (NIC) uses DMA to copy the data from the Socket Buffer to the hardware wire.

All that copying burns CPU cycles, saturates the memory bus, and thrashes the CPU caches.

## 3. The `mmap` Approach (4 Context Switches, 3 Data Copies)

Instead of `read()`, we map the file directly into virtual memory.
```c
char *buf = mmap(NULL, 1024, PROT_READ, MAP_PRIVATE, file_fd, 0);
write(socket_fd, buf, 1024);
```
**How it improves things:**
The `mmap` call creates a Page Table entry mapping the User Space `buf` pointer *directly* to the physical memory of the Kernel Page Cache. 
*   **Saved Copy:** The CPU Copy 2 (Kernel to User) is eliminated. The application can read the file data directly from the kernel cache.
*   **Drawback:** Still requires a CPU copy into the Socket Buffer on `write()`. Still requires 4 expensive mode context switches. Additionally, if the file is truncated by another process while you are reading the `mmap` buffer, your process will crash with a `SIGBUS` signal.

## 4. The `sendfile` Approach (The True Zero-Copy)

```c
off_t offset = 0;
sendfile(socket_fd, file_fd, &offset, 1024);
```
**How it works (2 Context Switches, 2 DMA Copies, 0 CPU Copies):**
1.  **Syscall `sendfile()`:** Context switch User to Kernel.
2.  **DMA Copy 1:** Disk controller DMAs data into Kernel Page Cache.
3.  **The Magic:** With hardware support (Scatter-Gather DMA on modern NICs), the kernel does *not* copy the data into the socket buffer. It simply appends a tiny "descriptor" (containing the memory address and length of the data in the Page Cache) to the socket buffer queue.
4.  **DMA Copy 2:** The NIC reads the descriptor, and directly DMAs the payload out of the Kernel Page Cache onto the network wire.
5.  **Syscall Return:** Context switch back to User Space.

**When and Why it's Faster:**
*   **Why:** It completely eliminates the CPU from processing the payload. The CPU never touches a single byte of the file data. It also eliminates 2 entirely unnecessary context switches by keeping the logic purely in kernel space. Data moves from Hardware -> RAM -> Hardware.
*   **When to use:** Serving static HTML/Images, or streaming massive files where the user-space application doesn't need to decrypt, encrypt, or actively modify the contents natively before sending. If you need TLS encryption (HTTPS), traditionally `sendfile` doesn't work because user-space `OpenSSL` needs the data, though modern Linux `kTLS` (Kernel TLS) fixes this.
