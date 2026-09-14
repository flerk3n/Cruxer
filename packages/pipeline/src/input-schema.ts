import { z } from "zod";

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .url()
  .superRefine((value, ctx) => {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company URL must use HTTP or HTTPS." });
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company URL cannot contain credentials." });
    }
  });

export const pipelineInputSchema = z.object({
  jd: z.string().trim().min(1, "A job description is required.").max(50_000),
  company_url: httpUrlSchema,
  days: z.number().int().min(1).max(60)
});

export const batchCaseSchema = pipelineInputSchema.extend({
  id: z.string().trim().min(1).max(200)
});

export const batchInputSchema = z.array(batchCaseSchema).min(1).max(100).superRefine((cases, ctx) => {
  const seen = new Set<string>();
  cases.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "id"],
        message: `Duplicate batch case id \"${item.id}\".`
      });
    }
    seen.add(item.id);
  });
});

export const batchErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

/** Appendix B's result envelope. The kit is intentionally unknown here to avoid a runtime cycle. */
export const batchOutputSchema = z.object({
  version: z.literal("1.0"),
  generated_at: z.string().datetime({ offset: true }),
  kits: z.array(
    z.discriminatedUnion("status", [
      z.object({ id: z.string().min(1), status: z.literal("ok"), kit: z.unknown(), error: z.null() }),
      z.object({ id: z.string().min(1), status: z.literal("failed"), kit: z.null(), error: batchErrorSchema })
    ])
  )
});

export type PipelineInput = z.infer<typeof pipelineInputSchema>;
export type BatchCase = z.infer<typeof batchCaseSchema>;
export type BatchInput = z.infer<typeof batchInputSchema>;
export type BatchOutput = z.infer<typeof batchOutputSchema>;
