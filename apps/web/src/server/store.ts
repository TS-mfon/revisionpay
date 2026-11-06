import { MongoClient, type Db } from "mongodb";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DomainError,
  type Agreement,
  type Job,
  type Session,
} from "@revisionpay/domain";
import { configuration } from "./config";

type Doc<T> = { _id: string; value: T; version?: number };
type LocalData = {
  agreements: Record<string, Agreement>;
  sessions: Record<string, Session>;
  jobs: Record<string, Job>;
  values: Record<string, unknown>;
};
const globals = globalThis as typeof globalThis & {
  rpMongo?: Promise<MongoClient>;
  rpStore?: Store;
  rpFileLock?: Promise<unknown>;
};
const clone = <T>(v: T): T => structuredClone(v);
export async function mongoClient() {
  const c = configuration();
  if (!c.mongoUri)
    throw new DomainError(
      "DATABASE_NOT_CONFIGURED",
      "MongoDB is not configured.",
      503,
    );
  globals.rpMongo ??= new MongoClient(c.mongoUri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 15000,
  })
    .connect()
    .catch((e) => {
      globals.rpMongo = undefined;
      throw e;
    });
  return globals.rpMongo;
}
export interface Store {
  getAgreement(id: string): Promise<Agreement | undefined>;
  listAgreements(tenantId?: string): Promise<Agreement[]>;
  createAgreement(a: Agreement): Promise<void>;
  saveAgreement(a: Agreement, expectedVersion: number): Promise<boolean>;
  findInvitation(hash: string): Promise<Agreement | undefined>;
  getSession(hash: string): Promise<Session | undefined>;
  putSession(s: Session): Promise<void>;
  updateSession(s: Session): Promise<void>;
  ensureJob(id: string, dueAt?: string): Promise<void>;
  claimJob(agreementId?: string): Promise<Job | undefined>;
  finishJob(job: Job, dueAt?: string, error?: string): Promise<void>;
  getValue<T>(key: string): Promise<T | undefined>;
  listValues<T>(prefix: string): Promise<T[]>;
  putValue<T>(key: string, value: T, ifAbsent?: boolean): Promise<T>;
  consumeQuota(key: string, limit: number): Promise<boolean>;
  leaseSlot(name: string, leaseToken: string, ms: number): Promise<boolean>;
  releaseSlot(name: string, leaseToken: string): Promise<void>;
}
export class MongoStore implements Store {
  constructor(public db: Db) {}
  async getAgreement(id: string) {
    return (
      await this.db
        .collection<Doc<Agreement>>("agreements")
        .findOne({ _id: id })
    )?.value;
  }
  async listAgreements(tenantId?: string) {
    return (
      await this.db
        .collection<Doc<Agreement>>("agreements")
        .find(tenantId ? { "value.tenantId": tenantId } : {})
        .sort({ "value.updatedAt": -1 })
        .limit(tenantId ? 250 : 0)
        .toArray()
    ).map((d) => d.value);
  }
  async createAgreement(a: Agreement) {
    await this.db
      .collection<Doc<Agreement>>("agreements")
      .insertOne({ _id: a.id, version: a.version, value: a });
  }
  async saveAgreement(a: Agreement, expectedVersion: number) {
    a.version = expectedVersion + 1;
    return (
      (
        await this.db
          .collection<Doc<Agreement>>("agreements")
          .replaceOne(
            { _id: a.id, version: expectedVersion },
            { version: a.version, value: a },
          )
      ).modifiedCount === 1
    );
  }
  async findInvitation(hash: string) {
    return (
      await this.db
        .collection<Doc<Agreement>>("agreements")
        .findOne({ "value.invitation.tokenHash": hash })
    )?.value;
  }
  async getSession(hash: string) {
    return (
      await this.db.collection<Doc<Session>>("sessions").findOne({ _id: hash })
    )?.value;
  }
  async putSession(s: Session) {
    await this.db
      .collection<Doc<Session>>("sessions")
      .insertOne({ _id: s.tokenHash, value: s });
  }
  async updateSession(s: Session) {
    await this.db
      .collection<Doc<Session>>("sessions")
      .replaceOne({ _id: s.tokenHash }, { value: s });
  }
  async ensureJob(id: string, dueAt = new Date().toISOString()) {
    const jobs = this.db.collection<Job & { _id: string }>("jobs");
    await jobs.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          id,
          agreementId: id,
          status: "done",
          dueAt,
          leaseUntil: "",
          attempts: 0,
        },
      },
      { upsert: true },
    );
    await jobs.updateOne(
      { _id: id, status: "done" },
      { $set: { status: "ready", dueAt } },
    );
    await jobs.updateOne(
      { _id: id, status: "ready", dueAt: { $gt: dueAt } },
      { $set: { dueAt } },
    );
    await jobs.updateOne(
      { _id: id, status: "running" },
      { $min: { wakeAt: dueAt } },
    );
  }
  async claimJob(agreementId?: string) {
    const now = new Date().toISOString();
    const j = await this.db
      .collection<Job & { _id: string }>("jobs")
      .findOneAndUpdate(
        {
          ...(agreementId ? { agreementId } : {}),
          dueAt: { $lte: now },
          $or: [
            { status: "ready" },
            { status: "running", leaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            status: "running",
            leaseToken: randomUUID(),
            leaseUntil: new Date(Date.now() + 90000).toISOString(),
          },
          $inc: { attempts: 1 },
        },
        { sort: { dueAt: 1 }, returnDocument: "after" },
      );
    return j || undefined;
  }
  async finishJob(job: Job, dueAt?: string, error?: string) {
    await this.db
      .collection<Job & { _id: string }>("jobs")
      .updateOne({ _id: job.id, leaseToken: job.leaseToken }, [
        {
          $set: {
            status: {
              $cond: [
                {
                  $or: [
                    Boolean(dueAt),
                    { $ne: [{ $ifNull: ["$wakeAt", null] }, null] },
                  ],
                },
                "ready",
                "done",
              ],
            },
            dueAt: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ["$wakeAt", null] }, null] },
                    dueAt ? { $lt: ["$wakeAt", dueAt] } : true,
                  ],
                },
                "$wakeAt",
                dueAt || job.dueAt,
              ],
            },
            leaseUntil: "",
            lastError: error || "",
          },
        },
        { $unset: ["leaseToken", "wakeAt"] },
      ]);
  }
  async getValue<T>(key: string) {
    return (
      await this.db.collection<Doc<T>>("service_state").findOne({ _id: key })
    )?.value;
  }
  async listValues<T>(prefix: string) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      await this.db
        .collection<Doc<T>>("service_state")
        .find({ _id: { $regex: "^" + escaped } })
        .limit(500)
        .toArray()
    ).map((d) => d.value);
  }
  async putValue<T>(key: string, value: T, ifAbsent = false) {
    const d = await this.db
      .collection<Doc<T>>("service_state")
      .findOneAndUpdate(
        { _id: key },
        ifAbsent ? { $setOnInsert: { value } } : { $set: { value } },
        { upsert: true, returnDocument: "after" },
      );
    return d!.value;
  }
  async consumeQuota(key: string, limit: number) {
    const col = this.db.collection<{ _id: string; count: number }>("quotas");
    try {
      const result = await col.findOneAndUpdate(
        {
          _id: key,
          $or: [{ count: { $lt: limit } }, { count: { $exists: false } }],
        },
        { $inc: { count: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      return Boolean(result && result.count <= limit);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  }
  async leaseSlot(name: string, leaseToken: string, ms: number) {
    const col = this.db.collection<{
      _id: string;
      until: string;
      token: string;
    }>("capacity");
    try {
      return Boolean(
        await col.findOneAndUpdate(
          {
            _id: name,
            $or: [
              { until: { $lte: new Date().toISOString() } },
              { until: { $exists: false } },
            ],
          },
          {
            $set: {
              token: leaseToken,
              until: new Date(Date.now() + ms).toISOString(),
            },
          },
          { upsert: true, returnDocument: "after" },
        ),
      );
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  }
  async releaseSlot(name: string, leaseToken: string) {
    await this.db
      .collection("capacity")
      .updateOne({ _id: name, token: leaseToken } as never, {
        $set: { until: "" },
      });
  }
}
export class LocalStore implements Store {
  constructor(
    public file?: string,
    private data: LocalData = {
      agreements: {},
      sessions: {},
      jobs: {},
      values: {},
    },
  ) {}
  private async atomic<T>(fn: (d: LocalData) => T): Promise<T> {
    const run = async () => {
      if (this.file) {
        try {
          this.data = JSON.parse(await fs.readFile(this.file, "utf8"));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
      const result = fn(this.data);
      if (this.file) {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + "." + randomUUID();
        await fs.writeFile(temp, JSON.stringify(this.data), { mode: 0o600 });
        await fs.rename(temp, this.file);
      }
      return clone(result);
    };
    const p = (globals.rpFileLock || Promise.resolve()).then(run, run);
    globals.rpFileLock = p.catch(() => undefined);
    return p;
  }
  getAgreement(id: string) {
    return this.atomic((d) => d.agreements[id]);
  }
  listAgreements(tenantId?: string) {
    return this.atomic((d) =>
      Object.values(d.agreements)
        .filter((a) => !tenantId || a.tenantId === tenantId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }
  createAgreement(a: Agreement) {
    return this.atomic((d) => {
      if (d.agreements[a.id]) throw new Error("Duplicate agreement");
      d.agreements[a.id] = clone(a);
    });
  }
  saveAgreement(a: Agreement, version: number) {
    return this.atomic((d) => {
      if (d.agreements[a.id]?.version !== version) return false;
      a.version = version + 1;
      d.agreements[a.id] = clone(a);
      return true;
    });
  }
  findInvitation(hash: string) {
    return this.atomic((d) =>
      Object.values(d.agreements).find((a) => a.invitation?.tokenHash === hash),
    );
  }
  getSession(hash: string) {
    return this.atomic((d) => d.sessions[hash]);
  }
  putSession(s: Session) {
    return this.atomic((d) => {
      if (d.sessions[s.tokenHash]) throw new Error("Duplicate session");
      d.sessions[s.tokenHash] = clone(s);
    });
  }
  updateSession(s: Session) {
    return this.atomic((d) => {
      d.sessions[s.tokenHash] = clone(s);
    });
  }
  ensureJob(id: string, dueAt = new Date().toISOString()) {
    return this.atomic((d) => {
      const job = d.jobs[id];
      if (!job || job.status === "done")
        d.jobs[id] = {
          id,
          agreementId: id,
          status: "ready",
          dueAt,
          leaseUntil: "",
          attempts: job?.attempts || 0,
        };
      else if (job.status === "ready" && dueAt < job.dueAt) job.dueAt = dueAt;
      else if (job.status === "running" && (!job.wakeAt || dueAt < job.wakeAt))
        job.wakeAt = dueAt;
    });
  }
  claimJob(agreementId?: string) {
    return this.atomic((d) => {
      const now = new Date().toISOString();
      const j = Object.values(d.jobs)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .find(
          (j) =>
            (!agreementId || j.agreementId === agreementId) &&
            j.dueAt <= now &&
            (j.status === "ready" ||
              (j.status === "running" && j.leaseUntil <= now)),
        );
      if (!j) return undefined;
      j.status = "running";
      j.leaseToken = randomUUID();
      j.leaseUntil = new Date(Date.now() + 90000).toISOString();
      j.attempts++;
      return j;
    });
  }
  finishJob(job: Job, dueAt?: string, error?: string) {
    return this.atomic((d) => {
      const j = d.jobs[job.id];
      if (j?.leaseToken !== job.leaseToken) return;
      const next = j.wakeAt && (!dueAt || j.wakeAt < dueAt) ? j.wakeAt : dueAt;
      j.status = next ? "ready" : "done";
      j.dueAt = next || j.dueAt;
      j.leaseUntil = "";
      j.lastError = error;
      delete j.leaseToken;
      delete j.wakeAt;
    });
  }
  getValue<T>(key: string) {
    return this.atomic((d) => d.values[key] as T | undefined);
  }
  listValues<T>(prefix: string) {
    return this.atomic((d) =>
      Object.entries(d.values)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value as T),
    );
  }
  putValue<T>(key: string, v: T, ifAbsent = false) {
    return this.atomic((d) => {
      if (!ifAbsent || !(key in d.values)) d.values[key] = clone(v);
      return d.values[key] as T;
    });
  }
  consumeQuota(key: string, limit: number) {
    return this.atomic((d) => {
      const k = "quota:" + key;
      const count = Number(d.values[k] || 0);
      if (count >= limit) return false;
      d.values[k] = count + 1;
      return true;
    });
  }
  leaseSlot(name: string, leaseToken: string, ms: number) {
    return this.atomic((d) => {
      const key = "slot:" + name;
      const slot = d.values[key] as
        | { until: number; token: string }
        | undefined;
      if (slot && slot.until > Date.now()) return false;
      d.values[key] = { until: Date.now() + ms, token: leaseToken };
      return true;
    });
  }
  releaseSlot(name: string, leaseToken: string) {
    return this.atomic((d) => {
      const key = "slot:" + name;
      if (
        (d.values[key] as { token: string } | undefined)?.token === leaseToken
      )
        delete d.values[key];
    });
  }
}
export async function getStore(): Promise<Store> {
  if (globals.rpStore) return globals.rpStore;
  const c = configuration();
  if (c.mongoUri)
    return (globals.rpStore = new MongoStore(
      (await mongoClient()).db(c.database),
    ));
  if (process.env.VERCEL || process.env.NETLIFY || c.mode !== "demo")
    throw new DomainError(
      "DATABASE_NOT_CONFIGURED",
      "Connect MongoDB Atlas to enable this environment.",
      503,
    );
  const root =
    path.basename(process.cwd()) === "web"
      ? path.resolve(process.cwd(), "../..")
      : process.cwd();
  return (globals.rpStore = new LocalStore(
    path.resolve(
      root,
      process.env.LOCAL_DATA_PATH || ".local/revisionpay.json",
    ),
  ));
}
export async function mutate(
  store: Store,
  id: string,
  update: (a: Agreement) => void,
): Promise<Agreement> {
  for (let retry = 0; retry < 5; retry++) {
    const a = await store.getAgreement(id);
    if (!a) throw new DomainError("NOT_FOUND", "Agreement not found.", 404);
    const v = a.version;
    update(a);
    a.updatedAt = new Date().toISOString();
    if (await store.saveAgreement(a, v)) return a;
  }
  throw new DomainError(
    "CONCURRENT_UPDATE",
    "This agreement changed. Refresh and try again.",
  );
}
