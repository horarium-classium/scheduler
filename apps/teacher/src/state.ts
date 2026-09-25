import { findScheduleConflicts, validateTimeSlot, type Lesson, type SchoolClass, type Subject, type Teacher, type TimeSlot } from "./model.ts";

export const SCHEMA_VERSION = 2;

export interface TeacherState {
  schemaVersion: number;
  school: { name: string; timezone: string };
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Teacher[];
  timeSlots: TimeSlot[];
  lessons: Lesson[];
  lastSelectedClassId: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUniquePositiveIds(items: unknown[]): boolean {
  const ids = items.map((item) => isRecord(item) ? item.id : undefined);
  return ids.every((id) => Number.isInteger(id) && Number(id) > 0) && new Set(ids).size === ids.length;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("hy");
}

function isValidColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("hy", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateState(value: unknown): string | null {
  if (!isRecord(value)) return "Տվյալները օբյեկտ չեն։";
  if (value.schemaVersion !== SCHEMA_VERSION) return "Տվյալների տարբերակը չի աջակցվում։";
  if (!isRecord(value.school) || typeof value.school.name !== "string" || !value.school.name.trim()) return "Դպրոցի անունը բացակայում է։";
  if (typeof value.school.timezone !== "string" || !isValidTimezone(value.school.timezone)) return "Դպրոցի ժամային գոտին անվավեր է։";
  if (!Array.isArray(value.classes) || !Array.isArray(value.timeSlots) || !Array.isArray(value.subjects) || !Array.isArray(value.teachers) || !Array.isArray(value.lessons)) return "Տվյալների ցանկերից մեկը բացակայում է։";
  if (![value.classes, value.timeSlots, value.subjects, value.teachers, value.lessons].every(hasUniquePositiveIds)) return "Տվյալներում կան անվավեր կամ կրկնվող ID-ներ։";

  const classNames = new Set<string>();
  for (const item of value.classes) {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim()) return "Դասարանի անունն անվավեր է։";
    const name = normalized(item.name);
    if (classNames.has(name)) return "Դասարանների անունները չեն կարող կրկնվել։";
    classNames.add(name);
  }

  const slots = value.timeSlots as unknown as TimeSlot[];
  for (const item of slots) {
    if (!isRecord(item) || item.schoolId !== 1 || typeof item.start !== "string" || typeof item.end !== "string") return "Դասաժամի կառուցվածքն անվավեր է։";
    const error = validateTimeSlot(item, slots, 1, Number(item.id));
    if (error) return `Դասաժամն անվավեր է․ ${error}`;
  }

  const subjectNames = new Set<string>();
  for (const item of value.subjects) {
    if (!isRecord(item) || item.schoolId !== 1 || typeof item.name !== "string" || !item.name.trim() || !isValidColor(item.color)) return "Առարկաներից մեկի կառուցվածքը կամ գույնն անվավեր է։";
    const name = normalized(item.name);
    if (subjectNames.has(name)) return "Առարկաների անունները չեն կարող կրկնվել։";
    subjectNames.add(name);
  }
  for (const item of value.teachers) if (!isRecord(item) || item.schoolId !== 1 || typeof item.name !== "string" || !item.name.trim()) return "Դասատուներից մեկի կառուցվածքն անվավեր է։";

  const classIds = new Set((value.classes as Record<string, unknown>[]).map((item) => item.id));
  const slotIds = new Set((value.timeSlots as Record<string, unknown>[]).map((item) => item.id));
  const subjectIds = new Set((value.subjects as Record<string, unknown>[]).map((item) => item.id));
  const teacherIds = new Set((value.teachers as Record<string, unknown>[]).map((item) => item.id));
  const cells = new Set<string>();
  for (const item of value.lessons as unknown[]) {
    if (!isRecord(item) || !classIds.has(item.classId) || !slotIds.has(item.timeSlotId) || !subjectIds.has(item.subjectId) || (item.teacherId !== null && !teacherIds.has(item.teacherId)) || !Number.isInteger(item.weekday) || Number(item.weekday) < 1 || Number(item.weekday) > 6 || typeof item.comment !== "string") return "Դասերից մեկի կառուցվածքը կամ կապերն անվավեր են։";
    const cell = `${item.classId}:${item.weekday}:${item.timeSlotId}`;
    if (cells.has(cell)) return "Նույն վանդակում մեկից ավելի դաս կա։";
    cells.add(cell);
  }
  if (findScheduleConflicts(value.lessons as Lesson[]).length) return "Նույն դասատուն նույն օրը և դասաժամին նշանակված է մի քանի դասարանում։";
  if (value.lastSelectedClassId !== null && (!Number.isInteger(value.lastSelectedClassId) || !classIds.has(value.lastSelectedClassId))) return "Վերջին ընտրված դասարանը գոյություն չունի։";
  return null;
}
