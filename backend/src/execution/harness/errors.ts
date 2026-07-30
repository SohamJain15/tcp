import type { ExecutableLanguage } from "../../shared/types/domain";
import type { TypeRef } from "./contract";

/** Base class for all harness-generation failures. */
export class HarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Raised when a wrapper cannot be produced (no adapter, invalid spec, etc.). */
export class HarnessGenerationError extends HarnessError {
  constructor(
    message: string,
    readonly language?: ExecutableLanguage,
  ) {
    super(message);
  }
}

/** Raised when no serializer plugin can handle a declared type. */
export class UnsupportedTypeError extends HarnessError {
  constructor(
    readonly type: TypeRef,
    readonly language: ExecutableLanguage,
  ) {
    super(
      `No serializer registered for type "${type.base}" in language "${language}". ` +
        `Register a TypeSerializerPlugin that handles it.`,
    );
  }
}
