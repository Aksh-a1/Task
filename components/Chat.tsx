"use client";

import { useEffect, useRef, useState } from "react";
import { streamChat } from "@/lib/chatStream";

type Status = "streaming" | "done" | "error" | "stopped";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: Status;
  cached?: boolean;
  cost?: number;
  costSaved?: number;
  totalTokens?: number;
  errorMessage?: string;
}

function formatMoney(amount: number): string {
  if (amount === 0) return "$0";
  return `$${amount.toFixed(6)}`;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm backed by this app's own /api/chat route. Send a message to see it stream in, with live cost tracking.",
      status: "done",
      cost: 0,
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalSaved, setTotalSaved] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let streamedText = "";

    await streamChat(
      trimmed,
      {
        onStart: (data) => {
          updateMessage(assistantId, { cached: data.cached });
        },
        onToken: (data) => {
          streamedText = streamedText
            ? `${streamedText} ${data.token}`
            : data.token;
          updateMessage(assistantId, { content: streamedText });
        },
        onDone: (data) => {
          updateMessage(assistantId, {
            status: "done",
            cached: data.cached,
            cost: data.cost,
            costSaved: data.costSaved,
            totalTokens: data.totalTokens,
            content: data.fullResponse,
          });
          if (data.cached) {
            setTotalSaved((prev) => prev + (data.costSaved ?? 0));
          } else {
            setTotalSpent((prev) => prev + data.cost);
          }
        },
        onStreamError: () => {
          updateMessage(assistantId, {
            status: "error",
            errorMessage:
              "Something went wrong while generating this response. Please try sending your message again.",
          });
        },
        onNetworkError: (message) => {
          updateMessage(assistantId, {
            status: "error",
            errorMessage: message,
          });
        },
        onAbort: () => {
          updateMessage(assistantId, { status: "stopped" });
        },
      },
      controller.signal
    );

    abortControllerRef.current = null;
    setIsStreaming(false);
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 720,
        height: "88vh",
        display: "flex",
        flexDirection: "column",
        background: "#16181d",
        border: "1px solid #2a2d34",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}
    >
      <header
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #2a2d34",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isStreaming ? "#f5a623" : "#3ecf5f",
          }}
        />
        <strong style={{ fontSize: 15 }}>Stream Chat</strong>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 14,
            fontSize: 12,
            color: "#8a8f98",
          }}
        >
          <span>
            Spent:{" "}
            <span style={{ color: "#e8e8ea", fontWeight: 600 }}>
              {formatMoney(totalSpent)}
            </span>
          </span>
          <span>
            Saved via cache:{" "}
            <span style={{ color: "#3ecf5f", fontWeight: 600 }}>
              {formatMoney(totalSaved)}
            </span>
          </span>
        </div>
      </header>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: 14,
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                background:
                  m.role === "user"
                    ? "#3a6ff7"
                    : m.status === "error"
                    ? "#3a1f22"
                    : "#22252c",
                color:
                  m.role === "user"
                    ? "#fff"
                    : m.status === "error"
                    ? "#ff9a9a"
                    : "#e8e8ea",
                border: m.status === "error" ? "1px solid #5c2b2f" : "none",
              }}
            >
              {m.content || (m.status === "streaming" ? "\u00A0" : "")}
              {m.status === "streaming" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 14,
                    marginLeft: 3,
                    background: "#8a8f98",
                    verticalAlign: "text-bottom",
                    animation: "blink 1s step-start infinite",
                  }}
                />
              )}
              {m.status === "error" && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  ⚠️ {m.errorMessage}
                </div>
              )}
            </div>

            {/* Footer: cost / cache / status info */}
            {m.role === "assistant" && m.status && m.status !== "streaming" && (
              <div
                style={{
                  fontSize: 11,
                  color: "#8a8f98",
                  marginTop: 4,
                  padding: "0 4px",
                }}
              >
                {m.status === "done" && m.cached && (
                  <>
                    cached · {m.totalTokens} tokens · saved{" "}
                    {formatMoney(m.costSaved ?? 0)}
                  </>
                )}
                {m.status === "done" && !m.cached && (
                  <>
                    {m.totalTokens} tokens · {formatMoney(m.cost ?? 0)}
                  </>
                )}
                {m.status === "stopped" && "stopped by user · not charged"}
                {m.status === "error" && "failed · not charged"}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid #2a2d34",
          padding: 14,
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={isStreaming}
          style={{
            flex: 1,
            resize: "none",
            background: "#0f1115",
            color: "#e8e8ea",
            border: "1px solid #2a2d34",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            maxHeight: 120,
          }}
        />
        {isStreaming ? (
          <button
            onClick={handleStop}
            style={{
              background: "#3a3d44",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              background: input.trim() ? "#3a6ff7" : "#2a2d34",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 14,
              cursor: input.trim() ? "pointer" : "default",
            }}
          >
            Send
          </button>
        )}
      </div>

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
