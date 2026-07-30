import type { ExecutableLanguage } from "../../../shared/types/domain";
import {
  resolveClassName,
  resolveComparison,
  resolveEntryMethod,
  resolveReturnChannel,
  type HarnessSpec,
  type TypeRef,
} from "../contract";
import { HarnessGenerationError } from "../errors";
import type { CodegenContext, GeneratedHarness, HarnessRequest, LanguageAdapter } from "./language-adapter";

/**
 * Rust adapter. Judge0 compiles a single file with `rustc` (no Cargo/serde), so a
 * tiny hand-rolled JSON reader is injected. Covers primitives, strings, and 1-D/2-D
 * integer/numeric/bool/string vectors (the bulk of array-style problems). Object
 * graphs (TreeNode/ListNode/GraphNode) are intentionally deferred for Rust because
 * their idiomatic `Option<Rc<RefCell<...>>>` shape needs a dedicated design.
 *
 * NOTE: no Rust toolchain is available here; covered by structural tests, pending
 * end-to-end verification.
 */
export class RustAdapter implements LanguageAdapter {
  readonly language: ExecutableLanguage = "rust";

  supports(type: TypeRef): boolean {
    try {
      this.rustType(type);
      return true;
    } catch {
      return false;
    }
  }

  private rustType(type: TypeRef): string {
    switch (type.base) {
      case "int":
      case "char":
        return "i32";
      case "long":
        return "i64";
      case "double":
      case "float":
        return "f64";
      case "boolean":
        return "bool";
      case "String":
        return "String";
      case "int[]":
        return "Vec<i32>";
      case "long[]":
        return "Vec<i64>";
      case "double[]":
        return "Vec<f64>";
      case "boolean[]":
        return "Vec<bool>";
      case "String[]":
        return "Vec<String>";
      case "int[][]":
        return "Vec<Vec<i32>>";
      case "String[][]":
        return "Vec<Vec<String>>";
      case "List":
        return `Vec<${type.of?.[0] ? this.rustType(type.of[0]) : "i32"}>`;
      default:
        throw new HarnessGenerationError(`Unsupported Rust type "${type.base}"`, "rust");
    }
  }

  private reader(type: TypeRef): string {
    switch (this.rustType(type)) {
      case "i32":
        return "read_i32";
      case "i64":
        return "read_i64";
      case "f64":
        return "read_f64";
      case "bool":
        return "read_bool";
      case "String":
        return "read_string";
      case "Vec<i32>":
        return "read_vec_i32";
      case "Vec<i64>":
        return "read_vec_i64";
      case "Vec<f64>":
        return "read_vec_f64";
      case "Vec<bool>":
        return "read_vec_bool";
      case "Vec<String>":
        return "read_vec_string";
      case "Vec<Vec<i32>>":
        return "read_vec_vec_i32";
      case "Vec<Vec<String>>":
        return "read_vec_vec_string";
      default:
        throw new HarnessGenerationError(`No Rust reader for "${type.base}"`, "rust");
    }
  }

  private dump(type: TypeRef, valueExpr: string): string {
    return `__t_dump(&${valueExpr})`;
  }

  generate(req: HarnessRequest, _ctx: CodegenContext): GeneratedHarness {
    const spec = req.spec;
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, "rust");
    const channel = resolveReturnChannel(spec);

    const decls: string[] = [];
    const argNames: string[] = [];
    spec.parameters.forEach((p, i) => {
      decls.push(`    let ${p.name} = __TReader::new(&__t_lines[${i}]).${this.reader(p.type)}();`);
      argNames.push(p.name);
    });

    const call = `${cls}::${method}(${argNames.join(", ")})`;
    let invoke: string;
    if (channel.kind === "VOID") {
      invoke = `    ${call};`;
    } else if (channel.kind === "MUTATION") {
      const target = spec.parameters[channel.parameterIndex];
      invoke = `    ${call};\n    print!("{}", ${this.dump(target.type, target.name)});`;
    } else {
      invoke = `    let __t_res = ${call};\n    print!("{}", ${this.dump(spec.returnType, "__t_res")});`;
    }

    const source = [
      "use std::io::Read;",
      "",
      RUST_HELPERS,
      "",
      "// --- user submission ---",
      req.userSource.trim(),
      "",
      "// --- generated harness ---",
      "fn main() {",
      "    let mut __t_all = String::new();",
      "    std::io::stdin().read_to_string(&mut __t_all).unwrap();",
      '    let __t_lines: Vec<String> = __t_all.split(\'\\n\').map(|s| s.to_string()).collect();',
      ...decls,
      invoke,
      "}",
      "",
    ].join("\n");

    return { source, comparison: resolveComparison(spec) };
  }

  generateStarter(spec: HarnessSpec): string {
    const cls = resolveClassName(spec);
    const method = resolveEntryMethod(spec, "rust");
    const channel = resolveReturnChannel(spec);
    const params = spec.parameters.map((p) => `${p.name}: ${this.rustType(p.type)}`).join(", ");
    const ret = channel.kind === "VOID" ? "" : ` -> ${this.rustType(spec.returnType)}`;
    return [
      `struct ${cls};`,
      `impl ${cls} {`,
      `    pub fn ${method}(${params})${ret} {`,
      "        // Write your code here",
      "    }",
      "}",
      "",
    ].join("\n");
  }
}

const RUST_HELPERS = String.raw`
struct __TReader { b: Vec<char>, i: usize }
impl __TReader {
    fn new(s: &str) -> Self { __TReader { b: s.chars().collect(), i: 0 } }
    fn ws(&mut self) { while self.i < self.b.len() && self.b[self.i].is_whitespace() { self.i += 1; } }
    fn peek(&mut self) -> char { self.ws(); if self.i < self.b.len() { self.b[self.i] } else { '\0' } }
    fn skip(&mut self) { self.i += 1; }
    fn read_num_str(&mut self) -> String { self.ws(); let mut s = String::new(); while self.i < self.b.len() { let c = self.b[self.i]; if c.is_ascii_digit() || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E' { s.push(c); self.i += 1; } else { break; } } s }
    fn read_i32(&mut self) -> i32 { self.read_num_str().parse().unwrap_or(0) }
    fn read_i64(&mut self) -> i64 { self.read_num_str().parse().unwrap_or(0) }
    fn read_f64(&mut self) -> f64 { self.read_num_str().parse().unwrap_or(0.0) }
    fn read_bool(&mut self) -> bool { self.ws(); let c = self.peek(); if c == 't' { self.i += 4; true } else { self.i += 5; false } }
    fn read_string(&mut self) -> String { self.ws(); let mut s = String::new(); if self.peek() == '"' { self.skip(); } while self.i < self.b.len() && self.b[self.i] != '"' { if self.b[self.i] == '\\' { self.i += 1; let e = self.b[self.i]; self.i += 1; match e { 'n' => s.push('\n'), 't' => s.push('\t'), 'r' => s.push('\r'), _ => s.push(e) } } else { s.push(self.b[self.i]); self.i += 1; } } self.i += 1; s }
    fn read_vec<T, F: FnMut(&mut Self) -> T>(&mut self, mut f: F) -> Vec<T> { let mut v = Vec::new(); self.ws(); self.skip(); if self.peek() == ']' { self.skip(); return v; } loop { let x = f(self); v.push(x); let c = self.peek(); self.skip(); if c == ']' { break; } } v }
    fn read_vec_i32(&mut self) -> Vec<i32> { self.read_vec(|r| r.read_i32()) }
    fn read_vec_i64(&mut self) -> Vec<i64> { self.read_vec(|r| r.read_i64()) }
    fn read_vec_f64(&mut self) -> Vec<f64> { self.read_vec(|r| r.read_f64()) }
    fn read_vec_bool(&mut self) -> Vec<bool> { self.read_vec(|r| r.read_bool()) }
    fn read_vec_string(&mut self) -> Vec<String> { self.read_vec(|r| r.read_string()) }
    fn read_vec_vec_i32(&mut self) -> Vec<Vec<i32>> { self.read_vec(|r| r.read_vec_i32()) }
    fn read_vec_vec_string(&mut self) -> Vec<Vec<String>> { self.read_vec(|r| r.read_vec_string()) }
}
trait __TDump { fn __t(&self) -> String; }
impl __TDump for i32 { fn __t(&self) -> String { self.to_string() } }
impl __TDump for i64 { fn __t(&self) -> String { self.to_string() } }
impl __TDump for bool { fn __t(&self) -> String { self.to_string() } }
impl __TDump for f64 { fn __t(&self) -> String { if self.fract() == 0.0 { format!("{}", *self as i64) } else { self.to_string() } } }
impl __TDump for String { fn __t(&self) -> String { __t_quote(self) } }
impl<T: __TDump> __TDump for Vec<T> { fn __t(&self) -> String { let parts: Vec<String> = self.iter().map(|x| x.__t()).collect(); format!("[{}]", parts.join(",")) } }
fn __t_quote(s: &str) -> String { let mut r = String::from("\""); for c in s.chars() { match c { '"' => r.push_str("\\\""), '\\' => r.push_str("\\\\"), '\n' => r.push_str("\\n"), '\r' => r.push_str("\\r"), '\t' => r.push_str("\\t"), _ => r.push(c) } } r.push('"'); r }
fn __t_dump<T: __TDump>(v: &T) -> String { v.__t() }
`;
