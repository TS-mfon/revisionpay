import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { sendMail } from "./mail";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { randomUUID } from "node:crypto";
import {
  requireCondition,
  type Actor,
  type Session,
} from "@revisionpay/domain";
import { sha256, token } from "@revisionpay/domain/crypto";
import { configuration } from "./config";
import { mongoClient, type Store } from "./store";

let authPromise: Promise<ReturnType<typeof betterAuth>> | undefined;
export async function auth() {
  const c = configuration();
  requireCondition(
    c.authSecret,
    "AUTH_NOT_CONFIGURED",
    "Sign-in is not available yet. Please try again later.",
    503,
  );
  return (authPromise ??= (async () => {
    const client = await mongoClient();
    const options: BetterAuthOptions = {
      baseURL: c.appUrl,
      secret: c.authSecret,
      database: mongodbAdapter(client.db(c.database), { client }),
      trustedOrigins: [c.appUrl],
      plugins: [
        magicLink({
          expiresIn: 15 * 60,
          storeToken: "hashed",
          sendMagicLink: async ({ email, url }) => {
            await sendMail(
              {
                to: email,
                subject: "Sign in to RevisionPay",
                text:
                  "Open this private link to sign in. It expires in 15 minutes.\n\n" +
                  url +
                  "\n\nIf you did not request this, ignore this email.",
              },
              url,
            );
          },
        }),
      ],
      rateLimit: {
        enabled: true,
        storage: "database",
        window: 60,
        max: 20,
        customRules: { "/sign-in/magic-link": { window: 60, max: 2 } },
      },
      socialProviders: {
        ...(c.googleClientId && c.googleSecret
          ? {
              google: {
                clientId: c.googleClientId,
                clientSecret: c.googleSecret,
              },
            }
          : {}),
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
          ? {
              github: {
                clientId: process.env.GITHUB_CLIENT_ID!,
                clientSecret: process.env.GITHUB_CLIENT_SECRET!,
              },
            }
          : {}),
      },
      session: { expiresIn: 60 * 60 * 12 },
      advanced: { useSecureCookies: c.appUrl.startsWith("https:") },
    };
    return betterAuth(options);
  })());
}
export function cookieToken(request: Request, name = "rp_session"): string {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function sessionCookie(
  raw: string,
  seconds = 7 * 86400,
  name = "rp_session",
) {
  return `${name}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${configuration().appUrl.startsWith("https:") ? "; Secure" : ""}`;
}
export async function issueSession(
  store: Store,
  input: Omit<Session, "id" | "tokenHash" | "expiresAt">,
) {
  const raw = token();
  const session: Session = {
    ...input,
    id: randomUUID(),
    tokenHash: sha256(raw),
    expiresAt: new Date(
      Date.now() + (input.kind === "owner" ? 12 * 3600000 : 7 * 86400000),
    ).toISOString(),
  };
  await store.putSession(session);
  return {
    session,
    cookie: sessionCookie(
      raw,
      input.kind === "owner" ? 12 * 3600 : 7 * 86400,
      input.kind === "demo"
        ? "rp_demo"
        : input.kind === "buyer"
          ? "rp_buyer_" + input.agreementId
          : "rp_session",
    ),
  };
}

async function googleIdentity(request: Request) {
  const c = configuration();
  if (!c.googleClientId || !c.googleSecret || !c.mongoUri) return;
  const service = await auth();
  const session = await service.api.getSession({ headers: request.headers });
  if (!session?.user.emailVerified) return;
  const accounts = await service.api.listUserAccounts({
    headers: request.headers,
  });
  if (!accounts.some((a) => a.providerId === "google")) return;
  return session.user;
}

export async function ownerGoogleStatus(request: Request, store: Store) {
  const user = await googleIdentity(request);
  if (!user) return { email: null, linked: false };
  const linked = await store.getValue<{ tenantId: string }>(
    "owner-link:" + user.id,
  );
  return {
    email: user.email,
    linked: linked?.tenantId === "owner:" + configuration().githubId,
  };
}

export async function linkOwnerGoogle(request: Request, store: Store) {
  // Linking requires two independent authenticated sessions, never an email/name match.
  const owner = await store.getSession(sha256(cookieToken(request)));
  requireCondition(
    owner?.kind === "owner" &&
      owner.tenantId === "owner:" + configuration().githubId &&
      Date.parse(owner.expiresAt) > Date.now(),
    "OWNER_SESSION_REQUIRED",
    "Open your private owner sign-in link before connecting Google.",
    403,
  );
  const user = await googleIdentity(request);
  requireCondition(
    user,
    "GOOGLE_SESSION_REQUIRED",
    "Sign in with Google before connecting this workspace.",
    403,
  );
  const key = "owner-link:" + user.id;
  const existing = await store.getValue<{ tenantId: string }>(key);
  requireCondition(
    !existing || existing.tenantId === owner.tenantId,
    "ACCOUNT_ALREADY_LINKED",
    "This Google account is already connected to another workspace.",
    409,
  );
  if (!existing) {
    const drafts = await store.listAgreements("user:" + user.id);
    requireCondition(
      drafts.length === 0,
      "WORKSPACE_HAS_AGREEMENTS",
      "This Google account already has a workspace with agreements. Use a different Google account to keep both workspaces accessible.",
      409,
    );
    await store.putValue(
      key,
      {
        tenantId: owner.tenantId,
        email: user.email,
        linkedAt: new Date().toISOString(),
      },
      true,
    );
  }
  return { linked: true, email: user.email };
}

export async function actor(
  request: Request,
  store: Store,
): Promise<Actor | undefined> {
  const demo = request.headers.get("x-revisionpay-space") === "demo";
  const agreementId = new URL(request.url).pathname.match(
    /\/agreements\/([0-9a-f-]{36})(?:\/|$)/,
  )?.[1];
  const names = demo
    ? ["rp_demo", "rp_session"]
    : [...(agreementId ? ["rp_buyer_" + agreementId] : []), "rp_session"];
  for (const name of names) {
    const raw = cookieToken(request, name);
    if (!raw) continue;
    const s = await store.getSession(sha256(raw));
    if (
      s &&
      Date.parse(s.expiresAt) > Date.now() &&
      (demo ? s.kind === "demo" : s.kind !== "demo")
    ) {
      let role = s.role;
      if (demo && agreementId) {
        const a = await store.getAgreement(agreementId);
        if (a?.tenantId === s.tenantId) {
          const submission = a.submissions.find(
            (v) => v.id === a.currentSubmissionId,
          );
          role =
            a.state === "AWAITING_BUYER" ||
            (submission?.state === "READY" && a.state !== "REVIEW_HOLD")
              ? "buyer"
              : "seller";
        }
      }
      return {
        id: s.id,
        tenantId: s.tenantId,
        kind: s.kind,
        role,
        agreementId: s.agreementId,
      };
    }
  }
  if (demo || !configuration().authSecret || !configuration().mongoUri) return;
  const service = await auth();
  const session = await service.api.getSession({ headers: request.headers });
  if (!session || !session.user.emailVerified) return;
  const linked = await store.getValue<{ tenantId: string }>(
    "owner-link:" + session.user.id,
  );
  if (linked?.tenantId === "owner:" + configuration().githubId)
    return {
      id: session.user.id,
      tenantId: linked.tenantId,
      kind: "owner",
      role: "seller",
      email: session.user.email,
      name: session.user.name,
    };
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const accounts = await service.api.listUserAccounts({
      headers: request.headers,
    });
    if (
      accounts.some(
        (v) =>
          v.providerId === "github" && v.accountId === configuration().githubId,
      )
    )
      return {
        id: session.user.id,
        tenantId: "owner:" + configuration().githubId,
        kind: "owner",
        role: "seller",
        email: session.user.email,
        name: session.user.name,
      };
  }
  if (agreementId) {
    const agreement = await store.getAgreement(agreementId);
    if (
      agreement?.clientEmail?.toLowerCase() ===
        session.user.email.toLowerCase() &&
      agreement.tenantId !== "user:" + session.user.id
    )
      return {
        id: session.user.id,
        tenantId: agreement.tenantId,
        agreementId,
        kind: "buyer",
        role: "buyer",
        email: session.user.email,
        name: session.user.name,
      };
  }
  return {
    id: session.user.id,
    tenantId: "user:" + session.user.id,
    kind: "seller",
    role: "seller",
    email: session.user.email,
    name: session.user.name,
  };
}

export async function switchDemoRole(
  request: Request,
  store: Store,
  role: "seller" | "buyer",
) {
  const s = await store.getSession(
    sha256(cookieToken(request, "rp_demo") || cookieToken(request)),
  );
  requireCondition(
    s?.kind === "demo" && Date.parse(s.expiresAt) > Date.now(),
    "DEMO_ONLY",
    "Role switching is only available inside a private demo session.",
    403,
  );
  s.role = role;
  await store.updateSession(s);
}
export function checkOrigin(request: Request) {
  requireCondition(
    request.headers.get("origin") === new URL(configuration().appUrl).origin,
    "ORIGIN_REJECTED",
    "This request must come from the RevisionPay application.",
    403,
  );
  requireCondition(
    !request.headers.get("sec-fetch-site") ||
      request.headers.get("sec-fetch-site") !== "cross-site",
    "ORIGIN_REJECTED",
    "Cross-site actions are not permitted.",
    403,
  );
}
