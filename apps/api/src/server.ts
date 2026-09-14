import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/connect.js";

const config = loadConfig();
await connectDatabase(config.MONGODB_URI);

const server = createApp(config).listen(config.PORT, () => {
  console.info(`Cruxer API listening on port ${config.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}; shutting down.`);
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
