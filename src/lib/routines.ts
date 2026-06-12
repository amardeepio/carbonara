import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { getDb } from "./db";
import type { Routine } from "./types";

/**
 * Storage for saved routines (one-tap activity bundles), always scoped to a
 * user. MongoDB when configured, in-memory otherwise — the same dual-store
 * pattern as `store.ts` / `users.ts`.
 */

export interface RoutineStore {
  /** List a user's routines, oldest first (stable order for the UI). */
  list(userId: string): Promise<Routine[]>;
  add(routine: Omit<Routine, "id">): Promise<Routine>;
  /** Remove one of `userId`'s routines; false if missing or not theirs. */
  remove(id: string, userId: string): Promise<boolean>;
  /** Fetch one routine, only if it belongs to `userId`. */
  get(id: string, userId: string): Promise<Routine | null>;
}

const COLLECTION = "routines";

// --- In-memory implementation ---------------------------------------------

class MemoryRoutineStore implements RoutineStore {
  private routines: Routine[] = [];

  async list(userId: string): Promise<Routine[]> {
    return this.routines
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async add(routine: Omit<Routine, "id">): Promise<Routine> {
    const created: Routine = { id: randomUUID(), ...routine };
    this.routines.push(created);
    return created;
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const before = this.routines.length;
    this.routines = this.routines.filter((r) => !(r.id === id && r.userId === userId));
    return this.routines.length < before;
  }

  async get(id: string, userId: string): Promise<Routine | null> {
    return this.routines.find((r) => r.id === id && r.userId === userId) ?? null;
  }
}

// --- MongoDB implementation ------------------------------------------------

interface RoutineDoc extends Omit<Routine, "id"> {
  _id: string;
}

function fromDoc({ _id, ...rest }: RoutineDoc): Routine {
  return { id: _id, ...rest };
}

class MongoRoutineStore implements RoutineStore {
  constructor(private readonly collection: Collection<RoutineDoc>) {}

  async list(userId: string): Promise<Routine[]> {
    const docs = await this.collection.find({ userId }).sort({ createdAt: 1 }).toArray();
    return docs.map(fromDoc);
  }

  async add(routine: Omit<Routine, "id">): Promise<Routine> {
    const doc: RoutineDoc = { _id: randomUUID(), ...routine };
    await this.collection.insertOne(doc);
    return fromDoc(doc);
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const res = await this.collection.deleteOne({ _id: id, userId });
    return res.deletedCount === 1;
  }

  async get(id: string, userId: string): Promise<Routine | null> {
    const doc = await this.collection.findOne({ _id: id, userId });
    return doc ? fromDoc(doc) : null;
  }
}

// --- Cached singleton resolution ------------------------------------------

interface Cache {
  promise?: Promise<RoutineStore>;
}

const globalForRoutines = globalThis as unknown as { __carbonaraRoutineStore?: Cache };
const cache: Cache = (globalForRoutines.__carbonaraRoutineStore ??= {});

async function createRoutineStore(): Promise<RoutineStore> {
  const db = await getDb();
  if (!db) return new MemoryRoutineStore();
  const collection = db.collection<RoutineDoc>(COLLECTION);
  await collection.createIndex({ userId: 1 });
  return new MongoRoutineStore(collection);
}

/** Resolve the shared routine store, creating it on first use. */
export async function getRoutineStore(): Promise<RoutineStore> {
  cache.promise ??= createRoutineStore();
  return cache.promise;
}
