/**
 * Connectivity smoke-check for the configured MongoDB.
 *
 * Run with:  node --env-file=.env.local scripts/check-db.mjs
 *
 * Verifies, end to end, that:
 *  1. the MONGODB_URI connection string works (ping),
 *  2. documents can be written (a sample user + an app-shaped log entry),
 *  3. the same documents can be read back.
 *
 * Never prints credentials.
 */
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run via: node --env-file=.env.local scripts/check-db.mjs");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "carbonara";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });

try {
  // 1. Connect + ping
  await client.connect();
  await client.db(dbName).command({ ping: 1 });
  console.log(`✓ Connected to MongoDB (db: ${dbName})`);

  const db = client.db(dbName);

  // 2a. Write a sample user
  const users = db.collection("users");
  const user = {
    _id: randomUUID(),
    name: "Demo User",
    email: "demo@carbonara.local",
    region: "IN",
    createdAt: new Date().toISOString(),
  };
  await users.insertOne(user);
  console.log(`✓ Inserted user ${user._id} into "users"`);

  // 2b. Write an app-shaped log entry (same shape MongoStore uses)
  const entries = db.collection("entries");
  const entry = {
    _id: randomUUID(),
    userId: user._id,
    type: "metro",
    quantity: 10,
    kgCo2e: 0.14,
    createdAt: new Date().toISOString(),
    pricedBy: "builtin",
  };
  await entries.insertOne(entry);
  console.log(`✓ Inserted entry ${entry._id} into "entries"`);

  // 3. Read both back
  const userBack = await users.findOne({ _id: user._id });
  const entryBack = await entries.findOne({ _id: entry._id });
  if (!userBack || !entryBack) {
    throw new Error("Round-trip failed: inserted document(s) not found on read-back");
  }
  console.log(`✓ Read back user: ${userBack.name} <${userBack.email}>`);
  console.log(`✓ Read back entry: ${entryBack.type} ${entryBack.quantity} → ${entryBack.kgCo2e} kg CO2e`);

  const [userCount, entryCount] = await Promise.all([
    users.countDocuments(),
    entries.countDocuments(),
  ]);
  console.log(`✓ Collection totals — users: ${userCount}, entries: ${entryCount}`);
  console.log("\nAll checks passed: connection string works, writes persist, reads succeed.");
} catch (error) {
  console.error("✗ MongoDB check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.close();
}
