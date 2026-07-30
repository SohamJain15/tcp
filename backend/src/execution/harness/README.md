# Metadata-Driven Judging Framework

A generic, language-independent wrapper generator. A problem publishes a **`HarnessSpec`**
(entry method + typed parameters + return type); the framework generates a per-language program
that reads canonical JSON-lines from stdin, deserializes into native typed arguments, calls the
user's declared method (never `solve()` unless legacy), and writes the result back as canonical
JSON. Judge0 stays a plain stdin→stdout runner.

## Pipeline

```
HarnessSpec ─▶ Parameter Resolver ─▶ Deserializer codegen ─▶ Harness Generator
           ─▶ Compilation (Judge0) ─▶ Execution ─▶ Serializer (in-harness) ─▶ Comparator
```

Single entry point: `generateSubmissionProgram(language, userSource, harness?)` in
[`index.ts`](./index.ts).
- **No `harness`** ⇒ verbatim legacy behaviour (`wrapSubmissionCode`), `EXACT` comparison. Existing
  `solve()` problems are unaffected.
- **With `harness`** ⇒ the language adapter generates a typed wrapper and declares a `ComparisonMode`.

## I/O contract (canonical JSON-lines)

- **Input:** for a method `f(p0, p1, …)`, each test case's `input` is N lines; line *i* is the
  canonical JSON of parameter *i*. Example for `twoSum(int[] nums, int target)`:
  ```
  [2,7,11,15]
  9
  ```
- **Output:** the harness prints the canonical JSON of the result, no trailing newline. Rules:
  compact (`,`/`:`), object keys sorted, `true`/`false`/`null`, integers without `.0`.
  See [`canonical.ts`](./canonical.ts) — every language must match `canonicalStringify`.
- **Object graphs:** `TreeNode` = level-order with nulls `[1,null,2,3]`; `ListNode` = `[1,2,3]`;
  `GraphNode` = 1-indexed adjacency list `[[2,4],[1,3],…]`.

## Comparison modes

| Mode | Behaviour | Where |
|------|-----------|-------|
| `EXACT` | trailing-ws-trimmed exact | delegated to Judge0 (`expected_output`) |
| `WHITESPACE` | inner whitespace collapsed | local |
| `UNORDERED` | deep-sort both sides (set answers) | local |
| `FLOAT` | numeric tolerance `epsilon` | local |
| `CHECKER` | registered special judge | local |

Non-EXACT modes: the provider omits `expected_output`, Judge0 returns stdout, and the local
`Comparator` decides the verdict ([`comparator/`](./comparator)).

## Extending (Open/Closed)

- **New type** ⇒ add a `TypeSerializerPlugin` ([`serializers/`](./serializers)) and register it in
  [`register.ts`](./register.ts). No adapter or generator edits.
- **New language** ⇒ add a `LangPrimitives` entry ([`adapters/lang-primitives.ts`](./adapters/lang-primitives.ts))
  and a `LanguageAdapter` extending `BaseAdapter`; register it. JSON-family types work automatically;
  add the object-graph runtime snippets to the tree/list/graph serializers' per-language `RUNTIME` map.
- **New problem** ⇒ set `harness` on the problem (see schema below) and author test cases as
  JSON-lines. Nothing else changes.

## `HarnessSpec` (authoring a problem)

```jsonc
{
  "schemaVersion": 1,
  "entryMethod": "twoSum",
  "className": "Solution",               // optional, default "Solution"
  "parameters": [
    { "name": "nums", "type": { "base": "int[]" } },
    { "name": "target", "type": { "base": "int" } }
  ],
  "returnType": { "base": "int[]" },
  "returnChannel": { "kind": "RETURN" }, // or MUTATION(parameterIndex) / VOID
  "comparison": { "mode": "EXACT" }      // or UNORDERED / FLOAT / ...
}
```

Validated by `harnessSpecSchema` ([`schema.ts`](./schema.ts)); stored on `ProblemRecord.harness`
and `CodingContestQuestion.harness`. Set `harness` to `null` on update to revert to legacy judging.

## Current coverage

- **Languages — verified end-to-end (real execution in CI):** Python, JavaScript, vanilla,
  TypeScript, Java, C++, **C** (LeetCode free-function + explicit-size convention).
- **Languages — implemented, pending toolchain verification** (no Go/Rust/Kotlin runtime in this
  environment; covered by structural tests): Go, Rust, Kotlin. Rust currently covers
  primitives/strings/numeric+bool vectors (object graphs deferred — Judge0 rustc has no serde).
- **Every other executable language** still runs via **legacy passthrough**, unchanged.
- **Types:** primitives, arrays/matrices, `List`/`Set`/`Map`/`Queue`/`Deque`/`Stack`/`PriorityQueue`/
  `Pair`, grids, `TreeNode`, `ListNode`, `GraphNode`.
- **Out of scope for typed harness:** Arduino, Assembly 8086, Racket (legacy passthrough only).

## Tests

- `canonical.spec.ts` — canonical JSON rules & comparators.
- `legacy-passthrough.spec.ts` — byte-identical legacy behaviour when no `harness`.
- `python-e2e.spec.ts` — generates & **runs** Python for arrays/trees/lists/booleans/MUTATION.
- `cross-language.spec.ts` — Python vs JavaScript produce identical canonical stdout for
  `twoSum`/`inorderTraversal`/`reverseList`/`cloneGraph`.

Run: `cd backend && npm test` (Python-dependent suites auto-skip if `python3` is absent).
