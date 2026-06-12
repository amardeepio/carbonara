import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import type { Pledge } from "./challenges";
import { getDb } from "./db";

/**
 * Storage for challenge pledges, always scoped to a user. MongoDB when
 * configured, in-memory otherwise — same dual-store pattern as `store.ts`.
 */

export interface PledgeStore {
  /** List a user's pledges, newest week first. */
  list(userId: string): Promise<Pledge[]>;
  add(pledge: Omit<Pledge, "id">): Promise<Pledge>;
  /** Patch one of `userId`'s pledges (status/kgAvoided transitions). */
  update(id: string, userId: string, patch: Partial<Pick<Pledge, "status" | "kgAvoided">>): Promise<Pledge | null>;
}

const COLLECTION = "pledges";

// --- In-memory implementation ---------------------------------------------

class MemoryPledgeStore implements PledgeStore {
  private pledges: Pledge[] = [];

  async list(userId: string): Promise<Pledge[]> {
    return this.pledges
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.challengeKey.localeCompare(b.challengeKey));
  }

  async add(pledge: Omit<Pledge, "id">): Promise<Pledge> {
    const created: Pledge = { id: randomUUID(), ...pledge };
    this.pledges.push(created);
    return created;
  }

  async update(
    id: string,
    userId: string,
    patch: Partial<Pick<Pledge, "status" | "kgAvoided">>,
  ): Promise<Pledge | null> {
    const pledge = this.pledges.find((p) => p.id === id && p.userId === userId);
    if (!pledge) return null;
    Object.assign(pledge, patch);
    return pledge;
  }
}

// --- MongoDB implementation ------------------------------------------------

interface PledgeDoc extends Omit<Pledge, "id"> {
  _id: string;
}

function fromDoc({ _id, ...rest }: PledgeDoc): Pledge {
  return { id: _id, ...rest };
}

class MongoPledgeStore implements PledgeStore {
  constructor(private readonly collection: Collection<PledgeDoc>) {}

  async list(userId: string): Promise<Pledge[]> {
    const docs = await this.collection
      .find({ userId })
      .sort({ weekStart: -1, challengeKey: 1 })
      .toArray();
    return docs.map(fromDoc);
  }

  async add(pledge: Omit<Pledge, "id">): Promise<Pledge> {
    const doc: PledgeDoc = { _id: randomUUID(), ...pledge };
    await this.collection.insertOne(doc);
    return fromDoc(doc);
  }

  async update(
    id: string,
    userId: string,
    patch: Partial<Pick<Pledge, "status" | "kgAvoided">>,
  ): Promise<Pledge | null> {
    const doc = await this.collection.findOneAndUpdate(
      { _id: id, userId },
      { $set: patch },
      { returnDocument: "after" },
    );
    return doc ? fromDoc(doc) : null;
  }
}

// --- Cached singleton resolution ------------------------------------------

interface Cache {
  promise?: Promise<PledgeStore>;
}

const globalForPledges = globalThis as unknown as { __carbonaraPledgeStore?: Cache };
const cache: Cache = (globalForPledges.__carbonaraPledgeStore ??= {});

async function createPledgeStore(): Promise<PledgeStore> {
  const db = await getDb();
  if (!db) return new MemoryPledgeStore();
  const collection = db.collection<PledgeDoc>(COLLECTION);
  await collection.createIndex({ userId: 1, weekStart: -1 });
  return new MongoPledgeStore(collection);
}

/** Resolve the shared pledge store, creating it on first use. */
export async function getPledgeStore(): Promise<PledgeStore> {
  cache.promise ??= createPledgeStore();
  return cache.promise;
}
