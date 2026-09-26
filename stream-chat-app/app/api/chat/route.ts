import {
  TOKEN_DELAY_MS,
  FAILURE_PROBABILITY,
  calculateCost,
  delay,
  getCached,
  getMockResponse,
  normalizeMessage,
  setCached,
  tokenize,
} from "@/lib/mockChatData";

// Force this route to always run dynamically (never statically cached/
// optimized by Next.js) since every call streams a fresh response.
export const dynamic = "force-dynamic";

// Use the Node.js runtime (default) so setTimeout-based delays and the
// module-scope Map cache behave as expected. Streaming works the same way
// on Vercel's Node serverless functions as it does locally.
export const runtime = "nodejs";

// Our stream runs for roughly (tokens * 100ms), typically well under a
// second or two — but if you use much longer mock responses, raise this to
// stay under Vercel's function execution limit for your plan.
export const maxDuration = 30;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const message = (body as { message?: unknown })?.message;
  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json(
      { error: 'Request body must include a non-empty "message" string.' },
      { status: 400 }
    );
  }

  const key = normalizeMessage(message);
  const cached = getCached(key);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseFrame(event, data)));

      send("start", { cached: Boolean(cached), message });

      // ---- Cache hit: replay stored tokens, no cost, no failure ----
      if (cached) {
        for (let i = 0; i < cached.tokens.length; i++) {
          send("token", { index: i, token: cached.tokens[i] });
          await delay(TOKEN_DELAY_MS);
        }
        send("done", {
          cached: true,
          totalTokens: cached.tokens.length,
          cost: 0,
          costSaved: cached.cost,
          fullResponse: cached.response,
        });
        controller.close();
        return;
      }

      // ---- Cache miss: generate a fresh mock response ----
      const response = getMockResponse(message);
      const tokens = tokenize(response);

      const shouldFail = Math.random() < FAILURE_PROBABILITY;
      const failAtIndex =
        shouldFail && tokens.length > 1
          ? Math.floor(Math.random() * (tokens.length - 1)) + 1
          : -1;

      let streamedCount = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (shouldFail && i === failAtIndex) {
          send("error", {
            message: "Stream interrupted unexpectedly (simulated failure).",
            tokensStreamedBeforeFailure: streamedCount,
          });
          controller.close();
          return; // nothing cached on failure — next attempt is fresh
        }

        send("token", { index: i, token: tokens[i] });
        streamedCount++;
        await delay(TOKEN_DELAY_MS);
      }

      const cost = calculateCost(tokens.length);
      setCached(key, { tokens, cost, response });

      send("done", {
        cached: false,
        totalTokens: tokens.length,
        cost,
        fullResponse: response,
      });
      controller.close();
    },

    cancel() {
      // Client aborted (e.g. hit Stop) — nothing extra to clean up since
      // we hold no external resources, but this hook is here if you add any.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables buffering on Vercel's edge/proxy layer so tokens flush
      // immediately instead of arriving all at once at the end.
      "X-Accel-Buffering": "no",
    },
  });
}
