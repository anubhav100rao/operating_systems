# Problem 51: Blocking vs. Non-Blocking I/O (Kernel Mechanics)

Handling input and output (network sockets, files, pipes) is the primary bottleneck in any high-performance application. System developers must choose how their application behaves when data isn't ready yet.

## 1. The Analogy: The Coffee Shop

*   **Blocking I/O:** You walk up to the barista, order a cappuccino, and stand perfectly still at the cash register staring at the barista until the drink is made. You do absolutely nothing else. Meanwhile, the line of customers behind you grows, but the register is blocked.
*   **Non-Blocking I/O:** You walk up to the barista, order a cappuccino, and ask "Is it ready?" They say "No." You immediately step aside, sit down, and read a book (doing other work). Every 2 minutes, you walk back to the register and ask "Is it ready now?" (Polling). 

*(Note: Asynchronous I/O, which is advanced, is when the barista hands you a buzzer that forcefully interrupts your reading when the coffee is done).*

## 2. Blocking I/O (The Default Mechanism)

By default in Linux, all file descriptors (FDs) are blocking.

**The Scenario:** A server thread calls `read()` on a TCP socket, but the client hasn't sent any packets yet.

**Kernel Mechanics:**
1.  **System Call:** The thread enters kernel mode via the `read()` syscall.
2.  **Buffer Check:** The kernel networking stack looks at the socket's internal receive buffer (`sk_buff`). It's empty.
3.  **State Change:** The kernel decides this thread cannot make progress. It changes the thread's state from `TASK_RUNNING` to `TASK_INTERRUPTIBLE` (or `TASK_UNINTERRUPTIBLE` depending on the device).
4.  **Wait Queue:** The kernel removes the thread from the CPU's active run-queue and places it onto a specific "Wait Queue" attached to that socket.
5.  **Context Switch:** The CPU is handed to another thread to do useful work. The original thread consumes zero CPU cycles while asleep.
6.  **The Wakeup:** Milliseconds later, the Network Interface Card (NIC) receives a packet. It triggers a hardware interrupt. The kernel interrupt handler copies the packet into the socket's buffer and then iterates through the socket's Wait Queue, changing the sleeping thread's state back to `TASK_RUNNING` and putting it back on the CPU scheduling queue.

**Pros/Cons:** Very simple to program. Very bad for concurrency, because handling 10,000 connections requires 10,000 OS threads (which consumes gigabytes of RAM just for thread stacks).

## 3. Non-Blocking I/O

You can configure a file descriptor to be non-blocking using `fcntl()` with the `O_NONBLOCK` flag.

**The Scenario:** A single-threaded server calls `read()` on a non-blocking TCP socket, and no data is ready.

**Kernel Mechanics:**
1.  **System Call:** The thread enters kernel mode via `read()`.
2.  **Buffer Check:** The kernel looks at the receive buffer. It's empty.
3.  **Immediate Return:** Because the `O_NONBLOCK` flag is set, the kernel *refuses* to put the thread to sleep. It does not touch the wait queues.
4.  **Error Code:** The kernel immediately returns to user-space, returning a value of `-1` from the `read()` call, and magically sets the global `errno` variable to `EAGAIN` or `EWOULDBLOCK` ("The resource is temporarily unavailable, try again later").
5.  **User Space Logic:** The application thread sees `EAGAIN`, knows the socket is empty, and can immediately move on to check a different socket or do math calculations.

**Pros/Cons:** Allows a single thread to juggle thousands of connections. However, blindly looping and calling `read()` on 10,000 non-blocking sockets over and over (Busy Wait) will peg the CPU to 100% usage needlessly. This requires an event-notification multiplexer like `epoll` (see Problem 52).

## 4. Code Example (C)

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    // Add the non-blocking flag to the descriptor
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main() {
    int sockfd = /* ... setup connected socket ... */;
    
    // Switch to non-blocking mode
    set_nonblocking(sockfd);
    
    char buffer[1024];
    while (1) {
        // This read() will NOT freeze your application
        ssize_t bytes_read = read(sockfd, buffer, sizeof(buffer));
        
        if (bytes_read > 0) {
            printf("Got data! %s\n", buffer);
            break;
        } else if (bytes_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Normal expected behavior when empty
                printf("Socket empty, doing other useful work...\n");
                sleep(1); // Simulate doing something else
            } else {
                perror("Fatal socket error");
                break;
            }
        } else {
            printf("Connection closed by peer.\n");
            break;
        }
    }
    return 0;
}
```
