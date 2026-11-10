# @phrase/cli

`phrase` command: validate, build, format (`--check`, `--assign-ids`), import. `main.ts` wires the process; `run.ts` is the testable entry with injected cwd and output; `node-storage.ts` implements `ProjectStorage` on the file system.

ADRs 0014, 0015, 0020, 0047.
