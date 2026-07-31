import type { ExecutableLanguage } from "../../../shared/types/domain";
import {
  BATCH_CASE_SEPARATOR,
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
 * C++ adapter (serves cpp and arduino-as-cpp is out of scope). Uses type-directed
 * templated (de)serialization: `__t_parse<T>(line)` reads a value of the declared
 * native type, `__t_dump(value)` writes canonical JSON. The user's Solution class
 * is called directly with the metadata signature.
 */
export class CppAdapter implements LanguageAdapter {
  readonly language: ExecutableLanguage;

  constructor(language: ExecutableLanguage = "cpp") {
    this.language = language;
  }

  supports(type: TypeRef): boolean {
    try {
      this.nativeType(type);
      return true;
    } catch {
      return false;
    }
  }

  private nativeType(type: TypeRef): string {
    switch (type.base) {
      case "int":
        return "int";
      case "long":
        return "long long";
      case "double":
      case "float":
        return "double";
      case "boolean":
        return "bool";
      case "char":
        return "char";
      case "String":
        return "string";
      case "int[]":
        return "vector<int>";
      case "long[]":
        return "vector<long long>";
      case "double[]":
        return "vector<double>";
      case "boolean[]":
        return "vector<bool>";
      case "char[]":
        return "vector<char>";
      case "String[]":
        return "vector<string>";
      case "int[][]":
        return "vector<vector<int>>";
      case "char[][]":
        return "vector<vector<char>>";
      case "String[][]":
        return "vector<vector<string>>";
      case "TreeNode":
        return "TreeNode*";
      case "ListNode":
        return "ListNode*";
      case "GraphNode":
        return "Node*";
      case "List": {
        const inner = type.of?.[0];
        return `vector<${inner ? this.nativeType(inner) : "int"}>`;
      }
      default:
        throw new HarnessGenerationError(`Unsupported C++ type "${type.base}"`, this.language);
    }
  }

  private deserialize(type: TypeRef, lineExpr: string): string {
    if (type.base === "TreeNode") return `__t_buildTree(${lineExpr})`;
    if (type.base === "ListNode") return `__t_buildList(${lineExpr})`;
    if (type.base === "GraphNode") return `__t_buildGraph(${lineExpr})`;
    return `__t_parse<${this.nativeType(type)}>(${lineExpr})`;
  }

  private serialize(type: TypeRef, valueExpr: string): string {
    // The flatten helpers already return canonical JSON strings, so do not re-dump.
    if (type.base === "TreeNode") return `__t_flattenTree(${valueExpr})`;
    if (type.base === "ListNode") return `__t_flattenList(${valueExpr})`;
    if (type.base === "GraphNode") return `__t_flattenGraph(${valueExpr})`;
    return `__t_dump(${valueExpr})`;
  }

  generate(req: HarnessRequest, _ctx: CodegenContext): GeneratedHarness {
    const spec = req.spec;
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, this.language);
    const channel = resolveReturnChannel(spec);

    // In batch mode the same declarations are emitted inside a per-case loop, reading from a
    // sliding offset into the input lines instead of from the top of the file.
    const batch = req.batch === true;
    const lineAt = (index: number) => (batch ? `__t_lines[__t_base + ${index}]` : `__t_lines[${index}]`);
    const indent = batch ? "        " : "    ";

    const decls: string[] = [];
    const argNames: string[] = [];
    spec.parameters.forEach((p, i) => {
      decls.push(`${indent}auto ${p.name} = ${this.deserialize(p.type, lineAt(i))};`);
      argNames.push(p.name);
    });

    const call = `sol.${method}(${argNames.join(", ")})`;
    let invoke: string;
    if (channel.kind === "VOID") {
      invoke = `${indent}${call};`;
    } else if (channel.kind === "MUTATION") {
      const target = spec.parameters[channel.parameterIndex];
      invoke = `${indent}${call};\n${indent}cout << ${this.serialize(target.type, target.name)};`;
    } else {
      invoke = `${indent}auto __t_res = ${call};\n${indent}cout << ${this.serialize(spec.returnType, "__t_res")};`;
    }

    const source = [
      CPP_HEADERS,
      "",
      CPP_TYPES,
      CPP_HELPERS,
      "",
      "// --- user submission ---",
      req.userSource.trim(),
      "",
      "// --- generated harness ---",
      "int main() {",
      "    ios::sync_with_stdio(false); cin.tie(nullptr);",
      "    string __t_all((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());",
      "    vector<string> __t_lines; { string cur; for (char c : __t_all) { if (c == '\\n') { __t_lines.push_back(cur); cur.clear(); } else cur += c; } __t_lines.push_back(cur); }",
      ...(batch
        ? [
            // Batched: leading case count, then a fixed-width block of lines per case.
            "    int __t_n = __t_lines.empty() ? 0 : atoi(__t_lines[0].c_str());",
            `    const int __t_width = ${spec.parameters.length};`,
            "    for (int __t_i = 0; __t_i < __t_n; ++__t_i) {",
            "        const int __t_base = 1 + __t_i * __t_width;",
            `        ${cls} sol;`,
            ...decls,
            invoke,
            `        cout << "\\n${BATCH_CASE_SEPARATOR}\\n";`,
            "    }",
          ]
        : [`    ${cls} sol;`, ...decls, invoke]),
      "    return 0;",
      "}",
      "",
    ].join("\n");

    return { source, comparison: resolveComparison(spec), batched: batch };
  }

  generateStarter(spec: HarnessSpec): string {
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, this.language);
    const params = spec.parameters.map((p) => `${this.nativeType(p.type)} ${p.name}`).join(", ");
    const channel = resolveReturnChannel(spec);
    const retType = channel.kind === "VOID" ? "void" : this.nativeType(spec.returnType);
    const body =
      channel.kind === "RETURN"
        ? "        // Write your code here\n        return {};"
        : "        // Write your code here";
    return [
      `class ${cls} {`,
      "public:",
      `    ${retType} ${method}(${params}) {`,
      body,
      "    }",
      "};",
      "",
    ].join("\n");
  }
}

const CPP_HEADERS = [
  "#include <iostream>",
  "#include <vector>",
  "#include <string>",
  "#include <algorithm>",
  "#include <sstream>",
  "#include <queue>",
  "#include <map>",
  "#include <set>",
  "#include <unordered_map>",
  "#include <unordered_set>",
  "#include <cctype>",
  "#include <cstdio>",
  "using namespace std;",
].join("\n");

const CPP_TYPES = [
  "struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int v) : val(v), left(nullptr), right(nullptr) {} };",
  "struct ListNode { int val; ListNode* next; ListNode(int v) : val(v), next(nullptr) {} };",
  "struct Node { int val; vector<Node*> neighbors; Node(int v) : val(v) {} };",
].join("\n");

const CPP_HELPERS = String.raw`
struct __TJsonReader {
  const string& s; size_t i = 0;
  __TJsonReader(const string& s_) : s(s_) {}
  void ws() { while (i < s.size() && isspace((unsigned char) s[i])) i++; }
  char peek() { ws(); return i < s.size() ? s[i] : '\0'; }
  void skip() { i++; }
  bool isNull() { ws(); if (s.compare(i, 4, "null") == 0) { i += 4; return true; } return false; }
  long long readInt() { ws(); size_t j = i; if (i < s.size() && (s[i] == '+' || s[i] == '-')) i++; while (i < s.size() && isdigit((unsigned char) s[i])) i++; return stoll(s.substr(j, i - j)); }
  double readDouble() { ws(); size_t j = i; while (i < s.size() && (isdigit((unsigned char) s[i]) || s[i] == '+' || s[i] == '-' || s[i] == '.' || s[i] == 'e' || s[i] == 'E')) i++; return stod(s.substr(j, i - j)); }
  bool readBool() { ws(); if (s.compare(i, 4, "true") == 0) { i += 4; return true; } i += 5; return false; }
  string readString() { ws(); string r; i++; while (i < s.size() && s[i] != '"') { if (s[i] == '\\') { i++; char c = s[i++]; switch (c) { case 'n': r += '\n'; break; case 't': r += '\t'; break; case 'r': r += '\r'; break; case '"': r += '"'; break; case '\\': r += '\\'; break; case '/': r += '/'; break; case 'b': r += '\b'; break; case 'f': r += '\f'; break; case 'u': { int cp = stoi(s.substr(i, 4), 0, 16); i += 4; r += (char) cp; break; } default: r += c; } } else r += s[i++]; } i++; return r; }
};

inline void __t_read(__TJsonReader& r, int& out) { out = (int) r.readInt(); }
inline void __t_read(__TJsonReader& r, long long& out) { out = r.readInt(); }
inline void __t_read(__TJsonReader& r, double& out) { out = r.readDouble(); }
inline void __t_read(__TJsonReader& r, bool& out) { out = r.readBool(); }
inline void __t_read(__TJsonReader& r, string& out) { out = r.readString(); }
inline void __t_read(__TJsonReader& r, char& out) { string t = r.readString(); out = t.empty() ? '\0' : t[0]; }
template <class T> void __t_read(__TJsonReader& r, vector<T>& out) { r.ws(); r.skip(); if (r.peek() == ']') { r.skip(); return; } while (true) { T v{}; __t_read(r, v); out.push_back(v); char c = r.peek(); r.skip(); if (c == ']') break; } }
template <class T> T __t_parse(const string& line) { __TJsonReader r(line); T v{}; __t_read(r, v); return v; }

inline string __t_quote(const string& s) { string b = "\""; for (char c : s) { switch (c) { case '"': b += "\\\""; break; case '\\': b += "\\\\"; break; case '\n': b += "\\n"; break; case '\r': b += "\\r"; break; case '\t': b += "\\t"; break; default: if ((unsigned char) c < 0x20) { char buf[8]; snprintf(buf, sizeof(buf), "\\u%04x", c); b += buf; } else b += c; } } b += "\""; return b; }
inline string __t_dump(int v) { return to_string(v); }
inline string __t_dump(long long v) { return to_string(v); }
inline string __t_dump(bool v) { return v ? "true" : "false"; }
inline string __t_dump(double v) { if (v == (long long) v) return to_string((long long) v); ostringstream o; o << v; return o.str(); }
inline string __t_dump(char c) { return __t_quote(string(1, c)); }
inline string __t_dump(const string& s) { return __t_quote(s); }
template <class T> string __t_dump(const vector<T>& v) { string r = "["; for (size_t k = 0; k < v.size(); k++) { if (k) r += ","; r += __t_dump(v[k]); } r += "]"; return r; }

inline TreeNode* __t_buildTree(const string& line) {
  __TJsonReader r(line); r.ws(); r.skip(); if (r.peek() == ']') return nullptr;
  auto readCell = [&](bool& isNull) -> int { if (r.isNull()) { isNull = true; return 0; } isNull = false; return (int) r.readInt(); };
  bool n0; int v0 = readCell(n0); if (n0) return nullptr; TreeNode* root = new TreeNode(v0);
  queue<TreeNode*> q; q.push(root); { char c = r.peek(); r.skip(); if (c == ']') return root; }
  while (!q.empty()) { TreeNode* node = q.front(); q.pop();
    { bool nl; int lv = readCell(nl); if (!nl) { node->left = new TreeNode(lv); q.push(node->left); } char c = r.peek(); r.skip(); if (c == ']') break; }
    { bool nr; int rv = readCell(nr); if (!nr) { node->right = new TreeNode(rv); q.push(node->right); } char c = r.peek(); r.skip(); if (c == ']') break; } }
  return root;
}
inline string __t_flattenTree(TreeNode* root) {
  if (!root) return "[]";
  vector<string> res; queue<TreeNode*> q; q.push(root);
  while (!q.empty()) { TreeNode* n = q.front(); q.pop(); if (!n) { res.push_back("null"); continue; } res.push_back(to_string(n->val)); q.push(n->left); q.push(n->right); }
  while (!res.empty() && res.back() == "null") res.pop_back();
  string out = "["; for (size_t k = 0; k < res.size(); k++) { if (k) out += ","; out += res[k]; } out += "]"; return out;
}
inline ListNode* __t_buildList(const string& line) { auto a = __t_parse<vector<int>>(line); ListNode* head = nullptr; for (int k = (int) a.size() - 1; k >= 0; k--) { ListNode* n = new ListNode(a[k]); n->next = head; head = n; } return head; }
inline string __t_flattenList(ListNode* n) { vector<int> out; while (n) { out.push_back(n->val); n = n->next; } return __t_dump(out); }
inline Node* __t_buildGraph(const string& line) {
  auto adj = __t_parse<vector<vector<int>>>(line); if (adj.empty()) return nullptr;
  vector<Node*> nodes(adj.size() + 1, nullptr); for (size_t k = 1; k <= adj.size(); k++) nodes[k] = new Node((int) k);
  for (size_t k = 1; k <= adj.size(); k++) for (int j : adj[k - 1]) nodes[k]->neighbors.push_back(nodes[j]);
  return nodes[1];
}
inline string __t_flattenGraph(Node* node) {
  if (!node) return "[]";
  map<int, Node*> seen; queue<Node*> q; q.push(node);
  while (!q.empty()) { Node* cur = q.front(); q.pop(); if (seen.count(cur->val)) continue; seen[cur->val] = cur; for (Node* nb : cur->neighbors) if (!seen.count(nb->val)) q.push(nb); }
  int n = seen.empty() ? 0 : seen.rbegin()->first; vector<vector<int>> adj(n);
  for (auto& pr : seen) { vector<int> row; for (Node* nb : pr.second->neighbors) row.push_back(nb->val); sort(row.begin(), row.end()); adj[pr.first - 1] = row; }
  return __t_dump(adj);
}
`;
