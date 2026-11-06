import { auth } from "@/server/auth";
export const runtime = "nodejs";
async function handler(request: Request) {
  try {
    return (await auth()).handler(request);
  } catch {
    return Response.json(
      {
        message:
          "GitHub app sign-in is not configured. Use the owner CLI sign-in link.",
      },
      { status: 503 },
    );
  }
}
export const GET = handler;
export const POST = handler;
