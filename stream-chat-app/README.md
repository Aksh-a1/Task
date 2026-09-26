# Stream Chat App (Full-Stack Next.js, Vercel-ready)

A single Next.js app containing both the chat UI and the streaming chat API
— the standalone Express server from before has been folded into a Next.js
**Route Handler**, so the whole thing deploys to Vercel as one project with
no separate backend to host.

## What moved where

| Before (Express server)      | Now (Next.js) |
|-------------------------------|----------------|
| `server.js` (Express app)     | `app/api/chat/route.ts` (Route Handler) |
| Mock data / tokenizer / cost  | `lib/mockChatData.ts` |
| `GET /health`                 | `app/api/health/route.ts` |
| `public/index.html` test page | The real chat UI in `components/Chat.tsx` |

The frontend (`components/Chat.tsx`, `lib/chatStream.ts`) is unchanged in
behavior — it just now calls the same-origin `/api/chat` instead of a
separate `http://localhost:3001/chat`, so there's no CORS setup needed either.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the UI and API both run from this one app.

## Deploy to Vercel

```bash
npm i -g vercel   # if you don't have it
vercel
```

Or connect the repo in the Vercel dashboard and deploy — no configuration
needed beyond the defaults; it's a standard Next.js App Router project.

### Why streaming works here

`app/api/chat/route.ts` returns a `ReadableStream` as the `Response` body
with `Content-Type: text/event-stream`. Next.js Route Handlers support Web
Streams natively, and Vercel's Node.js serverless functions stream that
response back to the client as it's written — the same SSE framing
(`event: ...\ndata: ...\n\n`) as the original Express server, so the
frontend's parsing logic didn't need to change.

Two route segment configs matter for deployment:
- `export const dynamic = "force-dynamic"` — prevents Next.js from trying to
  statically cache/optimize a route that must run fresh every request.
- `export const maxDuration = 30` — raises the function's execution time
  limit (in seconds) past the default, in case you lengthen the mock
  responses or the per-token delay. Our current responses stream in a
  couple of seconds, so 30s is a comfortable margin, not a requirement.

### ⚠️ A note on caching in production

The response cache in `lib/mockChatData.ts` is a plain in-memory `Map`. That
means:
- **Locally**, it works exactly as before — resend the same message and get
  a free cached replay.
- **On Vercel**, a `Map` only lives inside one serverless function
  instance. If two requests land on different instances (common under
  concurrent traffic or after a cold start), each instance has its own
  empty cache — so cache hits aren't guaranteed across requests in
  production, even for a truly repeated message.

This is fine for a demo/mock app, but if you need the cache to be reliably
shared across instances, swap the `Map` in `lib/mockChatData.ts` for a
persistent store, e.g. [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
or [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted):

```ts
// Sketch — replace getCached/setCached in lib/mockChatData.ts
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

export async function getCached(key: string) {
  return await redis.get(key);
}
export async function setCached(key: string, entry: CacheEntry) {
  await redis.set(key, entry);
}
```

You'd then `await` these calls in `route.ts` instead of calling them
synchronously — everything else about the streaming logic stays the same.

## API

### `POST /api/chat`

Same contract as the original server:

**Body:** `{ "message": "hello" }`

**Response:** `text/event-stream` with `start` → `token`(s) → `done` (or
`error`) events. See the route handler for exact payload shapes — they're
unchanged from the original Express version.

### `GET /api/health`

Returns `{ status: "ok", cachedMessages: <number> }`.

## Project structure

```
app/
  api/
    chat/route.ts     Streaming chat endpoint (was server.js)
    health/route.ts   Health check endpoint
  layout.tsx
  page.tsx             Renders <Chat />
  globals.css
components/
  Chat.tsx             Chat UI: messages, input, stop button, cost display
lib/
  chatStream.ts        Fetch + SSE parsing client (calls /api/chat)
  mockChatData.ts       Mock data, tokenizer, cost calc, cache (was in server.js)
```
