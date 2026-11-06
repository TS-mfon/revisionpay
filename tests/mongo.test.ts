import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { MongoStore } from "../apps/web/src/server/store";
import { agreement } from "./helpers";

describe("MongoDB persistence and leases", () => {
  let server: MongoMemoryServer;
  let client: MongoClient;
  let store: MongoStore;
  beforeAll(async () => {
    server = await MongoMemoryServer.create({
      binary: {
        version: "7.0.24",
        downloadDir: "node_modules/.cache/mongodb-memory-server",
      },
    });
    client = await new MongoClient(server.getUri()).connect();
    store = new MongoStore(client.db("revisionpay-test"));
  });
  afterAll(async () => {
    await client?.close();
    await server?.stop();
  });
  it("allows only one writer to replace the same aggregate version", async () => {
    const a = agreement();
    await store.createAgreement(a);
    const left = (await store.getAgreement(a.id))!;
    const right = (await store.getAgreement(a.id))!;
    left.payment.status = "CAPTURE_RESERVED";
    right.state = "CANCELED";
    const results = await Promise.all([
      store.saveAgreement(left, 0),
      store.saveAgreement(right, 0),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.getAgreement(a.id))!.version).toBe(1);
  });
  it("preserves wakeups made while a worker holds the lease", async () => {
    const a = agreement();
    await store.ensureJob(a.id);
    const job = (await store.claimJob(a.id))!;
    expect(await store.claimJob(a.id)).toBeUndefined();
    await store.ensureJob(a.id);
    await store.finishJob(job);
    expect(await store.claimJob(a.id)).toBeDefined();
  });
  it("fences expired workers from completing a newly claimed job", async () => {
    const id = agreement().id;
    await store.ensureJob(id);
    const old = (await store.claimJob(id))!;
    await store.db
      .collection("jobs")
      .updateOne({ id }, { $set: { leaseUntil: "" } });
    const current = (await store.claimJob(id))!;
    expect(current.leaseToken).not.toBe(old.leaseToken);
    await store.finishJob(old);
    expect(
      (await store.db.collection("jobs").findOne({ id }))!.leaseToken,
    ).toBe(current.leaseToken);
    await store.finishJob(current);
    expect(await store.claimJob(id)).toBeUndefined();
  });
  it("enforces shared quotas and capacity under contention", async () => {
    const quotas = await Promise.all(
      Array.from({ length: 10 }, () => store.consumeQuota("daily-test", 3)),
    );
    expect(quotas.filter(Boolean)).toHaveLength(3);
    expect(await store.leaseSlot("worker-test", "one", 10000)).toBe(true);
    await store.releaseSlot("worker-test", "wrong-token");
    expect(await store.leaseSlot("worker-test", "two", 10000)).toBe(false);
    await store.releaseSlot("worker-test", "one");
    expect(await store.leaseSlot("worker-test", "two", 10000)).toBe(true);
  });
});
