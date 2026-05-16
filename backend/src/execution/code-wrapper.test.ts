import { describe, expect, it } from "vitest";
import { wrapSubmissionCode } from "./code-wrapper";

describe("wrapSubmissionCode", () => {
  it("prepends hardening headers and a hidden main wrapper for C++ Solution classes", () => {
    const source = `
class Solution {
public:
    vector<int> solve() {
        return {1, 2, 3};
    }
};
`;

    const wrapped = wrapSubmissionCode("cpp", source);

    expect(wrapped).toContain("#include <iostream>");
    expect(wrapped).toContain("#include <vector>");
    expect(wrapped).toContain("#include <string>");
    expect(wrapped).toContain("#include <algorithm>");
    expect(wrapped).toContain("#include <type_traits>");
    expect(wrapped).toContain("int main()");
    expect(wrapped).toContain("Solution solution;");
    expect(wrapped).toContain("solution.solve()");
    expect(wrapped).toContain("std::is_same_v<decltype(solution.solve()), void>");
    expect(wrapped).toContain("__tcet_wrapper::print_result");
  });

  it("uses if constexpr for C++ void-returning methods", () => {
    const source = `
class Solution {
public:
    void solve() {
    }
};
`;

    const wrapped = wrapSubmissionCode("cpp", source);

    expect(wrapped).toContain('if constexpr (std::is_same_v<decltype(solution.solve()), void>)');
    expect(wrapped).toContain("solution.solve();");
  });

  it("does not wrap C++ code that already defines main", () => {
    const source = `
int main() {
  return 0;
}
`;

    expect(wrapSubmissionCode("cpp", source)).toBe(source);
  });

  it("wraps Java Solution classes in a public Main entrypoint", () => {
    const source = `
import java.util.*;

class Solution {
    public List<Integer> solve() {
        return Arrays.asList(1, 2, 3);
    }
}
`;

    const wrapped = wrapSubmissionCode("java", source);

    expect(wrapped).toContain("public class Main");
    expect(wrapped).toContain('Solution.class.getDeclaredMethod("solve")');
    expect(wrapped).toContain("System.out.print(__tcetFormatValue(result));");
    expect(wrapped).toContain("class Solution");
    expect(wrapped).toContain("import java.util.*;");
  });

  it("renames Java classes with an existing main method to Main so Judge0 can compile them", () => {
    const source = `
import java.util.*;

public class Solution {
    public static void main(String[] args) {
        System.out.println("ok");
    }
}
`;

    const wrapped = wrapSubmissionCode("java", source);

    expect(wrapped).toContain("public class Main");
    expect(wrapped).not.toContain("public class Solution");
    expect(wrapped).toContain('System.out.println("ok");');
  });

  it("appends Python execution boilerplate for Solution classes", () => {
    const source = `
class Solution:
    def solve(self):
        return [1, 2, 3]
`;

    const wrapped = wrapSubmissionCode("python", source);

    expect(wrapped).toContain('if __name__ == "__main__":');
    expect(wrapped).toContain("sol = Solution()");
    expect(wrapped).toContain("result = sol.solve()");
    expect(wrapped).toContain('print(__tcet_format_value(result), end="")');
  });

  it("appends Node.js execution boilerplate for Solution classes", () => {
    const source = `
class Solution {
  solve() {
    return [1, 2, 3];
  }
}
`;

    const wrapped = wrapSubmissionCode("javascript", source);

    expect(wrapped).toContain("const sol = new Solution();");
    expect(wrapped).toContain("const result = await sol.solve();");
    expect(wrapped).toContain("process.stdout.write(__tcetFormatValue(result));");
  });

  it("prepares TypeScript Solution classes for Judge0's Node runtime", () => {
    const source = `
class Solution {
  solve(): number[] {
    return [1, 2, 3];
  }
}
`;

    const wrapped = wrapSubmissionCode("typescript", source);

    expect(wrapped).toContain("declare function require");
    expect(wrapped).toContain("declare const Promise");
    expect(wrapped).toContain("declare const process");
    expect(wrapped).toContain("const sol = new Solution();");
    expect(wrapped).toContain("process.stdout.write(__tcetFormatValue(result));");
  });
});
