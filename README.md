# @rpamis/comet

OpenSpec + Superpowers dual-star development workflow for Claude Code.

## Installation

```bash
npm install -g @rpamis/comet
```

## Quick Start

```bash
cd your-project
comet init
```

`comet init` will:
1. Install Comet skills to `.claude/skills/`
2. Set up OpenSpec (if not already installed)
3. Set up Superpowers (if not already installed)
4. Create `docs/superpowers/` working directories

## Commands

| Command | Description |
|---------|-------------|
| `comet init [path]` | Initialize Comet workflow |
| `comet --help` | Show help |
| `comet --version` | Show version |

## Skills

After `comet init`, these skills are available in Claude Code:

| Skill | Description |
|-------|-------------|
| `/comet` | Main entry — auto-detects phase and dispatches |
| `/comet-open` | Phase 1: Open change |
| `/comet-design` | Phase 2: Deep design |
| `/comet-build` | Phase 3: Plan and build |
| `/comet-verify` | Phase 4: Verify and finish |
| `/comet-archive` | Phase 5: Archive |
| `/comet-hotfix` | Preset: Bug fix (skip brainstorming) |
| `/comet-tweak` | Preset: Small change (skip brainstorming and plan) |

## License

MIT
