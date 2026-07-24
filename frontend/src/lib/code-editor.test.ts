import { describe, expect, it } from "vitest";

import { formatSourceCode, supportsFullFormatting } from "./code-editor";

describe("formatSourceCode", () => {
  it("re-indents C by brace depth", async () => {
    const source = [
      "#include <stdio.h>",
      "int main(void) {",
      "int x = 1;",
      "if (x) {",
      'printf("hi");',
      "}",
      "return 0;",
      "}",
    ].join("\n");

    expect(await formatSourceCode("c", source)).toBe(
      [
        "#include <stdio.h>",
        "int main(void) {",
        "    int x = 1;",
        "    if (x) {",
        '        printf("hi");',
        "    }",
        "    return 0;",
        "}",
      ].join("\n"),
    );
  });

  it("ignores braces inside strings and comments", async () => {
    const source = ["int main() {", 'char *s = "{{{";', "// }}} not real", "return 0;", "}"].join("\n");

    expect(await formatSourceCode("cpp", source)).toBe(
      ["int main() {", '    char *s = "{{{";', "    // }}} not real", "    return 0;", "}"].join("\n"),
    );
  });

  it("pulls switch labels back one level", async () => {
    const source = ["switch (x) {", "case 1:", "break;", "default:", "break;", "}"].join("\n");

    expect(await formatSourceCode("c", source)).toBe(
      ["switch (x) {", "case 1:", "    break;", "default:", "    break;", "}"].join("\n"),
    );
  });

  it("never re-indents Python, only trims trailing whitespace", async () => {
    const source = ["def solve():   ", "    if True:", "        return 1  ", "", "solve()"].join("\n");

    // Indentation is semantic in Python, so it must survive untouched.
    expect(await formatSourceCode("python", source)).toBe(
      ["def solve():", "    if True:", "        return 1", "", "solve()"].join("\n"),
    );
  });

  it("reports which languages get a real reformat", () => {
    expect(supportsFullFormatting("c")).toBe(true);
    expect(supportsFullFormatting("javascript")).toBe(true);
    expect(supportsFullFormatting("python")).toBe(false);
  });
});
