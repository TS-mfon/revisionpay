import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { canonical, equalSecret, sign } from "@revisionpay/domain/crypto";
import { DomainError } from "@revisionpay/domain";
import { collect } from "../src/collector";

const Input = z
  .object({ url: z.string().url().max(1000), requestId: z.string().uuid() })
  .strict();
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") return send(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    let raw = req.body;
    if (raw === undefined) {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096)
          throw new DomainError(
            "INPUT_TOO_LARGE",
            "Capture request is too large.",
            413,
          );
        chunks.push(Buffer.from(chunk));
      }
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } else if (typeof raw === "string") raw = JSON.parse(raw);
    const input = Input.parse(raw);
    const timestamp = String(req.headers["x-rp-timestamp"] || "");
    const signature = String(req.headers["x-rp-signature"] || "");
    const secret = process.env.CAPTURE_SECRET || "";
    if (
      !secret ||
      !/^\d+$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 120000 ||
      !equalSecret(sign(timestamp + "\n" + canonical(input), secret), signature)
    )
      return send(401, { error: "INVALID_SIGNATURE" });
    const result = await collect(input.url, input.requestId, {
      allowedHosts: (process.env.CAPTURE_ALLOWED_HOSTS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      allowLocal:
        process.env.CAPTURE_ALLOW_LOCALHOST === "true" && !process.env.VERCEL,
    });
    res.setHeader("X-RP-Signature", sign(canonical(result), secret));
    return send(200, result);
  } catch (e) {
    if (e instanceof DomainError)
      return send(e.status, { error: e.code, message: e.message });
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return send(400, {
        error: "INVALID_INPUT",
        message: "Invalid capture request.",
      });
    return send(502, {
      error: "CAPTURE_FAILED",
      message:
        "The page could not be captured. Try again or use a supported page.",
    });
  }
}
