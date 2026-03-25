# Problem 52: `select()` vs `poll()` vs `epoll()` and Edge vs Level Triggering

When handling Non-Blocking I/O, you cannot blindly loop over 10,000 sockets checking if they have data. You need the OS to tell you *which* specific sockets are ready. This is I/O Multiplexing. Linux provides three generations of this capability.

## 1. The Analogy: The Exam Proctor

Imagine a teacher (the server thread) supervising 1,000 students (the sockets) taking a test. She needs to collect the tests as soon as a student finishes.

*   **`select()` and `poll()`:** The teacher walks up to Student 1: "Are you done?" (No). Student 2: "Are you done?" (No). She walks down the line of all 1,000 students. Only 3 were done. She takes 5 minutes to rest, and then starts asking all 1,000 students again, even the slow ones. This does not scale.
*   **`epoll()`:** The teacher sits at her desk at the front of the room. She tells the students: "When you finish, walk up here and put your test in this basket." She only looks at the basket. If there are 3 tests in the basket, she guarantees those 3 students are done without having to ask the other 997. This scales massively.

## 2. `select()` (The Ancient One)

The oldest multiplexer (POSIX standard).
*   **How it works:** You give it three arrays of bits (`fd_set`): one for reading, writing, and errors. The kernel loops over every single bit you gave it, checks the corresponding socket, modifies the bit array in-place, and copies it back to user-space.
*   **The Flaws:** 
    1. Hard limit: Max of 1024 file descriptors (set by `FD_SETSIZE`).
    2. Modifies arrays in place; you must recreate the bit array on every single loop iteration.
    3. Performance is `O(N)`. If you monitor 1,000 sockets but only 1 is active, the kernel still checks 1,000 sockets. It also copies massive arrays across user/kernel space on every call.

## 3. `poll()` (The Slight Upgrade)

Created to fix `select()`'s flaws without rewriting the paradigm.
*   **How it works:** Instead of bit arrays, you pass an array of `pollfd` structs `(fd, requested_events, returned_events)`.
*   **The Improvements:** No 1024 hard limit. Does not modify the requested events in place, making it reusable.
*   **The Flaw:** Performance is still `O(N)`. The kernel still linearly loops over the entire array of 10,000 descriptors every single time you call `poll()`.

## 4. `epoll()` (The Modern Linux Champion)

`epoll` completely separated the "registration" phase from the "waiting" phase.

**Kernel Mechanics:**
1.  **`epoll_create()`:** Creates an `epoll` instance in the kernel. The kernel initializes an internal **Red-Black Tree**.
2.  **`epoll_ctl()`:** You add a socket to the `epoll` instance. It gets added to the Red-Black Tree. (Registration).
3.  **The Magic (Hardware Interrupts):** When a NIC receives a packet for Socket X, the network interrupt handler not only puts the data in Socket X's buffer but *also* immediately places a reference to Socket X into a **Ready List** linked to the `epoll` instance.
4.  **`epoll_wait()`:** When your server calls this, the kernel does an `O(1)` check. It simply looks at the Ready List. It grabs the populated events and returns them immediately. No linear scanning required!

## 5. Level-Triggered (LT) vs. Edge-Triggered (ET)

`epoll` can operate in two modes. This heavily impacts how you write your code.

### Level-Triggered (Default in `epoll`, standard in `select`/`poll`)
**Definition:** "As long as there is data in the buffer, I will keep nagging you."
**Scenario:** 5KB of data arrives. You call `epoll_wait()`, it returns the socket. You call `read()` but only read 1KB (leaving 4KB in the kernel buffer).
**Result:** The next time you call `epoll_wait()`, it will immediately return that socket again because condition "buffer > 0" is still true. It is very forgiving but can result in extra syscall round-trips.

### Edge-Triggered (`EPOLLET`)
**Definition:** "I will poke you exactly ONE time when the state changes from empty to non-empty. Ignore me at your peril."
**Scenario:** 5KB of data arrives. `epoll_wait()` returns the socket. You read 1KB. You call `epoll_wait()` again.
**Result:** **It hangs forever!** You will never be warned about the remaining 4KB. The kernel assumes that because it warned you the edge transitioned (0 to 1), you took care of it.
**How to use ET safely:** You *must* use non-blocking sockets. When `epoll` wakes you up, you must put an internal `while(1)` loop around your `read()` call and aggressively drain down the socket until `read()` returns `EAGAIN`. Only then can you safely go back to `epoll_wait`.

*Nginx uses Edge-Triggered `epoll` for absolute minimum syscall overhead.*
