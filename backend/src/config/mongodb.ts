import { MongoClient, type Db } from "mongodb";
import { env } from "./env";

let client: MongoClient | null = null;
let database: Db | null = null;

export async function getMongoDatabase(): Promise<Db> {
  if (database) {
    return database;
  }

  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
  }

  database = client.db(env.MONGODB_DB_NAME);
  return database;
}

export async function closeMongoDatabase(): Promise<void> {
  if (!client) {
    return;
  }

  await client.close();
  client = null;
  database = null;
}
