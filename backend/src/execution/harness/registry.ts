import type { ExecutableLanguage } from "../../shared/types/domain";
import type {
  CodegenContext,
  LanguageAdapter,
  TypeSerializerPlugin,
} from "./adapters/language-adapter";
import { CheckerComparator } from "./comparator/checker";
import type { CheckerPlugin, Comparator } from "./comparator/comparator";
import { ExactComparator, WhitespaceComparator } from "./comparator/exact";
import { FloatComparator } from "./comparator/float";
import { UnorderedComparator } from "./comparator/unordered";
import type { ComparisonMode, HarnessSpec, SerializationFormat, TypeRef } from "./contract";
import { UnsupportedTypeError } from "./errors";

/**
 * Central wiring for the judging framework. Holds the language adapters, the
 * serializer plugins (the Open/Closed extension point for types), and the
 * comparators. Populated once at bootstrap and shared as a singleton.
 */
export class HarnessRegistry {
  private readonly adapters = new Map<ExecutableLanguage, LanguageAdapter>();
  private readonly serializers: TypeSerializerPlugin[] = [];
  private readonly checkers = new Map<string, CheckerPlugin>();
  private readonly comparators: Map<ComparisonMode["mode"], Comparator>;

  constructor() {
    this.comparators = new Map<ComparisonMode["mode"], Comparator>([
      ["EXACT", new ExactComparator()],
      ["WHITESPACE", new WhitespaceComparator()],
      ["UNORDERED", new UnorderedComparator()],
      ["FLOAT", new FloatComparator()],
      ["CHECKER", new CheckerComparator(this.checkers)],
    ]);
  }

  registerAdapter(adapter: LanguageAdapter): this {
    this.adapters.set(adapter.language, adapter);
    return this;
  }

  registerSerializer(plugin: TypeSerializerPlugin): this {
    // Later registrations take precedence (unshift) so callers can override built-ins.
    this.serializers.unshift(plugin);
    return this;
  }

  registerChecker(checker: CheckerPlugin): this {
    this.checkers.set(checker.id, checker);
    return this;
  }

  getAdapter(language: ExecutableLanguage): LanguageAdapter | undefined {
    return this.adapters.get(language);
  }

  hasAdapter(language: ExecutableLanguage): boolean {
    return this.adapters.has(language);
  }

  getComparator(mode: ComparisonMode["mode"]): Comparator {
    const comparator = this.comparators.get(mode);
    if (!comparator) {
      throw new Error(`No comparator registered for mode "${mode}"`);
    }
    return comparator;
  }

  hasChecker(id: string): boolean {
    return this.checkers.has(id);
  }

  /**
   * Resolve the serializer plugin for a type. When `format` is provided (e.g.
   * LEVEL_ORDER) a plugin must both handle the type and advertise the format.
   */
  resolveSerializer(
    type: TypeRef,
    language: ExecutableLanguage,
    format?: SerializationFormat,
  ): TypeSerializerPlugin {
    for (const plugin of this.serializers) {
      if (!plugin.handles(type)) {
        continue;
      }
      if (format && format !== "JSON" && !plugin.formats.includes(format)) {
        continue;
      }
      return plugin;
    }
    throw new UnsupportedTypeError(type, language);
  }

  /** Build a codegen context bound to a spec, language, and injection sink. */
  createContext(
    spec: HarnessSpec,
    language: ExecutableLanguage,
    sink: { runtime: Map<string, string>; counter: { value: number } },
  ): CodegenContext {
    const registry = this;
    return {
      spec,
      language,
      resolveSerializer(type: TypeRef, fmt?: SerializationFormat) {
        return registry.resolveSerializer(type, language, fmt);
      },
      requireRuntime(id: string, snippet: string) {
        if (!sink.runtime.has(id)) {
          sink.runtime.set(id, snippet);
        }
      },
      collectRuntime() {
        return Array.from(sink.runtime.values());
      },
      freshVar(prefix = "v") {
        sink.counter.value += 1;
        return `__t_${prefix}${sink.counter.value}`;
      },
    };
  }
}

/** Process-wide singleton, populated by registerHarness() at bootstrap. */
export const harnessRegistry = new HarnessRegistry();
