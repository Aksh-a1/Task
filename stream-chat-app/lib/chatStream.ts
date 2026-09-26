// Thin client for this app's own POST /api/chat route (a Next.js Route
// Handler — see app/api/chat/route.ts), which streams SSE events shaped like:
//   event: start | token | done | error
//   data: { ...json... }
//
// Since EventSource doesn't support POST bodies, we use fetch + a manual
// ReadableStream reader and parse the SSE framing ourselves.

// Same-origin by default since the API now lives inside this Next.js app.
// Override via NEXT_PUBLIC_CHAT_API_URL only if you point this UI at a
// chat API hosted elsewhere.
export const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat";

export interface StartEvent {
  cached: boolean;
  message: string;
}

export interface TokenEvent {
  index: number;
  token: string;
}

export interface DoneEvent {
  cached: boolean;
  totalTokens: number;
  cost: number;
  costSaved?: number;
  fullResponse: string;
}

export interface StreamErrorEvent {
  message: string;
  tokensStreamedBeforeFailure: number;
}

export interface ChatStreamHandlers {
  onStart?: (data: StartEvent) => void;
  onToken?: (data: TokenEvent) => void;
  onDone?: (data: DoneEvent) => void;
  // Server explicitly told us the generation failed mid-stream.
  onStreamError?: (data: StreamErrorEvent) => void;
  // Network / HTTP-level failure (server down, non-2xx, bad response, etc).
  onNetworkError?: (message: string) => void;
  // The request was aborted via the AbortSignal (user hit Stop).
  onAbort?: () => void;
}

/**
 * Sends `message` to the chat API and streams back tokens via the
 * provided handlers. Pass `signal` (from an AbortController) to allow
 * cancelling mid-stream.
 */
export async function streamChat(
  message: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      handlers.onAbort?.();
      return;
    }
    handlers.onNetworkError?.(
      "Could not reach the chat API. Please check your connection and try again."
    );
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error ? `: ${errBody.error}` : "";
    } catch {
      // ignore parse failures, fall back to status text
    }
    handlers.onNetworkError?.(
      `Chat API responded with an error (${response.status})${detail}.`
    );
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by a blank line.
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;

        const eventMatch = part.match(/^event: (.+)$/m);
        const dataMatch = part.match(/^data: (.+)$/m);
        if (!dataMatch) continue;

        const event = eventMatch ? eventMatch[1] : "message";
        let data: unknown;
        try {
          data = JSON.parse(dataMatch[1]);
        } catch {
          continue;
        }

        switch (event) {
          case "start":
            handlers.onStart?.(data as StartEvent);
            break;
          case "token":
            handlers.onToken?.(data as TokenEvent);
            break;
          case "done":
            handlers.onDone?.(data as DoneEvent);
            break;
          case "error":
            handlers.onStreamError?.(data as StreamErrorEvent);
            break;
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError" || signal?.aborted) {
      handlers.onAbort?.();
      return;
    }
    handlers.onNetworkError?.("The connection to the chat API was lost mid-stream.");
  }
}
