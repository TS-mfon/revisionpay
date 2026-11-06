import { auth } from "@/server/auth";
export const runtime = "nodejs";
async function handler(request: Request) {
  try {
    return (await auth()).handler(request);
  } catch {
    return Response.json(
      {
        message: "Sign-in is not available yet. Please try again later.",
      },
      { status: 503 },
    );
  }
}
export const GET = handler;
export const POST = handler;
