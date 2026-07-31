import type { ExecutableLanguage } from "../../../shared/types/domain";
import {
  BATCH_CASE_SEPARATOR,
  resolveComparison,
  resolveEntryMethod,
  resolveReturnChannel,
  type HarnessSpec,
  type TypeRef,
} from "../contract";
import { HarnessGenerationError } from "../errors";
import type { CodegenContext, GeneratedHarness, HarnessRequest, LanguageAdapter } from "./language-adapter";

/**
 * C adapter. C has no classes, so it uses LeetCode's free-function convention:
 * arrays expand to `(pointer, size)` parameters, a returned array is produced via
 * a caller-provided `*returnSize` (and `**returnColumnSizes` for 2-D), and
 * TreeNode/ListNode use the canonical LeetCode C structs. The adapter mechanically
 * expands the declared signature; the metadata is unchanged from other languages.
 */
export class CAdapter implements LanguageAdapter {
  readonly language: ExecutableLanguage = "c";

  supports(type: TypeRef): boolean {
    return SUPPORTED_PARAM.has(type.base) || SUPPORTED_RETURN.has(type.base);
  }

  generate(req: HarnessRequest, _ctx: CodegenContext): GeneratedHarness {
    const spec = req.spec;
    const fn = resolveEntryMethod(spec, "c");
    const channel = resolveReturnChannel(spec);

    // In batch mode the same declarations run inside a per-case loop, reading from a sliding
    // offset into the line table instead of from the top of the input.
    const batch = req.batch === true;

    const decls: string[] = [];
    const callArgs: string[] = [];
    spec.parameters.forEach((p, i) => {
      const line = batch ? `__T_LINE(__t_base + ${i})` : `__T_LINE(${i})`;
      switch (p.type.base) {
        case "int":
        case "long":
        case "char":
          decls.push(`    int ${p.name} = (int) __c_pInt(${line});`);
          callArgs.push(p.name);
          break;
        case "double":
        case "float":
          decls.push(`    double ${p.name} = __c_pDouble(${line});`);
          callArgs.push(p.name);
          break;
        case "boolean":
          decls.push(`    bool ${p.name} = __c_pBool(${line});`);
          callArgs.push(p.name);
          break;
        case "String":
          decls.push(`    char* ${p.name} = __c_pStr(${line});`);
          callArgs.push(p.name);
          break;
        case "int[]":
          decls.push(`    int ${p.name}Size; int* ${p.name} = __c_intArr(${line}, &${p.name}Size);`);
          callArgs.push(p.name, `${p.name}Size`);
          break;
        case "int[][]":
          decls.push(
            `    int ${p.name}Size; int* ${p.name}ColSize; int** ${p.name} = __c_intGrid(${line}, &${p.name}Size, &${p.name}ColSize);`,
          );
          callArgs.push(p.name, `${p.name}Size`, `${p.name}ColSize`);
          break;
        case "char[][]":
          decls.push(
            `    int ${p.name}Size; int* ${p.name}ColSize; char** ${p.name} = __c_charGrid(${line}, &${p.name}Size, &${p.name}ColSize);`,
          );
          callArgs.push(p.name, `${p.name}Size`, `${p.name}ColSize`);
          break;
        case "TreeNode":
          decls.push(`    struct TreeNode* ${p.name} = __c_buildTree(${line});`);
          callArgs.push(p.name);
          break;
        case "ListNode":
          decls.push(`    struct ListNode* ${p.name} = __c_buildList(${line});`);
          callArgs.push(p.name);
          break;
        default:
          throw new HarnessGenerationError(`Unsupported C parameter type "${p.type.base}"`, "c");
      }
    });

    const out = this.emitReturn(spec, channel, fn, callArgs);
    // Every emitted line already carries 4 spaces; inside the batch loop they need one more level.
    const nest = (body: string[]) => (batch ? body.map((line) => `    ${line}`) : body);

    const source = [
      C_HEADERS,
      C_TYPES,
      C_HELPERS,
      "",
      "/* --- user submission --- */",
      req.userSource.trim(),
      "",
      "/* --- generated harness --- */",
      "int main(void) {",
      C_READ_LINES,
      ...(batch
        ? [
            // Batched: leading case count, then a fixed-width block of lines per case.
            "    int __t_n = __t_nlines > 0 ? (int) __c_pInt(__T_LINE(0)) : 0;",
            `    const int __t_width = ${spec.parameters.length};`,
            "    for (int __t_i = 0; __t_i < __t_n; ++__t_i) {",
            "        const int __t_base = 1 + __t_i * __t_width;",
            ...nest(decls),
            ...nest(out),
            `        printf("\\n${BATCH_CASE_SEPARATOR}\\n");`,
            "    }",
          ]
        : [...decls, ...out]),
      "    return 0;",
      "}",
      "",
    ].join("\n");

    return { source, comparison: resolveComparison(spec), batched: batch };
  }

  private emitReturn(
    spec: HarnessSpec,
    channel: ReturnType<typeof resolveReturnChannel>,
    fn: string,
    callArgs: string[],
  ): string[] {
    if (channel.kind === "VOID") {
      return [`    ${fn}(${callArgs.join(", ")});`];
    }
    if (channel.kind === "MUTATION") {
      // Mutation on an int[] parameter: the function receives (arr, size); re-print it.
      const target = spec.parameters[channel.parameterIndex];
      if (target.type.base !== "int[]") {
        throw new HarnessGenerationError("C MUTATION supported only for int[] parameters", "c");
      }
      return [
        `    ${fn}(${callArgs.join(", ")});`,
        `    __c_dumpIntArr(${target.name}, ${target.name}Size);`,
      ];
    }
    const rt = spec.returnType.base;
    switch (rt) {
      case "int":
      case "long":
      case "char":
        return [`    int __t_res = ${fn}(${callArgs.join(", ")});`, `    printf("%d", __t_res);`];
      case "boolean":
        return [
          `    bool __t_res = ${fn}(${callArgs.join(", ")});`,
          `    printf("%s", __t_res ? "true" : "false");`,
        ];
      case "double":
      case "float":
        return [`    double __t_res = ${fn}(${callArgs.join(", ")});`, `    __c_dumpDouble(__t_res);`];
      case "String":
        return [`    char* __t_res = ${fn}(${callArgs.join(", ")});`, `    __c_dumpStr(__t_res);`];
      case "int[]": {
        const args = [...callArgs, "&__t_rn"].join(", ");
        return [`    int __t_rn; int* __t_res = ${fn}(${args});`, `    __c_dumpIntArr(__t_res, __t_rn);`];
      }
      case "int[][]": {
        const args = [...callArgs, "&__t_rn", "&__t_rc"].join(", ");
        return [
          `    int __t_rn; int* __t_rc; int** __t_res = ${fn}(${args});`,
          `    __c_dumpIntGrid(__t_res, __t_rn, __t_rc);`,
        ];
      }
      case "TreeNode":
        return [`    struct TreeNode* __t_res = ${fn}(${callArgs.join(", ")});`, `    __c_dumpTree(__t_res);`];
      case "ListNode":
        return [`    struct ListNode* __t_res = ${fn}(${callArgs.join(", ")});`, `    __c_dumpList(__t_res);`];
      default:
        throw new HarnessGenerationError(`Unsupported C return type "${rt}"`, "c");
    }
  }

  generateStarter(spec: HarnessSpec): string {
    const fn = resolveEntryMethod(spec, "c");
    const channel = resolveReturnChannel(spec);
    const params: string[] = [];
    spec.parameters.forEach((p) => params.push(...cParamDecl(p.type, p.name)));
    if (channel.kind === "RETURN" && spec.returnType.base === "int[]") params.push("int* returnSize");
    if (channel.kind === "RETURN" && spec.returnType.base === "int[][]") {
      params.push("int* returnSize", "int** returnColumnSizes");
    }
    const ret = cReturnType(channel.kind === "VOID" ? { base: "void" } : spec.returnType);
    return [`${ret} ${fn}(${params.join(", ")}) {`, "    // Write your code here", "}", ""].join("\n");
  }
}

const SUPPORTED_PARAM = new Set([
  "int",
  "long",
  "double",
  "float",
  "boolean",
  "char",
  "String",
  "int[]",
  "int[][]",
  "char[][]",
  "TreeNode",
  "ListNode",
]);
const SUPPORTED_RETURN = new Set([
  "int",
  "long",
  "double",
  "float",
  "boolean",
  "char",
  "String",
  "int[]",
  "int[][]",
  "TreeNode",
  "ListNode",
]);

function cReturnType(type: TypeRef): string {
  switch (type.base) {
    case "void":
      return "void";
    case "int":
    case "long":
    case "char":
      return "int";
    case "double":
    case "float":
      return "double";
    case "boolean":
      return "bool";
    case "String":
      return "char*";
    case "int[]":
      return "int*";
    case "int[][]":
      return "int**";
    case "TreeNode":
      return "struct TreeNode*";
    case "ListNode":
      return "struct ListNode*";
    default:
      throw new HarnessGenerationError(`Unsupported C return type "${type.base}"`, "c");
  }
}

function cParamDecl(type: TypeRef, name: string): string[] {
  switch (type.base) {
    case "int":
    case "long":
    case "char":
      return [`int ${name}`];
    case "double":
    case "float":
      return [`double ${name}`];
    case "boolean":
      return [`bool ${name}`];
    case "String":
      return [`char* ${name}`];
    case "int[]":
      return [`int* ${name}`, `int ${name}Size`];
    case "int[][]":
      return [`int** ${name}`, `int ${name}Size`, `int* ${name}ColSize`];
    case "char[][]":
      return [`char** ${name}`, `int ${name}Size`, `int* ${name}ColSize`];
    case "TreeNode":
      return [`struct TreeNode* ${name}`];
    case "ListNode":
      return [`struct ListNode* ${name}`];
    default:
      throw new HarnessGenerationError(`Unsupported C parameter type "${type.base}"`, "c");
  }
}

const C_HEADERS = ["#include <stdio.h>", "#include <stdlib.h>", "#include <string.h>", "#include <stdbool.h>"].join(
  "\n",
);

const C_TYPES = [
  "struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; };",
  "struct ListNode { int val; struct ListNode *next; };",
].join("\n");

/**
 * Reads all of stdin and indexes it by line.
 *
 * The line table grows on demand: it used to be a fixed `char*[64]` written without a bounds
 * check, so any input over 64 lines (a large grid, a dense edge list, or a batched run)
 * smashed the stack. `__T_LINE` also makes a short input read as an empty string rather than
 * running off the end of the table.
 */
const C_READ_LINES = [
  "    char* __t_buf = NULL; size_t __t_cap = 0, __t_len = 0; int __t_ch;",
  "    while ((__t_ch = getchar()) != EOF) { if (__t_len + 1 >= __t_cap) { __t_cap = __t_cap ? __t_cap * 2 : 256; __t_buf = realloc(__t_buf, __t_cap); } __t_buf[__t_len++] = (char) __t_ch; }",
  "    if (!__t_buf) { __t_buf = malloc(1); }",
  "    __t_buf[__t_len] = '\\0';",
  "    char** __t_lines = NULL; int __t_nlines = 0, __t_lcap = 0;",
  "    { char* p = __t_buf; for (;;) { if (__t_nlines >= __t_lcap) { __t_lcap = __t_lcap ? __t_lcap * 2 : 64; __t_lines = realloc(__t_lines, (size_t) __t_lcap * sizeof(char*)); } __t_lines[__t_nlines++] = p; while (*p && *p != '\\n') p++; if (!*p) break; *p = '\\0'; p++; } }",
  "    #define __T_LINE(i) ((i) >= 0 && (i) < __t_nlines ? __t_lines[i] : \"\")",
].join("\n");

const C_HELPERS = String.raw`
static const char* __c_ws(const char* p) { while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++; return p; }
static long __c_pInt(const char* s) { s = __c_ws(s); return strtol(s, NULL, 10); }
static double __c_pDouble(const char* s) { s = __c_ws(s); return strtod(s, NULL); }
static bool __c_pBool(const char* s) { s = __c_ws(s); return s[0] == 't'; }
static char* __c_pStr(const char* s) {
  s = __c_ws(s); if (*s == '"') s++; size_t n = strlen(s); char* r = malloc(n + 1); size_t k = 0;
  while (*s && *s != '"') { if (*s == '\\') { s++; char c = *s++; switch (c) { case 'n': r[k++] = '\n'; break; case 't': r[k++] = '\t'; break; default: r[k++] = c; } } else r[k++] = *s++; }
  r[k] = '\0'; return r;
}
static int* __c_intArr(const char* s, int* n) {
  s = __c_ws(s); if (*s == '[') s++; s = __c_ws(s);
  int cap = 8, cnt = 0; int* a = malloc(sizeof(int) * cap);
  if (*s == ']') { *n = 0; return a; }
  while (1) { char* end; long v = strtol(s, &end, 10); s = end; if (cnt == cap) { cap *= 2; a = realloc(a, sizeof(int) * cap); } a[cnt++] = (int) v; s = __c_ws(s); if (*s == ',') { s++; s = __c_ws(s); continue; } break; }
  *n = cnt; return a;
}
static const char* __c_skipElem(const char* s) {
  s = __c_ws(s); int depth = 0;
  while (*s) { if (*s == '[') depth++; else if (*s == ']') { depth--; s++; if (depth == 0) return s; continue; } else if (*s == '"') { s++; while (*s && *s != '"') { if (*s == '\\') s++; s++; } } s++; if (depth == 0 && (*s == ',' || *s == ']')) return s; }
  return s;
}
static int** __c_intGrid(const char* s, int* rows, int** colSizes) {
  s = __c_ws(s); if (*s == '[') s++; s = __c_ws(s);
  int cap = 8, cnt = 0; int** g = malloc(sizeof(int*) * cap); int* cs = malloc(sizeof(int) * cap);
  if (*s == ']') { *rows = 0; *colSizes = cs; return g; }
  while (1) { int m; int* row = __c_intArr(s, &m); if (cnt == cap) { cap *= 2; g = realloc(g, sizeof(int*) * cap); cs = realloc(cs, sizeof(int) * cap); } g[cnt] = row; cs[cnt] = m; cnt++; s = __c_skipElem(s); s = __c_ws(s); if (*s == ',') { s++; s = __c_ws(s); continue; } break; }
  *rows = cnt; *colSizes = cs; return g;
}
static char* __c_charRow(const char* s, int* n) {
  s = __c_ws(s); if (*s == '[') s++; s = __c_ws(s);
  int cap = 8, cnt = 0; char* a = malloc(cap);
  if (*s == ']') { *n = 0; return a; }
  while (1) { s = __c_ws(s); char c = 0; if (*s == '"') { s++; c = *s; while (*s && *s != '"') s++; if (*s == '"') s++; } if (cnt == cap) { cap *= 2; a = realloc(a, cap); } a[cnt++] = c; s = __c_ws(s); if (*s == ',') { s++; continue; } break; }
  *n = cnt; return a;
}
static char** __c_charGrid(const char* s, int* rows, int** colSizes) {
  s = __c_ws(s); if (*s == '[') s++; s = __c_ws(s);
  int cap = 8, cnt = 0; char** g = malloc(sizeof(char*) * cap); int* cs = malloc(sizeof(int) * cap);
  if (*s == ']') { *rows = 0; *colSizes = cs; return g; }
  while (1) { int m; char* row = __c_charRow(s, &m); if (cnt == cap) { cap *= 2; g = realloc(g, sizeof(char*) * cap); cs = realloc(cs, sizeof(int) * cap); } g[cnt] = row; cs[cnt] = m; cnt++; s = __c_skipElem(s); s = __c_ws(s); if (*s == ',') { s++; s = __c_ws(s); continue; } break; }
  *rows = cnt; *colSizes = cs; return g;
}

static void __c_quoteStr(const char* s) { putchar('"'); for (; *s; s++) { char c = *s; if (c == '"') printf("\\\""); else if (c == '\\') printf("\\\\"); else if (c == '\n') printf("\\n"); else if (c == '\t') printf("\\t"); else if (c == '\r') printf("\\r"); else putchar(c); } putchar('"'); }
static void __c_dumpStr(const char* s) { if (!s) { printf("null"); return; } __c_quoteStr(s); }
static void __c_dumpDouble(double v) { if (v == (long long) v) printf("%lld", (long long) v); else printf("%g", v); }
static void __c_dumpIntArr(int* a, int n) { putchar('['); for (int k = 0; k < n; k++) { if (k) putchar(','); printf("%d", a[k]); } putchar(']'); }
static void __c_dumpIntGrid(int** g, int n, int* cs) { putchar('['); for (int k = 0; k < n; k++) { if (k) putchar(','); __c_dumpIntArr(g[k], cs[k]); } putchar(']'); }

static struct TreeNode* __c_buildTree(const char* s) {
  int n; char has; (void) has;
  s = __c_ws(s); if (*s == '[') s++; s = __c_ws(s); if (*s == ']') return NULL;
  /* Read cells as either an integer or the token null. */
  struct TreeNode* nodes_root = NULL; struct TreeNode** q = malloc(sizeof(struct TreeNode*) * 1); int qcap = 1, qh = 0, qt = 0; (void) n;
  #define __C_PUSH(x) do { if (qt == qcap) { qcap *= 2; q = realloc(q, sizeof(struct TreeNode*) * qcap); } q[qt++] = (x); } while (0)
  /* first value */
  { char* end; long v = strtol(s, &end, 10); s = end; nodes_root = malloc(sizeof(struct TreeNode)); nodes_root->val = (int) v; nodes_root->left = nodes_root->right = NULL; __C_PUSH(nodes_root); }
  s = __c_ws(s); if (*s == ',') s++;
  while (qh < qt) {
    struct TreeNode* node = q[qh++];
    for (int side = 0; side < 2; side++) {
      s = __c_ws(s); if (*s == '\0' || *s == ']') { s = ""; break; }
      if (s[0] == 'n') { s += 4; }
      else { char* end; long v = strtol(s, &end, 10); s = end; struct TreeNode* child = malloc(sizeof(struct TreeNode)); child->val = (int) v; child->left = child->right = NULL; if (side == 0) node->left = child; else node->right = child; __C_PUSH(child); }
      s = __c_ws(s); if (*s == ',') s++;
    }
  }
  free(q); return nodes_root;
  #undef __C_PUSH
}
static void __c_dumpTree(struct TreeNode* root) {
  if (!root) { printf("[]"); return; }
  struct TreeNode** q = malloc(sizeof(struct TreeNode*) * 16); int cap = 16, h = 0, t = 0;
  int* isnull = malloc(sizeof(int) * 16);
  #define __C_PUSHT(x, nul) do { if (t == cap) { cap *= 2; q = realloc(q, sizeof(struct TreeNode*) * cap); isnull = realloc(isnull, sizeof(int) * cap); } q[t] = (x); isnull[t] = (nul); t++; } while (0)
  __C_PUSHT(root, 0);
  /* collect values with nulls */
  int* vals = malloc(sizeof(int) * 16); int* vnull = malloc(sizeof(int) * 16); int vc = 0, vcap = 16;
  while (h < t) { struct TreeNode* n = q[h]; int nul = isnull[h]; h++;
    if (vc == vcap) { vcap *= 2; vals = realloc(vals, sizeof(int) * vcap); vnull = realloc(vnull, sizeof(int) * vcap); }
    if (nul) { vnull[vc] = 1; vals[vc] = 0; vc++; continue; }
    vnull[vc] = 0; vals[vc] = n->val; vc++;
    __C_PUSHT(n->left, n->left ? 0 : 1); __C_PUSHT(n->right, n->right ? 0 : 1);
  }
  while (vc > 0 && vnull[vc - 1]) vc--;
  putchar('['); for (int k = 0; k < vc; k++) { if (k) putchar(','); if (vnull[k]) printf("null"); else printf("%d", vals[k]); } putchar(']');
  free(q); free(isnull); free(vals); free(vnull);
  #undef __C_PUSHT
}
static struct ListNode* __c_buildList(const char* s) {
  int n; int* a = __c_intArr(s, &n); struct ListNode* head = NULL;
  for (int k = n - 1; k >= 0; k--) { struct ListNode* node = malloc(sizeof(struct ListNode)); node->val = a[k]; node->next = head; head = node; }
  free(a); return head;
}
static void __c_dumpList(struct ListNode* n) { putchar('['); int first = 1; while (n) { if (!first) putchar(','); first = 0; printf("%d", n->val); n = n->next; } putchar(']'); }
`;
