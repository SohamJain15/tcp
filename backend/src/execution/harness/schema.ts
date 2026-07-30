import { z } from "zod";
import { HARNESS_SCHEMA_VERSION, SERIALIZATION_FORMATS, type TypeRef } from "./contract";

const identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must be a valid identifier");

const typeRefSchema: z.ZodType<TypeRef> = z.lazy(() =>
  z
    .object({
      base: z.string().min(1),
      of: z.array(typeRefSchema).optional(),
      nullable: z.boolean().optional(),
    })
    .strict(),
);

const serializationFormatSchema = z.enum(
  SERIALIZATION_FORMATS as unknown as [string, ...string[]],
);

const parameterSchema = z
  .object({
    name: identifier,
    type: typeRefSchema,
    serialization: serializationFormatSchema.optional(),
    customFormatId: z.string().min(1).optional(),
  })
  .strict();

const returnChannelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("RETURN") }).strict(),
  z.object({ kind: z.literal("MUTATION"), parameterIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("VOID") }).strict(),
]);

const comparisonSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("EXACT") }).strict(),
  z.object({ mode: z.literal("WHITESPACE") }).strict(),
  z.object({ mode: z.literal("UNORDERED"), depth: z.number().int().nonnegative().optional() }).strict(),
  z.object({ mode: z.literal("FLOAT"), epsilon: z.number().positive() }).strict(),
  z.object({ mode: z.literal("CHECKER"), checkerId: z.string().min(1) }).strict(),
  z.object({ mode: z.literal("LENIENT") }).strict(),
]);

const languageOverrideSchema = z
  .object({
    entryMethod: identifier.optional(),
    imports: z.array(z.string()).optional(),
    starter: z.string().optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

const customTypeSchema = z
  .object({
    name: identifier,
    fields: z
      .array(z.object({ name: identifier, type: typeRefSchema }).strict())
      .min(1),
    serialization: serializationFormatSchema.optional(),
  })
  .strict();

export const harnessSpecSchema = z
  .object({
    schemaVersion: z.literal(HARNESS_SCHEMA_VERSION),
    entryMethod: identifier,
    className: identifier.optional(),
    parameters: z.array(parameterSchema),
    returnType: typeRefSchema,
    returnChannel: returnChannelSchema.optional(),
    comparison: comparisonSchema.optional(),
    languageOverrides: z.record(z.string(), languageOverrideSchema).optional(),
    customTypes: z.array(customTypeSchema).optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const names = new Set<string>();
    for (const p of spec.parameters) {
      if (names.has(p.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate parameter name "${p.name}"`,
          path: ["parameters"],
        });
      }
      names.add(p.name);
      if (p.serialization === "CUSTOM" && !p.customFormatId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Parameter "${p.name}" uses CUSTOM serialization but has no customFormatId`,
          path: ["parameters"],
        });
      }
    }
    if (
      spec.returnChannel?.kind === "MUTATION" &&
      spec.returnChannel.parameterIndex >= spec.parameters.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "returnChannel.parameterIndex is out of range",
        path: ["returnChannel", "parameterIndex"],
      });
    }
  });

export type HarnessSpecInput = z.input<typeof harnessSpecSchema>;
