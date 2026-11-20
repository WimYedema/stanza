---
stanza-format: 1
title: "ADR 0061: Agent instructions for a project"
---

<!-- stanza: #xgycezsb1a -->
# ADR 0061: Agent instructions for a project

Status: Accepted

<!-- stanza: #aa2kghpp48 -->
## Context

Coding agents (such as Copilot in VS Code) can edit `.phrase.md` files as text. Without the rules of the dialect they invent styles, change or drop IDs, or add direct formatting. The documents are plain Markdown and the command line can check them, so the agent only needs to be told the rules and the loop.

<!-- stanza: #wq4kgprxaf -->
## Decision

- **File.** `AGENTS.md` in the project folder. It is the common name that agent tools read, and it sits next to `phrase.yaml`, so it follows the project when the project is in a subfolder of the workspace. No other tool-specific file is written, and no setting is changed.
- **Content.** One text in `project` (`AGENT_INSTRUCTIONS`), short: the files of a project and which are generated; the rules of a document (IDs are never changed, copied, reused or invented; styles by name from the stylesheet; no direct formatting; only the constructs of the dialect; heading numbers are not typed); and the loop after every edit, `phrase format` then `phrase validate`, with the Problems panel as the same check. An agent that cannot run the command is told to say so.
- **Never over a file.** `createProject` writes it only when the folder has none, and reports `agentInstructions: 'written' | 'exists'`. This is the one file that does not make "New Project" refuse a folder (ADR 0042), since a repository may have an `AGENTS.md` of its own.
- **Existing projects.** "Phrase: Add Agent Instructions" writes the same file into the project of the document in front, refuses when the file exists, and opens it when written.
- **Nothing is sent.** The extension writes a text file. It calls no model and sends no content anywhere.

<!-- stanza: #zymyn7e48n -->
## Consequences

- A project that is created, or that asks for it, tells an agent how to work in it, and the person can edit the text.
- VS Code reads an `AGENTS.md` at the workspace root; when the project is a subfolder, an agent may only find the file if its tool looks in nested folders.
- The text must follow the dialect. It is tested against the rules it names (it lists only constructs that the reader accepts).
