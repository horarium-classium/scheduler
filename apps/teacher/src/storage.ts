import { nextId, validateTimeSlot, type Lesson, type SchoolClass, type Subject, type Teacher, type TimeSlot } from "./model.ts";

export const STORAGE_KEY = "horarium-teacher-workspace";
export const STORAGE_BACKUP_KEY = "horarium-teacher-workspace-v1-backup";
export const SCHEMA_VERSION = 2;
export interface TeacherState { schemaVersion: number; school: { name: string; timezone: string }; classes: SchoolClass[]; subjects: Subject[]; teachers: Teacher[]; timeSlots: TimeSlot[]; lessons: Lesson[]; lastSelectedClassId: number | null; }
interface LegacyLesson { id: number; classId: number; weekday: number; timeSlotId: number; subject: string; color: string; comment: string; }
interface LegacyState extends Omit<TeacherState, "schemaVersion" | "subjects" | "teachers" | "lessons"> { schemaVersion: 1; lessons: LegacyLesson[]; }
export interface MigrationConflict { key: string; name: string; colors: string[]; suggestedColor: string; }
export type LoadResult = { kind: "missing" } | { kind: "valid"; state: TeacherState } | { kind: "migration"; state: TeacherState; conflicts: MigrationConflict[]; raw: string } | { kind: "invalid"; message: string; raw: string };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasUniquePositiveIds(items: unknown[]): boolean { const ids = items.map((item) => isRecord(item) ? item.id : undefined); return ids.every((id) => Number.isInteger(id) && Number(id) > 0) && new Set(ids).size === ids.length; }
function normalized(value: string): string { return value.trim().toLocaleLowerCase("hy"); }
function isValidColor(value: unknown): value is string { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value); }
export function isValidTimezone(value: string): boolean { try { new Intl.DateTimeFormat("hy", { timeZone: value }).format(); return true; } catch { return false; } }

function validateBase(value: Record<string, unknown>): string | null {
  if (!isRecord(value.school) || typeof value.school.name !== "string" || !value.school.name.trim()) return "Դպրոցի անունը բացակայում է։";
  if (typeof value.school.timezone !== "string" || !isValidTimezone(value.school.timezone)) return "Դպրոցի ժամային գոտին անվավեր է։";
  if (!Array.isArray(value.classes) || !Array.isArray(value.timeSlots) || !Array.isArray(value.lessons)) return "Պահոցի ցանկերը բացակայում են։";
  if (!hasUniquePositiveIds(value.classes) || !hasUniquePositiveIds(value.timeSlots) || !hasUniquePositiveIds(value.lessons)) return "Պահոցում կան անվավեր կամ կրկնվող ID-ներ։";
  const names = new Set<string>();
  for (const item of value.classes) { if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim()) return "Դասարանի անունն անվավեր է։"; const name = normalized(item.name); if (names.has(name)) return "Պահոցում կան կրկնվող դասարանների անուններ։"; names.add(name); }
  const slots = value.timeSlots as unknown as TimeSlot[];
  for (const item of slots) { if (!isRecord(item) || !Number.isInteger(item.schoolId) || typeof item.start !== "string" || typeof item.end !== "string") return "Դասաժամի կառուցվածքն անվավեր է։"; const error = validateTimeSlot(item, slots, Number(item.schoolId), Number(item.id)); if (error) return `Դասաժամն անվավեր է․ ${error}`; }
  return null;
}

function validateLegacy(value: Record<string, unknown>): string | null {
  const baseError = validateBase(value); if (baseError) return baseError;
  const classIds = new Set((value.classes as Record<string, unknown>[]).map((item) => item.id)); const slotIds = new Set((value.timeSlots as Record<string, unknown>[]).map((item) => item.id)); const cells = new Set<string>();
  for (const item of value.lessons as unknown[]) { if (!isRecord(item) || !classIds.has(item.classId) || !slotIds.has(item.timeSlotId) || !Number.isInteger(item.weekday) || Number(item.weekday) < 1 || Number(item.weekday) > 6 || typeof item.subject !== "string" || !item.subject.trim() || !isValidColor(item.color) || typeof item.comment !== "string") return "Հին դասերից մեկի կառուցվածքը, գույնը կամ կապերն անվավեր են։"; const cell = `${item.classId}:${item.weekday}:${item.timeSlotId}`; if (cells.has(cell)) return "Հին պահոցում նույն վանդակում մեկից ավելի դաս կա։"; cells.add(cell); }
  return null;
}

export function validateState(value: unknown): string | null {
  if (!isRecord(value)) return "Պահոցի տվյալները օբյեկտ չեն։";
  if (value.schemaVersion !== SCHEMA_VERSION) return Number(value.schemaVersion) > SCHEMA_VERSION ? "Պահոցը ստեղծվել է հավելվածի ավելի նոր տարբերակով։" : "Պահոցի տարբերակը չի աջակցվում։";
  const baseError = validateBase(value); if (baseError) return baseError;
  if (!Array.isArray(value.subjects) || !Array.isArray(value.teachers) || !hasUniquePositiveIds(value.subjects) || !hasUniquePositiveIds(value.teachers)) return "Առարկաների կամ ուսուցիչների ցանկն անվավեր է։";
  const subjectNames = new Set<string>();
  for (const item of value.subjects) { if (!isRecord(item) || item.schoolId !== 1 || typeof item.name !== "string" || !item.name.trim() || !isValidColor(item.color)) return "Առարկաներից մեկի կառուցվածքը կամ գույնն անվավեր է։"; const name = normalized(item.name); if (subjectNames.has(name)) return "Առարկաների անունները չեն կարող կրկնվել։"; subjectNames.add(name); }
  for (const item of value.teachers) if (!isRecord(item) || item.schoolId !== 1 || typeof item.name !== "string" || !item.name.trim()) return "Ուսուցիչներից մեկի կառուցվածքն անվավեր է։";
  const classIds = new Set((value.classes as Record<string, unknown>[]).map((item) => item.id)); const slotIds = new Set((value.timeSlots as Record<string, unknown>[]).map((item) => item.id)); const subjectIds = new Set((value.subjects as Record<string, unknown>[]).map((item) => item.id)); const teacherIds = new Set((value.teachers as Record<string, unknown>[]).map((item) => item.id)); const cells = new Set<string>();
  for (const item of value.lessons as unknown[]) { if (!isRecord(item) || !classIds.has(item.classId) || !slotIds.has(item.timeSlotId) || !subjectIds.has(item.subjectId) || (item.teacherId !== null && !teacherIds.has(item.teacherId)) || !Number.isInteger(item.weekday) || Number(item.weekday) < 1 || Number(item.weekday) > 6 || typeof item.comment !== "string") return "Դասերից մեկի կառուցվածքը կամ կապերն անվավեր են։"; const cell = `${item.classId}:${item.weekday}:${item.timeSlotId}`; if (cells.has(cell)) return "Նույն վանդակում մեկից ավելի դաս կա։"; cells.add(cell); }
  if (value.lastSelectedClassId !== null && (!Number.isInteger(value.lastSelectedClassId) || !classIds.has(value.lastSelectedClassId))) return "Վերջին ընտրված դասարանը գոյություն չունի։";
  return null;
}

export function migrateV1(value: LegacyState, colors: Record<string, string> = {}): { state: TeacherState; conflicts: MigrationConflict[] } {
  const subjects: Subject[] = []; const subjectByName = new Map<string, Subject>(); const colorsByName = new Map<string, Set<string>>();
  for (const lesson of value.lessons) { const key = normalized(lesson.subject); let subject = subjectByName.get(key); if (!subject) { subject = { id: nextId(subjects), schoolId: 1, name: lesson.subject.trim(), color: lesson.color }; subjects.push(subject); subjectByName.set(key, subject); } const found = colorsByName.get(key) ?? new Set<string>(); found.add(lesson.color); colorsByName.set(key, found); }
  const conflicts = [...colorsByName.entries()].filter(([, found]) => found.size > 1).map(([key, found]) => ({ key, name: subjectByName.get(key)?.name ?? key, colors: [...found], suggestedColor: subjectByName.get(key)?.color ?? [...found][0]! }));
  for (const subject of subjects) subject.color = colors[normalized(subject.name)] ?? subject.color;
  return { state: { schemaVersion: SCHEMA_VERSION, school: value.school, classes: value.classes, subjects, teachers: [], timeSlots: value.timeSlots, lessons: value.lessons.map((lesson) => ({ id: lesson.id, classId: lesson.classId, weekday: lesson.weekday, timeSlotId: lesson.timeSlotId, subjectId: subjectByName.get(normalized(lesson.subject))!.id, teacherId: null, comment: lesson.comment })), lastSelectedClassId: value.lastSelectedClassId }, conflicts };
}

export function loadState(storage: Pick<Storage, "getItem"> = localStorage): LoadResult {
  const raw = storage.getItem(STORAGE_KEY); if (raw === null) return { kind: "missing" };
  try { const value: unknown = JSON.parse(raw); if (!isRecord(value)) return { kind: "invalid", message: "Պահոցի տվյալները օբյեկտ չեն։", raw }; if (value.schemaVersion === 1) { const error = validateLegacy(value); if (error) return { kind: "invalid", message: error, raw }; const migration = migrateV1(value as unknown as LegacyState); const migratedError = validateState(migration.state); return migratedError ? { kind: "invalid", message: migratedError, raw } : { kind: "migration", ...migration, raw }; } const error = validateState(value); return error ? { kind: "invalid", message: error, raw } : { kind: "valid", state: value as unknown as TeacherState }; }
  catch { return { kind: "invalid", message: "Պահոցի JSON տվյալները վնասված են։", raw }; }
}

export function saveState(state: TeacherState, storage: Pick<Storage, "setItem"> = localStorage): void { const error = validateState(state); if (error) throw new Error(error); storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function completeMigration(state: TeacherState, rawBackup: string, storage: Pick<Storage, "setItem"> = localStorage): void { const error = validateState(state); if (error) throw new Error(error); storage.setItem(STORAGE_BACKUP_KEY, rawBackup); storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
