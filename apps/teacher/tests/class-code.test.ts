import assert from "node:assert/strict";
import { test } from "node:test";
import { copyClassCode } from "../src/class-code.ts";

test("class code uses public UUID, requires publication and reports clipboard failures", async () => {
  const publication = { class_id: "internal", public_id: "public", revision: 1, published_at: "2026-09-26T00:00:00Z", is_current: true };
  let copied = "";
  assert.match(await copyClassCode(publication, async text => { copied = text; }), /պատճենված/);
  assert.equal(copied, "public");
  assert.match(await copyClassCode(publication, async () => { throw new Error("denied"); }), /Չհաջողվեց/);
  copied = "";
  assert.match(await copyClassCode({ ...publication, revision: null }, async text => { copied = text; }), /նախ հրապարակեք/);
  assert.equal(copied, "");
});
