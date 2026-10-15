# Native collector browser isolation

The collector runs Chromium under UID 10001 using a fresh temporary browser
profile, home and cache for every view. Cleanup happens on success or failure.
Database, Paystack and R2 credentials are excluded from the browser subprocess.
Linux selects Chromium's unprivileged user-namespace sandbox rather than its
legacy setuid helper; namespace and seccomp sandboxing remain enabled.
Never use `--no-sandbox`, a privileged container or unconfined seccomp to recover
from an incompatible host.

The Linux runtime must permit the browser to create its own user/PID/network
namespaces and perform its sandbox chroot inside that namespace. Dropping all
container capabilities is compatible only when the seccomp allowlist also
permits that sandbox chroot; Docker's conditional default rule can otherwise
reject it even though no host capability was granted. Keep a deny-by-default
profile, dropped host capabilities, a non-root account and a bounded temporary
filesystem. The [documented browser container guidance](https://playwright.dev/docs/docker)
explains the namespace syscall requirements. A browser launch failure is a real
release failure, not permission to bypass the sandbox.

`infra/migration/native-browser-container-fixture.py` exercises the actual
Python worker against an isolated data document with networking disabled. It
reports cgroup peak/limit and no cloud writes. The synthetic launch result is
not a whole-universe source crawl, OCR load, restart or hosted Render proof.
Those remain separate release requirements.
