# Problem 101: Dining Philosophers — Deadlock-Free Implementation

The **Dining Philosophers** problem (Dijkstra, 1965) is the canonical concurrency problem demonstrating deadlock and resource contention.

## 1. The Problem Setup

Five philosophers sit around a circular table. There is one fork between each adjacent pair of philosophers — five forks total. A philosopher alternates between **thinking** and **eating**. To eat, a philosopher must pick up both the fork on their left **and** the fork on their right.

**The deadlock condition:** If all five philosophers simultaneously pick up their left fork, every fork is held by someone. No philosopher can pick up their right fork. Everyone waits forever. **Circular deadlock.**

## 2. Flawed Naive Implementation (Deadlock-Prone)

```c
#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

#define N 5
pthread_mutex_t forks[N];

void *philosopher(void *arg) {
    int id = *(int *)arg;
    int left  = id;
    int right = (id + 1) % N;

    while (1) {
        printf("Philosopher %d thinking\n", id);
        sleep(1);

        // DEADLOCK: all philosophers grab left fork simultaneously
        pthread_mutex_lock(&forks[left]);
        pthread_mutex_lock(&forks[right]); // waits forever if right is taken
        printf("Philosopher %d eating\n", id);
        sleep(1);
        pthread_mutex_unlock(&forks[right]);
        pthread_mutex_unlock(&forks[left]);
    }
    return NULL;
}
```

## 3. Solution 1 — Resource Ordering (Break Circular Wait)

The simplest correct fix: always acquire forks in a **globally consistent order**. One philosopher (e.g., philosopher 4) picks up the higher-numbered fork first. This breaks the circular dependency.

```c
#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

#define N 5
pthread_mutex_t forks[N];

void *philosopher(void *arg) {
    int id = *(int *)arg;
    int left  = id;
    int right = (id + 1) % N;

    // Always acquire the lower-indexed fork first
    int first  = (left < right) ? left  : right;
    int second = (left < right) ? right : left;

    while (1) {
        printf("Philosopher %d thinking\n", id);
        sleep(1);

        pthread_mutex_lock(&forks[first]);   // Lower index first — always
        pthread_mutex_lock(&forks[second]);  // Higher index second — always
        printf("Philosopher %d eating\n", id);
        sleep(1);
        pthread_mutex_unlock(&forks[second]);
        pthread_mutex_unlock(&forks[first]);
    }
    return NULL;
}

int main() {
    pthread_t threads[N];
    int ids[N];
    for (int i = 0; i < N; i++) pthread_mutex_init(&forks[i], NULL);
    for (int i = 0; i < N; i++) {
        ids[i] = i;
        pthread_create(&threads[i], NULL, philosopher, &ids[i]);
    }
    for (int i = 0; i < N; i++) pthread_join(threads[i], NULL);
    return 0;
}
```

**Why this works:** Cycle in the resource graph is broken. Philosopher 4 (who would normally create the circular dependency) now picks up fork 4 **then** fork 0 — but philosopher 0 also picks up fork 0 **first**. One of them must wait, preventing the circular deadlock.

## 4. Solution 2 — Semaphore to Limit Concurrent Eaters (Starvation-Free)

Allow at most **N-1 = 4** philosophers to attempt eating simultaneously. This guarantees at least one philosopher can always eat, and no circular wait can form.

```c
#include <pthread.h>
#include <semaphore.h>
#include <stdio.h>
#include <unistd.h>

#define N 5
pthread_mutex_t forks[N];
sem_t table_sem; // At most N-1 philosophers at the table simultaneously

void *philosopher(void *arg) {
    int id = *(int *)arg;
    int left  = id;
    int right = (id + 1) % N;

    while (1) {
        printf("Philosopher %d thinking\n", id);
        sleep(1);

        sem_wait(&table_sem); // Only N-1 can proceed past here
        pthread_mutex_lock(&forks[left]);
        pthread_mutex_lock(&forks[right]);

        printf("Philosopher %d eating\n", id);
        sleep(1);

        pthread_mutex_unlock(&forks[right]);
        pthread_mutex_unlock(&forks[left]);
        sem_post(&table_sem); // Release seat at table
    }
    return NULL;
}

int main() {
    pthread_t threads[N];
    int ids[N];
    sem_init(&table_sem, 0, N - 1); // Semaphore initialized to 4
    for (int i = 0; i < N; i++) pthread_mutex_init(&forks[i], NULL);
    for (int i = 0; i < N; i++) {
        ids[i] = i;
        pthread_create(&threads[i], NULL, philosopher, &ids[i]);
    }
    for (int i = 0; i < N; i++) pthread_join(threads[i], NULL);
    sem_destroy(&table_sem);
    return 0;
}
```

## 5. The Four Deadlock Conditions (Coffman Conditions)
All four must hold simultaneously for deadlock to occur. Solutions work by breaking at least one:

| Condition | Meaning | Solution |
|---|---|---|
| **Mutual Exclusion** | Resources cannot be shared | Can't remove (forks can't be shared) |
| **Hold and Wait** | Holding one resource while waiting | Acquire all forks atomically or none |
| **No Preemption** | Resources can't be forcibly taken | Try-lock and release on failure |
| **Circular Wait** | Circular chain of waiting processes | **Resource ordering** breaks this |
