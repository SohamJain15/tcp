import type { ExecutableLanguage } from "../../../shared/types/domain";
import type {
  CodeFragment,
  CodegenContext,
  TypeSerializerPlugin,
} from "../adapters/language-adapter";
import { getLangPrimitives } from "../adapters/lang-primitives";
import { canonicalStringify } from "../canonical";
import type { SerializationFormat, TypeRef } from "../contract";
import { HarnessGenerationError } from "../errors";

const PYTHON_RUNTIME = [
  "class Node:",
  "    def __init__(self, val=0, neighbors=None):",
  "        self.val = val; self.neighbors = neighbors if neighbors is not None else []",
  "def __t_build_graph(adj):",
  "    if not adj:",
  "        return None",
  "    nodes = {i: Node(i) for i in range(1, len(adj) + 1)}",
  "    for i, neigh in enumerate(adj, start=1):",
  "        nodes[i].neighbors = [nodes[j] for j in neigh]",
  "    return nodes[1]",
  "def __t_flatten_graph(node):",
  "    if node is None:",
  "        return []",
  "    seen = {}; q = deque([node])",
  "    while q:",
  "        cur = q.popleft()",
  "        if cur.val in seen:",
  "            continue",
  "        seen[cur.val] = cur",
  "        for nb in cur.neighbors:",
  "            if nb.val not in seen:",
  "                q.append(nb)",
  "    n = max(seen) if seen else 0",
  "    adj = [[] for _ in range(n)]",
  "    for v, node2 in seen.items():",
  "        adj[v - 1] = sorted(nb.val for nb in node2.neighbors)",
  "    return adj",
].join("\n");

const JS_RUNTIME = [
  "class Node { constructor(val = 0, neighbors = []) { this.val = val; this.neighbors = neighbors; } }",
  "const __t_build_graph = (adj) => {",
  "  if (!adj || adj.length === 0) return null;",
  "  const nodes = {}; for (let i = 1; i <= adj.length; i++) nodes[i] = new Node(i);",
  "  for (let i = 1; i <= adj.length; i++) nodes[i].neighbors = adj[i - 1].map((j) => nodes[j]);",
  "  return nodes[1];",
  "};",
  "const __t_flatten_graph = (node) => {",
  "  if (!node) return [];",
  "  const seen = new Map(); const q = [node];",
  "  while (q.length) { const cur = q.shift(); if (seen.has(cur.val)) continue; seen.set(cur.val, cur); for (const nb of cur.neighbors) if (!seen.has(nb.val)) q.push(nb); }",
  "  const n = Math.max(...seen.keys());",
  "  const adj = Array.from({ length: n }, () => []);",
  "  for (const [v, nd] of seen) adj[v - 1] = nd.neighbors.map((x) => x.val).sort((a, b) => a - b);",
  "  return adj;",
  "};",
].join("\n");

const RUNTIME: Partial<Record<ExecutableLanguage, string>> = {
  python: PYTHON_RUNTIME,
  javascript: JS_RUNTIME,
  vanilla: JS_RUNTIME,
  typescript: JS_RUNTIME,
};

/**
 * Undirected graph node (LeetCode "clone graph" convention): input is a 1-indexed
 * adjacency list, node values are 1..n. Output re-flattens to the same adjacency
 * list with sorted neighbours so the verdict is deterministic under EXACT.
 */
export class GraphSerializer implements TypeSerializerPlugin {
  readonly id = "graph";
  readonly formats: readonly SerializationFormat[] = [
    "ADJACENCY_LIST",
    "EDGE_LIST",
    "WEIGHTED_EDGE_LIST",
  ];

  handles(type: TypeRef): boolean {
    return type.base === "GraphNode";
  }

  emitDeserializer(_type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return { render: (line) => `__t_build_graph(${lp.parseLine(line)})` };
  }

  emitSerializer(_type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return { render: (value) => lp.dump(`__t_flatten_graph(${value})`) };
  }

  canonicalize(value: unknown): string {
    return canonicalStringify(value);
  }

  runtimeSupport(language: ExecutableLanguage): string | null {
    return RUNTIME[language] ?? null;
  }

  private primitives(ctx: CodegenContext) {
    if (!RUNTIME[ctx.language]) {
      throw new HarnessGenerationError(`GraphNode not implemented for "${ctx.language}"`, ctx.language);
    }
    return getLangPrimitives(ctx.language);
  }
}
