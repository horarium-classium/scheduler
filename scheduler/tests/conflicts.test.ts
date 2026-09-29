import assert from "node:assert/strict";
import test from "node:test";
import { findLessonConflict, findScheduleConflicts, type Lesson } from "../src/model.ts";
import { validateState, SCHEMA_VERSION } from "../src/state.ts";
const base: Lesson = { id: 1, classId: 1, weekday: 1, timeSlotId: 1, subjectId: 1, teacherId: 1, comment: "" };

test("teacher collision compares identities and excludes the edited lesson", () => {
  assert.equal(findLessonConflict(base, [base]), null);
  assert.equal(findLessonConflict({ ...base, id: 2, classId: 2 }, [base])?.kind, "teacher");
  for (const change of [{ teacherId: null }, { teacherId: 2 }, { weekday: 2 }, { timeSlotId: 2 }]) {
    assert.equal(findLessonConflict({ ...base, id: 2, classId: 2, ...change }, [base]), null);
  }
  assert.equal(base.teacherId, 1);
});

test("duplicate cells are blocked even without a teacher", () => {
  assert.equal(findLessonConflict({ ...base, id: 2, teacherId: null }, [base])?.kind, "cell");
  assert.equal(findScheduleConflicts([base, { ...base, id: 2, classId: 2 }]).length, 1);
  assert.equal(findScheduleConflicts([base, { ...base, id: 2, classId: 2, weekday: 2 }]).length, 0);
});

test("full state validation rejects cross-class teacher collisions and allows a cleared assignment", () => {
  const state = { schemaVersion: SCHEMA_VERSION, school: { name: "Դպրոց", timezone: "Asia/Yerevan" }, classes: [{ id: 1, name: "5Ա" }, { id: 2, name: "5Բ" }], subjects: [{ id: 1, schoolId: 1, name: "Մաթեմատիկա", color: "#dbeafe" }], teachers: [{ id: 1, schoolId: 1, name: "Անի" }], timeSlots: [{ id: 1, schoolId: 1, start: "09:00", end: "09:45" }], lessons: [base, { ...base, id: 2, classId: 2 }], lastSelectedClassId: 1 };
  assert.match(validateState(state) ?? "", /դասատու/);
  state.lessons[1] = { ...state.lessons[1]!, teacherId: null };
  assert.equal(validateState(state), null);
});
