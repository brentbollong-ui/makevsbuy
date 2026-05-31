/* =================================================================
   gateway-client.js — small browser helper for calling the local
   api-gateway from a static HTML page.

   Usage:
     <script src="gateway-client.js"></script>
     <script>
       const resp = await window.gateway.anthropic({
         model: 'claude-haiku-4-5-20251001',
         max_tokens: 200,
         messages: [{ role: 'user', content: 'hi' }]
       });
       console.log(resp.content[0].text);
     </script>

   No API keys live in the browser — the gateway holds them. CORS on
   the gateway restricts which origins can call it.
   ================================================================= */
(function (global) {
  const BASE = "http://127.0.0.1:4000";

  async function call(path, init) {
    const res = await fetch(BASE + path, init);
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    if (!res.ok) {
      let msg = "gateway returned " + res.status;
      try {
        if (isJson) {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        }
      } catch (_e) { /* ignore */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return isJson ? res.json() : res.blob();
  }

  global.gateway = {
    /** Wrap raw text helper around Anthropic messages. */
    async anthropic(body) {
      return call("/api/anthropic/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },

    /** Extract concatenated text from an Anthropic messages response. */
    text(response) {
      if (!response || !Array.isArray(response.content)) return "";
      return response.content
        .filter(function (b) { return b && b.type === "text"; })
        .map(function (b) { return b.text; })
        .join("");
    },

    /** USPTO trademark proxy. `path` is the upstream endpoint path. */
    async usptoTrademark(path) {
      return call("/api/uspto/trademark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: path }),
      });
    },

    /** USPTO patent proxy. */
    async usptoPatent(path) {
      return call("/api/uspto/patent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: path }),
      });
    },

    /** Health probe — useful for confirming the gateway is up and keys are loaded. */
    async health() {
      return call("/api/health", { method: "GET" });
    },
  };
})(window);
