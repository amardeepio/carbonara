import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { getDb } from "./db";
import type { SafeUser, User } from "./types";

/**
 * User storage: MongoDB (`users` collection) when configured, otherwise an
 * in-memory map — mirroring the entry store's graceful-degradation pattern.
 */

export interface UserStore {
  create(user: Omit<User, "id">): Promise<User>;
  get(id: string): Promise<User | null>;
  /** Find a returning Google user by Google's stable account id. */
  findByGoogleSub(sub: string): Promise<User | null>;
  /**
   * Apply a partial update. A key explicitly set to `undefined` removes that
   * field (used to clear optional profile answers); absent keys are untouched.
   */
  update(id: string, patch: Partial<Omit<User, "id">>): Promise<User | null>;
}

const COLLECTION = "users";

/** Strip provider internals before sending a user to the client. */
export function toSafeUser(user: User): SafeUser {
  const { googleSub: _googleSub, ...safe } = user;
  return safe;
}

// --- In-memory implementation ---------------------------------------------

class MemoryUserStore implements UserStore {
  private users = new Map<string, User>();

  async create(user: Omit<User, "id">): Promise<User> {
    const created: User = { id: randomUUID(), ...user };
    this.users.set(created.id, created);
    return created;
  }

  async get(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByGoogleSub(sub: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.googleSub === sub) return user;
    }
    return null;
  }

  async update(id: string, patch: Partial<Omit<User, "id">>): Promise<User | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    const updated = { ...existing } as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete updated[key];
      else updated[key] = value;
    }
    updated.id = id;
    const result = updated as unknown as User;
    this.users.set(id, result);
    return result;
  }
}

// --- MongoDB implementation ------------------------------------------------

interface UserDoc extends Omit<User, "id"> {
  _id: string;
}

function fromDoc({ _id, ...rest }: UserDoc): User {
  return { id: _id, ...rest };
}

class MongoUserStore implements UserStore {
  constructor(private readonly collection: Collection<UserDoc>) {}

  async create(user: Omit<User, "id">): Promise<User> {
    const doc: UserDoc = { _id: randomUUID(), ...user };
    await this.collection.insertOne(doc);
    return fromDoc(doc);
  }

  async get(id: string): Promise<User | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? fromDoc(doc) : null;
  }

  async findByGoogleSub(sub: string): Promise<User | null> {
    const doc = await this.collection.findOne({ googleSub: sub });
    return doc ? fromDoc(doc) : null;
  }

  async update(id: string, patch: Partial<Omit<User, "id">>): Promise<User | null> {
    const sets: Record<string, unknown> = {};
    const unsets: Record<string, ""> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) unsets[key] = "";
      else sets[key] = value;
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(sets).length > 0) update.$set = sets;
    if (Object.keys(unsets).length > 0) update.$unset = unsets;
    if (Object.keys(update).length === 0) return this.get(id);

    const doc = await this.collection.findOneAndUpdate({ _id: id }, update, {
      returnDocument: "after",
    });
    return doc ? fromDoc(doc) : null;
  }
}

// --- Cached singleton resolution ------------------------------------------

interface Cache {
  promise?: Promise<UserStore>;
}

const globalForUsers = globalThis as unknown as { __carbonaraUserStore?: Cache };
const cache: Cache = (globalForUsers.__carbonaraUserStore ??= {});

async function createUserStore(): Promise<UserStore> {
  const db = await getDb();
  if (!db) return new MemoryUserStore();
  const collection = db.collection<UserDoc>(COLLECTION);
  await collection.createIndex({ googleSub: 1 }, { sparse: true });
  return new MongoUserStore(collection);
}

/** Resolve the shared user store, creating it on first use. */
export async function getUserStore(): Promise<UserStore> {
  cache.promise ??= createUserStore();
  return cache.promise;
}
