import type { ExecutableLanguage } from "../../../shared/types/domain";
import {
  resolveComparison,
  resolveEntryMethod,
  resolveReturnChannel,
  type HarnessSpec,
  type TypeRef,
} from "../contract";
import { HarnessGenerationError } from "../errors";
import type { CodegenContext, GeneratedHarness, HarnessRequest, LanguageAdapter } from "./language-adapter";

/**
 * Go adapter. Go uses free functions (LeetCode convention) and `encoding/json`
 * for typed unmarshalling; output is `json.Marshal`, which is already compact and
 * sorts map keys — i.e. canonical for the shapes we emit. Object graphs are built
 * from / flattened to slices before marshalling.
 *
 * NOTE: no Go toolchain is available in this environment; this adapter is covered
 * by structural tests and pending end-to-end verification on a Go runtime.
 */
export class GoAdapter implements LanguageAdapter {
  readonly language: ExecutableLanguage = "go";

  supports(type: TypeRef): boolean {
    try {
      this.goType(type);
      return true;
    } catch {
      return false;
    }
  }

  private goType(type: TypeRef): string {
    switch (type.base) {
      case "int":
      case "long":
      case "char":
        return "int";
      case "double":
      case "float":
        return "float64";
      case "boolean":
        return "bool";
      case "String":
        return "string";
      case "int[]":
        return "[]int";
      case "long[]":
        return "[]int64";
      case "double[]":
        return "[]float64";
      case "boolean[]":
        return "[]bool";
      case "String[]":
        return "[]string";
      case "int[][]":
        return "[][]int";
      case "char[][]":
        return "[][]byte";
      case "String[][]":
        return "[][]string";
      case "TreeNode":
        return "*TreeNode";
      case "ListNode":
        return "*ListNode";
      case "GraphNode":
        return "*Node";
      case "List":
        return `[]${type.of?.[0] ? this.goType(type.of[0]) : "int"}`;
      default:
        throw new HarnessGenerationError(`Unsupported Go type "${type.base}"`, "go");
    }
  }

  private deserialize(type: TypeRef, name: string, lineExpr: string): string {
    if (type.base === "TreeNode") {
      return `var ${name}Raw []*int; json.Unmarshal([]byte(${lineExpr}), &${name}Raw); ${name} := __tBuildTree(${name}Raw)`;
    }
    if (type.base === "ListNode") {
      return `var ${name}Raw []int; json.Unmarshal([]byte(${lineExpr}), &${name}Raw); ${name} := __tBuildList(${name}Raw)`;
    }
    if (type.base === "GraphNode") {
      return `var ${name}Raw [][]int; json.Unmarshal([]byte(${lineExpr}), &${name}Raw); ${name} := __tBuildGraph(${name}Raw)`;
    }
    if (type.base === "char[][]") {
      return `var ${name}Str [][]string; json.Unmarshal([]byte(${lineExpr}), &${name}Str); ${name} := __tToByteGrid(${name}Str)`;
    }
    return `var ${name} ${this.goType(type)}; json.Unmarshal([]byte(${lineExpr}), &${name})`;
  }

  private serialize(type: TypeRef, valueExpr: string): string {
    if (type.base === "TreeNode") return `__tDump(__tFlattenTree(${valueExpr}))`;
    if (type.base === "ListNode") return `__tDump(__tFlattenList(${valueExpr}))`;
    if (type.base === "GraphNode") return `__tDump(__tFlattenGraph(${valueExpr}))`;
    return `__tDump(${valueExpr})`;
  }

  generate(req: HarnessRequest, _ctx: CodegenContext): GeneratedHarness {
    const spec = req.spec;
    const fn = resolveEntryMethod(spec, "go");
    const channel = resolveReturnChannel(spec);

    const decls: string[] = [];
    const argNames: string[] = [];
    spec.parameters.forEach((p, i) => {
      decls.push(`\t${this.deserialize(p.type, p.name, `__tLines[${i}]`)}`);
      argNames.push(p.name);
    });

    const call = `${fn}(${argNames.join(", ")})`;
    let invoke: string;
    if (channel.kind === "VOID") {
      invoke = `\t${call}`;
    } else if (channel.kind === "MUTATION") {
      const target = spec.parameters[channel.parameterIndex];
      invoke = `\t${call}\n\tfmt.Print(${this.serialize(target.type, target.name)})`;
    } else {
      invoke = `\t__tRes := ${call}\n\tfmt.Print(${this.serialize(spec.returnType, "__tRes")})`;
    }

    const source = [
      "package main",
      "",
      'import ("encoding/json"; "fmt"; "io"; "os"; "strings")',
      "",
      GO_TYPES,
      GO_HELPERS,
      "",
      "// --- user submission ---",
      req.userSource.trim(),
      "",
      "// --- generated harness ---",
      "func main() {",
      "\t__tData, _ := io.ReadAll(os.Stdin)",
      '\t__tLines := strings.Split(string(__tData), "\\n")',
      "\t_ = __tLines",
      ...decls,
      invoke,
      "}",
      "",
    ].join("\n");

    return { source, comparison: resolveComparison(spec) };
  }

  generateStarter(spec: HarnessSpec): string {
    const fn = resolveEntryMethod(spec, "go");
    const channel = resolveReturnChannel(spec);
    const params = spec.parameters.map((p) => `${p.name} ${this.goType(p.type)}`).join(", ");
    const ret = channel.kind === "VOID" ? "" : ` ${this.goType(spec.returnType)}`;
    return [`func ${fn}(${params})${ret} {`, "\t// Write your code here", "}", ""].join("\n");
  }
}

const GO_TYPES = [
  "type TreeNode struct { Val int; Left *TreeNode; Right *TreeNode }",
  "type ListNode struct { Val int; Next *ListNode }",
  "type Node struct { Val int; Neighbors []*Node }",
].join("\n");

const GO_HELPERS = String.raw`
func __tDump(v interface{}) string { b, _ := json.Marshal(v); return string(b) }
func __tToByteGrid(g [][]string) [][]byte {
	out := make([][]byte, len(g))
	for i, row := range g { r := make([]byte, len(row)); for j, c := range row { if len(c) > 0 { r[j] = c[0] } }; out[i] = r }
	return out
}
func __tBuildTree(arr []*int) *TreeNode {
	if len(arr) == 0 || arr[0] == nil { return nil }
	root := &TreeNode{Val: *arr[0]}; q := []*TreeNode{root}; i := 1
	for len(q) > 0 && i < len(arr) {
		node := q[0]; q = q[1:]
		if i < len(arr) { if arr[i] != nil { node.Left = &TreeNode{Val: *arr[i]}; q = append(q, node.Left) }; i++ }
		if i < len(arr) { if arr[i] != nil { node.Right = &TreeNode{Val: *arr[i]}; q = append(q, node.Right) }; i++ }
	}
	return root
}
func __tFlattenTree(root *TreeNode) []interface{} {
	res := []interface{}{}
	if root == nil { return res }
	q := []*TreeNode{root}
	for len(q) > 0 { n := q[0]; q = q[1:]; if n == nil { res = append(res, nil); continue }; res = append(res, n.Val); q = append(q, n.Left, n.Right) }
	for len(res) > 0 && res[len(res)-1] == nil { res = res[:len(res)-1] }
	return res
}
func __tBuildList(arr []int) *ListNode { var head *ListNode; for i := len(arr) - 1; i >= 0; i-- { head = &ListNode{Val: arr[i], Next: head} }; return head }
func __tFlattenList(n *ListNode) []int { out := []int{}; for n != nil { out = append(out, n.Val); n = n.Next }; return out }
func __tBuildGraph(adj [][]int) *Node {
	if len(adj) == 0 { return nil }
	nodes := make(map[int]*Node); for i := 1; i <= len(adj); i++ { nodes[i] = &Node{Val: i} }
	for i := 1; i <= len(adj); i++ { for _, j := range adj[i-1] { nodes[i].Neighbors = append(nodes[i].Neighbors, nodes[j]) } }
	return nodes[1]
}
func __tFlattenGraph(node *Node) [][]int {
	if node == nil { return [][]int{} }
	seen := map[int]*Node{}; q := []*Node{node}; maxV := 0
	for len(q) > 0 { cur := q[0]; q = q[1:]; if _, ok := seen[cur.Val]; ok { continue }; seen[cur.Val] = cur; if cur.Val > maxV { maxV = cur.Val }; for _, nb := range cur.Neighbors { if _, ok := seen[nb.Val]; !ok { q = append(q, nb) } } }
	adj := make([][]int, maxV)
	for i := range adj { adj[i] = []int{} }
	for v, nd := range seen { row := []int{}; for _, nb := range nd.Neighbors { row = append(row, nb.Val) }; __tSortInts(row); adj[v-1] = row }
	return adj
}
func __tSortInts(a []int) { for i := 1; i < len(a); i++ { for j := i; j > 0 && a[j-1] > a[j]; j-- { a[j-1], a[j] = a[j], a[j-1] } } }
`;
