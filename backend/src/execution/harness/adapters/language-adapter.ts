import type { ExecutableLanguage } from "../../../shared/types/domain";
import type {
  ComparisonMode,
  HarnessSpec,
  SerializationFormat,
  TypeRef,
} from "../contract";

/**
 * A unit of generated target-language code. `render(inputExpr)` turns an input
 * expression into the fragment's output expression; `helpers` are declarations
 * (functions, structs) that must be injected once into the harness preamble.
 */
export interface CodeFragment {
  render(inputExpr: string): string;
  helpers?: string;
}

/**
 * Threaded through code generation. Adapters and serializer plugins use it to
 * resolve nested serializers, inject deduplicated runtime support, and mint
 * collision-free temporary identifiers.
 */
export interface CodegenContext {
  readonly spec: HarnessSpec;
  readonly language: ExecutableLanguage;
  /** Resolve the serializer plugin for a (type, format) pair. */
  resolveSerializer(type: TypeRef, format?: SerializationFormat): TypeSerializerPlugin;
  /** Inject a typelib snippet once, keyed by id (later duplicates are ignored). */
  requireRuntime(id: string, snippet: string): void;
  /** All injected typelib snippets so far, in insertion order (deduplicated). */
  collectRuntime(): string[];
  /** Unique identifier for a temporary, e.g. `__t_v3`. */
  freshVar(prefix?: string): string;
}

/**
 * The Open/Closed extension point for types. Register one per logical type family
 * (primitives, arrays, collections, binary tree, linked list, graph, interval,
 * custom). Adding a new supported type never edits an adapter or the generator.
 */
export interface TypeSerializerPlugin {
  readonly id: string;
  readonly formats: readonly SerializationFormat[];
  /** Whether this plugin can (de)serialize the given type. */
  handles(type: TypeRef): boolean;
  /** Code that converts a parsed-JSON expression into a native typed value. */
  emitDeserializer(type: TypeRef, ctx: CodegenContext): CodeFragment;
  /** Code that converts a native value into a canonical-JSON string expression. */
  emitSerializer(type: TypeRef, ctx: CodegenContext): CodeFragment;
  /** Host-side (TS) canonicalization, for authoring expected_output and comparison. */
  canonicalize(value: unknown, type: TypeRef): string;
  /** typelib snippet to inject for this type in a language, or null if none. */
  runtimeSupport(language: ExecutableLanguage): string | null;
}

export interface HarnessRequest {
  spec: HarnessSpec;
  userSource: string;
  language: ExecutableLanguage;
}

export interface GeneratedHarness {
  /** Full program to hand to the execution provider. */
  source: string;
  /** Echoed so the provider knows whether to delegate comparison to Judge0 or run locally. */
  comparison: ComparisonMode;
}

/** One per language. Turns a {@link HarnessRequest} into a runnable program. */
export interface LanguageAdapter {
  readonly language: ExecutableLanguage;
  /** Capability probe used for validation and offering a language on a problem. */
  supports(type: TypeRef, ctx: CodegenContext): boolean;
  /** Generate the full wrapper program around the (untouched) user source. */
  generate(req: HarnessRequest, ctx: CodegenContext): GeneratedHarness;
  /** Generate empty starter code with the correct signature for the editor. */
  generateStarter(spec: HarnessSpec): string;
}
