import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import {
  DomainError,
  publicAgreement,
  nextAction,
  type Tenant,
  requireCondition,
  type DemoVariant,
} from "@revisionpay/domain";
import { sha256, equalSecret } from "@revisionpay/domain/crypto";
import { getStore, mutate } from "@/server/store";
import { configuration, readiness } from "@/server/config";
import {
  actor,
  checkOrigin,
  issueSession,
  sessionCookie,
  switchDemoRole,
  auth,
  ownerGoogleStatus,
  linkOwnerGoogle,
} from "@/server/auth";
import * as service from "@/server/service";
import { Workflow } from "@/server/workflow";
import {
  matchesWebhook,
  verifyWebhook,
  paymentIntegration,
} from "@/server/paypal";
import {
  merchantStatus,
  connectMerchant,
  refreshMerchant,
  onboardingWebhook,
} from "@/server/merchants";
import { deliverMail, notifyAgreement } from "@/server/mail";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
async function body(request: Request) {
  requireCondition(
    Number(request.headers.get("content-length") || 0) <= 65536,
    "PAYLOAD_TOO_LARGE",
    "The request is too large.",
    413,
  );
  const text = await request.text();
  requireCondition(
    Buffer.byteLength(text) <= 65536,
    "PAYLOAD_TOO_LARGE",
    "The request is too large.",
    413,
  );
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new DomainError("INVALID_JSON", "Send a valid JSON request.", 400);
  }
}
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const key = path.join("/");
    const post = request.method === "POST";
    if (key === "config" && request.method === "GET") return json(readiness());
    const store = await getStore();
    const workflow = new Workflow(store);
    const kick = (id?: string) =>
      after(async () => {
        const end = Date.now() + 40000;
        // Complete short demo steps and resume due work without needing a page refresh.
        do {
          const progressed = await workflow.run(id).catch(() => false);
          if (!id || !progressed) break;
          const current = await store.getAgreement(id);
          if (current?.mode !== "demo") break;
          await new Promise((resolve) => setTimeout(resolve, 2100));
        } while (Date.now() < end);
        await deliverMail(store).catch(() => undefined);
      });
    if (key === "internal/tick") {
      requireCondition(
        configuration().cronSecret &&
          equalSecret(
            request.headers.get("authorization") || "",
            "Bearer " + configuration().cronSecret,
          ),
        "UNAUTHORIZED",
        "Invalid scheduler authorization.",
        401,
      );
      // Each worker performs one bounded step. Leases survive Vercel restarts.
      const results = await Promise.allSettled([
        workflow.run(),
        workflow.run(),
      ]);
      await deliverMail(store).catch(() => undefined);
      return json({
        progressed: results.filter((v) => v.status === "fulfilled" && v.value)
          .length,
      });
    }
    if (
      [
        "webhooks/paypal",
        "webhooks/paypal/platform",
        "webhooks/paypal/live",
      ].includes(key) &&
      post
    ) {
      const event = await body(request);
      const environment = key.endsWith("/live") ? "live" : "sandbox";
      const integration = key === "webhooks/paypal" ? "DIRECT" : "PLATFORM";
      requireCondition(
        await verifyWebhook(request.headers, event, environment, integration),
        "INVALID_WEBHOOK",
        "The webhook signature is invalid.",
        401,
      );
      const eventId = z.string().max(150).parse(event.id);
      const received = await store.putValue(
        "webhook:" + environment + ":" + integration + ":" + eventId,
        { id: randomUUID() },
        true,
      );
      // Duplicate delivery is harmless: only a provider read may change money state.
      const agreements = await store.listAgreements();
      if (integration === "PLATFORM")
        await onboardingWebhook(store, event, environment);
      const match = agreements.find(
        (a) =>
          a.mode === environment &&
          paymentIntegration(a) === integration &&
          matchesWebhook(a, event),
      );
      if (match) {
        await workflow.reconcile(match.id);
        await store.ensureJob(match.id);
        kick(match.id);
      }
      return json({ received: Boolean(received) });
    }
    if (post) checkOrigin(request);
    if (key === "demo" && post) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
      requireCondition(
        await store.consumeQuota(
          "demo-ip:" + sha256(ip) + ":" + new Date().toISOString().slice(0, 10),
          30,
        ),
        "RATE_LIMIT",
        "Today's demo-session limit has been reached. Continue in your existing session.",
        429,
      );
      const issued = await issueSession(store, {
        tenantId: "demo:" + randomUUID(),
        kind: "demo",
        role: "seller",
      });
      const who = {
        id: issued.session.id,
        tenantId: issued.session.tenantId,
        kind: "demo" as const,
        role: "seller" as const,
      };
      const a = await service.create(store, who, {}, true);
      kick(a.id);
      return json({ agreement: publicAgreement(a) }, 201, {
        "Set-Cookie": issued.cookie,
      });
    }
    if (key === "invite/redeem" && post) {
      const data = z
        .object({ token: z.string().min(32).max(100) })
        .parse(await body(request));
      const a = await store.findInvitation(sha256(data.token));
      if (a) {
        const existing = await actor(
          new Request(new URL("/api/agreements/" + a.id, request.url), {
            headers: request.headers,
          }),
          store,
        );
        if (
          existing &&
          existing.tenantId === a.tenantId &&
          existing.agreementId === a.id
        )
          return json({ agreementId: a.id });
      }
      requireCondition(
        a?.invitation &&
          !a.invitation.redeemedAt &&
          Date.parse(a.invitation.expiresAt) > Date.now() &&
          a.state === "AWAITING_BUYER",
        "INVITATION_EXPIRED",
        "This invitation is invalid, expired, or already redeemed.",
        410,
      );
      await mutate(store, a.id, (x) => {
        requireCondition(
          x.invitation?.tokenHash === sha256(data.token) &&
            !x.invitation.redeemedAt,
          "INVITATION_USED",
          "This invitation has already been used.",
        );
        x.invitation.redeemedAt = new Date().toISOString();
      });
      const issued = await issueSession(store, {
        tenantId: a.tenantId,
        kind: "buyer",
        role: "buyer",
        agreementId: a.id,
      });
      return json({ agreementId: a.id }, 200, { "Set-Cookie": issued.cookie });
    }
    if (key === "owner/redeem" && post) {
      const data = z
        .object({ token: z.string().min(32).max(100) })
        .parse(await body(request));
      const hash = sha256(data.token);
      const login = await store.getValue<{
        tenantId: string;
        expiresAt: string;
      }>("owner-login:" + hash);
      requireCondition(
        login &&
          login.tenantId === "owner:" + configuration().githubId &&
          Date.parse(login.expiresAt) > Date.now(),
        "LOGIN_EXPIRED",
        "This owner sign-in link is invalid or expired.",
        401,
      );
      requireCondition(
        await store.leaseSlot("owner-login:" + hash, randomUUID(), 86400000),
        "LOGIN_USED",
        "This owner sign-in link has already been used.",
        401,
      );
      const issued = await issueSession(store, {
        tenantId: login.tenantId,
        kind: "owner",
        role: "seller",
      });
      return json({ signedIn: true }, 200, { "Set-Cookie": issued.cookie });
    }
    const who = await actor(request, store);
    if (key === "me")
      return json({ actor: who || null, readiness: readiness() });
    requireCondition(
      who,
      "SIGN_IN_REQUIRED",
      "Sign in or start a demo to continue.",
      401,
    );
    if (post)
      requireCondition(
        await store.consumeQuota(
          "requests:" + who.id + ":" + Math.floor(Date.now() / 60000),
          100,
        ),
        "RATE_LIMIT",
        "Too many actions. Wait a minute and try again.",
        429,
      );
    if (key === "logout" && post) {
      if (
        (who.kind === "seller" || who.kind === "owner") &&
        configuration().mongoUri
      ) {
        const response = await (
          await auth()
        ).api.signOut({
          headers: request.headers,
          asResponse: true,
        });
        response.headers.append("Set-Cookie", sessionCookie("", 0));
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
      return json({ signedOut: true }, 200, {
        "Set-Cookie": sessionCookie(
          "",
          0,
          who.kind === "demo"
            ? "rp_demo"
            : who.kind === "buyer"
              ? "rp_buyer_" + who.agreementId
              : "rp_session",
        ),
      });
    }
    if (key === "profile/link-google" && post)
      return json(await linkOwnerGoogle(request, store));
    if (key === "profile") {
      requireCondition(
        who.kind === "seller" || who.kind === "owner",
        "SELLER_REQUIRED",
        "Sign in to your workspace.",
        403,
      );
      if (post) {
        const { displayName } = z
          .object({ displayName: z.string().trim().min(2).max(80) })
          .parse(await body(request));
        await store.putValue<Tenant>("tenant:" + who.tenantId, {
          id: who.tenantId,
          userId: who.id,
          email: who.email || "",
          displayName,
        });
      }
      return json({
        profile: await store.getValue<Tenant>("tenant:" + who.tenantId),
        merchant: await merchantStatus(store, who),
        readiness: readiness(),
        ownerGoogle:
          who.kind === "owner"
            ? await ownerGoogleStatus(request, store)
            : undefined,
      });
    }
    if (key === "merchant/connect" && post) {
      const data = z
        .object({ returnTo: z.string().max(500).optional() })
        .parse(await body(request));
      return json(await connectMerchant(store, who, data.returnTo));
    }
    if (key === "merchant/refresh" && post)
      return json({ merchant: await refreshMerchant(store, who) });
    if (key === "demo/role" && post) {
      const { role } = z
        .object({ role: z.enum(["seller", "buyer"]) })
        .parse(await body(request));
      await switchDemoRole(request, store, role);
      return json({ role });
    }
    if (key === "agreements" && request.method === "GET") {
      const all = await store.listAgreements(who.tenantId);
      return json({
        agreements: all
          .filter((a) => who.kind !== "buyer" || who.agreementId === a.id)
          .map(publicAgreement),
      });
    }
    if (key === "agreements" && post) {
      const data = await body(request);
      const profile = await store.getValue<Tenant>("tenant:" + who.tenantId);
      if (profile) {
        who.name = profile.displayName;
        who.email = profile.email;
      }
      const a = await service.create(
        store,
        who,
        data.input,
        data.templateId !== undefined
          ? z.string().min(1).max(80).parse(data.templateId)
          : data.template === true,
      );
      kick(a.id);
      return json({ agreement: publicAgreement(a) }, 201);
    }
    if (key === "ops" && request.method === "GET") {
      requireCondition(
        who.kind === "owner",
        "OWNER_REQUIRED",
        "Owner access is required.",
        403,
      );
      return json({
        readiness: readiness(),
        agreements: (await store.listAgreements(who.tenantId)).map(
          publicAgreement,
        ),
      });
    }
    if (path[0] === "agreements" && path[1]) {
      const id = z.string().uuid().parse(path[1]);
      const action = path[2];
      const a = await service.allowed(store, who, id);
      if (action === "logout" && post) {
        requireCondition(
          who.kind === "buyer",
          "CLIENT_REQUIRED",
          "Open the client view before closing it.",
          403,
        );
        const cookie = sessionCookie("", 0, "rp_buyer_" + id);
        if (who.email && configuration().mongoUri) {
          const response = await (
            await auth()
          ).api.signOut({ headers: request.headers, asResponse: true });
          response.headers.append("Set-Cookie", cookie);
          response.headers.set("Cache-Control", "private, no-store");
          return response;
        }
        return json({ signedOut: true }, 200, { "Set-Cookie": cookie });
      }
      if (!action && request.method === "GET") {
        // A view preference only selects an existing session. It grants no role.
        const otherHeaders = new Headers(request.headers);
        if (who.role === "buyer")
          otherHeaders.set("X-RevisionPay-View", "freelancer");
        else otherHeaders.delete("X-RevisionPay-View");
        const other =
          a.mode === "demo"
            ? undefined
            : await actor(
                new Request(request.url, { headers: otherHeaders }),
                store,
              );
        const merchant =
          who.role === "seller" && a.mode !== "demo"
            ? await merchantStatus(store, who)
            : undefined;
        return json({
          agreement: publicAgreement(a),
          actor: who,
          nextAction: nextAction(a, who.role),
          canSwitchView: Boolean(
            other &&
              other.role !== who.role &&
              other.tenantId === a.tenantId &&
              (other.role === "seller" || other.agreementId === a.id),
          ),
          setup: merchant
            ? {
                connected:
                  merchant.status === "READY" &&
                  merchant.environment === a.mode,
                emailAvailable: readiness().emailAuth,
                liveAvailable: a.mode !== "live" || readiness().livePayments,
              }
            : undefined,
        });
      }
      if (action === "receipt" && request.method === "GET")
        return json({
          schemaVersion: "1",
          generatedAt: new Date().toISOString(),
          environment:
            a.mode === "demo"
              ? "SIMULATION — no money or blockchain transactions"
              : a.mode === "live"
                ? "Live PayPal payment; experimental GenLayer advice"
                : "PayPal sandbox + GenLayer Studionet",
          agreement: publicAgreement(a),
        });
      if (action === "image" && request.method === "GET") {
        const hash = new URL(request.url).searchParams.get("hash");
        requireCondition(
          hash &&
            [
              a.baseline?.screenshotHash,
              ...a.submissions.map((s) => s.evidence?.screenshotHash),
            ].includes(hash),
          "NOT_FOUND",
          "Image not found.",
          404,
        );
        const data = await store.getValue<string>("image:" + hash);
        requireCondition(data, "NOT_FOUND", "Image not found.", 404);
        return new Response(Buffer.from(data, "base64"), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=86400",
          },
        });
      }
      requireCondition(
        post,
        "METHOD_NOT_ALLOWED",
        "This action requires POST.",
        405,
      );
      const data = await body(request);
      let result;
      if (action === "freeze") {
        const result = await service.freezeAgreement(
          store,
          who,
          id,
          data.draftRevision,
        );
        kick(id);
        return json({
          agreement: publicAgreement(result.a),
          invitationUrl: result.invitationUrl,
          email: result.email,
        });
      } else if (action === "draft")
        result = await service.updateDraft(
          store,
          who,
          id,
          data.input,
          z.number().int().nonnegative().parse(data.draftRevision),
        );
      else if (action === "invite") {
        const invitation = await service.invite(store, who, id);
        kick(id);
        return json(invitation);
      } else if (action === "consent")
        result = await service.consent(
          store,
          who,
          id,
          z.string().parse(data.digest),
        );
      else if (action === "checkout")
        return json(await service.checkout(store, who, id));
      else if (action === "authorize")
        result = await service.authorize(store, who, id);
      else if (action === "submit")
        result = await service.submit(
          store,
          who,
          id,
          z.string().max(500).default("").parse(data.note),
        );
      else if (action === "variant")
        result = await service.setVariant(
          store,
          who,
          id,
          z
            .enum([
              "baseline",
              "incomplete",
              "corrected",
              "ambiguous",
              "injected",
              "changed",
            ])
            .parse(data.variant) as DemoVariant,
        );
      else if (action === "hold")
        result = await service.hold(
          store,
          who,
          id,
          z.string().max(1000).default("").parse(data.note),
        );
      else if (action === "accept")
        result = await service.acceptSubmission(
          store,
          who,
          id,
          z.string().uuid().parse(data.submissionId),
          z.string().parse(data.artifactHash),
        );
      else if (action === "cancel")
        result = await service.cancel(store, who, id);
      else if (action === "refresh") {
        await store.ensureJob(id);
        kick(id);
        return json({ scheduled: true });
      } else if (action === "retry-baseline") {
        await service.allowed(store, who, id, "seller");
        result = await mutate(store, id, (x) => {
          requireCondition(
            x.state === "DRAFT" && x.baselineStatus === "FAILED",
            "RETRY_UNAVAILABLE",
            "The baseline cannot be retried in this state.",
          );
          x.baselineStatus = "QUEUED";
          x.lastError = undefined;
        });
        await store.ensureJob(id);
      } else if (action === "reconcile") {
        requireCondition(
          who.kind === "owner",
          "OWNER_REQUIRED",
          "Owner access is required.",
          403,
        );
        await workflow.reconcile(id);
        result = await store.getAgreement(id);
      } else throw new DomainError("NOT_FOUND", "Unknown action.", 404);
      kick(id);
      if (result) await notifyAgreement(store, result).catch(() => undefined);
      return json({ agreement: result ? publicAgreement(result) : undefined });
    }
    throw new DomainError("NOT_FOUND", "Unknown endpoint.", 404);
  } catch (e) {
    if (e instanceof DomainError)
      return json({ error: e.code, message: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        {
          error: "INVALID_INPUT",
          message: e.issues
            .map((i) => i.path.join(".") + ": " + i.message)
            .slice(0, 3)
            .join("; "),
        },
        400,
      );
    // Provider/database errors may contain connection strings or private RPC inputs.
    return json(
      {
        error: "SERVICE_UNAVAILABLE",
        message:
          "This step could not be completed. Your saved agreement is unchanged; refresh or check service configuration.",
      },
      503,
    );
  }
}
export const GET = route;
export const POST = route;
