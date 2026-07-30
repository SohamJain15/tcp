import type { ExecutableLanguage } from "../../../shared/types/domain";
import type { HarnessSpec } from "../contract";
import { BaseAdapter, type ResolvedOutput, type ResolvedParameter } from "./base-adapter";
import type { CodegenContext } from "./language-adapter";
import { getLangPrimitives } from "./lang-primitives";

/**
 * Node.js adapter (serves both `javascript` and `vanilla`). Instantiates the
 * Solution class and calls the metadata-declared entry method with typed args,
 * awaiting the result so async solutions work, then writes canonical JSON.
 */
export class JavaScriptAdapter extends BaseAdapter {
  readonly language: ExecutableLanguage;

  constructor(language: ExecutableLanguage = "javascript") {
    super();
    this.language = language;
  }

  protected emitMain(
    spec: HarnessSpec,
    parameters: ResolvedParameter[],
    output: ResolvedOutput,
    _ctx: CodegenContext,
  ): string {
    const cls = this.className(spec);
    const method = this.entryMethod(spec);
    const lines: string[] = [];
    lines.push("(async () => {");
    lines.push("  const __t_lines = __t_read().split('\\n');");

    const argNames = parameters.map((p, i) => {
      lines.push(`  const ${p.spec.name} = ${p.deserializerFragment.render(`__t_lines[${i}]`)};`);
      return p.spec.name;
    });

    const call = `await new ${cls}().${method}(${argNames.join(", ")})`;

    if (output.channel.kind === "VOID") {
      lines.push(`  ${call};`);
    } else if (output.channel.kind === "MUTATION") {
      const target = parameters[output.channel.parameterIndex].spec.name;
      lines.push(`  ${call};`);
      lines.push(`  process.stdout.write(${output.serializerFragment.render(target)});`);
    } else {
      lines.push(`  const __t_res = ${call};`);
      lines.push(`  process.stdout.write(${output.serializerFragment.render("__t_res")});`);
    }

    lines.push("})();");
    return lines.join("\n");
  }

  protected assembleProgram(parts: {
    runtime: string[];
    userSource: string;
    mainBody: string;
  }): string {
    const lp = getLangPrimitives(this.language);
    return [
      lp.preamble,
      ...parts.runtime,
      "",
      "// --- user submission ---",
      parts.userSource.trim(),
      "",
      "// --- generated harness ---",
      parts.mainBody,
      "",
    ].join("\n");
  }

  generateStarter(spec: HarnessSpec): string {
    const cls = this.className(spec);
    const method = this.entryMethod(spec);
    const params = spec.parameters.map((p) => p.name).join(", ");
    return [`class ${cls} {`, `  ${method}(${params}) {`, "    // Write your code here", "  }", "}", ""].join("\n");
  }
}
