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

const JAVA_TYPES: Record<string, string> = {
  int: "int",
  long: "long",
  double: "double",
  float: "double",
  boolean: "boolean",
  char: "char",
  String: "String",
  "int[]": "int[]",
  "long[]": "long[]",
  "double[]": "double[]",
  "boolean[]": "boolean[]",
  "char[]": "char[]",
  "String[]": "String[]",
  "int[][]": "int[][]",
  "char[][]": "char[][]",
  "String[][]": "String[][]",
  TreeNode: "TreeNode",
  ListNode: "ListNode",
  GraphNode: "Node",
};

// TypeRef.base -> the deserializer helper that converts a parsed JSON Object.
const JAVA_DESERIALIZE: Record<string, string> = {
  int: "__t_int",
  long: "__t_long",
  double: "__t_double",
  float: "__t_double",
  boolean: "__t_bool",
  char: "__t_char",
  String: "__t_str",
  "int[]": "__t_intArr",
  "long[]": "__t_longArr",
  "double[]": "__t_doubleArr",
  "boolean[]": "__t_boolArr",
  "char[]": "__t_charArr",
  "String[]": "__t_strArr",
  "int[][]": "__t_intArr2",
  "char[][]": "__t_charArr2",
  "String[][]": "__t_strArr2",
  TreeNode: "__t_buildTree",
  ListNode: "__t_buildList",
  GraphNode: "__t_buildGraph",
};

/** Java adapter: direct typed call using the metadata signature (no reflection needed). */
export class JavaAdapter implements LanguageAdapter {
  readonly language: ExecutableLanguage = "java";

  supports(type: TypeRef): boolean {
    if (JAVA_TYPES[type.base]) {
      return true;
    }
    return type.base === "List"; // List<Integer> / List<String> / List<List<Integer>>
  }

  private nativeType(type: TypeRef): string {
    if (JAVA_TYPES[type.base]) {
      return JAVA_TYPES[type.base];
    }
    if (type.base === "List") {
      const inner = type.of?.[0];
      return `List<${inner ? this.boxedType(inner) : "Object"}>`;
    }
    throw new HarnessGenerationError(`Unsupported Java type "${type.base}"`, "java");
  }

  private boxedType(type: TypeRef): string {
    switch (type.base) {
      case "int":
        return "Integer";
      case "long":
        return "Long";
      case "double":
      case "float":
        return "Double";
      case "boolean":
        return "Boolean";
      case "char":
        return "Character";
      case "String":
        return "String";
      case "List":
        return `List<${type.of?.[0] ? this.boxedType(type.of[0]) : "Object"}>`;
      default:
        return "Object";
    }
  }

  private deserialize(type: TypeRef, lineExpr: string): string {
    const parsed = `__TJson.parse(${lineExpr})`;
    if (type.base === "List") {
      const inner = type.of?.[0]?.base;
      if (inner === "int") return `__t_intList(${parsed})`;
      if (inner === "String") return `__t_strList(${parsed})`;
      if (inner === "List" && type.of?.[0].of?.[0]?.base === "int") return `__t_intListList(${parsed})`;
      throw new HarnessGenerationError(`Unsupported Java List element`, "java");
    }
    const fn = JAVA_DESERIALIZE[type.base];
    if (!fn) {
      throw new HarnessGenerationError(`Unsupported Java type "${type.base}"`, "java");
    }
    return `${fn}(${parsed})`;
  }

  private serialize(type: TypeRef, valueExpr: string): string {
    if (type.base === "TreeNode") return `__t_dump(__t_flattenTree(${valueExpr}))`;
    if (type.base === "ListNode") return `__t_dump(__t_flattenList(${valueExpr}))`;
    if (type.base === "GraphNode") return `__t_dump(__t_flattenGraph(${valueExpr}))`;
    return `__t_dump(${valueExpr})`;
  }

  generate(req: HarnessRequest, _ctx: CodegenContext): GeneratedHarness {
    const spec = req.spec;
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, "java");
    const channel = resolveReturnChannel(spec);

    const decls: string[] = [];
    const argNames: string[] = [];
    spec.parameters.forEach((p, i) => {
      decls.push(`    ${this.nativeType(p.type)} ${p.name} = ${this.deserialize(p.type, `__t_lines[${i}]`)};`);
      argNames.push(p.name);
    });

    const call = `new ${cls}().${method}(${argNames.join(", ")})`;
    let invoke: string;
    if (channel.kind === "VOID") {
      invoke = `    ${call};`;
    } else if (channel.kind === "MUTATION") {
      const target = spec.parameters[channel.parameterIndex];
      invoke = `    ${call};\n    System.out.print(${this.serialize(target.type, target.name)});`;
    } else {
      invoke = `    ${this.nativeType(spec.returnType)} __t_res = ${call};\n    System.out.print(${this.serialize(spec.returnType, "__t_res")});`;
    }

    // Java requires imports before any type declaration, so hoist any imports the
    // user wrote above the injected typelib classes.
    const { imports, body } = hoistJavaImports(req.userSource);

    const source = [
      "import java.util.*;",
      ...imports,
      "",
      ...this.typelib(spec),
      "",
      "// --- user submission ---",
      body.trim(),
      "",
      "// --- generated harness ---",
      "public class Main {",
      "  public static void main(String[] args) throws Exception {",
      '    String all = new String(System.in.readAllBytes());',
      '    String[] __t_lines = all.split("\\n", -1);',
      ...decls,
      invoke,
      "  }",
      JAVA_HELPERS,
      "}",
      "",
    ].join("\n");

    return { source, comparison: resolveComparison(spec) };
  }

  private typelib(_spec: HarnessSpec): string[] {
    // The static helpers reference these classes, so inject all three unconditionally.
    // Unused top-level classes are harmless in Java, and user code that references
    // TreeNode/ListNode/Node (LeetCode convention) resolves against these.
    return [JAVA_TREE_CLASS, JAVA_LIST_CLASS, JAVA_GRAPH_CLASS];
  }

  generateStarter(spec: HarnessSpec): string {
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, "java");
    const params = spec.parameters.map((p) => `${this.nativeType(p.type)} ${p.name}`).join(", ");
    const ret = this.nativeType(spec.returnType);
    const body = spec.returnChannel?.kind === "VOID" || spec.returnChannel?.kind === "MUTATION"
      ? "        // Write your code here"
      : `        // Write your code here\n        return ${defaultJavaReturn(spec.returnType)};`;
    const retType = spec.returnChannel?.kind === "VOID" ? "void" : ret;
    return [
      `class ${cls} {`,
      `    public ${retType} ${method}(${params}) {`,
      body,
      "    }",
      "}",
      "",
    ].join("\n");
  }
}

/**
 * Extract import statements from user source (hoisted to the top) and drop any
 * `package` declaration (not valid in Judge0's single-file Main compilation).
 * `import java.util.*;` is filtered because the harness already emits it.
 */
function hoistJavaImports(userSource: string): { imports: string[]; body: string } {
  const imports: string[] = [];
  const body: string[] = [];
  for (const line of userSource.split("\n")) {
    if (/^\s*import\s+[\w.*]+\s*;/.test(line)) {
      const normalized = line.trim();
      if (normalized !== "import java.util.*;") {
        imports.push(normalized);
      }
    } else if (/^\s*package\s+[\w.]+\s*;/.test(line)) {
      // dropped
    } else {
      body.push(line);
    }
  }
  return { imports: [...new Set(imports)], body: body.join("\n") };
}

function defaultJavaReturn(type: TypeRef): string {
  switch (type.base) {
    case "int":
    case "long":
    case "double":
    case "float":
    case "char":
      return "0";
    case "boolean":
      return "false";
    default:
      return "null";
  }
}

const JAVA_TREE_CLASS =
  "class TreeNode { int val; TreeNode left, right; TreeNode(int v) { val = v; } }";
const JAVA_LIST_CLASS = "class ListNode { int val; ListNode next; ListNode(int v) { val = v; } }";
const JAVA_GRAPH_CLASS =
  "class Node { int val; List<Node> neighbors; Node(int v) { val = v; neighbors = new java.util.ArrayList<>(); } }";

// A compact recursive-descent JSON parser + type converters + canonical dumper,
// injected inside Main as static members.
const JAVA_HELPERS = String.raw`
  static final class __TJson {
    private final String s; private int i;
    private __TJson(String s) { this.s = s; this.i = 0; }
    static Object parse(String s) { __TJson p = new __TJson(s); p.ws(); return p.val(); }
    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    private Object val() {
      ws(); char c = s.charAt(i);
      if (c == '[') return arr();
      if (c == '"') return str();
      if (c == '{') return obj();
      if (c == 't') { i += 4; return Boolean.TRUE; }
      if (c == 'f') { i += 5; return Boolean.FALSE; }
      if (c == 'n') { i += 4; return null; }
      return num();
    }
    private java.util.List<Object> arr() {
      java.util.List<Object> a = new java.util.ArrayList<>(); i++; ws();
      if (s.charAt(i) == ']') { i++; return a; }
      while (true) { a.add(val()); ws(); char c = s.charAt(i++); if (c == ']') break; }
      return a;
    }
    private java.util.Map<String,Object> obj() {
      java.util.Map<String,Object> m = new java.util.LinkedHashMap<>(); i++; ws();
      if (s.charAt(i) == '}') { i++; return m; }
      while (true) { ws(); String k = str(); ws(); i++; Object v = val(); m.put(k, v); ws(); char c = s.charAt(i++); if (c == '}') break; }
      return m;
    }
    private String str() {
      StringBuilder b = new StringBuilder(); i++;
      while (true) { char c = s.charAt(i++); if (c == '"') break;
        if (c == '\\') { char e = s.charAt(i++);
          switch (e) { case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'r': b.append('\r'); break;
            case '"': b.append('"'); break; case '\\': b.append('\\'); break; case '/': b.append('/'); break;
            case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
            case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break; default: b.append(e); } }
        else b.append(c); }
      return b.toString();
    }
    private Object num() {
      int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
      String t = s.substring(st, i);
      if (t.indexOf('.') >= 0 || t.indexOf('e') >= 0 || t.indexOf('E') >= 0) return Double.parseDouble(t);
      return Long.parseLong(t);
    }
  }

  @SuppressWarnings("unchecked")
  static java.util.List<Object> __L(Object o) { return (java.util.List<Object>) o; }
  static int __t_int(Object o) { return (int) ((Number) o).longValue(); }
  static long __t_long(Object o) { return ((Number) o).longValue(); }
  static double __t_double(Object o) { return ((Number) o).doubleValue(); }
  static boolean __t_bool(Object o) { return (Boolean) o; }
  static char __t_char(Object o) { return ((String) o).charAt(0); }
  static String __t_str(Object o) { return (String) o; }
  static int[] __t_intArr(Object o) { java.util.List<Object> l = __L(o); int[] a = new int[l.size()]; for (int k = 0; k < a.length; k++) a[k] = __t_int(l.get(k)); return a; }
  static long[] __t_longArr(Object o) { java.util.List<Object> l = __L(o); long[] a = new long[l.size()]; for (int k = 0; k < a.length; k++) a[k] = __t_long(l.get(k)); return a; }
  static double[] __t_doubleArr(Object o) { java.util.List<Object> l = __L(o); double[] a = new double[l.size()]; for (int k = 0; k < a.length; k++) a[k] = __t_double(l.get(k)); return a; }
  static boolean[] __t_boolArr(Object o) { java.util.List<Object> l = __L(o); boolean[] a = new boolean[l.size()]; for (int k = 0; k < a.length; k++) a[k] = __t_bool(l.get(k)); return a; }
  static char[] __t_charArr(Object o) { java.util.List<Object> l = __L(o); char[] a = new char[l.size()]; for (int k = 0; k < a.length; k++) a[k] = __t_char(l.get(k)); return a; }
  static String[] __t_strArr(Object o) { java.util.List<Object> l = __L(o); String[] a = new String[l.size()]; for (int k = 0; k < a.length; k++) a[k] = __t_str(l.get(k)); return a; }
  static int[][] __t_intArr2(Object o) { java.util.List<Object> l = __L(o); int[][] a = new int[l.size()][]; for (int k = 0; k < a.length; k++) a[k] = __t_intArr(l.get(k)); return a; }
  static char[][] __t_charArr2(Object o) { java.util.List<Object> l = __L(o); char[][] a = new char[l.size()][]; for (int k = 0; k < a.length; k++) a[k] = __t_charArr(l.get(k)); return a; }
  static String[][] __t_strArr2(Object o) { java.util.List<Object> l = __L(o); String[][] a = new String[l.size()][]; for (int k = 0; k < a.length; k++) a[k] = __t_strArr(l.get(k)); return a; }
  static java.util.List<Integer> __t_intList(Object o) { java.util.List<Object> l = __L(o); java.util.List<Integer> r = new java.util.ArrayList<>(); for (Object x : l) r.add(__t_int(x)); return r; }
  static java.util.List<String> __t_strList(Object o) { java.util.List<Object> l = __L(o); java.util.List<String> r = new java.util.ArrayList<>(); for (Object x : l) r.add(__t_str(x)); return r; }
  static java.util.List<java.util.List<Integer>> __t_intListList(Object o) { java.util.List<Object> l = __L(o); java.util.List<java.util.List<Integer>> r = new java.util.ArrayList<>(); for (Object x : l) r.add(__t_intList(x)); return r; }

  static String __t_quote(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (int k = 0; k < s.length(); k++) { char c = s.charAt(k);
      switch (c) { case '"': b.append("\\\""); break; case '\\': b.append("\\\\"); break; case '\n': b.append("\\n"); break;
        case '\r': b.append("\\r"); break; case '\t': b.append("\\t"); break;
        default: if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); } }
    b.append("\""); return b.toString();
  }
  @SuppressWarnings("unchecked")
  static String __t_dump(Object v) {
    if (v == null) return "null";
    if (v instanceof Boolean) return ((Boolean) v) ? "true" : "false";
    if (v instanceof Character) return __t_quote(v.toString());
    if (v instanceof String) return __t_quote((String) v);
    if (v instanceof Integer || v instanceof Long) return v.toString();
    if (v instanceof Double || v instanceof Float) { double d = ((Number) v).doubleValue();
      if (d == Math.floor(d) && !Double.isInfinite(d)) return String.valueOf((long) d); return v.toString(); }
    if (v instanceof Number) return v.toString();
    if (v.getClass().isArray()) { int n = java.lang.reflect.Array.getLength(v); StringBuilder b = new StringBuilder("[");
      for (int k = 0; k < n; k++) { if (k > 0) b.append(','); b.append(__t_dump(java.lang.reflect.Array.get(v, k))); } b.append("]"); return b.toString(); }
    if (v instanceof java.util.Map) { java.util.TreeMap<String,Object> t = new java.util.TreeMap<>();
      for (java.util.Map.Entry<?,?> e : ((java.util.Map<?,?>) v).entrySet()) t.put(String.valueOf(e.getKey()), e.getValue());
      StringBuilder b = new StringBuilder("{"); boolean first = true;
      for (java.util.Map.Entry<String,Object> e : t.entrySet()) { if (!first) b.append(','); first = false; b.append(__t_quote(e.getKey())).append(':').append(__t_dump(e.getValue())); }
      b.append("}"); return b.toString(); }
    if (v instanceof Iterable) { StringBuilder b = new StringBuilder("["); boolean first = true;
      for (Object x : (Iterable<Object>) v) { if (!first) b.append(','); first = false; b.append(__t_dump(x)); } b.append("]"); return b.toString(); }
    return __t_quote(v.toString());
  }

  static TreeNode __t_buildTree(Object o) {
    java.util.List<Object> a = __L(o); if (a.isEmpty()) return null;
    TreeNode root = new TreeNode(__t_int(a.get(0))); java.util.ArrayDeque<TreeNode> q = new java.util.ArrayDeque<>(); q.add(root); int i = 1;
    while (!q.isEmpty() && i < a.size()) { TreeNode node = q.poll();
      if (i < a.size()) { Object lv = a.get(i++); if (lv != null) { node.left = new TreeNode(__t_int(lv)); q.add(node.left); } }
      if (i < a.size()) { Object rv = a.get(i++); if (rv != null) { node.right = new TreeNode(__t_int(rv)); q.add(node.right); } } }
    return root;
  }
  static java.util.List<Object> __t_flattenTree(TreeNode root) {
    if (root == null) return new java.util.ArrayList<>();
    // BFS emitting nulls for missing children (LeetCode level-order), trimming trailing nulls.
    // LinkedList (not ArrayDeque) because null children are enqueued.
    java.util.List<Object> res = new java.util.ArrayList<>(); java.util.LinkedList<TreeNode> q = new java.util.LinkedList<>(); q.add(root);
    while (!q.isEmpty()) { TreeNode n = q.poll(); if (n == null) { res.add(null); continue; } res.add(n.val); q.add(n.left); q.add(n.right); }
    int end = res.size(); while (end > 0 && res.get(end - 1) == null) end--;
    return new java.util.ArrayList<>(res.subList(0, end));
  }
  static ListNode __t_buildList(Object o) { java.util.List<Object> a = __L(o); ListNode head = null; for (int k = a.size() - 1; k >= 0; k--) { ListNode n = new ListNode(__t_int(a.get(k))); n.next = head; head = n; } return head; }
  static java.util.List<Object> __t_flattenList(ListNode n) { java.util.List<Object> out = new java.util.ArrayList<>(); while (n != null) { out.add(n.val); n = n.next; } return out; }
  static Node __t_buildGraph(Object o) {
    java.util.List<Object> adj = __L(o); if (adj.isEmpty()) return null;
    java.util.Map<Integer,Node> nodes = new java.util.HashMap<>(); for (int k = 1; k <= adj.size(); k++) nodes.put(k, new Node(k));
    for (int k = 1; k <= adj.size(); k++) { for (Object j : __L(adj.get(k - 1))) nodes.get(k).neighbors.add(nodes.get(__t_int(j))); }
    return nodes.get(1);
  }
  static java.util.List<Object> __t_flattenGraph(Node node) {
    if (node == null) return new java.util.ArrayList<>();
    java.util.TreeMap<Integer,Node> seen = new java.util.TreeMap<>(); java.util.ArrayDeque<Node> q = new java.util.ArrayDeque<>(); q.add(node);
    while (!q.isEmpty()) { Node cur = q.poll(); if (seen.containsKey(cur.val)) continue; seen.put(cur.val, cur); for (Node nb : cur.neighbors) if (!seen.containsKey(nb.val)) q.add(nb); }
    int n = seen.isEmpty() ? 0 : seen.lastKey(); java.util.List<Object> adj = new java.util.ArrayList<>();
    for (int k = 1; k <= n; k++) { java.util.List<Integer> row = new java.util.ArrayList<>(); Node nd = seen.get(k);
      if (nd != null) { for (Node nb : nd.neighbors) row.add(nb.val); java.util.Collections.sort(row); } adj.add(row); }
    return adj;
  }
`;
