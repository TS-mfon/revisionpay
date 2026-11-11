import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DomainError,
  requireCondition,
  type Actor,
  type Tenant,
} from "@revisionpay/domain";
import {
  publicWork,
  WorkInput,
  type WorkPost,
  type WorkQuery,
} from "@revisionpay/domain/work";
import { configuration } from "./config";
import { create } from "./service";
import type { Store } from "./store";

export const workMode = () =>
  configuration().mode === "live" ? ("live" as const) : ("sandbox" as const);
function account(who: Actor | undefined): asserts who is Actor {
  requireCondition(
    who && ["owner", "seller"].includes(who.kind),
    "SIGN_IN_REQUIRED",
    "Sign in to post work or apply as a freelancer.",
    401,
  );
}
async function identity(store: Store, who: Actor) {
  account(who);
  const profile = await store.getValue<Tenant>("tenant:" + who.tenantId);
  const email = who.email || profile?.email;
  requireCondition(
    email && z.string().email().safeParse(email).success,
    "PROFILE_REQUIRED",
    "Sign in with Google to use the work explorer.",
  );
  return {
    email: email.toLowerCase(),
    name: profile?.displayName || who.name || email.split("@")[0],
  };
}
function httpsUrl(value: string) {
  const url = new URL(value);
  requireCondition(
    url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash,
    "PUBLIC_URL_REQUIRED",
    "Use a public HTTPS page without a password, port or fragment.",
  );
  return url.href;
}
async function read(store: Store, id: string) {
  const post = await store.getWorkPost(id);
  requireCondition(
    post && post.mode === workMode(),
    "NOT_FOUND",
    "Posted work not found.",
    404,
  );
  return post;
}
async function change(
  store: Store,
  id: string,
  update: (post: WorkPost) => void,
) {
  for (let retry = 0; retry < 5; retry++) {
    const post = await read(store, id),
      version = post.version;
    update(post);
    post.updatedAt = new Date().toISOString();
    if (await store.saveWorkPost(post, version)) return post;
  }
  throw new DomainError(
    "WORK_CHANGED",
    "This post changed in another tab. Please try again.",
    409,
  );
}
export async function listWork(
  store: Store,
  who: Actor | undefined,
  input: URLSearchParams,
) {
  const view = z
    .enum(["open", "posts", "applications"])
    .parse(input.get("view") || "open");
  if (view !== "open") account(who);
  const query: WorkQuery = {
    view,
    tenantId: who?.tenantId,
    mode: workMode(),
    q: z
      .string()
      .trim()
      .max(100)
      .parse(input.get("q") || ""),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .parse(input.get("page") || 1),
  };
  const posts = await store.listWorkPosts(query);
  return {
    posts: posts
      .slice(0, 20)
      .map((post) => ({
        ...publicWork(post),
        myApplicationStatus: post.applications.find(
          (a) => a.tenantId === who?.tenantId,
        )?.status,
      })),
    hasMore: posts.length > 20,
    page: query.page,
    mode: query.mode,
  };
}
export async function workDetail(
  store: Store,
  who: Actor | undefined,
  id: string,
) {
  const post = await read(store, id);
  const owner =
    who?.tenantId === post.clientTenantId &&
    ["owner", "seller"].includes(who.kind);
  const mine =
    who && ["owner", "seller"].includes(who.kind)
      ? post.applications.find((a) => a.tenantId === who.tenantId)
      : undefined;
  requireCondition(
    post.status === "OPEN" || owner || mine,
    "NOT_FOUND",
    "This work is no longer accepting applications.",
    404,
  );
  const selected = mine && post.selectedApplicationId === mine.id;
  const agreement =
    (owner || selected) && post.agreementId && post.status === "ASSIGNED"
      ? await store.getAgreement(post.agreementId)
      : undefined;
  const safeApplication = ({
    id,
    name,
    message,
    portfolioUrl,
    status,
    createdAt,
  }: WorkPost["applications"][number]) => ({
    id,
    name,
    message,
    portfolioUrl,
    status,
    createdAt,
  });
  return {
    post: publicWork(post),
    isOwner: Boolean(owner),
    applications: owner ? post.applications.map(safeApplication) : undefined,
    application: mine ? safeApplication(mine) : undefined,
    agreementId: agreement?.id,
    agreementRole: owner ? "buyer" : selected ? "seller" : undefined,
    preparingAgreement: Boolean(
      (owner || selected) && post.status === "ASSIGNED" && !agreement,
    ),
  };
}
export async function postWork(store: Store, who: Actor, input: unknown) {
  account(who);
  const data = WorkInput.parse(input),
    client = await identity(store, who);
  requireCondition(
    !configuration().newJobsPaused,
    "PAUSED",
    "New work posts are temporarily paused.",
    503,
  );
  const sourceUrl = httpsUrl(data.sourceUrl);
  requireCondition(
    await store.consumeQuota(
      "work-posts:" +
        who.tenantId +
        ":" +
        new Date().toISOString().slice(0, 10),
      10,
    ),
    "POST_LIMIT",
    "You can post up to ten jobs each day.",
    429,
  );
  const now = new Date().toISOString();
  const post: WorkPost = {
    id: randomUUID(),
    version: 0,
    clientTenantId: who.tenantId,
    clientName: client.name,
    clientEmail: client.email,
    mode: workMode(),
    title: data.title,
    description: data.description,
    sourceUrl,
    amountMinor: data.amountMinor,
    requirements: data.requirements,
    status: "OPEN",
    applications: [],
    createdAt: now,
    updatedAt: now,
  };
  await store.createWorkPost(post);
  return publicWork(post);
}
export async function applyToWork(
  store: Store,
  who: Actor,
  id: string,
  input: unknown,
) {
  account(who);
  const data = z
    .object({
      message: z.string().trim().min(20).max(1200),
      portfolioUrl: z.string().url().max(1000).optional(),
    })
    .strict()
    .parse(input);
  const freelancer = await identity(store, who);
  const portfolioUrl = data.portfolioUrl
    ? httpsUrl(data.portfolioUrl)
    : undefined;
  return change(store, id, (post) => {
    requireCondition(
      post.clientTenantId !== who.tenantId,
      "OWN_POST",
      "You cannot apply to your own work post.",
    );
    requireCondition(
      post.status === "OPEN",
      "APPLICATIONS_CLOSED",
      "This work is no longer accepting applications.",
    );
    const existing = post.applications.find((a) => a.tenantId === who.tenantId);
    if (existing && existing.status === "APPLIED") return;
    requireCondition(
      !existing,
      "ALREADY_APPLIED",
      "You have already applied to this work.",
    );
    requireCondition(
      post.applications.length < 50,
      "APPLICATION_LIMIT",
      "This post has reached its application limit.",
    );
    post.applications.push({
      id: randomUUID(),
      tenantId: who.tenantId,
      ...freelancer,
      message: data.message,
      portfolioUrl,
      status: "APPLIED",
      createdAt: new Date().toISOString(),
    });
  });
}
export async function inviteFreelancer(
  store: Store,
  who: Actor,
  id: string,
  applicationId: string,
) {
  account(who);
  return change(store, id, (post) => {
    requireCondition(
      post.clientTenantId === who.tenantId,
      "CLIENT_REQUIRED",
      "Only the client who posted this work can invite a freelancer.",
      403,
    );
    if (
      post.status === "INVITED" &&
      post.selectedApplicationId === applicationId
    )
      return;
    requireCondition(
      post.status === "OPEN",
      "INVITATION_PENDING",
      "Wait for the invited freelancer to respond, or close this post.",
    );
    const application = post.applications.find((a) => a.id === applicationId);
    requireCondition(
      application?.status === "APPLIED",
      "APPLICATION_UNAVAILABLE",
      "Choose a current application.",
    );
    application.status = "INVITED";
    post.selectedApplicationId = application.id;
    post.agreementId = randomUUID();
    post.status = "INVITED";
  });
}
export async function respondToWork(
  store: Store,
  who: Actor,
  id: string,
  accept: boolean,
) {
  account(who);
  const post = await change(store, id, (post) => {
    const mine = post.applications.find(
      (a) => a.id === post.selectedApplicationId && a.tenantId === who.tenantId,
    );
    requireCondition(
      mine,
      "INVITATION_REQUIRED",
      "Only the invited freelancer can respond.",
      403,
    );
    if (accept && post.status === "ASSIGNED" && mine.status === "ACCEPTED")
      return;
    requireCondition(
      post.status === "INVITED" && mine.status === "INVITED",
      "INVITATION_UNAVAILABLE",
      "This invitation is no longer available.",
    );
    mine.status = accept ? "ACCEPTED" : "DECLINED";
    post.status = accept ? "ASSIGNED" : "OPEN";
    if (!accept) {
      delete post.selectedApplicationId;
      delete post.agreementId;
    }
  });
  if (!accept) return undefined;
  const selected = post.applications.find(
    (a) => a.id === post.selectedApplicationId,
  )!;
  return create(
    store,
    { ...who, name: selected.name, email: selected.email },
    {
      title: post.title,
      clientName: post.clientName,
      clientEmail: post.clientEmail,
      sourceUrl: post.sourceUrl,
      amountMinor: post.amountMinor,
      requirements: post.requirements,
    },
    false,
    {
      id: post.agreementId!,
      postId: post.id,
      clientTenantId: post.clientTenantId,
    },
  );
}
export async function closeWork(store: Store, who: Actor, id: string) {
  account(who);
  return change(store, id, (post) => {
    requireCondition(
      post.clientTenantId === who.tenantId,
      "CLIENT_REQUIRED",
      "Only the client who posted this work can close it.",
      403,
    );
    requireCondition(
      post.status !== "ASSIGNED",
      "AGREEMENT_STARTED",
      "This work has an agreement. Manage it from the agreement page.",
    );
    post.status = "CLOSED";
  });
}
export async function withdrawApplication(
  store: Store,
  who: Actor,
  id: string,
) {
  account(who);
  return change(store, id, (post) => {
    const mine = post.applications.find((a) => a.tenantId === who.tenantId);
    requireCondition(
      mine?.status === "APPLIED",
      "APPLICATION_UNAVAILABLE",
      "Only a pending application can be withdrawn.",
    );
    mine.status = "WITHDRAWN";
  });
}
