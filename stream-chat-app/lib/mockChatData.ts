// Mock "model" data + helpers shared by the /api/chat route.
//
// IMPORTANT — caching on Vercel:
// This uses a plain in-memory Map, which lives only for the lifetime of a
// single serverless function instance. On Vercel that means:
//   - It works great locally (`next dev`) and within one warm instance.
//   - In production, concurrent/cold-started instances do NOT share this
//     Map, so a "cache hit" is only guaranteed if the same instance
//     happens to handle both requests.
// For a real deployment where the cache must be shared across instances,
// swap this Map for a persistent store such as Vercel KV or Upstash Redis
// (see the README for a short example) — the rest of the route doesn't
// need to change, since it only calls getCached()/setCached() below.

export const TOKEN_DELAY_MS = 100;
export const FAILURE_PROBABILITY = 1 / 3;
export const PRICE_PER_1K_TOKENS = 0.002; // mock $ price per 1000 tokens

interface CacheEntry {
  tokens: string[];
  cost: number;
  response: string;
}

const responseCache = new Map<string, CacheEntry>();

export function getCached(key: string): CacheEntry | undefined {
  return responseCache.get(key);
}

export function setCached(key: string, entry: CacheEntry): void {
  responseCache.set(key, entry);
}

export function cacheSize(): number {
  return responseCache.size;
}

// ------------------------------------------------------------------
// Mock knowledge base
// ------------------------------------------------------------------
const MOCK_KNOWLEDGE_BASE: { keywords: string[]; response: string }[] = [
  {
    keywords: ["hello", "hi", "hey"],
    response:
      "Hey there! I'm a mock streaming chat API running as a Next.js route handler. Ask me something and watch the tokens roll in one at a time.",
  },
  {
    keywords: ["joke"],
    response:
      "Why did the developer go broke? Because they forgot to cache anything and paid full token price every single time.",
  },
  {
    keywords: ["weather"],
    response:
      "I don't have live weather data, but the mock forecast says it's sunny with a chance of streaming tokens later today.",
  },
  {
    keywords: ["help"],
    response:
      'POST a JSON body like { "message": "hello" } to /api/chat and I will stream the reply back token by token over Server-Sent Events.',
  },
  {
    keywords: ["bye", "goodbye"],
    response: "Goodbye! Thanks for testing the mock streaming API.",
  },
];

const FALLBACK_RESPONSES = [
  "That's an interesting message. Here's a mock response streamed one token at a time so you can see how token-based billing works.",
  "I don't have a specific canned answer for that, so here's a generic mock reply demonstrating streaming, caching, and cost tracking.",
  "Thanks for your message. This simulated response shows off streaming, response caching, and randomized mid-stream failures.",
];

export function getMockResponse(message: string): string {
  const normalized = message.toLowerCase();
  const match = MOCK_KNOWLEDGE_BASE.find((entry) =>
    entry.keywords.some((k) => normalized.includes(k))
  );
  if (match) return match.response;
  return FALLBACK_RESPONSES[
    Math.floor(Math.random() * FALLBACK_RESPONSES.length)
  ];
}

export function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

// Mock tokenizer: real tokenizers use subword units (BPE etc.); this just
// splits on whitespace so token counts are easy to reason about here.
export function tokenize(text: string): string[] {
  return text.split(" ");
}

export function calculateCost(tokenCount: number): number {
  return Number(((tokenCount / 1000) * PRICE_PER_1K_TOKENS).toFixed(6));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
