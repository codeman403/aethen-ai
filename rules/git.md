# Git & Version Control Rules

## Branch Strategy
- **`main`** — production-ready, protected. No direct pushes.
- **`dev`** — integration branch for feature work.
- **Feature branches** off `dev`: `feat/<module-or-feature>` (e.g., `feat/memory-debug-module`).
- **Fix branches**: `fix/<issue-description>` (e.g., `fix/trace-parsing-null-check`).
- **Chore branches**: `chore/<description>` (e.g., `chore/update-dependencies`).

## Commit Messages
Follow **Conventional Commits** strictly:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types
| Type | Use for |
|------|---------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `chore` | Build, CI, dependency updates |
| `style` | Formatting, whitespace (no logic change) |
| `perf` | Performance improvement |

### Scopes
Use the module or area: `frontend`, `backend`, `langgraph`, `api`, `db`, `ci`, `docs`.

### Examples
```
feat(langgraph): add memory debug module state machine
fix(api): handle null trace_id in analysis endpoint
test(backend): add integration tests for tool misfire detection
chore(frontend): update shadcn/ui to v2.1
docs: update CLAUDE.md with new module architecture
```

## Pull Requests
- **Title**: Same format as commit message type + description.
- **Body must include**:
  - What changed and why
  - How to test / verify
  - Screenshots for UI changes
- **Squash merge** to `dev` — keep history clean.
- Delete branch after merge.

## Pre-commit Checks
Before committing, ensure:
- [ ] `pnpm lint` passes (frontend)
- [ ] `pnpm type-check` passes (frontend)
- [ ] `poetry run lint` passes (backend)
- [ ] `poetry run pytest` passes (backend)
- [ ] No secrets in diff (`grep -rE "sk-|api_key|password" --include="*.ts" --include="*.py"`)
- [ ] No `console.log` in production code (frontend)
- [ ] No `print()` in production code (backend) — use `logger`

## .gitignore Essentials
Ensure these are always ignored:
```
node_modules/
.next/
__pycache__/
*.pyc
.env
.env.local
.venv/
dist/
.DS_Store
```
