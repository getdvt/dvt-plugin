// DVT-4950 — dvt_render_view: fetch a stored native-app render PNG from the app's SPCS
// ingress with the USER's own Snowflake credentials and return it as real MCP image
// content. Zero dependencies (Node >=18 built-ins). Never returns a URL, never writes
// to disk, never logs a credential.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
// Raw cap such that base64 (4/3 expansion) stays <= 5,000,000 chars.
const MAX_BYTES = 3_750_000;
const MAX_DIM = 8000;
const TOKEN_TTL_MS = 50 * 60 * 1000;
const TIMEOUT_MS = 30_000;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors deploy/snowflake/rig/mcp_probe.py _JWT_RE.
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

const TOOL = {
  name: "dvt_render_view",
  description:
    "For dvt Snowflake native-app installs only (dvt Gallery renders already include a viewable URL). " +
    "Show a stored dvt native-app dashboard render as an image. Pass the dashboard_id and " +
    "render_id that a dvt render tool returned. The image is fetched with your own Snowflake " +
    "credentials and returned inline; renders are visible only to the user who requested them.",
  inputSchema: {
    type: "object",
    properties: {
      dashboard_id: { type: "string", description: "Dashboard UUID." },
      render_id: { type: "string", description: "Render UUID." },
    },
    required: ["dashboard_id", "render_id"],
    additionalProperties: false,
  },
};

// Mirrors mcp_probe.scrub: known secrets first, then anything JWT-shaped.
export function scrub(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) if (s) out = out.split(s).join("<redacted>");
  return out.replace(JWT_RE, "<redacted>");
}

export function normalizeHost(raw) {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  if (/^http:\/\//i.test(s)) return null; // https only
  if (!/^https:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.hostname ? u.host : null;
  } catch {
    return null;
  }
}

function defaultExec(file, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(String(stdout));
    });
  });
}

function pluginVersion() {
  try {
    const p = new URL("../../.claude-plugin/plugin.json", import.meta.url);
    return JSON.parse(readFileSync(p, "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

class ToolError extends Error {}

const SETUP =
  "dvt_render_view is not configured. Set DVT_APP_URL to your dvt native app's ingress URL " +
  "(e.g. https://abc-xyz.snowflakecomputing.app). Credentials: set DVT_SNOWFLAKE_PAT to a " +
  "Snowflake programmatic access token, OR configure a `snow` CLI keypair connection " +
  "(DVT_SNOWFLAKE_CONNECTION, default \"default\"; optional DVT_SNOWFLAKE_ROLE and " +
  "DVT_SNOWFLAKE_ACCOUNT_URL).";

export function createServer({
  env = process.env,
  fetchImpl = (...a) => fetch(...a),
  execImpl = defaultExec,
  now = () => Date.now(),
  log = (m) => process.stderr.write(m + "\n"),
} = {}) {
  const cache = new Map(); // key host|role|conn -> {token, exp}. Memory only, never disk.
  const secrets = new Set();

  const s = (t) => scrub(t, [...secrets]);

  async function generateJwt(conn) {
    let out;
    try {
      out = await execImpl("snow", ["connection", "generate-jwt", "-c", conn], { timeout: 30_000 });
    } catch (e) {
      throw new ToolError(`snow connection generate-jwt -c ${conn} failed: ${String(e.stderr || e.message).trim().slice(0, 200)}`);
    }
    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new ToolError(`snow connection generate-jwt -c ${conn} produced no output`);
    secrets.add(lines[lines.length - 1]);
    return lines[lines.length - 1];
  }

  async function accountUrl(conn) {
    if (env.DVT_SNOWFLAKE_ACCOUNT_URL) {
      const h = normalizeHost(env.DVT_SNOWFLAKE_ACCOUNT_URL);
      if (!h) throw new ToolError("DVT_SNOWFLAKE_ACCOUNT_URL must be an https URL or bare host");
      return `https://${h}`;
    }
    let raw;
    try {
      raw = await execImpl("snow", ["connection", "list", "--format", "json"], { timeout: 30_000 });
    } catch (e) {
      throw new ToolError(`could not read \`snow connection list\`: ${String(e.message).slice(0, 200)}. Set DVT_SNOWFLAKE_ACCOUNT_URL.`);
    }
    let list;
    try {
      list = JSON.parse(raw);
    } catch {
      // Fixed message on purpose: a JSON.parse error can quote an excerpt of the input.
      throw new ToolError("could not parse `snow connection list --format json` output. Set DVT_SNOWFLAKE_ACCOUNT_URL.");
    }
    const entry = (Array.isArray(list) ? list : []).find((c) => c.connection_name === conn);
    const p = entry && entry.parameters;
    const derived = p && (p.host ? p.host : p.account ? `${p.account}.snowflakecomputing.com` : null);
    if (derived) {
      const h = normalizeHost(derived);
      if (!h) throw new ToolError(`snow connection "${conn}" has an invalid host/account. Set DVT_SNOWFLAKE_ACCOUNT_URL.`);
      return `https://${h}`;
    }
    throw new ToolError(`snow connection "${conn}" not found or has no account. Set DVT_SNOWFLAKE_ACCOUNT_URL.`);
  }

  // Mirrors Ingress._fresh_token (deploy/snowflake/rig/ingress.py).
  async function exchange(host, role, conn) {
    const jwt = await generateJwt(conn);
    const base = await accountUrl(conn);
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      scope: role ? `session:role:${role} ${host}` : host,
      assertion: jwt,
    });
    const res = await fetchImpl(`${base}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = (await res.text()).trim();
    if (res.status !== 200) throw new ToolError(`token request failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    if (!text) throw new ToolError("token request returned an empty body");
    secrets.add(text);
    cache.set(`${host}|${role}|${conn}`, { token: text, exp: now() + TOKEN_TTL_MS });
    return text;
  }

  async function getToken(host, role, conn, force) {
    const key = `${host}|${role}|${conn}`;
    if (force) cache.delete(key);
    const hit = cache.get(key);
    if (hit && hit.exp > now()) return hit.token;
    return exchange(host, role, conn);
  }

  async function renderView(args) {
    const { dashboard_id: did, render_id: rid } = args || {};
    if (typeof did !== "string" || !UUID_RE.test(did) || typeof rid !== "string" || !UUID_RE.test(rid)) {
      throw new ToolError("dashboard_id and render_id must both be UUIDs");
    }
    const host = normalizeHost(env.DVT_APP_URL);
    if (!host) {
      throw new ToolError(env.DVT_APP_URL ? `DVT_APP_URL must be an https URL or bare host. ${SETUP}` : SETUP);
    }
    const pat = env.DVT_SNOWFLAKE_PAT;
    if (pat) secrets.add(pat);
    const role = env.DVT_SNOWFLAKE_ROLE || "";
    const conn = env.DVT_SNOWFLAKE_CONNECTION || "default";
    const url = `https://${host}/v1/dashboards/${did}/renders/${rid}/artifact`;

    const get = async (token) =>
      fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Snowflake Token="${token}"` },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    let res = await get(pat || (await getToken(host, role, conn, false)));
    if (!pat && (res.status === 302 || res.status === 401)) {
      res = await get(await getToken(host, role, conn, true)); // single refresh-retry
    }

    if (res.status === 302 || res.status === 401) {
      throw new ToolError(
        `the app ingress refused the credential (HTTP ${res.status}); a 302 means it redirected to the Snowflake login page. ` +
          "Check DVT_APP_URL, the credential, and that your role can use the app.",
      );
    }
    if (res.status === 404) {
      throw new ToolError(
        "render not found — either it does not exist (deleted or expired), it is not finished, or it was requested by a different user (renders are visible only to the user who requested them)",
      );
    }
    if (res.status !== 200) {
      const t = await res.text().catch(() => "");
      throw new ToolError(`unexpected HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const tooBig = (n) => new ToolError(`render is ${(n / 1e6).toFixed(2)} MB, over the 3.75 MB limit; no image returned`);
    const cl = Number(res.headers && res.headers.get && res.headers.get("content-length"));
    if (Number.isFinite(cl) && cl > MAX_BYTES) throw tooBig(cl);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 24 || !PNG_SIG.every((b, i) => buf[i] === b)) {
      throw new ToolError("response was not a PNG image (only PNG renders can be viewed)");
    }
    if (buf.length > MAX_BYTES) throw tooBig(buf.length);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w > MAX_DIM || h > MAX_DIM) {
      throw new ToolError(`render is ${w}×${h} px; the image exceeds the ${MAX_DIM} px model limit; no image returned`);
    }
    return [
      { type: "image", data: buf.toString("base64"), mimeType: "image/png" },
      { type: "text", text: `dvt render ${rid} (dashboard ${did}): ${w}×${h} px, ${Math.round(buf.length / 1024)} KB` },
    ];
  }

  async function callTool(params) {
    try {
      return { content: await renderView(params.arguments) };
    } catch (e) {
      const msg = e instanceof ToolError ? e.message : `${e && e.name === "TimeoutError" ? "request timed out" : "request failed"}: ${e && e.message}`;
      const safe = s(msg);
      log(`dvt_render_view error: ${safe}`);
      return { isError: true, content: [{ type: "text", text: safe }] };
    }
  }

  // Returns the JSON-RPC response object, or null when none is due.
  async function handle(msg) {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") return null;
    const hasId = msg.id !== undefined && msg.id !== null;
    if (!hasId) return null;
    const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
    const err = (code, message) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
    switch (msg.method) {
      case "initialize": {
        const want = msg.params && msg.params.protocolVersion;
        return ok({
          protocolVersion: SUPPORTED_PROTOCOLS.includes(want) ? want : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "dvt-render-viewer", version: pluginVersion() },
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: [TOOL] });
      case "tools/call": {
        const p = msg.params || {};
        if (p.name !== TOOL.name) return err(-32602, `unknown tool: ${String(p.name).slice(0, 100)}`);
        return ok(await callTool(p));
      }
      default:
        return err(-32601, `method not found: ${msg.method.slice(0, 100)}`);
    }
  }

  return { handle };
}

export function startStdio(opts = {}) {
  const server = createServer(opts);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stderr.write("dvt-render-viewer: ignoring malformed JSON line\n");
      return;
    }
    // Each call runs concurrently; one write per response keeps stdout lines whole.
    server.handle(msg).then(
      (res) => {
        if (res) process.stdout.write(JSON.stringify(res) + "\n");
      },
      (e) => process.stderr.write(`dvt-render-viewer: internal error: ${scrub(e && e.message)}\n`),
    );
  });
  return rl;
}
