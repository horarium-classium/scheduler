import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, validateState, type TeacherState } from "../src/state.ts";

function validState(): TeacherState {
  return {
    schemaVersion: SCHEMA_VERSION,
    school: { name: "Դպրոց", timezone: "Asia/Yerevan" },
    classes: [{ id: 3, name: "Դասարան Ա" }, { id: 8, name: "Դասարան Բ" }],
    subjects: [{ id: 2, schoolId: 1, name: "Առարկա", color: "#dbeafe" }],
    teachers: [{ id: 6, schoolId: 1, name: "Ուսուցիչ" }],
    timeSlots: [{ id: 4, schoolId: 1, start: "09:00", end: "09:45" }],
    lessons: [{ id: 7, classId: 3, weekday: 1, timeSlotId: 4, subjectId: 2, teacherId: 6, comment: "" }],
    lastSelectedClassId: 3,
  };
}

test("accepts a valid cloud editor state", () => {
  assert.equal(validateState(validState()), null);
});

test("rejects duplicate IDs, names, broken links and overlapping slots", () => {
  const duplicateId = validState();
  duplicateId.classes.push({ id: 3, name: "Դասարան Գ" });
  assert.match(validateState(duplicateId) ?? "", /ID/);

  const duplicateName = validState();
  duplicateName.classes[1]!.name = " դասարան ա ";
  assert.match(validateState(duplicateName) ?? "", /անուն/);

  const brokenLink = validState();
  brokenLink.lessons[0]!.subjectId = 999;
  assert.match(validateState(brokenLink) ?? "", /կապ/);

  const overlapping = validState();
  overlapping.timeSlots.push({ id: 9, schoolId: 1, start: "09:30", end: "10:00" });
  assert.match(validateState(overlapping) ?? "", /համընկնում/);
});

test("accepts an intentionally empty cloud workspace", () => {
  const state = validState();
  state.classes = [];
  state.subjects = [];
  state.teachers = [];
  state.timeSlots = [];
  state.lessons = [];
  state.lastSelectedClassId = null;
  assert.equal(validateState(state), null);
});
