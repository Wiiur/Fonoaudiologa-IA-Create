import api from "@/lib/api";

export async function streamPost(path, body, { onDelta } = {}) {
  
  let baseUrl = api.defaults?.baseURL || "http://localhost:8000/api";
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const absoluteUrl = `${baseUrl}${cleanPath}`;

  // ==========================================
  // O SEGREDO DESVENDADO: O CRACHÁ MOCKADO
  // ==========================================
  const headers = {
    "Content-Type": "application/json",
    // Copiamos o mesmo hack do api.js direto para o fetch!
    "user-id": "doc_mock_123" 
  };

  // Mantemos a busca por tokens normais por precaução para o futuro
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (token) {
    headers["Authorization"] = token.startsWith("Bearer") ? token : `Bearer ${token}`;
  }

  const res = await fetch(absoluteUrl, {
    method: "POST",
    credentials: "include", 
    headers: headers, // <-- Agora o fetch leva o "doc_mock_123" junto!
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorText = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorText = errJson.detail;
    } catch {}
    throw new Error(errorText);
  }

  if (!res.body) throw new Error("Resposta do servidor vazia");

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