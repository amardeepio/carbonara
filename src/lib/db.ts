import type { Db } from "mongodb";

/**
 * Shared MongoDB connection, used by both the entry store and the user store.
 *
 * Resolves to `null` when `MONGODB_URI` is unset or the cluster is unreachable,
 * so callers fall back to their in-memory implementations (graceful
 * degradation). The connection promise is cached on `globalThis` to survive
 * dev hot-reloads and warm serverless invocations — the standard Next.js +
 * Mongo pattern.
 */

interface DbCache {
  promise?: Promise<Db | null>;
}

const globalForDb = globalThis as unknown as { __carbonaraDb?: DbCache };
const cache: DbCache = (globalForDb.__carbonaraDb ??= {});

async function connect(uri: string): Promise<Db | null> {
  try {
    // Imported lazily so the in-memory path has no Mongo dependency cost.
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(uri);
    await client.connect();
    return client.db(process.env.MONGODB_DB || "carbonara");
  } catch (error) {
    // Graceful degradation: an unreachable/misconfigured MongoDB must not take
    // the app down. Log server-side and let callers serve from memory.
    console.error("MongoDB unavailable, falling back to in-memory storage:", error);
    return null;
  }
}

/** Resolve the shared database handle, or `null` when Mongo is unavailable. */
export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  cache.promise ??= connect(uri);
  return cache.promise;
}

/** Whether persistent MongoDB storage is configured. */
export function isPersistent(): boolean {
  return Boolean(process.env.MONGODB_URI);
}
