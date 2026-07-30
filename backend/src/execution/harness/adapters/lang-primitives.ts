import type { ExecutableLanguage } from "../../../shared/types/domain";

/**
 * Language-level (not type-level) codegen primitives shared by every serializer
 * plugin: how to parse one canonical-JSON line into a native value, dump a native
 * value back to canonical JSON, and the few type-shape coercions that are purely
 * syntactic per language (sets, floats). Adding a new *type* never edits this file
 * (that is a new plugin); adding a new *language* adds one entry here plus a
 * LanguageAdapter.
 */
export interface LangPrimitives {
  readonly language: ExecutableLanguage;
  /** Snippet injected once into the harness preamble (imports + `__t_dump`). */
  readonly preamble: string;
  /** Expression: parse a JSON-encoded string expression into a native value. */
  parseLine(lineExpr: string): string;
  /** Expression: turn a native value expression into a canonical-JSON string. */
  dump(valueExpr: string): string;
  /** Expression: build a native set from a parsed JSON array expression. */
  wrapSet(arrayExpr: string): string;
  /** Expression: coerce a parsed JSON number expression to a float. */
  wrapFloat(numberExpr: string): string;
  /** Expression: canonical dump of a native set (sorted for determinism). */
  dumpSet(setExpr: string): string;
}

const python: LangPrimitives = {
  language: "python",
  preamble: [
    "import json, sys",
    "from collections import deque",
    "def __t_dump(x):",
    "    return json.dumps(x, separators=(',',':'), sort_keys=True, ensure_ascii=False)",
  ].join("\n"),
  parseLine: (line) => `json.loads(${line})`,
  dump: (value) => `__t_dump(${value})`,
  wrapSet: (arr) => `set(${arr})`,
  wrapFloat: (num) => `float(${num})`,
  dumpSet: (set) => `__t_dump(sorted(${set}))`,
};

const javascript: LangPrimitives = {
  language: "javascript",
  preamble: [
    "const __t_read = () => require('fs').readFileSync(0, 'utf8');",
    "const __t_dump = (x) => {",
    "  if (x === null || x === undefined) return 'null';",
    "  if (Array.isArray(x)) return '[' + x.map(__t_dump).join(',') + ']';",
    "  if (typeof x === 'boolean') return x ? 'true' : 'false';",
    "  if (typeof x === 'object') {",
    "    const keys = Object.keys(x).sort();",
    "    return '{' + keys.map((k) => JSON.stringify(k) + ':' + __t_dump(x[k])).join(',') + '}';",
    "  }",
    "  return JSON.stringify(x);",
    "};",
  ].join("\n"),
  parseLine: (line) => `JSON.parse(${line})`,
  dump: (value) => `__t_dump(${value})`,
  wrapSet: (arr) => `new Set(${arr})`,
  wrapFloat: (num) => `Number(${num})`,
  dumpSet: (set) => `__t_dump([...${set}].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))`,
};

const LANG_PRIMITIVES: Partial<Record<ExecutableLanguage, LangPrimitives>> = {
  python,
  javascript,
  // "vanilla" is Node JavaScript; "typescript" runs the same Node harness.
  vanilla: { ...javascript, language: "vanilla" },
  typescript: { ...javascript, language: "typescript" },
};

export function getLangPrimitives(language: ExecutableLanguage): LangPrimitives {
  const lp = LANG_PRIMITIVES[language];
  if (!lp) {
    throw new Error(`No language primitives defined for "${language}"`);
  }
  return lp;
}

export function hasLangPrimitives(language: ExecutableLanguage): boolean {
  return LANG_PRIMITIVES[language] !== undefined;
}
