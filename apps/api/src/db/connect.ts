import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | undefined;

export function connectDatabase(uri: string): Promise<typeof mongoose> {
  if (!connectionPromise) {
    mongoose.set("strictQuery", true);
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8_000,
      maxPoolSize: 10,
      minPoolSize: 0
    });
  }
  return connectionPromise;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connectionPromise = undefined;
}
