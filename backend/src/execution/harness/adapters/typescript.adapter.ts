import type { ExecutableLanguage } from "../../../shared/types/domain";
import { JavaScriptAdapter } from "./javascript.adapter";

const TS_DECLARES = [
  "declare function require(name: string): any;",
  "declare const process: any;",
  "declare const Promise: any;",
].join("\n");

/**
 * TypeScript adapter. The generated harness is valid JS (and thus valid TS); we
 * only prepend ambient declarations so Judge0's TS runtime accepts the Node
 * globals (`require`, `process`) the harness uses. User type annotations are kept
 * verbatim; JSON-parsed args are `any`, which is assignable to any declared type.
 */
export class TypeScriptAdapter extends JavaScriptAdapter {
  readonly language: ExecutableLanguage = "typescript";

  constructor() {
    super("typescript");
  }

  protected assembleProgram(parts: { runtime: string[]; userSource: string; mainBody: string }): string {
    return `${TS_DECLARES}\n${super.assembleProgram(parts)}`;
  }
}
