---
description: Use this workflow when needed to verify the impact radius of a code change
---

# Blast Radius Workflow with Context Atlas

Use this workflow **before any refactor or merge** to map the impact of a change across the codebase.

---

## Prerequisites

- A context-atlas graph populated with indexed nodes
- IDs of the symbols that will be modified

> **Note:** Blast radius accuracy is proportional to graph density.  
> Projects with little usage history will produce conservative results.

---

## Workflow

### 1. Describe the change in natural language

```
semantic_search(
  query     = "description of the change you want to make",
  threshold = 0.3,   // lower for sparse graphs
  limit     = 10
)
```

**Output:** list of candidate nodes with similarity scores.

---

### 2. Filter relevant nodes

Discard nodes below the desired threshold.

| Score     | Interpretation                          |
|-----------|-----------------------------------------|
| 0.8 – 1.0 | Direct dependency — high risk           |
| 0.5 – 0.7 | Indirect dependency — medium risk       |
| 0.1 – 0.4 | Loose coupling — monitor                |

---

### 3. Calculate the blast radius

```
get_impact(
  modifiedNodeIds = [ ids filtered in the previous step ],
  threshold       = 0.3
)
```

**Output:** list of affected nodes with impact weight (0.0 – 1.0).

---

### 4. Drill into critical dependencies (optional)

For nodes with impact ≥ 0.8, use `trace_callers` to inspect the dependency chain:

```
trace_callers(functionName = "critical_symbol_name")
```

---

## Threshold Quick Reference

| Goal                            | Recommended threshold |
|---------------------------------|-----------------------|
| Full picture (maximum context)  | 0.0                   |
| Relevant impacts only           | 0.3 – 0.5             |
| Critical dependencies only      | 0.8+                  |

---

## Use Cases

- **Before a refactor** — run with the nodes that will be moved or renamed
- **PR review** — list the changed files, pass their IDs, and attach the output as a risk report
- **Releases** — combine with `get_all_changes` to map the accumulated blast radius across the sprint