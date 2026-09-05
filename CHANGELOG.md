# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1] - 2026-09-05

### Changed

- Clean-uninstall story, documented and tested: the README gains an Uninstall section (the removal command, what stays on disk — the seeded `~/.dsh/agents/*.md` personas and any user-written agents — the dsh-tui-pi graceful-degradation note, and how continuable children behave after removal), and the boot smoke gains an uninstall leg: after the boot proof it runs `dsh plugin --profile smoke remove @aiwayds/dsh-subagent-registry` against the scratch profile and asserts the second `--dump-config` no longer contains the plugin entry — removal must reconcile the composed tree back to stock.
