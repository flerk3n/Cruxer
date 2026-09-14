import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" }
  }
});

if (!values.input || !values.output) {
  console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  process.exitCode = 1;
} else {
  console.error("The evaluator pipeline has not been implemented yet.");
  process.exitCode = 1;
}
