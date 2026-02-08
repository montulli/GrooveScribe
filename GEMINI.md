# Project Guidelines for AI Agents

## Questions & Planning vs. Implementation

**Do NOT jump into writing or editing code when the user is asking questions or planning.**

When the user asks a question (e.g. "how would we…", "what do you think about…", "what's the best way to…") or is discussing a plan, **respond with discussion only** — explanations, options, trade-offs, or a proposed plan. Wait for an explicit go-ahead before touching any code.

### Signals that the user wants *discussion*, not code changes
- Questions phrased with "how", "what", "why", "should we", "could we"
- Exploring multiple approaches or trade-offs
- Asking for opinions or recommendations
- Reviewing a TODO list or roadmap
- Any conversation that feels like brainstorming or planning

### Signals that the user wants *implementation*
- Imperative requests: "add …", "fix …", "change …", "implement …", "update …"
- Explicit go-ahead after a planning discussion: "let's do it", "go ahead", "sounds good, make it happen"
- Pointing at specific code and asking for a concrete change

**When in doubt, ask** rather than start editing files.

## Core Code Hygiene

**Keep code outside the `coach/` directory as clean and stable as possible.**

The core GrooveScribe codebase (everything outside `coach/`) should be treated with extra care:

- **Only change core files when strictly necessary.** If there's a way to achieve the goal within `coach/`, prefer that.
- **Keep changes minimal.** When a core change is unavoidable, make the smallest possible change — no drive-by refactors, no "while we're here" cleanups.
- **Avoid side effects.** Make sure core changes don't alter existing behavior for non-coach functionality.

## Code Quality Standards

**No fallbacks, no hacks, no magic constants.**

- **No silent fallbacks.** If something fails or is missing, surface the error clearly rather than falling back to a default that masks the problem. This also means **don't implement a second-best approach** as a fallback for the preferred one — doing so hides failures in the preferred approach and clutters the code with undesired logic paths. Implement the correct approach and let it fail visibly if something is wrong.
  - **Common anti-pattern:** `let type = DEFAULT; if (...) type = A; else if (...) type = B;` — if none of the conditions match, the code silently uses DEFAULT. Instead, use a lookup table or explicit `else { warn/error }`.
  - **`??` fallback chains** (e.g. `map[key] ?? map[SNARE] ?? defaultY`) silently mask missing entries. If a key isn't in the map, **warn and bail** — don't substitute a different key.
- **No hacks or workarounds.** If a proper solution is too complex right now, discuss it with the user instead of shipping a hack. Temporary workarounds accumulate and become permanent.
- **No magic constants.** Every number, string, or threshold in the code should be a named constant with a clear reason for its value. If you can't name it or explain it, it probably shouldn't be hardcoded.

## Verify, Don't Guess

**Run small verification tests when studying code behavior instead of guessing or assuming.**

When you're unsure how something works:

1. **Write a small test or snippet** to confirm the actual behavior rather than reasoning from assumptions.
2. **Ask the user to run a quick check** in the console or browser if that's faster.
3. **Check real output** — log values, inspect state, run the code path — before building on top of assumptions.

Guessing leads to compounding errors. A 30-second test is always cheaper than debugging a wrong assumption later.

## Debugging Strategy

**Prefer asking the USER to verify browser state over using browser automation.**

Browser subagents / automation is slow and heavyweight. For most debugging tasks, it's far more efficient to:

1. **Ask the user to reload the page** and paste back console logs or visual observations.
2. **Add temporary `console.log()` statements** to the code, then ask the user to paste the output.
3. **Ask the user to run a snippet** in the browser DevTools console and paste the result.

### When to use browser automation
- Taking screenshots for documentation or visual comparison
- Multi-step interactive flows (clicking through dialogs, drag-and-drop)
- Tasks where the user explicitly asks you to do it yourself

### When NOT to use browser automation
- Checking console output or logs (ask the user to paste)
- Verifying a value in the DOM (give the user a JS snippet to run)
- Simple page reloads to pick up code changes
- Any scenario where pasting logs is sufficient

## Session Startup Checklist

At the **start of every session**, ensure the development server is running:

1. Check if port 8082 is already in use: `lsof -ti:8082`
2. If not running, start it: `npx -y http-server -p 8082 -c-1` (from the project root)

## Development Server

The project uses a simple HTTP server:
```bash
npx -y http-server -p 8082 -c-1
```
Run from the project root. The `-c-1` flag disables caching so code changes take effect on reload.
