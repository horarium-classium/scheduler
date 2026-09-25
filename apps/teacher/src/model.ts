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

export function validateSubjectName(name: string, subjects: readonly Pick<Subject, "id" | "name">[], excludedId?: number): string | null {
  const normalized = name.trim().toLocaleLowerCase("hy");
  if (!normalized) return "Առարկայի անունը պարտադիր է։";
  return subjects.some((subject) => subject.id !== excludedId && subject.name.trim().toLocaleLowerCase("hy") === normalized)
    ? "Այս անունով առարկա արդեն կա։"
    : null;
}

export function isSubjectUsed(subjectId: number, lessons: readonly Lesson[]): boolean {
  return lessons.some((lesson) => lesson.subjectId === subjectId);
}

export function validateTeacherName(name: string): string | null {
  return name.trim() ? null : "Դասատուի անունը պարտադիր է։";
}

export function hasDuplicateTeacherName(name: string, teachers: readonly Pick<Teacher, "id" | "name">[], excludedId?: number): boolean {
  const normalized = name.trim().toLocaleLowerCase("hy");
  return teachers.some((teacher) => teacher.id !== excludedId && teacher.name.trim().toLocaleLowerCase("hy") === normalized);
}

export function isTeacherUsed(teacherId: number, lessons: readonly Lesson[]): boolean {
  return lessons.some((lesson) => lesson.teacherId === teacherId);
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

export interface LessonConflict {
  kind: "cell" | "teacher";
  lesson: Lesson;
}

// Compare stable entity IDs, never names or formatted times. Exclude the edited lesson.
export function findLessonConflict(candidate: Lesson, lessons: readonly Lesson[]): LessonConflict | null {
  for (const lesson of lessons) {
    if (lesson.id === candidate.id || lesson.weekday !== candidate.weekday || lesson.timeSlotId !== candidate.timeSlotId) continue;
    if (lesson.classId === candidate.classId) return { kind: "cell", lesson };
    if (candidate.teacherId !== null && lesson.teacherId === candidate.teacherId) return { kind: "teacher", lesson };
  }
  return null;
}

export function findScheduleConflicts(lessons: readonly Lesson[]): LessonConflict[] {
  return lessons.flatMap((lesson, index) => {
    const conflict = findLessonConflict(lesson, lessons.slice(0, index));
    return conflict ? [conflict] : [];
  });
}
