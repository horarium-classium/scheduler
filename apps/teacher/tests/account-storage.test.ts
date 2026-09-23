import test from "node:test";
import assert from "node:assert/strict";
import { accountStorage } from "../src/account-storage.ts";

test("account drafts and backups are isolated and legacy data is preserved", () => {
  const data = new Map<string, string>([["draft", "legacy"]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } } as Storage;
  const first = accountStorage("first", storage);
  const second = accountStorage("second", storage);
  assert.equal(first.getItem("draft"), null);
  first.setItem("draft", "first draft");
  second.setItem("draft", "second draft");
  first.setItem("backup", "old first draft");
  assert.equal(first.getItem("draft"), "first draft");
  assert.equal(second.getItem("draft"), "second draft");
  assert.equal(second.getItem("backup"), null);
  first.removeItem("draft");
  assert.equal(second.getItem("draft"), "second draft");
  assert.equal(storage.getItem("draft"), "legacy");
});
