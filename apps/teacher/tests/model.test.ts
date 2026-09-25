import assert from "node:assert/strict";
import test from "node:test";
import { hasDuplicateTeacherName, isSubjectUsed, isTeacherUsed, isTimeSlotUsed, nextId, removeClassDraft, sortTimeSlots, validateSubjectName, validateTeacherName, validateTimeSlot, type Lesson, type Subject, type Teacher, type TimeSlot } from "../src/model.ts";

const slots: TimeSlot[] = [
  { id: 4, schoolId: 1, start: "09:00", end: "09:45" },
  { id: 9, schoolId: 1, start: "10:00", end: "10:45" },
];

test("validates time format, direction, overlaps, and adjacent slots", () => {
  assert.match(validateTimeSlot({ start: "", end: "10:00" }, slots, 1) ?? "", /HH:MM/);
  assert.match(validateTimeSlot({ start: "10:00", end: "10:00" }, slots, 1) ?? "", /շուտ/);
  assert.match(validateTimeSlot({ start: "09:30", end: "10:00" }, slots, 1) ?? "", /համընկնում/);
  assert.equal(validateTimeSlot({ start: "09:45", end: "10:00" }, slots, 1), null);
  assert.equal(validateTimeSlot({ start: "08:30", end: "09:15" }, slots, 1, 4), null);
});

test("keeps stable IDs when sorting and allocates above the current maximum", () => {
  assert.deepEqual(sortTimeSlots([slots[1]!, slots[0]!]).map((slot) => slot.id), [4, 9]);
  assert.equal(nextId(slots), 10);
});

test("detects a slot used in any class", () => {
  const lessons: Lesson[] = [{ id: 1, classId: 25, weekday: 6, timeSlotId: 9, subjectId: 1, teacherId: null, comment: "" }];
  assert.equal(isTimeSlotUsed(9, lessons), true);
  assert.equal(isTimeSlotUsed(4, lessons), false);
});

test("validates subject names and detects subjects used in lessons", () => {
  const subjects: Subject[] = [
    { id: 1, schoolId: 1, name: "Մաթեմատիկա", color: "#dbeafe" },
    { id: 2, schoolId: 1, name: "Հայոց լեզու", color: "#dcfce7" },
  ];
  const lessons: Lesson[] = [{ id: 1, classId: 25, weekday: 1, timeSlotId: 4, subjectId: 2, teacherId: null, comment: "" }];
  assert.match(validateSubjectName("  ", subjects) ?? "", /պարտադիր/);
  assert.match(validateSubjectName(" մԱԹԵՄԱՏԻԿԱ ", subjects) ?? "", /արդեն կա/);
  assert.equal(validateSubjectName("Մաթեմատիկա", subjects, 1), null);
  assert.equal(validateSubjectName("Բնագիտություն", subjects), null);
  assert.equal(isSubjectUsed(2, lessons), true);
  assert.equal(isSubjectUsed(1, lessons), false);
});

test("validates teacher names, allows distinct duplicate records, and detects usage", () => {
  const teachers: Teacher[] = [{ id: 1, schoolId: 1, name: "Անի Մկրտչյան" }, { id: 2, schoolId: 1, name: "Արամ Սարգսյան" }];
  const lessons: Lesson[] = [{ id: 1, classId: 25, weekday: 1, timeSlotId: 4, subjectId: 2, teacherId: 2, comment: "" }];
  assert.match(validateTeacherName("  ") ?? "", /պարտադիր/);
  assert.equal(validateTeacherName("Անի Մկրտչյան"), null);
  assert.equal(hasDuplicateTeacherName(" անի մԿՐՏՉՅԱՆ ", teachers), true);
  assert.equal(hasDuplicateTeacherName("Անի Մկրտչյան", teachers, 1), false);
  assert.equal(isTeacherUsed(2, lessons), true);
  assert.equal(isTeacherUsed(1, lessons), false);
});

test("class removal deletes only its draft lessons and selects the next neighbor", () => {
  const classes = [{ id: 1, name: "5Ա" }, { id: 2, name: "5Բ" }, { id: 3, name: "6Ա" }];
  const lessons: Lesson[] = [
    { id: 1, classId: 1, weekday: 1, timeSlotId: 4, subjectId: 1, teacherId: null, comment: "" },
    { id: 2, classId: 2, weekday: 1, timeSlotId: 4, subjectId: 1, teacherId: null, comment: "" },
  ];
  const result = removeClassDraft(1, classes, lessons);
  assert.deepEqual(result.classes.map((item) => item.id), [2, 3]);
  assert.deepEqual(result.lessons.map((item) => item.id), [2]);
  assert.equal(result.nextSelectedClassId, 2);
  const last = removeClassDraft(2, result.classes.slice(0, 1), result.lessons);
  assert.equal(last.nextSelectedClassId, null);
});
