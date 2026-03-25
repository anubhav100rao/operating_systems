# Problem 91: Design a Kernel Module for Monitoring

A Linux Kernel Module (LKM) is a piece of code that can be loaded and unloaded into the kernel at runtime without rebooting. Monitoring modules allow you to observe kernel internals — process lifecycles, system call rates, memory events — that are completely invisible from user space.

## 1. The Analogy: The ECU Diagnostics Port

A car's body panels (the kernel) are mostly sealed and inaccessible. But every car has an OBD-II diagnostic port (the LKM interface). When you plug in a diagnostic dongle (load the module), it gains access to the internal CAN bus: fuel injection rates, engine temperature, RPM. When you disconnect it (unload), the car operates exactly as before. Nothing inside is modified permanently.

## 2. Kernel Module Skeleton

Every LKM has exactly two mandatory entry points. The kernel calls `module_init` when the module is loaded (`insmod`) and `module_exit` when it is removed (`rmmod`).

```c
// monitor.c — minimal kernel module skeleton
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/init.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Systems Dev");
MODULE_DESCRIPTION("Process lifecycle monitor");

static int __init monitor_init(void) {
    printk(KERN_INFO "Monitor: loaded.\n");
    return 0;  // Non-zero = load failed
}

static void __exit monitor_exit(void) {
    printk(KERN_INFO "Monitor: unloaded.\n");
}

module_init(monitor_init);
module_exit(monitor_exit);
```

**Build with a Makefile:**
```makefile
obj-m += monitor.o
KDIR  := /lib/modules/$(shell uname -r)/build

all:
	make -C $(KDIR) M=$(PWD) modules

clean:
	make -C $(KDIR) M=$(PWD) clean
```
*Load/unload:* `sudo insmod monitor.ko` / `sudo rmmod monitor`

## 3. Monitoring Technique 1: kprobes (Syscall / Function Tracing)

`kprobes` lets you attach a handler to virtually any kernel or module function — running your code right before or after it executes — without recompiling the kernel.

```c
#include <linux/kprobes.h>
#include <linux/atomic.h>

static atomic_long_t syscall_count;

// This handler fires BEFORE every call to do_sys_open()
static int handler_pre(struct kprobe *p, struct pt_regs *regs) {
    atomic_long_inc(&syscall_count);
    // regs->di on x86-64 holds the first argument (the path string)
    // We could carefully read it using strncpy_from_user() here
    return 0;
}

static struct kprobe kp = {
    .symbol_name    = "do_sys_open",  // Kernel function to hook
    .pre_handler    = handler_pre,
};

static int __init monitor_init(void) {
    int ret = register_kprobe(&kp);
    if (ret < 0) {
        pr_err("Monitor: register_kprobe failed (%d)\n", ret);
        return ret;
    }
    pr_info("Monitor: kprobe planted at do_sys_open.\n");
    return 0;
}

static void __exit monitor_exit(void) {
    unregister_kprobe(&kp);
    pr_info("Monitor: total open() calls seen: %ld\n",
            atomic_long_read(&syscall_count));
}
```

## 4. Monitoring Technique 2: procfs Interface

To expose statistics to user space, the standard approach is creating a virtual file in `/proc`. Reading the file invokes a kernel callback that fetches live data.

```c
#include <linux/proc_fs.h>
#include <linux/seq_file.h>

static struct proc_dir_entry *proc_entry;
static atomic_long_t total_forks;

// Called when user does: cat /proc/mymonitor
static int monitor_show(struct seq_file *m, void *v) {
    seq_printf(m, "total_forks: %ld\n", atomic_long_read(&total_forks));
    seq_printf(m, "syscall_count: %ld\n", atomic_long_read(&syscall_count));
    return 0;
}

static int monitor_open(struct inode *inode, struct file *file) {
    return single_open(file, monitor_show, NULL);
}

static const struct proc_ops monitor_fops = {
    .proc_open    = monitor_open,
    .proc_read    = seq_read,
    .proc_release = single_release,
};

// In module_init:
proc_entry = proc_create("mymonitor", 0444, NULL, &monitor_fops);

// In module_exit:
proc_remove(proc_entry);
```

**Usage:**
```bash
$ cat /proc/mymonitor
total_forks: 42813
syscall_count: 2109341
```

## 5. Monitoring Technique 3: Tracepoints

Tracepoints are statically defined hooks compiled into the kernel at performance-sensitive locations. When no module is attached, they have near-zero overhead (a single `NOP` instruction in the hot path).

```c
#include <linux/tracepoint.h>

// Attach to the built-in sched_switch tracepoint to detect context switches
static void on_sched_switch(void *data, bool preempt,
                            struct task_struct *prev,
                            struct task_struct *next,
                            unsigned int prev_state) {
    pr_info("Monitor: switched %s -> %s\n", prev->comm, next->comm);
}

// In module_init:
register_trace_sched_switch(on_sched_switch, NULL);

// In module_exit:
unregister_trace_sched_switch(on_sched_switch, NULL);
```
