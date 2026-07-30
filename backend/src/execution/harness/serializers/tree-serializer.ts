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
  "class TreeNode:",
  "    def __init__(self, val=0, left=None, right=None):",
  "        self.val = val; self.left = left; self.right = right",
  "def __t_build_tree(arr):",
  "    if not arr:",
  "        return None",
  "    it = iter(arr)",
  "    root = TreeNode(next(it)); q = deque([root])",
  "    while q:",
  "        node = q.popleft()",
  "        try:\n            lv = next(it)\n        except StopIteration:\n            break",
  "        if lv is not None:",
  "            node.left = TreeNode(lv); q.append(node.left)",
  "        try:\n            rv = next(it)\n        except StopIteration:\n            break",
  "        if rv is not None:",
  "            node.right = TreeNode(rv); q.append(node.right)",
  "    return root",
  "def __t_flatten_tree(root):",
  "    if root is None:",
  "        return []",
  "    out = []; q = deque([root])",
  "    while q:",
  "        n = q.popleft()",
  "        if n is None:",
  "            out.append(None); continue",
  "        out.append(n.val); q.append(n.left); q.append(n.right)",
  "    while out and out[-1] is None:",
  "        out.pop()",
  "    return out",
].join("\n");

const JS_RUNTIME = [
  "class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }",
  "const __t_build_tree = (arr) => {",
  "  if (!arr || arr.length === 0) return null;",
  "  const root = new TreeNode(arr[0]); const q = [root]; let i = 1;",
  "  while (q.length && i < arr.length) {",
  "    const node = q.shift();",
  "    if (i < arr.length) { const lv = arr[i++]; if (lv !== null) { node.left = new TreeNode(lv); q.push(node.left); } }",
  "    if (i < arr.length) { const rv = arr[i++]; if (rv !== null) { node.right = new TreeNode(rv); q.push(node.right); } }",
  "  }",
  "  return root;",
  "};",
  "const __t_flatten_tree = (root) => {",
  "  if (!root) return [];",
  "  const out = []; const q = [root];",
  "  while (q.length) { const n = q.shift(); if (n === null) { out.push(null); continue; } out.push(n.val); q.push(n.left); q.push(n.right); }",
  "  while (out.length && out[out.length - 1] === null) out.pop();",
  "  return out;",
  "};",
].join("\n");

const RUNTIME: Partial<Record<ExecutableLanguage, string>> = {
  python: PYTHON_RUNTIME,
  javascript: JS_RUNTIME,
  vanilla: JS_RUNTIME,
  typescript: JS_RUNTIME,
};

/** Binary tree via level-order-with-nulls (e.g. `[1,null,2,3]`). */
export class BinaryTreeSerializer implements TypeSerializerPlugin {
  readonly id = "binary-tree";
  readonly formats: readonly SerializationFormat[] = [
    "LEVEL_ORDER",
    "PREORDER",
    "INORDER",
    "POSTORDER",
  ];

  handles(type: TypeRef): boolean {
    return type.base === "TreeNode";
  }

  emitDeserializer(_type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return { render: (line) => `__t_build_tree(${lp.parseLine(line)})` };
  }

  emitSerializer(_type: TypeRef, ctx: CodegenContext): CodeFragment {
    const lp = this.primitives(ctx);
    return { render: (value) => lp.dump(`__t_flatten_tree(${value})`) };
  }

  canonicalize(value: unknown): string {
    return canonicalStringify(value);
  }

  runtimeSupport(language: ExecutableLanguage): string | null {
    return RUNTIME[language] ?? null;
  }

  private primitives(ctx: CodegenContext) {
    if (!RUNTIME[ctx.language]) {
      throw new HarnessGenerationError(`TreeNode not implemented for "${ctx.language}"`, ctx.language);
    }
    return getLangPrimitives(ctx.language);
  }
}
