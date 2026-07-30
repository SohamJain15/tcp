import type { ExecutableLanguage } from "../../../shared/types/domain";
import type { HarnessSpec } from "../contract";
import { BaseAdapter, type ResolvedOutput, type ResolvedParameter } from "./base-adapter";
import type { CodegenContext } from "./language-adapter";
import { getLangPrimitives } from "./lang-primitives";

/**
 * Python adapter. Uses the metadata-declared signature directly (no `inspect`,
 * no AST): it instantiates the Solution class and calls the declared entry method
 * with typed, deserialized arguments, then serializes the result to canonical JSON.
 */
export class PythonAdapter extends BaseAdapter {
  readonly language: ExecutableLanguage = "python";

  protected emitMain(
    spec: HarnessSpec,
    parameters: ResolvedParameter[],
    output: ResolvedOutput,
    _ctx: CodegenContext,
  ): string {
    const cls = this.className(spec);
    const method = this.entryMethod(spec);
    const lines: string[] = [];
    lines.push("def __t_main():");
    lines.push("    __t_lines = sys.stdin.read().split('\\n')");

    const argNames = parameters.map((p, i) => {
      const value = p.deserializerFragment.render(`__t_lines[${i}]`);
      lines.push(`    ${p.spec.name} = ${value}`);
      return p.spec.name;
    });

    const call = `${cls}().${method}(${argNames.join(", ")})`;

    if (output.channel.kind === "VOID") {
      lines.push(`    ${call}`);
    } else if (output.channel.kind === "MUTATION") {
      const target = parameters[output.channel.parameterIndex].spec.name;
      lines.push(`    ${call}`);
      lines.push(`    sys.stdout.write(${output.serializerFragment.render(target)})`);
    } else {
      lines.push(`    __t_res = ${call}`);
      lines.push(`    sys.stdout.write(${output.serializerFragment.render("__t_res")})`);
    }

    lines.push("__t_main()");
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
      "# --- user submission ---",
      parts.userSource.trim(),
      "",
      "# --- generated harness ---",
      parts.mainBody,
      "",
    ].join("\n");
  }

  generateStarter(spec: HarnessSpec): string {
    const cls = this.className(spec);
    const method = this.entryMethod(spec);
    const params = spec.parameters.map((p) => p.name).join(", ");
    const args = params ? `self, ${params}` : "self";
    return [
      `class ${cls}:`,
      `    def ${method}(${args}):`,
      "        # Write your code here",
      "        pass",
      "",
    ].join("\n");
  }
}
