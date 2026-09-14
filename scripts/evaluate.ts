import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  CruxerKitPipeline,
  PipelineError,
  batchInputSchema,
  batchOutputSchema,
  type BatchInput,
  type BatchOutput,
  type KitPipeline
} from "../packages/pipeline/src/index";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" }
  }
});

async function main(): Promise<void> {
  if (!values.input || !values.output) {
    throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  }

  const inputPath = resolve(values.input);
  const outputPath = resolve(values.output);
  const source = await readFile(inputPath, "utf8");
  const cases = batchInputSchema.parse(JSON.parse(source));
  const output = await evaluateCases(cases, new CruxerKitPipeline());
  batchOutputSchema.parse(output);

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

export async function evaluateCases(cases: BatchInput, pipeline: KitPipeline): Promise<BatchOutput> {
  const kits: BatchOutput["kits"] = [];

  // Process sequentially to remain within conservative free-tier request/token limits.
  for (const currentCase of cases) {
    try {
      const kit = await pipeline.run({
        jd: currentCase.jd,
        company_url: currentCase.company_url,
        days: currentCase.days
      });
      kits.push({ id: currentCase.id, status: "ok", kit, error: null });
    } catch (error) {
      kits.push({
        id: currentCase.id,
        status: "failed",
        kit: null,
        error: toBatchError(error)
      });
    }
  }

  return { version: "1.0", generated_at: new Date().toISOString(), kits };
}

function toBatchError(error: unknown): { code: string; message: string } {
  if (error instanceof PipelineError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: "GENERATION_FAILED", message: error.message };
  }
  return { code: "GENERATION_FAILED", message: "The case could not be completed." };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluator failed.");
  process.exitCode = 1;
});
