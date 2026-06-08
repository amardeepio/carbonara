import { randomUUID } from "node:crypto";
import type { Collection, Db, MongoClient } from "mongodb";
import type { LogEntry } from "./types";

/**
 * Storage layer for activity log entries.
 *
 * Uses MongoDB when `MONGODB_URI` is configured, otherwise an in-memory store
 * so the app (and its reviewers) can run with zero external dependencies. The
 * Mongo client is cached across hot-reloads / serverless invocations to avoid
 * exhausting the connection pool — the standard Next.js + Mongo pattern.
 */

export interface EntryStore {
  add(entry: Omit<LogEntry, "id">): Promise<LogEntry>;
  list(): Promise<LogEntry[]>;
  remove(id: string): Promise<boolean>;
}

const COLLECTION = "entries";

// --- In-memory implementation ---------------------------------------------

class MemoryStore implements EntryStore {
  private entries: LogEntry[] = [];

  async add(entry: Omit<LogEntry, "id">): Promise<LogEntry> {
    const created: LogEntry = { id: randomUUID(), ...entry };
    this.entries.push(created);
    return created;
  }

  async list(): Promise<LogEntry[]> {
    return [...this.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async remove(id: string): Promise<boolean> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    return this.entries.length < before;
  }
}

// --- MongoDB implementation ------------------------------------------------

interface MongoDoc extends Omit<LogEntry, "id"> {
  _id: string;
}

class MongoStore implements EntryStore {
  constructor(private readonly collection: Collection<MongoDoc>) {}

  async add(entry: Omit<LogEntry, "id">): Promise<LogEntry> {
    const doc: MongoDoc = { _id: randomUUID(), ...entry };
    await this.collection.insertOne(doc);
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
  }

  async list(): Promise<LogEntry[]> {
    const docs = await this.collection.find().sort({ createdAt: -1 }).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ _id: id });
    return res.deletedCount === 1;
  }
}

// --- Cached singleton resolution ------------------------------------------

interface Cache {
  client?: MongoClient;
  store?: EntryStore;
  promise?: Promise<EntryStore>;
}

// Persist across module reloads in dev and warm serverless invocations.
const globalForStore = globalThis as unknown as { __carbonaraStore?: Cache };
const cache: Cache = (globalForStore.__carbonaraStore ??= {});

async function createStore(): Promise<EntryStore> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return new MemoryStore();
  }

  // Imported lazily so the in-memory path has no Mongo dependency cost.
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri);
  await client.connect();
  cache.client = client;

  const db: Db = client.db(process.env.MONGODB_DB || "carbonara");
  const collection = db.collection<MongoDoc>(COLLECTION);
  await collection.createIndex({ createdAt: -1 });
  return new MongoStore(collection);
}

/** Resolve the shared store instance, creating it on first use. */
export async function getStore(): Promise<EntryStore> {
  if (cache.store) return cache.store;
  cache.promise ??= createStore().then((store) => {
    cache.store = store;
    return store;
  });
  return cache.promise;
}

/** Whether persistent MongoDB storage is configured. */
export function isPersistent(): boolean {
  return Boolean(process.env.MONGODB_URI);
}
