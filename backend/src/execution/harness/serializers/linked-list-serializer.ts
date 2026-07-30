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

const PYTHON_RUNTIME = [
  "class ListNode:",
  "    def __init__(self, val=0, next=None):",
  "        self.val = val; self.next = next",
  "def __t_build_list(arr):",
  "    head = None",
  "    for v in reversed(arr):",
  "        head = ListNode(v, head)",
  "    return head",
  "def __t_flatten_list(node):",
  "    out = []",
  "    while node is not None:",
  "        out.append(node.val); node = node.next",
  "    return out",
].join("\n");

const JS_RUNTIME = [
  "class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }",
  "const __t_build_list = (arr) => { let head = null; for (let i = arr.length - 1; i >= 0; i--) head = new ListNode(arr[i], head); return head; };",
  "const __t_flatten_list = (node) => { const out = []; while (node) { out.push(node.val); node = node.next; } return out; };",
].join("\n");

const RUNTIME: Partial<Record<ExecutableLanguage, string>> = {
  python: PYTHON_RUNTIME,
  javascript: JS_RUNTIME,
  vanilla: JS_RUNTIME,
  typescript: JS_RUNTIME,
};

/** Singly linked list via a JSON array head->tail (e.g. `[1,2,3]`). */
export class LinkedListSerializer implements TypeSerializerPlugin {
  readonly id = "linked-list";
  readonly formats: readonly SerializationFormat[] = ["LINKED_LIST"];

  handles(type: TypeRef): boolean {
    return type.base === "ListNode";
  }

  emitDeserializer(_type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return { render: (line) => `__t_build_list(${lp.parseLine(line)})` };
  }

  emitSerializer(_type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return { render: (value) => lp.dump(`__t_flatten_list(${value})`) };
  }

  canonicalize(value: unknown): string {
    return canonicalStringify(value);
  }

  runtimeSupport(language: ExecutableLanguage): string | null {
    return RUNTIME[language] ?? null;
  }

  private primitives(ctx: CodegenContext) {
    if (!RUNTIME[ctx.language]) {
      throw new HarnessGenerationError(`ListNode not implemented for "${ctx.language}"`, ctx.language);
    }
    return getLangPrimitives(ctx.language);
  }
}
