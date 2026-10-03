// DVT-4950 — unit tests for the render viewer. Fake credentials are assembled at runtime
// so no JWT/PAT-shaped literal lands in the tree (scripts/plugin-leak-scan.sh).
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, scrub, normalizeHost } from "./lib.mjs";

const DID = "11111111-1111-4111-8111-111111111111";
const RID = "22222222-2222-4222-8222-222222222222";
const HOST = "abc-xyz.snowflakecomputing.app";
const fakeJwt = () => ["ey" + "Jhbg", "payload", "sig"].join(".");
const PAT = ["pat", "planted", "value"].join("-");

function png(w, h, extra = 0) {
  const b = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
const resp = (status, body = "") =>
  new Response(Buffer.isBuffer(body) ? body : String(body), { status });

// Scripted fetch: artifact responses are consumed in order; exchanges are recorded.
function harness({ env = {}, artifact = [], tokens = ["tok-1", "tok-2", "tok-3"] } = {}) {
  const calls = { exchange: [], artifact: [], exec: [] };
  let t = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith("/oauth/token")) {
      calls.exchange.push({ url: String(url), body: new URLSearchParams(init.body) });
      return resp(200, tokens[t++] + "\n");
    }
    calls.artifact.push({ url: String(url), init });
    return artifact.shift();
  };
  const execImpl = async (file, args) => {
    calls.exec.push([file, ...args]);
    if (args[1] === "generate-jwt") return `info line\n${fakeJwt()}\n`;
    return JSON.stringify([{ connection_name: "default", parameters: { account: "ORG-ACCT" } }]);
  };
  const logs = [];
  let clock = 1000;
  const srv = createServer({
    env: { DVT_APP_URL: `https://${HOST}/`, ...env },
    fetchImpl,
    execImpl,
    now: () => clock,
    log: (m) => logs.push(m),
  });
  const call = (args = { dashboard_id: DID, render_id: RID }) =>
    srv.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "dvt_render_view", arguments: args } }).then((r) => r.result);
  return { srv, calls, call, logs, advance: (ms) => (clock += ms) };
}
const text = (r) => r.content.map((c) => c.text || "").join("\n");

test("keypair exchange: form fields, scope without role, derived account URL", async () => {
  const h = harness({ artifact: [resp(200, png(10, 20))] });
  const r = await h.call();
  assert.equal(r.isError, undefined);
  const x = h.calls.exchange[0];
  assert.equal(x.url, "https://org-acct.snowflakecomputing.com/oauth/token");
  assert.equal(x.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  assert.equal(x.body.get("scope"), HOST);
  assert.equal(x.body.get("assertion"), fakeJwt());
  assert.equal(h.calls.artifact[0].init.headers.Authorization, 'Snowflake Token="tok-1"');
  assert.equal(h.calls.artifact[0].init.redirect, "manual");
  assert.equal(h.calls.artifact[0].url, `https://${HOST}/v1/dashboards/${DID}/renders/${RID}/artifact`);
});

test("keypair exchange: scope with role, explicit account URL skips snow list", async () => {
  const h = harness({
    env: { DVT_SNOWFLAKE_ROLE: "MYROLE", DVT_SNOWFLAKE_ACCOUNT_URL: "https://acct.example.com/" },
    artifact: [resp(200, png(1, 1))],
  });
  await h.call();
  assert.equal(h.calls.exchange[0].body.get("scope"), `session:role:MYROLE ${HOST}`);
  assert.equal(h.calls.exchange[0].url, "https://acct.example.com/oauth/token");
  assert.ok(!h.calls.exec.some((c) => c[2] === "list"));
});

test("unparseable `snow connection list` output: fixed error, planted value not echoed", async () => {
  const PLANTED = ["sec", "ret", "XYZ"].join("");
  const srv = createServer({
    env: { DVT_APP_URL: `https://${HOST}/` },
    fetchImpl: async () => resp(200, png(1, 1)),
    execImpl: async (file, args) =>
      args[1] === "generate-jwt" ? `info line\n${fakeJwt()}\n` : `not json ${PLANTED} {{`,
    now: () => 1000,
    log: () => {},
  });
  const r = await srv
    .handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "dvt_render_view", arguments: { dashboard_id: DID, render_id: RID } } })
    .then((x) => x.result);
  assert.equal(r.isError, true);
  assert.ok(!text(r).includes(PLANTED));
  assert.match(text(r), /could not parse/);
});

test("PAT mode skips the exchange", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [resp(200, png(1, 1))] });
  await h.call();
  assert.equal(h.calls.exchange.length, 0);
  assert.equal(h.calls.exec.length, 0);
  assert.equal(h.calls.artifact[0].init.headers.Authorization, `Snowflake Token="${PAT}"`);
});

test("token cached across calls; re-exchanged after 50 minutes", async () => {
  const h = harness({ artifact: [resp(200, png(1, 1)), resp(200, png(1, 1)), resp(200, png(1, 1))] });
  await h.call();
  await h.call();
  assert.equal(h.calls.exchange.length, 1);
  h.advance(51 * 60 * 1000);
  await h.call();
  assert.equal(h.calls.exchange.length, 2);
});

test("302 then success: one re-exchange and retry", async () => {
  const h = harness({ artifact: [resp(302), resp(200, png(5, 6))] });
  const r = await h.call();
  assert.equal(r.isError, undefined);
  assert.equal(h.calls.exchange.length, 2);
  assert.equal(h.calls.artifact[1].init.headers.Authorization, 'Snowflake Token="tok-2"');
});

test("302 twice: isError mentioning 302", async () => {
  const h = harness({ artifact: [resp(302), resp(302)] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /302/);
  assert.equal(h.calls.exchange.length, 2);
});

test("401 in PAT mode: isError, no exchange, no retry", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [resp(401)] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /401/);
  assert.equal(h.calls.exchange.length, 0);
  assert.equal(h.calls.artifact.length, 1);
});

test("404 message", async () => {
  const h = harness({ artifact: [resp(404)] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /render not found/);
  assert.match(text(r), /different user/);
});

test("500 body is scrubbed of planted value and JWT-shaped strings", async () => {
  const jwt = fakeJwt();
  const h = harness({
    env: { DVT_SNOWFLAKE_PAT: PAT },
    artifact: [resp(500, `boom ${PAT} and ${jwt} tail`)],
  });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /500/);
  assert.ok(!text(r).includes(PAT));
  assert.ok(!text(r).includes(jwt));
  assert.ok(!h.logs.join("\n").includes(PAT));
  assert.ok(!h.logs.join("\n").includes(jwt));
});

test("scrub replaces known values and JWT shapes", () => {
  const out = scrub(`a ${PAT} b ${fakeJwt()}`, [PAT]);
  assert.equal(out, "a <redacted> b <redacted>");
});

test("non-PNG 200 is an error", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [resp(200, "<html>login</html>" + " ".repeat(40))] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /not a PNG/);
});

test("over 3.75 MB is an error with no image", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [resp(200, png(9, 9, 3_750_000))] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /3\.75 MB/);
  assert.ok(!r.content.some((c) => c.type === "image"));
});

test("content-length over the cap refuses without reading the body", async () => {
  let read = false;
  const big = {
    status: 200,
    headers: new Headers({ "content-length": "9000000" }),
    arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
    text: async () => "",
  };
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [big] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.equal(read, false);
  assert.match(text(r), /3\.75 MB/);
});

test("image wider or taller than 8000 px is refused", async () => {
  for (const [w, hh] of [[8001, 10], [10, 8001]]) {
    const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [resp(200, png(w, hh))] });
    const r = await h.call();
    assert.equal(r.isError, true);
    assert.match(text(r), /8000 px model limit/);
    assert.ok(!r.content.some((c) => c.type === "image"));
  }
});

test("http:// DVT_SNOWFLAKE_ACCOUNT_URL refuses with no fetch", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_ACCOUNT_URL: "http://acct.snowflakecomputing.com" }, artifact: [] });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /DVT_SNOWFLAKE_ACCOUNT_URL/);
  assert.equal(h.calls.exchange.length, 0);
  assert.equal(h.calls.artifact.length, 0);
});

test("bare-host DVT_SNOWFLAKE_ACCOUNT_URL works", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_ACCOUNT_URL: "acct.snowflakecomputing.com" }, artifact: [resp(200, png(10, 20))] });
  const r = await h.call();
  assert.equal(r.isError, undefined);
  assert.equal(h.calls.exchange[0].url, "https://acct.snowflakecomputing.com/oauth/token");
});

test("bad UUID: isError and no fetch", async () => {
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT } });
  const r = await h.call({ dashboard_id: "../x", render_id: RID });
  assert.equal(r.isError, true);
  assert.equal(h.calls.artifact.length, 0);
  assert.equal(h.calls.exchange.length, 0);
});

test("missing DVT_APP_URL: setup instructions, server still lists the tool", async () => {
  const h = harness({ env: { DVT_APP_URL: "" } });
  const r = await h.call();
  assert.equal(r.isError, true);
  assert.match(text(r), /DVT_APP_URL/);
  const l = await h.srv.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(l.result.tools.length, 1);
});

test("success returns image + caption with correct dimensions", async () => {
  const buf = png(1280, 720, 2048);
  const h = harness({ env: { DVT_SNOWFLAKE_PAT: PAT }, artifact: [resp(200, buf)] });
  const r = await h.call();
  assert.equal(r.isError, undefined);
  assert.equal(r.content[0].type, "image");
  assert.equal(r.content[0].mimeType, "image/png");
  assert.equal(Buffer.from(r.content[0].data, "base64").length, buf.length);
  assert.equal(r.content[1].type, "text");
  assert.match(r.content[1].text, /1280×720 px, 2 KB/);
  assert.ok(!r.content[1].text.includes(r.content[0].data));
});

test("normalizeHost", () => {
  assert.equal(normalizeHost("https://a.b.com/x"), "a.b.com");
  assert.equal(normalizeHost("a.b.com"), "a.b.com");
  assert.equal(normalizeHost("http://a.b.com"), null);
  assert.equal(normalizeHost(""), null);
});

test("JSON-RPC: initialize negotiation, ping, tools/list, errors, notification", async () => {
  const { srv } = harness();
  const init = (v) => srv.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: v } });
  assert.equal((await init("2025-03-26")).result.protocolVersion, "2025-03-26");
  assert.equal((await init("1999-01-01")).result.protocolVersion, "2025-06-18");
  const i = (await init("2025-06-18")).result;
  assert.deepEqual(i.capabilities, { tools: {} });
  assert.equal(i.serverInfo.name, "dvt-render-viewer");
  assert.match(i.serverInfo.version, /^\d+\.\d+\.\d+/);
  assert.deepEqual((await srv.handle({ jsonrpc: "2.0", id: 2, method: "ping" })).result, {});
  const t = (await srv.handle({ jsonrpc: "2.0", id: 3, method: "tools/list" })).result.tools;
  assert.equal(t.length, 1);
  assert.equal(t[0].name, "dvt_render_view");
  assert.ok(t[0].description.length <= 600);
  assert.deepEqual(t[0].inputSchema.required, ["dashboard_id", "render_id"]);
  assert.equal(t[0].inputSchema.additionalProperties, false);
  assert.equal((await srv.handle({ jsonrpc: "2.0", id: 4, method: "nope" })).error.code, -32601);
  const bad = await srv.handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "other" } });
  assert.equal(bad.error.code, -32602);
  assert.equal(await srv.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});
