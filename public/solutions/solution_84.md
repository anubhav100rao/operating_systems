# Solution 84: Build an Async Runtime (Node.js / Event Loop)

## The Problem
Build an async runtime (like Node.js event loop).

---

## 💡 The Analogy: The Single Restaurant Waiter

A traditional blocking server is like a restaurant where every waiter takes one table's order, sprints to the kitchen, stands there for 20 minutes while the food is cooked (I/O wait), then runs back. With 50 tables, you need 50 waiters.

An async runtime with an event loop is the **single incredibly efficient maître d'**. He takes Table 1's order and puts a ticket in the kitchen window (initiates an async I/O). He immediately spins around and takes Table 2's order (another async I/O). Then Table 3's. He keeps circling the room.

When the kitchen window opens and food is ready (I/O completion event), he is notified, picks up the plate, and delivers it. He handles 50 tables at once with zero waiting, because he *never stands still*.

---

## 🔬 Architecture Deep Dive

An Async Runtime is the backbone of Node.js, Python's asyncio, and the Tokio library in Rust. They are all variants of the same core pattern.

### The Four Building Blocks

#### 1. The Event Queue
A FIFO queue holding **Callbacks** or **Futures/Promises** that are ready to be executed. In Node.js, this is split into multiple priority phases (timers, I/O callbacks, `setImmediate`, close events), following libuv's phases.

#### 2. The Event Loop (The Heartbeat)
A single-threaded `while(true)` infinite loop that:
1.  Checks if there are any expired timers (setTimeout, setInterval). If yes, runs them.
2.  Blocks (sleeps!) on `epoll_wait(-1)` — listening for I/O completion events on any registered file descriptor. The `-1` timeout means it sleeps indefinitely until something happens, using **zero CPU**.
3.  Upon `epoll_wait` returning (a file descriptor is readable/writable), it enqueues the associated callback into the Event Queue.
4.  Drains the Event Queue one callback at a time.
5.  Repeats.

#### 3. The OS I/O Poller (`epoll` / `kqueue` / `io_uring`)
This is the raw hardware-OS interface. It maintains a kernel-side interest list of file descriptors (network sockets, file handles) that we care about. When data arrives on a socket, the kernel updates the ready list and unblocks the `epoll_wait` call — at zero CPU cost while waiting.

#### 4. The Thread Pool (libuv's secret)
`epoll` is fantastically efficient for network sockets, because the kernel tells us when data arrives. However, the Linux kernel **does not support async notifications for regular file I/O** in a portable manner. 

Node.js's underlying library (libuv) secretly maintains a small thread pool (4 threads by default). Any operation that uses blocking disk I/O (e.g., reading a 5GB video file) is offloaded to this thread pool. When the thread pool thread finishes the `read()`, it enqueues the result callback back onto the main event loop's queue. To the JavaScript code, it is seamlessly `await fs.readFile(...)`.

### The Critical Rule: Never Block the Event Loop
Because there is only one JavaScript thread, if a callback runs an infinite loop (`while(true)`) or an extremely long synchronous computation (e.g., `bcrypt` a million passwords), **zero other requests can be processed**. The single maître d' is frozen. This is the event-loop equivalent of a Head-of-Line Blocking problem.

---

## 💻 Code Example: A Minimal Async Runtime in Python

```python
import heapq
import select
import time
from collections import deque

class EventLoop:
    """A minimal single-threaded async event loop."""
    
    def __init__(self):
        self._ready_callbacks = deque()         # Tasks ready to run right now
        self._scheduled_timers = []            # (deadline, callback) heap
        self._io_watchers: dict = {}           # fd -> callback for I/O events
    
    def call_soon(self, callback):
        """Schedule a callback to run in the next loop iteration."""
        self._ready_callbacks.append(callback)
    
    def call_later(self, delay: float, callback):
        """Schedule a callback to run after 'delay' seconds."""
        deadline = time.monotonic() + delay
        heapq.heappush(self._scheduled_timers, (deadline, callback))
    
    def add_reader(self, fd, callback):
        """Register interest in a file descriptor being readable."""
        self._io_watchers[fd] = callback
    
    def remove_reader(self, fd):
        self._io_watchers.pop(fd, None)
    
    def run_forever(self):
        """The main event loop. Runs until stop() is called."""
        while True:
            # 1. Fire all immediately-ready callbacks
            while self._ready_callbacks:
                cb = self._ready_callbacks.popleft()
                cb()
            
            # 2. Check for expired timers
            now = time.monotonic()
            while self._scheduled_timers and self._scheduled_timers[0][0] <= now:
                _, cb = heapq.heappop(self._scheduled_timers)
                cb()
            
            # 3. Calculate how long we can safely sleep (until next timer)
            timeout = None
            if self._scheduled_timers:
                timeout = max(0, self._scheduled_timers[0][0] - time.monotonic())
            
            # 4. Block on I/O using select() (epoll equivalent for this demo)
            # This is the key: the loop SLEEPS here, consuming ZERO CPU
            fds = list(self._io_watchers.keys())
            if fds:
                readable, _, _ = select.select(fds, [], [], timeout)
                for fd in readable:
                    cb = self._io_watchers.pop(fd)
                    self._ready_callbacks.append(cb)
            elif timeout:
                time.sleep(timeout)

# --- Demo: Simulating async "I/O" with sockets ---
import socket

loop = EventLoop()

def handle_connection(conn):
    data = conn.recv(1024)
    if data:
        conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello")
    conn.close()

def accept_connection(server_sock):
    conn, addr = server_sock.accept()
    conn.setblocking(False)
    print(f"New connection from {addr}")
    # Register the new connection for reading
    loop.add_reader(conn.fileno(), lambda: handle_connection(conn))
    # Re-register the server to accept more connections
    loop.add_reader(server_sock.fileno(), lambda: accept_connection(server_sock))

# Create a non-blocking server socket
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(('127.0.0.1', 8888))
server.listen(10)
server.setblocking(False)

loop.add_reader(server.fileno(), lambda: accept_connection(server))
print("Listening on :8888")
loop.run_forever()
```
