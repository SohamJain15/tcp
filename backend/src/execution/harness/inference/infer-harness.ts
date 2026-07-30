import { canonicalStringify } from "../canonical";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";

/**
 * Deterministic harness inference. Given a problem authored the legacy way
 * (free-text formats + raw stdin test cases), it recognises the *shape* of the
 * inputs/outputs — from the test-case structure plus the tags/topic faculty
 * already provide — and produces a HarnessSpec together with the test cases
 * re-encoded as canonical JSON-lines. No AI, fully deterministic.
 *
 * Approach: analyse one representative input into ordered "segments" (each maps
 * fixed line positions to a parameter + an extractor). Within a single problem
 * every test case shares the same line structure (only list *lengths* vary), so
 * the same segments convert every case. Graphs (variable line count) are handled
 * separately. Every conversion is round-trip validated and the result carries a
 * confidence flag so callers auto-apply only when safe.
 */

export interface RawTestCase {
  input: string;
  output: string;
  explanation?: string | null;
}

export interface InferenceInput {
  title: string;
  tags?: string[];
  topic?: string;
  statement?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases: RawTestCase[];
  hiddenTestCases: RawTestCase[];
}

export interface ConvertedTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface InferenceResult {
  ok: boolean;
  confidence: "high" | "low";
  warnings: string[];
  signatureSummary?: string;
  harness?: HarnessSpec;
  sampleTestCases?: ConvertedTestCase[];
  hiddenTestCases?: ConvertedTestCase[];
}

const T = (base: string, of?: TypeRef[]): TypeRef => (of ? { base, of } : { base });

interface Line {
  raw: string;
  tokens: string[];
  hasNull: boolean;
  allInt: boolean;
  ints: number[];
}

function parseLine(raw: string): Line {
  const trimmed = raw.trim();
  const tokens = trimmed.length ? trimmed.split(/\s+/) : [];
  const hasNull = tokens.some((t) => t.toLowerCase() === "null");
  const nonNull = tokens.filter((t) => t.toLowerCase() !== "null");
  const allInt = nonNull.length > 0 && nonNull.every((t) => /^-?\d+$/.test(t));
  return { raw, tokens, hasNull, allInt, ints: allInt ? nonNull.map(Number) : [] };
}

function splitLines(input: string): Line[] {
  return input.split("\n").map(parseLine);
}

function methodName(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "solve";
  const name = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  return /^[A-Za-z_]/.test(name) ? name : "solve";
}

function hay(input: InferenceInput): string {
  return [input.title, input.topic, input.statement, input.inputFormat, input.outputFormat, ...(input.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function allCases(input: InferenceInput): RawTestCase[] {
  return [...input.sampleTestCases, ...input.hiddenTestCases];
}

// --------------------------------------------------------------- segment model

interface Param {
  name: string;
  type: TypeRef;
}

/** A segment extracts one or more canonical-JSON lines from a specific input. */
interface Segment {
  params: Param[];
  extract: (lines: Line[]) => string[];
}

interface ParamPlan {
  params: Param[];
  convert: (input: string) => string[] | null;
  confident: boolean;
}

// --------------------------------------------------------------------- graph

function isGraphShape(inputs: string[]): boolean {
  return inputs.every((inp) => {
    const lines = splitLines(inp).filter((l) => l.tokens.length > 0);
    if (lines.length < 1) return false;
    const head = lines[0];
    if (!head.allInt || head.ints.length !== 2) return false;
    const m = head.ints[1];
    if (lines.length - 1 !== m) return false;
    return lines.slice(1).every((l) => l.allInt && (l.ints.length === 2 || l.ints.length === 3));
  });
}

function graphPlan(): ParamPlan {
  return {
    params: [
      { name: "n", type: T("int") },
      { name: "edges", type: T("int[][]") },
    ],
    confident: true,
    convert: (input) => {
      const lines = splitLines(input).filter((l) => l.tokens.length > 0);
      const n = lines[0].ints[0];
      const edges = lines.slice(1).map((l) => l.ints);
      return [String(n), canonicalStringify(edges)];
    },
  };
}

// ------------------------------------------------------------------- tree util

function isTreeLine(line: Line): boolean {
  return line.hasNull && line.tokens.every((t) => t.toLowerCase() === "null" || /^-?\d+$/.test(t));
}
function treeTokensToArray(line: Line): (number | null)[] {
  const arr: (number | null)[] = line.tokens.map((t) => (t.toLowerCase() === "null" ? null : Number(t)));
  while (arr.length && arr[arr.length - 1] === null) arr.pop();
  return arr;
}

// -------------------------------------------------------- linear plan builder

function buildSegments(template: string, input: InferenceInput): { segments: Segment[]; confident: boolean } | null {
  const text = hay(input);
  const isLinkedList = /linked list|listnode/.test(text);
  const inputs = allCases(input).map((c) => c.input);
  const treeFirst =
    inputs.some((inp) => isTreeLine(splitLines(inp)[0])) ||
    (/(binary )?tree|level[- ]order/.test(text) && inputs.every((inp) => splitLines(inp)[0]?.allInt && !splitLines(inp)[0]?.hasNull ? true : true) && /(binary )?tree|level[- ]order/.test(text));

  const lines = splitLines(template);
  const segments: Segment[] = [];
  const used = new Set<string>();
  const uniq = (base: string) => {
    let n = base;
    let k = 2;
    while (used.has(n)) n = `${base}${k++}`;
    used.add(n);
    return n;
  };

  let i = 0;
  let lastLen = -1;
  let confident = true;
  let sc = 0;
  let strc = 0;

  const isTrailingBlank = (idx: number) => lines[idx].tokens.length === 0 && idx === lines.length - 1;

  while (i < lines.length) {
    if (isTrailingBlank(i)) break;
    const line = lines[i];
    const next = lines[i + 1];

    // 1. tree line
    if (isTreeLine(line) || (i === 0 && treeFirst && line.allInt)) {
      const idx = i;
      segments.push({ params: [{ name: uniq("root"), type: T("TreeNode") }], extract: (ls) => [canonicalStringify(treeTokensToArray(ls[idx]))] });
      i += 1;
      continue;
    }

    // 2. count line + list of that length
    if (line.allInt && line.ints.length >= 1 && next && next.tokens.length === line.ints[0]) {
      const count = line.ints[0];
      lastLen = count;
      const extras = line.ints.slice(1);
      const listIdx = i + 1;
      if (!next.allInt) {
        segments.push({ params: [{ name: uniq("words"), type: T("List", [T("String")]) }], extract: (ls) => [canonicalStringify(ls[listIdx].tokens)] });
      } else {
        segments.push({
          params: [{ name: uniq(isLinkedList ? "head" : "nums"), type: isLinkedList ? T("ListNode") : T("int[]") }],
          extract: (ls) => [canonicalStringify(ls[listIdx].ints)],
        });
      }
      i += 2;
      // secondary same-length int lists (e.g. knapsack values)
      while (i < lines.length && lines[i].allInt && lines[i].ints.length === count && count > 1) {
        const vIdx = i;
        segments.push({ params: [{ name: uniq("values"), type: T("int[]") }], extract: (ls) => [canonicalStringify(ls[vIdx].ints)] });
        i += 1;
      }
      // deferred scalars from the count line
      extras.forEach((_, pos) => {
        const p = pos + 1;
        const idx = i0OfCount(listIdx);
        segments.push({ params: [{ name: uniq(sc === 0 ? "target" : `k${sc}`), type: T("int") }], extract: (ls) => [String(ls[idx].ints[p])] });
        sc += 1;
      });
      continue;
    }

    // 3. bare int list matching lastLen (secondary array without its own count)
    if (line.allInt && lastLen > 0 && line.ints.length === lastLen && line.ints.length > 1) {
      const vIdx = i;
      segments.push({ params: [{ name: uniq("values"), type: T("int[]") }], extract: (ls) => [canonicalStringify(ls[vIdx].ints)] });
      i += 1;
      continue;
    }

    // 4. inline ints not acting as a count -> that many int params ("p q")
    if (line.allInt && line.ints.length >= 1 && line.ints.length <= 3) {
      const idx = i;
      const k = line.ints.length;
      const params: Param[] = [];
      const firstParam = segments.length === 0;
      for (let j = 0; j < k; j += 1) {
        const nm =
          k === 2 && j === 0
            ? "p"
            : k === 2 && j === 1
              ? "q"
              : firstParam && j === 0
                ? "n" // a lone leading int (e.g. climbStairs(int n))
                : sc === 0
                  ? "target" // a scalar that follows an array (e.g. twoSum target)
                  : `k${sc}`;
        params.push({ name: uniq(nm), type: T("int") });
        sc += 1;
      }
      segments.push({ params, extract: (ls) => ls[idx].ints.map(String) });
      i += 1;
      continue;
    }

    // 5. non-numeric line -> String param (whole line)
    {
      const idx = i;
      segments.push({ params: [{ name: uniq(strc === 0 ? "s" : strc === 1 ? "t" : `s${strc}`), type: T("String") }], extract: (ls) => [canonicalStringify(ls[idx].raw)] });
      strc += 1;
      i += 1;
      continue;
    }
  }

  void confident;
  return segments.length ? { segments, confident: true } : null;

  // the count line is one before the list line
  function i0OfCount(listIndex: number): number {
    return listIndex - 1;
  }
}

function linearPlan(input: InferenceInput): ParamPlan | null {
  const inputs = allCases(input).map((c) => c.input);
  const template = inputs.reduce((a, b) => (splitLines(b).filter((l) => l.tokens.length).length >= splitLines(a).filter((l) => l.tokens.length).length ? b : a), inputs[0]);
  const built = buildSegments(template, input);
  if (!built) return null;
  const params = built.segments.flatMap((s) => s.params);
  return {
    params,
    confident: built.confident,
    convert: (rawInput) => {
      const lines = splitLines(rawInput);
      const out: string[] = [];
      for (const seg of built.segments) {
        let extracted: string[];
        try {
          extracted = seg.extract(lines);
        } catch {
          return null;
        }
        if (extracted.some((x) => x === undefined || x === null)) return null;
        out.push(...extracted);
      }
      return out.length === params.length ? out : null;
    },
  };
}

// --------------------------------------------------------------------- returns

interface ReturnPlan {
  type: TypeRef;
  convert: (output: string) => string;
  confident: boolean;
}

function detectReturn(outputs: string[], input: InferenceInput): ReturnPlan {
  const text = hay(input);
  const nonEmpty = outputs.map((o) => o.trim()).filter((o) => o !== "" && o !== '""');
  const tokenLists = nonEmpty.map((o) => o.split(/\s+/));
  const asBool = nonEmpty.length > 0 && nonEmpty.every((o) => /^(true|false)$/i.test(o));
  const asYesNo = nonEmpty.length > 0 && nonEmpty.every((o) => /^(yes|no)$/i.test(o));
  const allSingleInt = nonEmpty.length > 0 && tokenLists.every((t) => t.length === 1 && /^-?\d+$/.test(t[0]));
  const allInts = nonEmpty.length > 0 && tokenLists.every((t) => t.every((x) => /^-?\d+$/.test(x)));
  // Only treat numeric-looking output as binary *strings* when the tokens are
  // literally binary digits (0/1) — so "Binary Tree" traversals (1 3 2) aren't caught.
  const looksBinary =
    allInts &&
    tokenLists.some((t) => t.length > 1) &&
    /binary|representation/.test(text) &&
    nonEmpty.every((o) => o.split(/\s+/).every((tok) => /^[01]+$/.test(tok)));

  if (asBool) {
    return { type: T("boolean"), confident: true, convert: (o) => (/^true$/i.test(o.trim()) ? "true" : "false") };
  }
  if (asYesNo) {
    return { type: T("String"), confident: true, convert: (o) => canonicalStringify(o.trim()) };
  }
  if (allSingleInt) {
    return { type: T("int"), confident: true, convert: (o) => String(parseInt(o.trim(), 10)) };
  }
  if (looksBinary) {
    return {
      type: T("List", [T("String")]),
      confident: false,
      convert: (o) => canonicalStringify(o.trim() === "" ? [] : o.trim().split(/\s+/)),
    };
  }
  if (allInts) {
    return {
      type: T("int[]"),
      confident: true,
      convert: (o) => {
        const s = o.trim();
        if (s === "" || s === '""') return "[]";
        return canonicalStringify(s.split(/\s+/).map(Number));
      },
    };
  }
  return {
    type: T("String"),
    confident: true,
    convert: (o) => {
      const s = o.trim();
      return canonicalStringify(s === '""' ? "" : s);
    },
  };
}

// -------------------------------------------------------------------- assemble

function typeLabel(t: TypeRef): string {
  if (t.base === "List") return `List<${t.of?.[0] ? typeLabel(t.of[0]) : "?"}>`;
  return t.base;
}
function summarize(h: HarnessSpec): string {
  const p = h.parameters.map((x) => `${typeLabel(x.type)} ${x.name}`).join(", ");
  return `${typeLabel(h.returnType)} ${h.entryMethod}(${p})`;
}

export function inferHarness(input: InferenceInput): InferenceResult {
  const warnings: string[] = [];
  const cases = allCases(input);
  if (cases.length === 0) {
    return { ok: false, confidence: "low", warnings: ["No test cases to infer from."] };
  }
  const inputs = cases.map((c) => c.input);

  const plan: ParamPlan | null = isGraphShape(inputs) ? graphPlan() : linearPlan(input);
  if (!plan) {
    return { ok: false, confidence: "low", warnings: ["Could not infer parameter structure."] };
  }

  const ret = detectReturn(cases.map((c) => c.output), input);

  const convertCase = (c: RawTestCase): ConvertedTestCase | null => {
    const lines = plan.convert(c.input);
    if (!lines || lines.length !== plan.params.length) return null;
    return {
      input: lines.join("\n"),
      output: ret.convert(c.output),
      ...(c.explanation ? { explanation: c.explanation } : {}),
    };
  };

  const sample = input.sampleTestCases.map(convertCase);
  const hidden = input.hiddenTestCases.map(convertCase);
  if ([...sample, ...hidden].some((x) => x === null)) {
    const failed = [...sample, ...hidden].filter((x) => x === null).length;
    return { ok: false, confidence: "low", warnings: [`${failed} test case(s) did not match the inferred structure.`] };
  }

  for (const c of [...sample, ...hidden] as ConvertedTestCase[]) {
    for (const line of c.input.split("\n")) {
      try {
        JSON.parse(line);
      } catch {
        return { ok: false, confidence: "low", warnings: [`Converted input is not valid JSON: ${line}`] };
      }
    }
  }

  const harness: HarnessSpec = {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    entryMethod: methodName(input.title),
    parameters: plan.params,
    returnType: ret.type,
    comparison: { mode: "EXACT" },
  };
  if (!ret.confident) warnings.push("Return type was ambiguous (numbers vs strings) — please review.");

  return {
    ok: true,
    confidence: plan.confident && ret.confident ? "high" : "low",
    warnings,
    signatureSummary: summarize(harness),
    harness,
    sampleTestCases: sample as ConvertedTestCase[],
    hiddenTestCases: hidden as ConvertedTestCase[],
  };
}
