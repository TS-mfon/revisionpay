import { mongoClient } from "../apps/web/src/server/store";
import { configuration } from "../apps/web/src/server/config";
const client = await mongoClient();
const db = client.db(configuration().database);
await db
  .collection("agreements")
  .createIndex({ "value.tenantId": 1, "value.updatedAt": -1 });
await db
  .collection("agreements")
  .createIndex({ "value.invitation.tokenHash": 1 }, { sparse: true });
await db.collection("jobs").createIndex({ status: 1, dueAt: 1, leaseUntil: 1 });
await db
  .collection("work_posts")
  .createIndex({
    "value.mode": 1,
    "value.status": 1,
    "value.createdAt": -1,
    _id: -1,
  });
await db
  .collection("work_posts")
  .createIndex({ "value.clientTenantId": 1, "value.createdAt": -1 });
await db
  .collection("work_posts")
  .createIndex({ "value.applications.tenantId": 1, "value.createdAt": -1 });
console.log("RevisionPay MongoDB indexes are ready.");
await client.close();
