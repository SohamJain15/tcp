import type { ExecutableLanguage } from "../../../shared/types/domain";
import {
  resolveClassName,
  resolveComparison,
  resolveEntryMethod,
  resolveReturnChannel,
  type HarnessSpec,
  type TypeRef,
} from "../contract";
import { HarnessGenerationError } from "../errors";
import type { CodegenContext, GeneratedHarness, HarnessRequest, LanguageAdapter } from "./language-adapter";

/**
 * Kotlin adapter (JVM). Parses each line into a generic value via an injected JSON
 * reader, converts to the declared native type, calls Solution().method directly,
 * and dumps canonical JSON. Same overall shape as the Java adapter.
 *
 * NOTE: no Kotlin toolchain is available here; covered by structural tests, pending
 * end-to-end verification.
 */
export class KotlinAdapter implements LanguageAdapter {
  readonly language: ExecutableLanguage = "kotlin";

  supports(type: TypeRef): boolean {
    try {
      this.kotlinType(type);
      this.converter(type);
      return true;
    } catch {
      return false;
    }
  }

  private kotlinType(type: TypeRef): string {
    switch (type.base) {
      case "int":
        return "Int";
      case "long":
        return "Long";
      case "double":
      case "float":
        return "Double";
      case "boolean":
        return "Boolean";
      case "char":
        return "Char";
      case "String":
        return "String";
      case "int[]":
        return "IntArray";
      case "double[]":
        return "DoubleArray";
      case "boolean[]":
        return "BooleanArray";
      case "char[]":
        return "CharArray";
      case "String[]":
        return "Array<String>";
      case "int[][]":
        return "Array<IntArray>";
      case "char[][]":
        return "Array<CharArray>";
      case "TreeNode":
        return "TreeNode?";
      case "ListNode":
        return "ListNode?";
      case "GraphNode":
        return "Node?";
      case "List":
        return `List<${type.of?.[0] ? this.boxed(type.of[0]) : "Int"}>`;
      default:
        throw new HarnessGenerationError(`Unsupported Kotlin type "${type.base}"`, "kotlin");
    }
  }

  private boxed(type: TypeRef): string {
    switch (type.base) {
      case "int":
        return "Int";
      case "long":
        return "Long";
      case "double":
      case "float":
        return "Double";
      case "boolean":
        return "Boolean";
      case "String":
        return "String";
      default:
        return "Any";
    }
  }

  private converter(type: TypeRef): string {
    switch (type.base) {
      case "int":
        return "__tInt";
      case "long":
        return "__tLong";
      case "double":
      case "float":
        return "__tDouble";
      case "boolean":
        return "__tBool";
      case "char":
        return "__tChar";
      case "String":
        return "__tStr";
      case "int[]":
        return "__tIntArr";
      case "char[]":
        return "__tCharArr";
      case "String[]":
        return "__tStrArr";
      case "int[][]":
        return "__tIntArr2";
      case "char[][]":
        return "__tCharArr2";
      case "TreeNode":
        return "__tBuildTree";
      case "ListNode":
        return "__tBuildList";
      case "GraphNode":
        return "__tBuildGraph";
      case "List":
        if (type.of?.[0]?.base === "int") return "__tIntList";
        if (type.of?.[0]?.base === "String") return "__tStrList";
        throw new HarnessGenerationError("Unsupported Kotlin List element", "kotlin");
      default:
        throw new HarnessGenerationError(`Unsupported Kotlin type "${type.base}"`, "kotlin");
    }
  }

  private serialize(type: TypeRef, valueExpr: string): string {
    if (type.base === "TreeNode") return `__tDump(__tFlattenTree(${valueExpr}))`;
    if (type.base === "ListNode") return `__tDump(__tFlattenList(${valueExpr}))`;
    if (type.base === "GraphNode") return `__tDump(__tFlattenGraph(${valueExpr}))`;
    return `__tDump(${valueExpr})`;
  }

  generate(req: HarnessRequest, _ctx: CodegenContext): GeneratedHarness {
    const spec = req.spec;
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, "kotlin");
    const channel = resolveReturnChannel(spec);

    const decls: string[] = [];
    const argNames: string[] = [];
    spec.parameters.forEach((p, i) => {
      decls.push(`    val ${p.name} = ${this.converter(p.type)}(__TJson(__tLines[${i}]).parse())`);
      argNames.push(p.name);
    });

    const call = `${cls}().${method}(${argNames.join(", ")})`;
    let invoke: string;
    if (channel.kind === "VOID") {
      invoke = `    ${call}`;
    } else if (channel.kind === "MUTATION") {
      const target = spec.parameters[channel.parameterIndex];
      invoke = `    ${call}\n    print(${this.serialize(target.type, target.name)})`;
    } else {
      invoke = `    val __tRes = ${call}\n    print(${this.serialize(spec.returnType, "__tRes")})`;
    }

    const source = [
      KOTLIN_TYPES,
      KOTLIN_HELPERS,
      "",
      "// --- user submission ---",
      req.userSource.trim(),
      "",
      "// --- generated harness ---",
      "fun main() {",
      "    val __tAll = System.`in`.readBytes().toString(Charsets.UTF_8)",
      '    val __tLines = __tAll.split("\\n")',
      ...decls,
      invoke,
      "}",
      "",
    ].join("\n");

    return { source, comparison: resolveComparison(spec) };
  }

  generateStarter(spec: HarnessSpec): string {
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, "kotlin");
    const channel = resolveReturnChannel(spec);
    const params = spec.parameters.map((p) => `${p.name}: ${this.kotlinType(p.type)}`).join(", ");
    const ret = channel.kind === "VOID" ? "" : `: ${this.kotlinType(spec.returnType)}`;
    return [
      `class ${cls} {`,
      `    fun ${method}(${params})${ret} {`,
      "        // Write your code here",
      "    }",
      "}",
      "",
    ].join("\n");
  }
}

const KOTLIN_TYPES = [
  "class TreeNode(var `val`: Int) { var left: TreeNode? = null; var right: TreeNode? = null }",
  "class ListNode(var `val`: Int) { var next: ListNode? = null }",
  "class Node(var `val`: Int) { var neighbors: ArrayList<Node?> = ArrayList() }",
].join("\n");

// Backtick escapes Kotlin's reserved word `val` used as a property name. It is
// interpolated (not written literally) because this file uses String.raw templates.
const BT = "`";

const KOTLIN_HELPERS = String.raw`
class __TJson(val s: String) {
    var i = 0
    fun parse(): Any? { ws(); return value() }
    private fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
    private fun value(): Any? { ws(); val c = s[i]; return when { c == '[' -> arr(); c == '"' -> str(); c == '{' -> obj(); c == 't' -> { i += 4; true }; c == 'f' -> { i += 5; false }; c == 'n' -> { i += 4; null }; else -> num() } }
    private fun arr(): MutableList<Any?> { val a = ArrayList<Any?>(); i++; ws(); if (s[i] == ']') { i++; return a }; while (true) { a.add(value()); ws(); val c = s[i++]; if (c == ']') break }; return a }
    private fun obj(): MutableMap<String, Any?> { val m = LinkedHashMap<String, Any?>(); i++; ws(); if (s[i] == '}') { i++; return m }; while (true) { ws(); val k = str(); ws(); i++; val v = value(); m[k] = v; ws(); val c = s[i++]; if (c == '}') break }; return m }
    private fun str(): String { val b = StringBuilder(); i++; while (s[i] != '"') { if (s[i] == '\\') { i++; val e = s[i++]; when (e) { 'n' -> b.append('\n'); 't' -> b.append('\t'); 'r' -> b.append('\r'); '"' -> b.append('"'); '\\' -> b.append('\\'); '/' -> b.append('/'); else -> b.append(e) } } else b.append(s[i++]) }; i++; return b.toString() }
    private fun num(): Any { val st = i; while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++; val t = s.substring(st, i); return if (t.contains('.') || t.contains('e') || t.contains('E')) t.toDouble() else t.toLong() }
}

@Suppress("UNCHECKED_CAST")
fun __tL(o: Any?): List<Any?> = o as List<Any?>
fun __tInt(o: Any?): Int = (o as Number).toInt()
fun __tLong(o: Any?): Long = (o as Number).toLong()
fun __tDouble(o: Any?): Double = (o as Number).toDouble()
fun __tBool(o: Any?): Boolean = o as Boolean
fun __tChar(o: Any?): Char = (o as String)[0]
fun __tStr(o: Any?): String = o as String
fun __tIntArr(o: Any?): IntArray = __tL(o).map { __tInt(it) }.toIntArray()
fun __tCharArr(o: Any?): CharArray = __tL(o).map { __tChar(it) }.toCharArray()
fun __tStrArr(o: Any?): Array<String> = __tL(o).map { __tStr(it) }.toTypedArray()
fun __tIntArr2(o: Any?): Array<IntArray> = __tL(o).map { __tIntArr(it) }.toTypedArray()
fun __tCharArr2(o: Any?): Array<CharArray> = __tL(o).map { __tCharArr(it) }.toTypedArray()
fun __tIntList(o: Any?): List<Int> = __tL(o).map { __tInt(it) }
fun __tStrList(o: Any?): List<String> = __tL(o).map { __tStr(it) }

fun __tQuote(s: String): String { val b = StringBuilder("\""); for (c in s) { when (c) { '"' -> b.append("\\\""); '\\' -> b.append("\\\\"); '\n' -> b.append("\\n"); '\r' -> b.append("\\r"); '\t' -> b.append("\\t"); else -> b.append(c) } }; b.append("\""); return b.toString() }
fun __tDump(v: Any?): String {
    return when (v) {
        null -> "null"
        is Boolean -> if (v) "true" else "false"
        is Char -> __tQuote(v.toString())
        is String -> __tQuote(v)
        is Int, is Long -> v.toString()
        is Double -> if (v == Math.floor(v) && !v.isInfinite()) v.toLong().toString() else v.toString()
        is IntArray -> "[" + v.joinToString(",") { it.toString() } + "]"
        is CharArray -> "[" + v.joinToString(",") { __tQuote(it.toString()) } + "]"
        is BooleanArray -> "[" + v.joinToString(",") { if (it) "true" else "false" } + "]"
        is DoubleArray -> "[" + v.joinToString(",") { __tDump(it) } + "]"
        is Array<*> -> "[" + v.joinToString(",") { __tDump(it) } + "]"
        is Map<*, *> -> { val keys = v.keys.map { it.toString() }.sorted(); "{" + keys.joinToString(",") { k -> __tQuote(k) + ":" + __tDump(v[k]) } + "}" }
        is Iterable<*> -> "[" + v.joinToString(",") { __tDump(it) } + "]"
        else -> __tQuote(v.toString())
    }
}

fun __tBuildTree(o: Any?): TreeNode? {
    val a = __tL(o); if (a.isEmpty()) return null
    val root = TreeNode(__tInt(a[0])); val q = ArrayDeque<TreeNode>(); q.add(root); var i = 1
    while (q.isNotEmpty() && i < a.size) { val node = q.removeFirst()
        if (i < a.size) { val lv = a[i++]; if (lv != null) { node.left = TreeNode(__tInt(lv)); q.add(node.left!!) } }
        if (i < a.size) { val rv = a[i++]; if (rv != null) { node.right = TreeNode(__tInt(rv)); q.add(node.right!!) } } }
    return root
}
fun __tFlattenTree(root: TreeNode?): List<Any?> {
    if (root == null) return emptyList()
    val res = ArrayList<Any?>(); val q = ArrayDeque<TreeNode?>(); q.add(root)
    while (q.isNotEmpty()) { val n = q.removeFirst(); if (n == null) { res.add(null); continue }; res.add(n.${BT}val${BT}); q.add(n.left); q.add(n.right) }
    while (res.isNotEmpty() && res.last() == null) res.removeAt(res.size - 1)
    return res
}
fun __tBuildList(o: Any?): ListNode? { val a = __tL(o); var head: ListNode? = null; for (k in a.indices.reversed()) { val n = ListNode(__tInt(a[k])); n.next = head; head = n }; return head }
fun __tFlattenList(n0: ListNode?): List<Any?> { val out = ArrayList<Any?>(); var n = n0; while (n != null) { out.add(n.${BT}val${BT}); n = n.next }; return out }
fun __tBuildGraph(o: Any?): Node? {
    val adj = __tL(o); if (adj.isEmpty()) return null
    val nodes = HashMap<Int, Node>(); for (k in 1..adj.size) nodes[k] = Node(k)
    for (k in 1..adj.size) { for (j in __tL(adj[k - 1])) nodes[k]!!.neighbors.add(nodes[__tInt(j)]) }
    return nodes[1]
}
fun __tFlattenGraph(node: Node?): List<Any?> {
    if (node == null) return emptyList()
    val seen = sortedMapOf<Int, Node>(); val q = ArrayDeque<Node>(); q.add(node)
    while (q.isNotEmpty()) { val cur = q.removeFirst(); if (seen.containsKey(cur.${BT}val${BT})) continue; seen[cur.${BT}val${BT}] = cur; for (nb in cur.neighbors) if (nb != null && !seen.containsKey(nb.${BT}val${BT})) q.add(nb) }
    val n = if (seen.isEmpty()) 0 else seen.lastKey()
    val adj = ArrayList<Any?>()
    for (k in 1..n) { val row = ArrayList<Int>(); val nd = seen[k]; if (nd != null) { for (nb in nd.neighbors) if (nb != null) row.add(nb.${BT}val${BT}); row.sort() }; adj.add(row) }
    return adj
}
`;
