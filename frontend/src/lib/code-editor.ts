import type * as MonacoEditor from "monaco-editor";

import type { ExecutableLanguage } from "@/api/types";

type Monaco = typeof MonacoEditor;
type StandaloneCodeEditor = MonacoEditor.editor.IStandaloneCodeEditor;

const DEFAULT_FORMATTED_LANGUAGES = new Set<ExecutableLanguage>([
  "javascript",
  "java",
  "typescript",
]);

const PRETTIER_LANGUAGE_PARSERS: Partial<Record<ExecutableLanguage, string>> = {
  java: "java",
  javascript: "babel",
  typescript: "typescript",
};

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
  const formattedSource = await formatWithPrettier(language, source);
  const nextValue = formattedSource ?? trimTrailingWhitespace(source);

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

  monaco.languages.registerDocumentFormattingEditProvider("javascript", {
    provideDocumentFormattingEdits: async (model) =>
      provideExecutableFormattingEdits(monaco, "javascript", model),
  });

  monaco.languages.registerDocumentFormattingEditProvider("typescript", {
    provideDocumentFormattingEdits: async (model) =>
      provideExecutableFormattingEdits(monaco, "typescript", model),
  });

  monaco.languages.registerDocumentFormattingEditProvider("java", {
    provideDocumentFormattingEdits: async (model) =>
      provideExecutableFormattingEdits(monaco, "java", model),
  });
}

export async function formatCodeInEditor(
  editor: StandaloneCodeEditor,
  language: ExecutableLanguage,
): Promise<void> {
  if (supportsRichFormatting(language)) {
    await editor.getAction("editor.action.formatDocument").run();
    return;
  }

  await editor.getAction("editor.action.reindentlines").run();

  const model = editor.getModel();
  if (!model) {
    return;
  }

  const normalizedValue = trimTrailingWhitespace(model.getValue());
  if (normalizedValue !== model.getValue()) {
    editor.executeEdits("tcet-format-fallback", [
      {
        range: model.getFullModelRange(),
        text: normalizedValue,
      },
    ]);
  }
}
