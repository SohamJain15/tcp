import { wrapSubmissionCode } from "../execution/code-wrapper";
import { Judge0ExecutionProvider } from "../execution/judge0-execution-provider";
import { EXECUTABLE_LANGUAGES } from "../shared/constants/domain";
import type { ExecutableLanguage } from "../shared/types/domain";

const provider = new Judge0ExecutionProvider();

const snippets: Partial<Record<ExecutableLanguage, string>> = {
  c: '#include <stdio.h>\nint main(){printf("3\\n");return 0;}',
  cpp: '#include <iostream>\nint main(){std::cout << 3 << "\\n"; return 0;}',
  java: "public class Main { public static void main(String[] args) { System.out.println(3); } }",
  javascript: "console.log(3);",
  python: "print(3)",
  ruby: "puts 3",
  arduino: '#include <iostream>\nint main(){std::cout << 3 << "\\n"; return 0;}',
  go: 'package main\nimport "fmt"\nfunc main(){fmt.Println(3)}',
  rust: 'fn main() { println!("3"); }',
  csharp: "using System; class Program { static void Main() { Console.WriteLine(3); } }",
  php: '<?php echo "3\\n"; ?>',
  vanilla: "console.log(3);",
  typescript: "console.log(3);",
  assembly8086:
    "section .data\nmsg db \"3\", 10\nlen equ $-msg\nsection .text\nglobal _start\n_start:\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, len\n    syscall\n    mov rax, 60\n    xor rdi, rdi\n    syscall",
  kotlin: "fun main() { println(3) }",
  swift: "print(3)",
  dart: "void main() { print(3); }",
  scala: "object Main { def main(args: Array[String]): Unit = println(3) }",
  elixir: 'IO.puts("3")',
  erlang: 'main(_) ->\n    io:format("3~n"),\n    halt(0).',
  racket: '#lang racket\n(displayln 3)',
};

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const language of EXECUTABLE_LANGUAGES) {
    const snippet = snippets[language];
    if (!snippet) {
      failures.push(`${language}: missing verification snippet`);
      continue;
    }

    const result = await provider.executeRun({
      code: wrapSubmissionCode(language, snippet),
      language,
      testCases: [{ input: "", output: "3\n" }],
      problemId: "judge0-runtime-diagnostic",
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
    });

    const summary = {
      language,
      status: result.status,
      runtimeMs: result.runtimeMs,
      memoryKb: result.memoryKb,
      stderr: result.stderr ?? null,
      stdout: result.stdout ?? null,
    };

    console.log(JSON.stringify(summary));

    if (result.status !== "ACCEPTED") {
      failures.push(`${language}: ${result.status}${result.stderr ? ` - ${result.stderr}` : ""}`);
    }
  }

  if (failures.length > 0) {
    console.error("Runtime language verification failed.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Runtime language verification passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Runtime language verification failed:", message);
  process.exitCode = 1;
});
