import { requireCondition, type Agreement } from "@revisionpay/domain";
import { sha256, sign, token } from "@revisionpay/domain/crypto";
import { configuration } from "./config";

// Store a random nonce, not a bearer credential. Only the server can derive the
// link, and publicAgreement excludes the complete invitation record.
export function newInvitation(id: string, demo = false) {
  const secret = configuration().authSecret;
  requireCondition(
    secret || demo,
    "AUTH_NOT_CONFIGURED",
    "Sign-in must be configured before sharing agreements.",
    503,
  );
  const nonce = token();
  const raw = sign("revisionpay:invitation:" + id + ":" + nonce, secret);
  return { raw, invitation: { tokenHash: sha256(raw), nonce } };
}

export function invitationUrl(a: Agreement) {
  if (!a.invitation?.nonce) return undefined;
  const raw = sign(
    "revisionpay:invitation:" + a.id + ":" + a.invitation.nonce,
    configuration().authSecret,
  );
  if (sha256(raw) !== a.invitation.tokenHash) return undefined;
  return configuration().appUrl + "/invite#" + raw;
}

export function invitationUsable(a: Agreement, raw: string) {
  const invite = a.invitation;
  return Boolean(
    invite &&
      invite.tokenHash === sha256(raw) &&
      a.state !== "DRAFT" &&
      (invite.nonce ||
        (!invite.redeemedAt &&
          invite.expiresAt &&
          Date.parse(invite.expiresAt) > Date.now() &&
          a.state === "AWAITING_BUYER")),
  );
}
