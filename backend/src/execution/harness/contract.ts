import type { ExecutableLanguage } from "../../shared/types/domain";

/**
 * Version of the {@link HarnessSpec} shape. Bump when the schema changes in a
 * backward-incompatible way so stored problems can be migrated deterministically.
 */
export const HARNESS_SCHEMA_VERSION = 1 as const;

/**
 * How a value is serialized on the wire (canonical JSON-lines). Most types use
 * plain `JSON`; the others describe richer object graphs that cannot be expressed
 * as raw JSON without an agreed convention.
 */
export type SerializationFormat =
  | "JSON"
  | "LEVEL_ORDER"
  | "PREORDER"
  | "INORDER"
  | "POSTORDER"
  | "LINKED_LIST"
  | "DOUBLY_LINKED_LIST"
  | "ADJACENCY_LIST"
  | "EDGE_LIST"
  | "WEIGHTED_EDGE_LIST"
  | "GRID"
  | "NESTED_INTEGER"
  | "INTERVALS"
  | "CUSTOM";

export const SERIALIZATION_FORMATS: readonly SerializationFormat[] = [
  "JSON",
  "LEVEL_ORDER",
  "PREORDER",
  "INORDER",
  "POSTORDER",
  "LINKED_LIST",
  "DOUBLY_LINKED_LIST",
  "ADJACENCY_LIST",
  "EDGE_LIST",
  "WEIGHTED_EDGE_LIST",
  "GRID",
  "NESTED_INTEGER",
  "INTERVALS",
  "CUSTOM",
];

/**
 * A structural description of a value's type, language-independent.
 *
 * `base` is a canonical token: primitives (`int`, `long`, `double`, `float`,
 * `boolean`, `char`, `String`), array shorthands (`int[]`, `int[][]`, `char[][]`,
 * `String[]`, ...), container heads (`List`, `Set`, `Map`, `Queue`, `Deque`,
 * `Stack`, `PriorityQueue`, `Pair`), or a named object type (`TreeNode`,
 * `ListNode`, `GraphNode`, an `Interval`, or a problem-scoped custom type).
 *
 * `of` carries generic arguments, e.g. `List<int>` -> `{ base: "List", of: [{ base: "int" }] }`.
 */
export interface TypeRef {
  base: string;
  of?: TypeRef[];
  nullable?: boolean;
}

export interface ParameterSpec {
  name: string;
  type: TypeRef;
  /** Defaults to a value derived from {@link TypeRef.base} when omitted. */
  serialization?: SerializationFormat;
  /** Required when {@link serialization} is `CUSTOM`; resolves a registered plugin. */
  customFormatId?: string;
}

/** Where the value that gets serialized to stdout comes from. */
export type ReturnChannel =
  | { kind: "RETURN" }
  | { kind: "MUTATION"; parameterIndex: number }
  | { kind: "VOID" };

/** How the expected output is compared against the produced stdout. */
export type ComparisonMode =
  | { mode: "EXACT" }
  | { mode: "WHITESPACE" }
  | { mode: "UNORDERED"; depth?: number }
  | { mode: "FLOAT"; epsilon: number }
  | { mode: "CHECKER"; checkerId: string };

export interface LanguageOverride {
  entryMethod?: string;
  imports?: string[];
  starter?: string;
  disabled?: boolean;
}

export interface CustomTypeSpec {
  name: string;
  fields: { name: string; type: TypeRef }[];
  serialization?: SerializationFormat;
}

/**
 * The complete, language-independent contract a problem publishes so the judging
 * framework can generate a wrapper for any supported language. Absent on a problem
 * => legacy raw-stdin behaviour (see `wrapLegacy`).
 */
export interface HarnessSpec {
  schemaVersion: typeof HARNESS_SCHEMA_VERSION;
  entryMethod: string;
  className?: string;
  parameters: ParameterSpec[];
  returnType: TypeRef;
  returnChannel?: ReturnChannel;
  comparison?: ComparisonMode;
  languageOverrides?: Partial<Record<ExecutableLanguage, LanguageOverride>>;
  customTypes?: CustomTypeSpec[];
}

export const DEFAULT_CLASS_NAME = "Solution";
export const DEFAULT_RETURN_CHANNEL: ReturnChannel = { kind: "RETURN" };
export const DEFAULT_COMPARISON: ComparisonMode = { mode: "EXACT" };

export function resolveReturnChannel(spec: HarnessSpec): ReturnChannel {
  return spec.returnChannel ?? DEFAULT_RETURN_CHANNEL;
}

export function resolveComparison(spec: HarnessSpec): ComparisonMode {
  return spec.comparison ?? DEFAULT_COMPARISON;
}

export function resolveClassName(spec: HarnessSpec): string {
  return spec.className ?? DEFAULT_CLASS_NAME;
}

export function resolveEntryMethod(spec: HarnessSpec, language: ExecutableLanguage): string {
  return spec.languageOverrides?.[language]?.entryMethod ?? spec.entryMethod;
}

export function isLanguageDisabled(spec: HarnessSpec, language: ExecutableLanguage): boolean {
  return spec.languageOverrides?.[language]?.disabled === true;
}
