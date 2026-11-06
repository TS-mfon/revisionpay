import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../../src/handler";
export default async function snapshot(request: Request): Promise<Response> {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (!request.body)
    return new Response("Request body required", { status: 400 });
  const req = Readable.fromWeb(
    request.body as Parameters<typeof Readable.fromWeb>[0],
  ) as IncomingMessage;
  req.method = request.method;
  req.headers = Object.fromEntries(request.headers);
  return new Promise((resolve) => {
    const headers = new Headers();
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
      end(body: string) {
        resolve(new Response(body, { status: this.statusCode, headers }));
      },
    };
    void handler(req, res as unknown as ServerResponse).catch(() =>
      resolve(new Response("Capture failed", { status: 502 })),
    );
  });
}
