import type * as MonacoEditor from "monaco-editor";

import type { ExecutableLanguage } from "@/api/types";

type Monaco = typeof MonacoEditor;
type StandaloneCodeEditor = MonacoEditor.editor.IStandaloneCodeEditor;

const DEFAULT_FORMATTED_LANGUAGES = new Set<ExecutableLanguage>([
  "javascript",
  "java",
  "typescript",
]);

/**
 * Brace-delimited languages we can safely re-indent ourselves. Prettier does not cover these, so
 * without this the Format button did nothing at all for the languages students use most (C, C++).
 */
const BRACE_INDENTED_LANGUAGES = new Set<ExecutableLanguage>([
  "c",
  "cpp",
  "csharp",
  "go",
  "kotlin",
  "php",
  "rust",
  "scala",
  "swift",
]);

const PRETTIER_LANGUAGE_PARSERS: Partial<Record<ExecutableLanguage, string>> = {
  java: "java",
  javascript: "babel",
  typescript: "typescript",
};

const INDENT_UNIT = "    ";

let configuredMonaco = false;

function normalizeLineEndings(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function trimTrailingWhitespace(source: string): string {
  return normalizeLineEndings(source)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

/**
 * Counts how a single line changes brace depth, and whether it *starts* by closing a block.
 * String/char literals, line comments and block comments are skipped so braces inside them never
 * move the indentation. `blockCommentDepth` carries multi-line `/* *\/` state between lines.
 */
function scanLineForBraces(
  line: string,
  startsInBlockComment: boolean,
): { delta: number; leadingCloses: number; endsInBlockComment: boolean } {
  let delta = 0;
  let leadingCloses = 0;
  let sawCode = false;
  let inBlockComment = startsInBlockComment;
  let index = 0;

  while (index < line.length) {
    const char = line[index];
    const next = line[index + 1];

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Line comments: `//` everywhere, plus `#` for PHP.
    if ((char === "/" && next === "/") || char === "#") {
      break;
    }

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      index += 1;
      while (index < line.length) {
        if (line[index] === "\\") {
          index += 2;
          continue;
        }
        if (line[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      sawCode = true;
      continue;
    }

    if (char === "{" || char === "(" || char === "[") {
      delta += 1;
      sawCode = true;
    } else if (char === "}" || char === ")" || char === "]") {
      delta -= 1;
      // Only closers before any other code on the line pull this line back out.
      if (!sawCode) {
        leadingCloses += 1;
      }
      sawCode = true;
    } else if (!/\s/.test(char)) {
      sawCode = true;
    }

    index += 1;
  }

  return { delta, leadingCloses, endsInBlockComment: inBlockComment };
}

/**
 * Re-indents brace-delimited source. It only ever rewrites the *leading whitespace* of a line —
 * code content, ordering and line breaks are untouched — so the worst possible outcome is odd
 * indentation, never a broken solution.
 */
function reindentBraceLanguage(source: string): string {
  const lines = trimTrailingWhitespace(source).split("\n");
  const formatted: string[] = [];
  let depth = 0;
  let inBlockComment = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      formatted.push("");
      continue;
    }

    // Preprocessor directives and continuation of a block comment keep their own column.
    if (!inBlockComment && trimmed.startsWith("#") && !trimmed.startsWith("#{")) {
      formatted.push(trimmed);
      continue;
    }

    if (inBlockComment) {
      formatted.push(`${INDENT_UNIT.repeat(Math.max(depth, 0))} ${trimmed}`.replace(/\s+$/, ""));
      const scan = scanLineForBraces(rawLine, inBlockComment);
      inBlockComment = scan.endsInBlockComment;
      continue;
    }

    const scan = scanLineForBraces(rawLine, inBlockComment);
    // `case:`/`default:` and access labels sit one level back inside their block.
    const isLabel = /^(case\b.*|default\s*|(public|private|protected)\s*):$/.test(trimmed);
    const indentDepth = Math.max(0, depth - scan.leadingCloses - (isLabel ? 1 : 0));

    formatted.push(`${INDENT_UNIT.repeat(indentDepth)}${trimmed}`);

    depth = Math.max(0, depth + scan.delta);
    inBlockComment = scan.endsInBlockComment;
  }

  return formatted.join("\n");
}

/**
 * Single source of truth for formatting, shared by the Format button and Monaco's own
 * `formatDocument` (Shift+Alt+F).
 */
export async function formatSourceCode(language: ExecutableLanguage, source: string): Promise<string> {
  if (DEFAULT_FORMATTED_LANGUAGES.has(language)) {
    const formatted = await formatWithPrettier(language, source);
    if (formatted !== null) {
      return formatted;
    }
  }

  if (BRACE_INDENTED_LANGUAGES.has(language)) {
    return reindentBraceLanguage(source);
  }

  // Python and friends are indentation-sensitive: re-indenting would change what the code means,
  // so they only get safe whitespace cleanup.
  return trimTrailingWhitespace(source);
}

/** True when the language gets a real reformat rather than only whitespace cleanup. */
export function supportsFullFormatting(language: ExecutableLanguage): boolean {
  return DEFAULT_FORMATTED_LANGUAGES.has(language) || BRACE_INDENTED_LANGUAGES.has(language);
}

function createFullModelEdit(
  monaco: Monaco,
  model: MonacoEditor.editor.ITextModel,
  value: string,
): MonacoEditor.languages.TextEdit[] {
  return [
    {
      range: model.getFullModelRange(),
      text: value,
    },
  ];
}

function resolvePlugin(moduleValue: unknown): unknown {
  if (moduleValue && typeof moduleValue === "object" && "default" in moduleValue) {
    return (moduleValue as { default: unknown }).default;
  }

  return moduleValue;
}

async function formatWithPrettier(language: ExecutableLanguage, source: string): Promise<string | null> {
  const parser = PRETTIER_LANGUAGE_PARSERS[language];
  if (!parser) {
    return null;
  }

  const prettier = await import("prettier/standalone");
  const plugins: unknown[] = [];
  const normalizedSource = normalizeLineEndings(source);

  switch (language) {
    case "javascript": {
      const [babelPlugin, estreePlugin] = await Promise.all([
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
      ]);
      plugins.push(resolvePlugin(babelPlugin), resolvePlugin(estreePlugin));
      break;
    }
    case "java": {
      const javaPlugin = await import("prettier-plugin-java");
      plugins.push(resolvePlugin(javaPlugin));
      break;
    }
    case "typescript": {
      const [typescriptPlugin, estreePlugin] = await Promise.all([
        import("prettier/plugins/typescript"),
        import("prettier/plugins/estree"),
      ]);
      plugins.push(resolvePlugin(typescriptPlugin), resolvePlugin(estreePlugin));
      break;
    }
    default:
      return null;
  }

  return prettier.format(normalizedSource, {
    parser,
    plugins,
    tabWidth: 4,
    useTabs: false,
  });
}

async function provideExecutableFormattingEdits(
  monaco: Monaco,
  language: ExecutableLanguage,
  model: MonacoEditor.editor.ITextModel,
): Promise<MonacoEditor.languages.TextEdit[]> {
  const source = model.getValue();
  const nextValue = await formatSourceCode(language, source);

  if (nextValue === source) {
    return [];
  }

  return createFullModelEdit(monaco, model, nextValue);
}

export function getMonacoLanguage(language: ExecutableLanguage): string {
  switch (language) {
    case "arduino":
      return "cpp";
    case "assembly8086":
      return "plaintext";
    case "c":
      return "c";
    case "cpp":
      return "cpp";
    case "csharp":
      return "csharp";
    case "dart":
      return "plaintext";
    case "elixir":
      return "plaintext";
    case "erlang":
      return "plaintext";
    case "go":
      return "go";
    case "java":
      return "java";
    case "javascript":
      return "javascript";
    case "kotlin":
      return "java";
    case "php":
      return "php";
    case "python":
      return "python";
    case "racket":
      return "plaintext";
    case "ruby":
      return "ruby";
    case "rust":
      return "rust";
    case "scala":
      return "java";
    case "swift":
      return "swift";
    case "typescript":
      return "typescript";
    default:
      return "plaintext";
  }
}

export function supportsRichFormatting(language: ExecutableLanguage): boolean {
  return DEFAULT_FORMATTED_LANGUAGES.has(language);
}

export function configureCodeEditor(monaco: Monaco): void {
  if (configuredMonaco) {
    return;
  }

  configuredMonaco = true;

  // Register a formatter for every language we can format, so Monaco's own formatDocument
  // (Shift+Alt+F) behaves identically to the Format button. Several ExecutableLanguages map onto the
  // same Monaco grammar (e.g. arduino -> cpp, kotlin/scala -> java), so register once per grammar.
  const registered = new Set<string>();
  const formattableLanguages: ExecutableLanguage[] = [
    ...DEFAULT_FORMATTED_LANGUAGES,
    ...BRACE_INDENTED_LANGUAGES,
  ];

  for (const language of formattableLanguages) {
    const monacoLanguage = getMonacoLanguage(language);
    if (monacoLanguage === "plaintext" || registered.has(monacoLanguage)) {
      continue;
    }

    registered.add(monacoLanguage);
    monaco.languages.registerDocumentFormattingEditProvider(monacoLanguage, {
      provideDocumentFormattingEdits: async (model) =>
        provideExecutableFormattingEdits(monaco, language, model),
    });
  }
}

/**
 * Disables clipboard use inside a Monaco instance for proctored contests.
 *
 * Document-level copy/cut/paste listeners are not enough: Monaco handles those key chords through
 * its own command layer and does not always let the native event reach the document. This rebinds
 * the chords directly and undoes anything that still lands, then returns a disposer.
 *
 * Deliberately separate from `configureCodeEditor`, which is shared with the practice problem
 * editor and must keep working normally there.
 */
export function lockDownContestEditor(
  editor: StandaloneCodeEditor,
  monaco: Monaco,
  onBlocked: () => void,
): () => void {
  const noop = () => onBlocked();
  const { CtrlCmd, Shift } = monaco.KeyMod;
  const { KeyC, KeyV, KeyX, Insert } = monaco.KeyCode;

  // Rebinding a chord to a no-op command is what actually stops Monaco's internal clipboard
  // actions; preventDefault on the DOM event alone does not reach them.
  for (const chord of [
    CtrlCmd | KeyC,
    CtrlCmd | KeyV,
    CtrlCmd | KeyX,
    CtrlCmd | Shift | KeyV,
    CtrlCmd | Insert,
    Shift | Insert,
  ]) {
    editor.addCommand(chord, noop);
  }

  // Backstop: anything that still pastes (middle-click, IME, drag-drop) is immediately reverted.
  const pasteDisposable = editor.onDidPaste(() => {
    editor.trigger("contest-proctoring", "undo", null);
    onBlocked();
  });

  const domNode = editor.getDomNode();
  const blockEvent = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    onBlocked();
  };

  domNode?.addEventListener("copy", blockEvent, true);
  domNode?.addEventListener("cut", blockEvent, true);
  domNode?.addEventListener("paste", blockEvent, true);
  domNode?.addEventListener("contextmenu", blockEvent, true);
  domNode?.addEventListener("dragstart", blockEvent, true);
  domNode?.addEventListener("drop", blockEvent, true);

  return () => {
    pasteDisposable.dispose();
    domNode?.removeEventListener("copy", blockEvent, true);
    domNode?.removeEventListener("cut", blockEvent, true);
    domNode?.removeEventListener("paste", blockEvent, true);
    domNode?.removeEventListener("contextmenu", blockEvent, true);
    domNode?.removeEventListener("dragstart", blockEvent, true);
    domNode?.removeEventListener("drop", blockEvent, true);
  };
}

/**
 * Formats the editor's content in place. Applies the edit through `executeEdits` so it stays a
 * single undo step, and never relies on `editor.getAction(...)`, which returns null when an action
 * is unavailable and previously threw.
 */
export async function formatCodeInEditor(
  editor: StandaloneCodeEditor,
  language: ExecutableLanguage,
): Promise<void> {
  const model = editor.getModel();
  if (!model) {
    return;
  }

  const source = model.getValue();
  const formatted = await formatSourceCode(language, source);
  if (formatted === source) {
    return;
  }

  const selection = editor.getSelection();
  editor.executeEdits("tcet-format", [
    {
      range: model.getFullModelRange(),
      text: formatted,
    },
  ]);
  editor.pushUndoStop();
  if (selection) {
    editor.setSelection(selection);
  }
}
