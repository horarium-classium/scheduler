import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, STORAGE_BACKUP_KEY, STORAGE_KEY, completeMigration, loadState, migrateV1, saveState, validateState, type TeacherState } from "../src/storage.ts";

function validState(): TeacherState {
  return {
    schemaVersion: SCHEMA_VERSION,
    school: { name: "Դպրոց", timezone: "Asia/Yerevan" },
    classes: [{ id: 3, name: "5Ա" }, { id: 8, name: "5Բ" }],
    subjects: [{ id: 2, schoolId: 1, name: "Մաթեմատիկա", color: "#dbeafe" }],
    teachers: [{ id: 6, schoolId: 1, name: "Անի" }],
    timeSlots: [{ id: 4, schoolId: 1, start: "09:00", end: "09:45" }],
    lessons: [{ id: 7, classId: 3, weekday: 1, timeSlotId: 4, subjectId: 2, teacherId: 6, comment: "" }],
    lastSelectedClassId: 3,
  };
}

class MemoryStorage {
  value: string | null = null;
  getItem(key: string): string | null { assert.equal(key, STORAGE_KEY); return this.value; }
  setItem(key: string, value: string): void { assert.equal(key, STORAGE_KEY); this.value = value; }
}

test("distinguishes an absent store from valid empty lists", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadState(storage), { kind: "missing" });
  const state = validState(); state.classes = []; state.timeSlots = []; state.lessons = []; state.lastSelectedClassId = null;
  saveState(state, storage);
  assert.equal(loadState(storage).kind, "valid");
});

test("round-trips valid state without changing stable IDs or links", () => {
  const storage = new MemoryStorage(); const state = validState(); saveState(state, storage);
  assert.deepEqual(loadState(storage), { kind: "valid", state });
});

test("preserves corrupted JSON and rejects a newer schema", () => {
  const storage = new MemoryStorage(); storage.value = "{broken";
  const broken = loadState(storage); assert.equal(broken.kind, "invalid");
  if (broken.kind === "invalid") assert.equal(broken.raw, "{broken");
  storage.value = JSON.stringify({ ...validState(), schemaVersion: SCHEMA_VERSION + 1 });
  const newer = loadState(storage); assert.equal(newer.kind, "invalid");
  if (newer.kind === "invalid") assert.match(newer.message, /ավելի նոր/);
});

test("rejects duplicate IDs, broken links, duplicate cells, and overlapping slots", () => {
  const duplicateIds = validState(); duplicateIds.classes.push({ id: 3, name: "6Ա" }); assert.match(validateState(duplicateIds) ?? "", /ID/);
  const brokenLink = validState(); brokenLink.lessons[0]!.classId = 99; assert.match(validateState(brokenLink) ?? "", /կապերն/);
  const brokenSubject = validState(); brokenSubject.lessons[0]!.subjectId = 99; assert.match(validateState(brokenSubject) ?? "", /կապերն/);
  const brokenTeacher = validState(); brokenTeacher.lessons[0]!.teacherId = 99; assert.match(validateState(brokenTeacher) ?? "", /կապերն/);
  const duplicateCell = validState(); duplicateCell.lessons.push({ ...duplicateCell.lessons[0]!, id: 9 }); assert.match(validateState(duplicateCell) ?? "", /վանդակում/);
  const overlap = validState(); overlap.timeSlots.push({ id: 9, schoolId: 1, start: "09:30", end: "10:00" }); assert.match(validateState(overlap) ?? "", /համընկնում/);
});

test("save failures leave the supplied in-memory state untouched", () => {
  const state = validState();
  assert.throws(() => saveState(state, { setItem() { throw new Error("quota"); } }), /quota/);
  assert.equal(state.lessons[0]!.subjectId, 2);
});

test("migrates v1 lessons to shared subjects while preserving lesson identity and links", () => {
  const legacy = { schemaVersion: 1 as const, school: { name: "Դպրոց", timezone: "Asia/Yerevan" }, classes: [{ id: 3, name: "5Ա" }], timeSlots: [{ id: 4, schoolId: 1, start: "09:00", end: "09:45" }], lessons: [
    { id: 7, classId: 3, weekday: 1, timeSlotId: 4, subject: " Մաթեմատիկա ", color: "#dbeafe", comment: "ա" },
    { id: 9, classId: 3, weekday: 2, timeSlotId: 4, subject: "մաթեմատիկա", color: "#dcfce7", comment: "բ" },
  ], lastSelectedClassId: 3 };
  const migrated = migrateV1(legacy);
  assert.equal(migrated.state.subjects.length, 1);
  assert.deepEqual(migrated.state.lessons.map((item) => [item.id, item.subjectId, item.comment]), [[7, 1, "ա"], [9, 1, "բ"]]);
  assert.equal(migrated.state.lessons.every((item) => item.teacherId === null), true);
  assert.deepEqual(migrated.conflicts[0]?.colors, ["#dbeafe", "#dcfce7"]);
});

test("load requests migration without overwriting v1 and completion writes a backup first", () => {
  const legacy = { schemaVersion: 1, school: { name: "Դպրոց", timezone: "Asia/Yerevan" }, classes: [], timeSlots: [], lessons: [], lastSelectedClassId: null };
  const values = new Map<string, string>([[STORAGE_KEY, JSON.stringify(legacy)]]);
  const storage = { getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); } };
  const result = loadState(storage); assert.equal(result.kind, "migration");
  assert.equal(values.get(STORAGE_KEY), JSON.stringify(legacy));
  if (result.kind === "migration") completeMigration(result.state, result.raw, storage);
  assert.equal(values.get(STORAGE_BACKUP_KEY), JSON.stringify(legacy));
  assert.equal(JSON.parse(values.get(STORAGE_KEY) ?? "{}").schemaVersion, SCHEMA_VERSION);
  assert.equal(loadState(storage).kind, "valid");
});
