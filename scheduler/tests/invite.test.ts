import assert from "node:assert/strict";
import test from "node:test";
import { activationApi, activationTarget, activationError, ActivationError, readCallback, validatePassword } from "../src/invite.ts";

test("routes invite and recovery before normal login, retaining callback", () => {
  const root = "https://example.com/horarium-classium/";
  assert.equal(activationTarget(root), null);
  for (const type of ["invite", "recovery"]) {
    const hash = `#type=${type}&access_token=test&refresh_token=refresh`;
    assert.equal(activationTarget(root + hash), root + "activate.html" + hash);
    assert.equal(readCallback(hash).token, "test");
  }
  assert.equal(activationTarget(root + "#settings"), null);
});

test("rejects missing tokens, unsupported callbacks and errors from either URL component", () => {
  for (const hash of ["", "#type=invite", "#access_token=test", "#type=signup&access_token=test", "#type=invite&access_token=test&error_code=otp_expired"]) {
    assert.equal(readCallback(hash).token, null);
  }
  assert.equal(readCallback("#type=invite&access_token=test", "?error=access_denied").token, null);
  assert.ok(activationTarget("https://example.com/horarium-classium/?error=access_denied"));
});

test("validates password before saving", () => {
  assert.ok(validatePassword("short", "short"));
  assert.ok(validatePassword("long-password", "different-password"));
  assert.equal(validatePassword("long-password", "long-password"), null);
});

test("uses only invitation credentials, validates user and saves password", async () => {
  const calls: RequestInit[] = [];
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "https://example.com/auth/v1/user");
    calls.push(options!);
    return new Response(JSON.stringify({ id: "invited-user", email: "test@example.com" }));
  };
  const api = activationApi("https://example.com/", "public-key", "invite-token", request);
  assert.equal(await api(), "test@example.com");
  await api("long-password");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "PUT");
  assert.equal(calls[1].body, JSON.stringify({ password: "long-password" }));
  assert.equal((calls[1].headers as Record<string, string>).Authorization, "Bearer invite-token");
});

test("does not report success on rejected, malformed or unavailable API", async () => {
  for (const code of [401, 403, 422, 429, 500]) {
    const api = activationApi("https://example.com", "key", "token", async () => new Response("{}", { status: code }));
    await assert.rejects(api("long-password"), ActivationError);
    assert.ok(activationError(new ActivationError(code)));
  }
  await assert.rejects(activationApi("https://example.com", "key", "token", async () => new Response("{}"))());
  await assert.rejects(activationApi("https://example.com", "key", "token", async () => { throw new TypeError("offline"); })());
});
