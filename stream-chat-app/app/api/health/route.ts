import { cacheSize } from "@/lib/mockChatData";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", cachedMessages: cacheSize() });
}
