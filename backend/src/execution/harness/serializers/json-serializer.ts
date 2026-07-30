import type { ExecutableLanguage } from "../../../shared/types/domain";
import type {
  CodeFragment,
  CodegenContext,
  TypeSerializerPlugin,
} from "../adapters/language-adapter";
import { getLangPrimitives } from "../adapters/lang-primitives";
import { canonicalStringify } from "../canonical";
import type { SerializationFormat, TypeRef } from "../contract";
import { HarnessGenerationError } from "../errors";

const PRIMITIVES = new Set(["int", "long", "float", "double", "boolean", "char", "String"]);
const COLLECTIONS = new Set([
  "List",
  "Set",
  "Map",
  "Queue",
  "Deque",
  "Stack",
  "PriorityQueue",
  "Pair",
  "Tuple",
  "Interval",
]);

function isArrayType(base: string): boolean {
  return base.endsWith("[]");
}

function isSetLike(type: TypeRef): boolean {
  return type.base === "Set";
}

function isFloatLike(type: TypeRef): boolean {
  return type.base === "float" || type.base === "double";
}

/**
 * Handles every type whose canonical wire form is plain JSON: primitives,
 * arrays / matrices, and JSON-native collections (List/Map/Set/Queue/Deque/
 * Stack/PriorityQueue/Pair/Interval). Object graphs (TreeNode, ListNode,
 * GraphNode) are handled by dedicated plugins registered with higher precedence.
 */
export class JsonValueSerializer implements TypeSerializerPlugin {
  readonly id = "json";
  readonly formats: readonly SerializationFormat[] = ["JSON", "GRID", "INTERVALS"];

  handles(type: TypeRef): boolean {
    return PRIMITIVES.has(type.base) || isArrayType(type.base) || COLLECTIONS.has(type.base);
  }

  emitDeserializer(type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return {
      render: (line) => {
        const parsed = lp.parseLine(line);
        if (isSetLike(type)) {
          return lp.wrapSet(parsed);
        }
        if (isFloatLike(type)) {
          return lp.wrapFloat(parsed);
        }
        return parsed;
      },
    };
  }

  emitSerializer(type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return {
      render: (value) => (isSetLike(type) ? lp.dumpSet(value) : lp.dump(value)),
    };
  }

  private primitives(ctx: CodegenContext) {
    try {
      return getLangPrimitives(ctx.language);
    } catch {
      throw new HarnessGenerationError(
        `JSON (de)serializer not available for "${ctx.language}"`,
        ctx.language,
      );
    }
  }

  canonicalize(value: unknown, type: TypeRef): string {
    if (isSetLike(type) && Array.isArray(value)) {
      return canonicalStringify([...value].sort());
    }
    return canonicalStringify(value);
  }

  runtimeSupport(): string | null {
    // The base preamble (json import + __t_dump) is injected by the adapter, not per-type.
    return null;
  }
}
