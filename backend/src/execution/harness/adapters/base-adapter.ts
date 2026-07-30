import type { ExecutableLanguage } from "../../../shared/types/domain";
import {
  resolveClassName,
  resolveComparison,
  resolveEntryMethod,
  resolveReturnChannel,
  type HarnessSpec,
  type ParameterSpec,
  type SerializationFormat,
  type TypeRef,
} from "../contract";
import type {
  CodeFragment,
  CodegenContext,
  GeneratedHarness,
  HarnessRequest,
  LanguageAdapter,
  TypeSerializerPlugin,
} from "./language-adapter";

/** The value actually serialized to stdout, resolved from the return channel. */
export interface ResolvedOutput {
  /** The serializer for the produced value's type. */
  serializer: TypeSerializerPlugin;
  serializerFragment: CodeFragment;
  type: TypeRef;
  /** RETURN | MUTATION(paramIndex) | VOID */
  channel: ReturnType<typeof resolveReturnChannel>;
}

export interface ResolvedParameter {
  spec: ParameterSpec;
  serializer: TypeSerializerPlugin;
  deserializerFragment: CodeFragment;
}

/**
 * Default wire format for a type when the problem does not pin one explicitly.
 * Object graphs get their conventional encoding; everything else is plain JSON.
 */
export function defaultSerializationFormat(type: TypeRef): SerializationFormat {
  switch (type.base) {
    case "TreeNode":
      return "LEVEL_ORDER";
    case "ListNode":
      return "LINKED_LIST";
    case "DoublyListNode":
    case "RandomListNode":
      return "DOUBLY_LINKED_LIST";
    case "GraphNode":
    case "NaryTreeNode":
      return "ADJACENCY_LIST";
    case "NestedInteger":
      return "NESTED_INTEGER";
    default:
      return "JSON";
  }
}

/**
 * Template-method base for language adapters. It resolves the serializer plugins
 * for every parameter and for the produced output, injects their runtime support,
 * then delegates the language-specific glue to {@link emitMain}/{@link assembleProgram}.
 * Concrete adapters implement only the language-specific rendering.
 */
export abstract class BaseAdapter implements LanguageAdapter {
  abstract readonly language: ExecutableLanguage;

  supports(type: TypeRef, ctx: CodegenContext): boolean {
    try {
      ctx.resolveSerializer(type, defaultSerializationFormat(type));
      return true;
    } catch {
      return false;
    }
  }

  generate(req: HarnessRequest, ctx: CodegenContext): GeneratedHarness {
    const { spec } = req;
    const parameters = this.resolveParameters(spec, ctx);
    const output = this.resolveOutput(spec, ctx);

    // Inject typelib support for every involved type (deduplicated by the sink).
    for (const p of parameters) {
      this.injectRuntime(p.serializer, ctx);
    }
    this.injectRuntime(output.serializer, ctx);

    const mainBody = this.emitMain(spec, parameters, output, ctx);
    const runtime = ctx.collectRuntime();
    const source = this.assembleProgram({
      spec,
      language: this.language,
      runtime,
      userSource: req.userSource,
      mainBody,
    });

    return { source, comparison: resolveComparison(spec) };
  }

  abstract generateStarter(spec: HarnessSpec): string;

  // --- language-specific hooks -------------------------------------------------

  /** Render the generated entry point body (read stdin, call method, print). */
  protected abstract emitMain(
    spec: HarnessSpec,
    parameters: ResolvedParameter[],
    output: ResolvedOutput,
    ctx: CodegenContext,
  ): string;

  /** Stitch the runtime preamble, user source, and generated main into one program. */
  protected abstract assembleProgram(parts: {
    spec: HarnessSpec;
    language: ExecutableLanguage;
    runtime: string[];
    userSource: string;
    mainBody: string;
  }): string;

  // --- shared helpers ----------------------------------------------------------

  protected entryMethod(spec: HarnessSpec): string {
    return resolveEntryMethod(spec, this.language);
  }

  protected className(spec: HarnessSpec): string {
    return resolveClassName(spec);
  }

  protected resolveParameters(spec: HarnessSpec, ctx: CodegenContext): ResolvedParameter[] {
    return spec.parameters.map((p) => {
      const format = p.serialization ?? defaultSerializationFormat(p.type);
      const serializer = ctx.resolveSerializer(p.type, format);
      return {
        spec: p,
        serializer,
        deserializerFragment: serializer.emitDeserializer(p.type, ctx),
      };
    });
  }

  protected resolveOutput(spec: HarnessSpec, ctx: CodegenContext): ResolvedOutput {
    const channel = resolveReturnChannel(spec);
    const type =
      channel.kind === "MUTATION"
        ? spec.parameters[channel.parameterIndex].type
        : spec.returnType;
    const format = defaultSerializationFormat(type);
    const serializer = ctx.resolveSerializer(type, format);
    return {
      serializer,
      serializerFragment: serializer.emitSerializer(type, ctx),
      type,
      channel,
    };
  }

  protected injectRuntime(serializer: TypeSerializerPlugin, ctx: CodegenContext): void {
    const snippet = serializer.runtimeSupport(this.language);
    if (snippet) {
      ctx.requireRuntime(`${serializer.id}:${this.language}`, snippet);
    }
  }
}
