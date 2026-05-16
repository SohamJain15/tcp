export type Difficulty = "Easy" | "Medium" | "Hard";
export type ProblemLifecycleState = "Draft" | "Published" | "Archived";
export type StudentProblemStatus = "solved" | "attempted" | "todo";
export type Department =
  | "B.E. Computer Engineering"
  | "B.E. Information Technology"
  | "B.E. Electronics & Tele-Communication"
  | "B.E. Electronics and Computer Science"
  | "B.E. Mechanical Engineering"
  | "B.E. Civil Engineering"
  | "B.E. Computer Science and Engineering (Cyber Security)"
  | "B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)"
  | "B.Tech – Artificial Intelligence & Machine Learning"
  | "B.Tech – Artificial Intelligence & Data Science"
  | "B.Tech – Internet of Things (IoT)"
  | "B.Tech – Computer Science & Engineering (CSE-IOT)";
export type SupportedLanguage =
  | "c"
  | "cpp"
  | "java"
  | "javascript"
  | "python"
  | "ruby"
  | "arduino"
  | "go"
  | "rust"
  | "csharp"
  | "php"
  | "vanilla"
  | "react"
  | "typescript"
  | "html"
  | "css"
  | "assembly8086"
  | "kotlin"
  | "swift"
  | "dart"
  | "scala"
  | "elixir"
  | "erlang"
  | "racket";
export type EditorOnlyLanguage = "react" | "html" | "css";
export type ExecutableLanguage = Exclude<SupportedLanguage, EditorOnlyLanguage>;
export type SubmissionStatus =
  | "QUEUED"
  | "RUNNING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILATION_ERROR"
  | "INTERNAL_ERROR";
