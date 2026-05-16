import type { ExecutableLanguage } from "../shared/types/domain";

type WrapperStrategy = (source: string) => string;

const DEFAULT_METHOD_NAME = "solve";

const CPP_SOLUTION_CLASS_PATTERN = /\bclass\s+Solution\b/;
const CPP_MAIN_PATTERN = /\bint\s+main\s*\(/;
const CPP_METHOD_PATTERN =
  /(?:public\s*:\s*)?(?:template\s*<[^>]+>\s*)?(?:[\w:<>,\s*&]+)\b([A-Za-z_]\w*)\s*\(\s*\)\s*(?:const)?\s*(?:noexcept)?\s*(?:\{|;)/gm;
const CPP_IGNORED_METHOD_NAMES = new Set(["Solution"]);
const CPP_HEADER_BLOCK = `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <type_traits>
#include <utility>

using namespace std;`;

const JAVA_SOLUTION_CLASS_PATTERN = /\b(?:public\s+)?(?:final\s+|abstract\s+)?class\s+Solution\b/;
const JAVA_MAIN_CLASS_PATTERN = /\bpublic\s+class\s+Main\b|\bclass\s+Main\b/;
const JAVA_MAIN_METHOD_PATTERN = /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s*\w+\s*\)/;
const JAVA_TOP_LEVEL_CLASS_PATTERN = /\b(public\s+)?((?:final\s+|abstract\s+)*)class\s+([A-Za-z_]\w*)\b/;
const JAVA_METHOD_PATTERN =
  /(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s*)?[\w<>\[\],\s?]+\b([A-Za-z_]\w*)\s*\(\s*\)\s*(?:throws\s+[^{]+)?\{/gm;
const JAVA_IGNORED_METHOD_NAMES = new Set(["Solution", "main"]);

const PYTHON_SOLUTION_CLASS_PATTERN = /\bclass\s+Solution\b/;
const PYTHON_MAIN_PATTERN = /if\s+__name__\s*==\s*['"]__main__['"]\s*:/;
const PYTHON_METHOD_PATTERN = /^[ \t]+def\s+([A-Za-z_]\w*)\s*\(\s*self\s*\)\s*:/gm;
const PYTHON_IGNORED_METHOD_NAMES = new Set(["__init__"]);

const JAVASCRIPT_SOLUTION_CLASS_PATTERN = /\bclass\s+Solution\b/;
const JAVASCRIPT_INSTANTIATION_PATTERN = /\bnew\s+Solution\s*\(/;
const JAVASCRIPT_METHOD_PATTERN = /^[ \t]*(?:async\s+)?([A-Za-z_]\w*)\s*\(\s*\)\s*\{/gm;
const JAVASCRIPT_IGNORED_METHOD_NAMES = new Set(["constructor"]);
const TYPESCRIPT_SOLUTION_CLASS_PATTERN = /\bclass\s+Solution\b/;
const TYPESCRIPT_INSTANTIATION_PATTERN = /\bnew\s+Solution\s*\(/;
const TYPESCRIPT_METHOD_PATTERN =
  /^[ \t]*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*\(\s*\)\s*(?::\s*[^{]+)?\s*\{/gm;
const TYPESCRIPT_IGNORED_METHOD_NAMES = new Set(["constructor"]);

function detectMethodName(
  source: string,
  classPattern: RegExp,
  methodPattern: RegExp,
  ignoredMethodNames: ReadonlySet<string>,
): string {
  const classIndex = source.search(classPattern);
  if (classIndex === -1) {
    return DEFAULT_METHOD_NAME;
  }

  methodPattern.lastIndex = 0;
  const classBody = source.slice(classIndex);
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(classBody)) !== null) {
    const methodName = match[1];
    if (methodName && !ignoredMethodNames.has(methodName)) {
      methodPattern.lastIndex = 0;
      return methodName;
    }
  }

  methodPattern.lastIndex = 0;
  return DEFAULT_METHOD_NAME;
}

function wrapCppSolution(source: string): string {
  if (!CPP_SOLUTION_CLASS_PATTERN.test(source) || CPP_MAIN_PATTERN.test(source)) {
    return source;
  }

  const targetMethodName = detectMethodName(
    source,
    CPP_SOLUTION_CLASS_PATTERN,
    CPP_METHOD_PATTERN,
    CPP_IGNORED_METHOD_NAMES,
  );

  return `${CPP_HEADER_BLOCK}

${source}

namespace __tcet_wrapper {
template <typename T>
void print_value(const T& value) {
    std::cout << value;
}

inline void print_value(const std::string& value) {
    std::cout << value;
}

inline void print_value(const char* value) {
    std::cout << value;
}

inline void print_value(char* value) {
    std::cout << value;
}

inline void print_value(char value) {
    std::cout << value;
}

inline void print_value(bool value) {
    std::cout << (value ? "true" : "false");
}

template <typename A, typename B>
void print_value(const std::pair<A, B>& value) {
    print_value(value.first);
    std::cout << " ";
    print_value(value.second);
}

template <typename T>
void print_value(const std::vector<T>& values) {
    for (int index = 0; index < static_cast<int>(values.size()); ++index) {
        if (index > 0) {
            std::cout << " ";
        }
        print_value(values[index]);
    }
}

template <typename Result>
void print_result(Result&& result) {
    print_value(result);
}
} // namespace __tcet_wrapper

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    Solution solution;

    if constexpr (std::is_same_v<decltype(solution.${targetMethodName}()), void>) {
        solution.${targetMethodName}();
    } else {
        auto result = solution.${targetMethodName}();
        __tcet_wrapper::print_result(result);
    }

    return 0;
}
`;
}

function normalizeJavaSolutionClass(source: string): string {
  return source.replace(
    /\bpublic\s+((?:final\s+|abstract\s+)*)class\s+Solution\b/,
    (_, modifiers: string) => `${modifiers}class Solution`,
  );
}

function normalizeJavaEntryClass(source: string): string {
  if (JAVA_MAIN_CLASS_PATTERN.test(source)) {
    return source;
  }

  return source.replace(
    JAVA_TOP_LEVEL_CLASS_PATTERN,
    (_, publicKeyword: string | undefined, modifiers: string | undefined) => {
      const prefix = publicKeyword ? "public " : "";
      const normalizedModifiers = modifiers ?? "";
      return `${prefix}${normalizedModifiers}class Main`;
    },
  );
}

function splitJavaPreamble(source: string): { preamble: string; body: string } {
  const lines = source.split("\n");
  const preambleLines: string[] = [];
  const bodyLines: string[] = [];
  let inPreamble = true;

  for (const line of lines) {
    const isPreambleLine =
      /^\s*$/.test(line) || /^\s*package\s+[\w.]+\s*;/.test(line) || /^\s*import\s+.+;\s*$/.test(line);

    if (inPreamble && isPreambleLine) {
      preambleLines.push(line);
      continue;
    }

    inPreamble = false;
    bodyLines.push(line);
  }

  return {
    preamble: preambleLines.join("\n").trim(),
    body: bodyLines.join("\n").trim(),
  };
}

function wrapJavaSolution(source: string): string {
  if (JAVA_MAIN_METHOD_PATTERN.test(source)) {
    return normalizeJavaEntryClass(source);
  }

  if (!JAVA_SOLUTION_CLASS_PATTERN.test(source) || JAVA_MAIN_CLASS_PATTERN.test(source)) {
    return source;
  }

  const targetMethodName = detectMethodName(
    source,
    JAVA_SOLUTION_CLASS_PATTERN,
    JAVA_METHOD_PATTERN,
    JAVA_IGNORED_METHOD_NAMES,
  );
  const { preamble, body } = splitJavaPreamble(source);
  const normalizedBody = normalizeJavaSolutionClass(body);

  const wrappedBody = `public class Main {
    public static void main(String[] args) throws Exception {
        Solution solution = new Solution();
        java.lang.reflect.Method method = Solution.class.getDeclaredMethod("${targetMethodName}");
        method.setAccessible(true);

        Object result = method.invoke(solution);
        if (result != null) {
            System.out.print(__tcetFormatValue(result));
        }
    }

    private static String __tcetFormatValue(Object value) {
        if (value == null) {
            return "";
        }

        if (value instanceof Boolean) {
            return ((Boolean) value) ? "true" : "false";
        }

        Class<?> valueClass = value.getClass();
        if (valueClass.isArray()) {
            int length = java.lang.reflect.Array.getLength(value);
            StringBuilder builder = new StringBuilder();
            for (int index = 0; index < length; index++) {
                if (index > 0) {
                    builder.append(' ');
                }
                builder.append(__tcetFormatValue(java.lang.reflect.Array.get(value, index)));
            }
            return builder.toString();
        }

        if (value instanceof Iterable<?>) {
            StringBuilder builder = new StringBuilder();
            boolean first = true;
            for (Object item : (Iterable<?>) value) {
                if (!first) {
                    builder.append(' ');
                }
                builder.append(__tcetFormatValue(item));
                first = false;
            }
            return builder.toString();
        }

        if (value instanceof java.util.Map.Entry<?, ?>) {
            java.util.Map.Entry<?, ?> entry = (java.util.Map.Entry<?, ?>) value;
            return __tcetFormatValue(entry.getKey()) + " " + __tcetFormatValue(entry.getValue());
        }

        return String.valueOf(value);
    }
}

${normalizedBody}`;

  return preamble ? `${preamble}\n\n${wrappedBody}\n` : `${wrappedBody}\n`;
}

function wrapPythonSolution(source: string): string {
  if (!PYTHON_SOLUTION_CLASS_PATTERN.test(source) || PYTHON_MAIN_PATTERN.test(source)) {
    return source;
  }

  const targetMethodName = detectMethodName(
    source,
    PYTHON_SOLUTION_CLASS_PATTERN,
    PYTHON_METHOD_PATTERN,
    PYTHON_IGNORED_METHOD_NAMES,
  );

  return `${source}

def __tcet_format_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, tuple)):
        return " ".join(__tcet_format_value(item) for item in value)
    if isinstance(value, dict):
        return " ".join(
            f"{__tcet_format_value(key)} {__tcet_format_value(item)}"
            for key, item in value.items()
        )
    return str(value)

if __name__ == "__main__":
    sol = Solution()
    result = sol.${targetMethodName}()
    if result is not None:
        print(__tcet_format_value(result), end="")
`;
}

function wrapJavaScriptSolution(source: string): string {
  if (!JAVASCRIPT_SOLUTION_CLASS_PATTERN.test(source) || JAVASCRIPT_INSTANTIATION_PATTERN.test(source)) {
    return source;
  }

  const targetMethodName = detectMethodName(
    source,
    JAVASCRIPT_SOLUTION_CLASS_PATTERN,
    JAVASCRIPT_METHOD_PATTERN,
    JAVASCRIPT_IGNORED_METHOD_NAMES,
  );

  return `${source}

const __tcetFormatValue = (value) => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return value.map((item) => __tcetFormatValue(item)).join(" ");
  }

  if (value && typeof value === "object" && "first" in value && "second" in value) {
    return [__tcetFormatValue(value.first), __tcetFormatValue(value.second)].join(" ");
  }

  return String(value);
};

(async () => {
  const sol = new Solution();
  const result = await sol.${targetMethodName}();
  if (result !== undefined) {
    process.stdout.write(__tcetFormatValue(result));
  }
})();
`;
}

function prependTypeScriptNodeDeclarations(source: string): string {
  const declarationBlock = `declare function require(name: string): any;
declare const Promise: any;
declare const process: {
  stdout: {
    write(value: string): void;
  };
};`;

  const trimmedSource = source.trimStart();
  if (
    /declare\s+function\s+require\s*\(/.test(trimmedSource) ||
    /declare\s+const\s+Promise\b/.test(trimmedSource) ||
    /declare\s+const\s+process\b/.test(trimmedSource)
  ) {
    return source;
  }

  return `${declarationBlock}

${source}`;
}

function wrapTypeScriptSolution(source: string): string {
  const preparedSource = prependTypeScriptNodeDeclarations(source);

  if (!TYPESCRIPT_SOLUTION_CLASS_PATTERN.test(preparedSource) || TYPESCRIPT_INSTANTIATION_PATTERN.test(preparedSource)) {
    return preparedSource;
  }

  const targetMethodName = detectMethodName(
    preparedSource,
    TYPESCRIPT_SOLUTION_CLASS_PATTERN,
    TYPESCRIPT_METHOD_PATTERN,
    TYPESCRIPT_IGNORED_METHOD_NAMES,
  );

  return `${preparedSource}

const __tcetFormatValue = (value: unknown): string => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return value.map((item) => __tcetFormatValue(item)).join(" ");
  }

  if (
    value &&
    typeof value === "object" &&
    "first" in value &&
    "second" in value
  ) {
    const pair = value as { first: unknown; second: unknown };
    return [__tcetFormatValue(pair.first), __tcetFormatValue(pair.second)].join(" ");
  }

  return String(value ?? "");
};

(async () => {
  const sol = new Solution();
  const result = await (sol as any).${targetMethodName}();
  if (result !== undefined) {
    process.stdout.write(__tcetFormatValue(result));
  }
})();
`;
}

const wrapperStrategies: Partial<Record<ExecutableLanguage, WrapperStrategy>> = {
  arduino: wrapCppSolution,
  cpp: wrapCppSolution,
  java: wrapJavaSolution,
  javascript: wrapJavaScriptSolution,
  python: wrapPythonSolution,
  typescript: wrapTypeScriptSolution,
  vanilla: wrapJavaScriptSolution,
};

export function wrapSubmissionCode(language: ExecutableLanguage, source: string): string {
  return wrapperStrategies[language]?.(source) ?? source;
}
