export interface SchoolClass { id: number; name: string; }
export interface TimeSlot { id: number; schoolId: number; start: string; end: string; }
export interface Subject { id: number; schoolId: number; name: string; color: string; }
export interface Teacher { id: number; schoolId: number; name: string; }
export interface Lesson { id: number; classId: number; weekday: number; timeSlotId: number; subjectId: number; teacherId: number | null; comment: string; }

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function nextId(items: ReadonlyArray<{ id: number }>): number {
  return items.reduce((maximum, item) => Math.max(maximum, item.id), 0) + 1;
}

export function sortTimeSlots(timeSlots: readonly TimeSlot[]): TimeSlot[] {
  return [...timeSlots].sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
}

export function validateTimeSlot(candidate: Pick<TimeSlot, "start" | "end">, timeSlots: readonly TimeSlot[], schoolId: number, excludedId?: number): string | null {
  if (!TIME_PATTERN.test(candidate.start) || !TIME_PATTERN.test(candidate.end)) return "Մուտքագրեք սկիզբն ու ավարտը HH:MM ձևաչափով։";
  if (candidate.start >= candidate.end) return "Դասաժամի սկիզբը պետք է ավարտից շուտ լինի։";
  const overlaps = timeSlots.some((slot) => slot.schoolId === schoolId && slot.id !== excludedId && candidate.start < slot.end && slot.start < candidate.end);
  return overlaps ? "Դասաժամը համընկնում է գոյություն ունեցող դասաժամի հետ։" : null;
}

export function isTimeSlotUsed(timeSlotId: number, lessons: readonly Lesson[]): boolean {
  return lessons.some((lesson) => lesson.timeSlotId === timeSlotId);
}

export function removeClassDraft(
  classId: number,
  classes: readonly SchoolClass[],
  lessons: readonly Lesson[],
): { classes: SchoolClass[]; lessons: Lesson[]; nextSelectedClassId: number | null } {
  const index = classes.findIndex((item) => item.id === classId);
  if (index < 0) return { classes: [...classes], lessons: [...lessons], nextSelectedClassId: classes[0]?.id ?? null };
  const remainingClasses = classes.filter((item) => item.id !== classId);
  return {
    classes: remainingClasses,
    lessons: lessons.filter((lesson) => lesson.classId !== classId),
    nextSelectedClassId: remainingClasses[index]?.id ?? remainingClasses[index - 1]?.id ?? null,
  };
}
