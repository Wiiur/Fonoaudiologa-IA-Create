import { API } from "@/lib/api";

// Consume SSE from a POST endpoint. onDelta receives streaming text; resolves with `done` payload.
export async function streamPost(path, body, { onDelta } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = null;
  let errMsg = null;
  while (true) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(5).trim());
        if (payload.delta && onDelta) onDelta(payload.delta);
        if (payload.error) errMsg = payload.error;
        if (payload.done) done = payload;
      } catch {}
    }
  }
  if (errMsg) throw new Error(errMsg);
  return done;
}
