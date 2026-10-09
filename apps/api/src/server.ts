import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/connect.js";
import { startSweeper } from "./jobs/sweeper.js";
import { CruxerKitPipeline } from "../../../packages/pipeline/src/index.js";
import { GenerationOrchestrator } from "./services/generation-orchestrator.js";

const config = loadConfig();
await connectDatabase(config.MONGODB_URI);

const generation = new GenerationOrchestrator(new CruxerKitPipeline(), config);
const server = createApp(config, { generation }).listen(config.PORT, () => {
  console.info(`Cruxer API listening on port ${config.PORT}`);
});
const stopSweeper = startSweeper(config, generation);

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}; shutting down.`);
  stopSweeper();
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
