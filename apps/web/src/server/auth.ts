import { betterAuth, type BetterAuthOptions } from "better-auth";
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
    c.authSecret &&
      process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET,
    "AUTH_NOT_CONFIGURED",
    "GitHub application sign-in is not configured. The owner can also use a CLI sign-in link.",
    503,
  );
  return (authPromise ??= (async () => {
    const client = await mongoClient();
    const options: BetterAuthOptions = {
      baseURL: c.appUrl,
      secret: c.authSecret,
      database: mongodbAdapter(client.db(c.database), { client }),
      trustedOrigins: [c.appUrl],
      socialProviders: {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
      },
      session: { expiresIn: 60 * 60 * 12 },
      advanced: { useSecureCookies: c.appUrl.startsWith("https:") },
    };
    return betterAuth(options);
  })());
}
export function cookieToken(request: Request): string {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("rp_session="))
      ?.slice(11) || ""
  );
}
export function sessionCookie(raw: string, seconds = 7 * 86400) {
  return `rp_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${configuration().appUrl.startsWith("https:") ? "; Secure" : ""}`;
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
    cookie: sessionCookie(raw, input.kind === "owner" ? 12 * 3600 : 7 * 86400),
  };
}
export async function actor(
  request: Request,
  store: Store,
): Promise<Actor | undefined> {
  const raw = cookieToken(request);
  if (raw) {
    const s = await store.getSession(sha256(raw));
    if (s && Date.parse(s.expiresAt) > Date.now())
      return {
        id: s.id,
        tenantId: s.tenantId,
        kind: s.kind,
        role: s.role,
        agreementId: s.agreementId,
      };
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const service = await auth();
    const session = await service.api.getSession({ headers: request.headers });
    if (!session) return;
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
      };
  }
}
export async function switchDemoRole(
  request: Request,
  store: Store,
  role: "seller" | "buyer",
) {
  const s = await store.getSession(sha256(cookieToken(request)));
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
