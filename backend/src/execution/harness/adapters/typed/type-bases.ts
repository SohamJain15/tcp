import type { HarnessSpec, TypeRef } from "../../contract";

/** Collect the distinct type "bases" used anywhere in a spec (params + return). */
export function collectTypeBases(spec: HarnessSpec): Set<string> {
  const bases = new Set<string>();
  const walk = (t: TypeRef): void => {
    bases.add(t.base);
    t.of?.forEach(walk);
  };
  spec.parameters.forEach((p) => walk(p.type));
  walk(spec.returnType);
  return bases;
}

export function usesTree(bases: Set<string>): boolean {
  return bases.has("TreeNode");
}
export function usesList(bases: Set<string>): boolean {
  return bases.has("ListNode");
}
export function usesGraph(bases: Set<string>): boolean {
  return bases.has("GraphNode");
}
