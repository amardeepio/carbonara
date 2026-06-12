import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { getDb } from "./db";
import type { LogEntry } from "./types";

/**
 * Storage layer for activity log entries, always scoped to a user.
 *
 * Uses MongoDB when available (shared connection in `db.ts`), otherwise an
 * in-memory store so the app (and its reviewers) can run with zero external
 * dependencies.
 */

export interface EntryStore {
  add(entry: Omit<LogEntry, "id">): Promise<LogEntry>;
  /** List a user's entries, newest first. */
  list(userId: string): Promise<LogEntry[]>;
  /** Remove one of `userId`'s entries; false if it doesn't exist or isn't theirs. */
  remove(id: string, userId: string): Promise<boolean>;
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

  async list(userId: string): Promise<LogEntry[]> {
    return this.entries
      .filter((e) => e.userId === userId)
      .map((e) => ({ ...e, date: e.date ?? e.createdAt.slice(0, 10) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => !(e.id === id && e.userId === userId));
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

  async list(userId: string): Promise<LogEntry[]> {
    const docs = await this.collection.find({ userId }).sort({ createdAt: -1 }).toArray();
    return docs.map(({ _id, ...rest }) => ({
      id: _id,
      ...rest,
      date: rest.date ?? rest.createdAt.slice(0, 10),
    }));
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ _id: id, userId });
    return res.deletedCount === 1;
  }
}

// --- Cached singleton resolution ------------------------------------------

interface Cache {
  promise?: Promise<EntryStore>;
}

// Persist across module reloads in dev and warm serverless invocations.
const globalForStore = globalThis as unknown as { __carbonaraStore?: Cache };
const cache: Cache = (globalForStore.__carbonaraStore ??= {});

async function createStore(): Promise<EntryStore> {
  const db = await getDb();
  if (!db) return new MemoryStore();
  const collection = db.collection<MongoDoc>(COLLECTION);
  await collection.createIndex({ userId: 1, createdAt: -1 });
  return new MongoStore(collection);
}

/** Resolve the shared store instance, creating it on first use. */
export async function getStore(): Promise<EntryStore> {
  cache.promise ??= createStore();
  return cache.promise;
}

export { isPersistent } from "./db";
