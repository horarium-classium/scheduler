import { SCHEMA_VERSION, validateState, type TeacherState } from "./state.ts";

export const tables = ["classes", "time_slots", "subjects", "teachers", "lessons"] as const;
type Table = typeof tables[number];
type Row = Record<string, unknown> & { id: string };
export interface PublicationStatus { class_id: string; public_id: string; join_code?: string; revision: number | null; published_at: string | null; is_current: boolean; }
export interface WorkspaceSnapshot { version: string; data: { school: Row } & Record<Table, Row[]>; publications?: PublicationStatus[]; }
export type PublicationState = "unavailable" | "unpublished" | "published" | "changed";

// Compare only this class and its referenced directory entries. Other classes,
// unused slots/subjects and UI selection must not mark a publication as changed.
export function classDraftSignature(state: TeacherState, classId: number): string {
  return JSON.stringify({ school: state.school, name: state.classes.find(c => c.id === classId)?.name,
    lessons: state.lessons.filter(l => l.classId === classId).map(l => {
      const slot = state.timeSlots.find(s => s.id === l.timeSlotId);
      const subject = state.subjects.find(s => s.id === l.subjectId);
      const teacher = state.teachers.find(t => t.id === l.teacherId);
      return { weekday: l.weekday, start: slot?.start, end: slot?.end, subjectId: l.subjectId,
        lesson: subject?.name, color: subject?.color, teacherId: l.teacherId,
        teacherName: teacher?.name ?? null, comment: l.comment };
    }).sort((a,b) => a.weekday - b.weekday || (a.start ?? "").localeCompare(b.start ?? "")) });
}
export interface Change { table: Table | "schools"; op: "insert" | "update" | "delete"; row: Record<string, unknown>; }
export interface WorkspaceTransport {
  read(): Promise<unknown>;
  save(version: string, changes: Change[]): Promise<unknown>;
  publish?(classId: string, version: string): Promise<unknown>;
}
const fields: Record<Table, string[]> = {
  classes: ["name", "sort_order"], time_slots: ["start_time", "end_time", "sort_order"],
  subjects: ["name", "color"], teachers: ["name"],
  lessons: ["class_id", "weekday", "time_slot_id", "subject_id", "teacher_id", "comment"],
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
const joinCodePattern = /^[A-HJ-NP-RT-Z]{4}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseSnapshot(value: unknown, schoolId: string): WorkspaceSnapshot {
  if (!record(value) || typeof value.version !== "string" || !record(value.data) || !record(value.data.school) || value.data.school.id !== schoolId) throw new Error("Դպրոցի տվյալները հասանելի չեն։");
  for (const table of tables) {
    const rows = value.data[table];
    if (!Array.isArray(rows)) throw new Error("Սերվերի տվյալների ձևաչափը սխալ է։");
    const ids = new Set<string>();
    for (const row of rows) {
      if (!record(row) || typeof row.id !== "string" || !uuid.test(row.id) || ids.has(row.id) || row.school_id !== schoolId) throw new Error("Սերվերի տվյալների կապերն անվավեր են։");
      ids.add(row.id);
    }
  }
  const codes = new Set<string>();
  for (const row of value.data.classes as Row[]) {
    if (row.join_code === undefined) continue; // Older workspace responses.
    if (typeof row.join_code !== "string" || !joinCodePattern.test(row.join_code) || codes.has(row.join_code)) throw new Error("Դասարանի կոդն անվավեր է։");
    codes.add(row.join_code);
  }
  if (value.publications !== undefined) {
    const classes = value.data.classes as Row[];
    if (!Array.isArray(value.publications) || value.publications.length !== classes.length) throw new Error("Հրապարակման կարգավիճակներն անվավեր են։");
    const seen = new Set<string>();
    for (const item of value.publications) {
      if (!record(item) || typeof item.class_id !== "string" || seen.has(item.class_id) ||
        !classes.some((row: Row) => row.id === item.class_id && row.public_id === item.public_id) ||
        typeof item.public_id !== "string" || !uuid.test(item.public_id) ||
        (item.join_code !== undefined && (typeof item.join_code !== "string" || !joinCodePattern.test(item.join_code))) ||
        typeof item.is_current !== "boolean" ||
        (item.revision === null ? item.published_at !== null || item.is_current :
          !Number.isSafeInteger(item.revision) || Number(item.revision) < 1 || typeof item.published_at !== "string" || !Number.isFinite(Date.parse(item.published_at)))) {
        throw new Error("Հրապարակման կարգավիճակներն անվավեր են։");
      }
      const row = classes.find(row => row.id === item.class_id)!;
      if (row.join_code !== undefined && item.join_code !== undefined && row.join_code !== item.join_code) throw new Error("Դասարանի կոդերը չեն համընկնում։");
      seen.add(item.class_id);
    }
  }
  return value as unknown as WorkspaceSnapshot;
}
export function cloudError(error: unknown): string {
  const code = record(error) ? error.code : undefined;
  if (code === "40001") return "Դասացուցակը փոխվել է այլ ներդիրում կամ սարքում։ Ներբեռնեք ձեր սևագիրը և բեռնեք սերվերի նոր տարբերակը։";
  if (code === "22023") return "Դասարանը հասանելի չէ հրապարակման համար։ Բեռնեք սերվերի նոր տարբերակը։";
  if (code === "42501") return "Այս փոփոխության համար իրավունք չունեք, կամ դպրոցի անդամակցությունը փոխվել է։";
  if (["23001", "23503", "23505", "23514", "23P01"].includes(String(code))) return "Սերվերը մերժեց փոփոխությունը․ ստուգեք կրկնվող անունները, ժամերը և դասերի կապերը։";
  return error instanceof Error ? error.message : "Ամպային պահպանումը չհաջողվեց։ Ստուգեք կապը և կրկին փորձեք։";
}

export class CloudWorkspace {
  readonly schoolId: string;
  private snapshot: WorkspaceSnapshot;
  private acknowledged = new Map<number, string>();
  private ids: Record<Table, Map<number, string>> = Object.fromEntries(tables.map(t => [t, new Map()])) as Record<Table, Map<number, string>>;
  private transport: WorkspaceTransport;
  constructor(schoolId: string, snapshot: unknown, transport: WorkspaceTransport) {
    this.schoolId = schoolId; this.snapshot = parseSnapshot(snapshot, schoolId); this.transport = transport;
  }
  decode(): TeacherState {
    const data = this.snapshot.data;
    for (const table of tables) {
      this.ids[table].clear();
      const ordered = [...data[table]].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || a.id.localeCompare(b.id));
      ordered.forEach((row, index) => this.ids[table].set(index + 1, row.id));
    }
    const local = (table: Table, id: unknown): number => {
      for (const [number, remote] of this.ids[table]) if (remote === id) return number;
      throw new Error("Դասացուցակի կապերից մեկը բացակայում է։");
    };
    const state: TeacherState = {
      schemaVersion: SCHEMA_VERSION,
      school: { name: data.school.name as string, timezone: data.school.timezone as string },
      classes: data.classes.map(r => ({ id: local("classes", r.id), name: r.name as string })).sort((a,b) => a.id-b.id),
      timeSlots: data.time_slots.map(r => ({ id: local("time_slots", r.id), schoolId: 1, start: this.time(r.start_time), end: this.time(r.end_time) })),
      subjects: data.subjects.map(r => ({ id: local("subjects", r.id), schoolId: 1, name: r.name as string, color: r.color as string })),
      teachers: data.teachers.map(r => ({ id: local("teachers", r.id), schoolId: 1, name: r.name as string })),
      lessons: data.lessons.map(r => ({ id: local("lessons", r.id), classId: local("classes", r.class_id), weekday: r.weekday as number, timeSlotId: local("time_slots", r.time_slot_id), subjectId: local("subjects", r.subject_id), teacherId: r.teacher_id === null ? null : local("teachers", r.teacher_id), comment: r.comment as string })),
      lastSelectedClassId: null,
    };
    state.lastSelectedClassId = state.classes[0]?.id ?? null;
    const error = validateState(state); if (error) throw new Error(error);
    this.remember(state);
    return state;
  }
  private remember(state: TeacherState): void {
    this.acknowledged = new Map(state.classes.map(c => [c.id, classDraftSignature(state, c.id)]));
  }
  get publicationAvailable(): boolean { return this.snapshot.publications !== undefined && !!this.transport.publish; }
  publication(classId: number): PublicationStatus | undefined {
    return this.snapshot.publications?.find(p => p.class_id === this.ids.classes.get(classId));
  }
  joinCode(classId: number): string | undefined {
    const remoteId = this.ids.classes.get(classId);
    const row = this.snapshot.data.classes.find(item => item.id === remoteId);
    return typeof row?.join_code === "string" ? row.join_code : this.publication(classId)?.join_code;
  }
  publicationState(state: TeacherState, classId: number): PublicationState {
    if (!this.publicationAvailable) return "unavailable";
    const published = this.publication(classId);
    if (!published?.revision) return "unpublished";
    return published.is_current && this.acknowledged.get(classId) === classDraftSignature(state, classId) ? "published" : "changed";
  }
  async publish(classId: number, state: TeacherState): Promise<void> {
    if (!this.publicationAvailable) throw new Error("Հրապարակման backend-ը դեռ միացված չէ։");
    if (this.changes(state).length) throw new Error("Նախ սպասեք սևագրի պահպանմանը։");
    const remoteId = this.ids.classes.get(classId);
    if (!remoteId || !state.classes.some(c => c.id === classId)) throw new Error("Դասարանը չի գտնվել։");
    const result = await this.transport.publish!(remoteId, this.snapshot.version);
    if (!record(result) || !Number.isSafeInteger(result.revision) || Number(result.revision) < 1 ||
      typeof result.publishedAt !== "string" || !Number.isFinite(Date.parse(result.publishedAt))) throw new Error("Հրապարակման պատասխանը սխալ է։ Բեռնեք սերվերի նոր տարբերակը։");
    const next = parseSnapshot(result.workspace, this.schoolId);
    const published = next.publications?.find(p => p.class_id === remoteId);
    if (!published?.is_current || published.revision !== result.revision || published.published_at !== result.publishedAt || next.version !== this.snapshot.version) {
      throw new Error("Հրապարակման հաստատումը բացակայում է։ Բեռնեք սերվերի նոր տարբերակը։");
    }
    this.snapshot = next;
    this.remember(state);
  }
  private time(value: unknown): string {
    if (typeof value !== "string" || !/^\d{2}:\d{2}:00$/.test(value)) throw new Error("Սերվերի դասաժամի ձևաչափը սխալ է։");
    return value.slice(0, 5);
  }
  private remote(table: Table, id: number): string {
    let value = this.ids[table].get(id);
    if (!value) { value = crypto.randomUUID(); this.ids[table].set(id, value); }
    return value;
  }
  changes(state: TeacherState): Change[] {
    const error = validateState(state); if (error) throw new Error(error);
    const order = (table: "classes" | "time_slots", id: number): number => {
      const remote = this.remote(table, id);
      return (this.snapshot.data[table].find(row => row.id === remote)?.sort_order as number | undefined) ??
        Math.max(0, ...this.snapshot.data[table].map(row => Number(row.sort_order))) + id;
    };
    const desired: Record<Table, Row[]> = {
      classes: state.classes.map(r => ({ id: this.remote("classes", r.id), name: r.name, sort_order: order("classes", r.id) })),
      time_slots: state.timeSlots.map(r => ({ id: this.remote("time_slots", r.id), start_time: r.start + ":00", end_time: r.end + ":00", sort_order: order("time_slots", r.id) })),
      subjects: state.subjects.map(r => ({ id: this.remote("subjects", r.id), name: r.name, color: r.color })),
      teachers: state.teachers.map(r => ({ id: this.remote("teachers", r.id), name: r.name })),
      lessons: state.lessons.map(r => ({ id: this.remote("lessons", r.id), class_id: this.remote("classes", r.classId), weekday: r.weekday, time_slot_id: this.remote("time_slots", r.timeSlotId), subject_id: this.remote("subjects", r.subjectId), teacher_id: r.teacherId === null ? null : this.remote("teachers", r.teacherId), comment: r.comment })),
    };
    const removed: Change[] = [], edited: Change[] = [];
    if (state.school.name !== this.snapshot.data.school.name || state.school.timezone !== this.snapshot.data.school.timezone) edited.push({ table: "schools", op: "update", row: { id: this.schoolId, ...state.school } });
    for (const table of tables) {
      const before = new Map(this.snapshot.data[table].map(r => [r.id, r]));
      const after = new Set(desired[table].map(r => r.id));
      for (const row of desired[table]) {
        const old = before.get(row.id);
        if (!old || fields[table].some(f => row[f] !== old[f])) edited.push({ table, op: old ? "update" : "insert", row });
      }
      for (const old of before.values()) if (!after.has(old.id)) removed.push({ table, op: "delete", row: { id: old.id } });
    }
    return [...removed.filter(r => r.table === "lessons"), ...edited, ...removed.filter(r => r.table !== "lessons")];
  }
  async save(state: TeacherState): Promise<void> {
    const changes = this.changes(state);
    if (!changes.length) return;
    this.snapshot = parseSnapshot(await this.transport.save(this.snapshot.version, changes), this.schoolId);
    this.remember(state);
    // Retire removed IDs only after acknowledgement. Failed requests retain stable retry IDs.
    for (const table of tables) {
      const existing = new Set(this.snapshot.data[table].map(r => r.id));
      for (const [id, value] of this.ids[table]) if (!existing.has(value)) this.ids[table].delete(id);
    }
  }
  async reload(): Promise<TeacherState> {
    this.snapshot = parseSnapshot(await this.transport.read(), this.schoolId);
    return this.decode();
  }
}

// Only one save in flight. Later edits coalesce, and failures keep the newest draft.
export class SaveQueue {
  pending: TeacherState | null = null;
  busy = false;
  error = "";
  private disposed = false;
  private save: (state: TeacherState) => Promise<void>;
  private notify: () => void;
  constructor(save: (state: TeacherState) => Promise<void>, notify: () => void) { this.save = save; this.notify = notify; }
  get dirty(): boolean { return this.busy || this.pending !== null; }
  submit(state: TeacherState): void { this.pending = structuredClone(state); if (!this.error) void this.drain(); this.notify(); }
  retry(): void { this.error = ""; void this.drain(); }
  dispose(): void { this.disposed = true; this.pending = null; }
  private async drain(): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true; this.notify();
    while (this.pending && !this.disposed) {
      const next = this.pending; this.pending = null;
      try { await this.save(next); }
      catch (error) { this.pending ??= next; this.error = cloudError(error); break; }
    }
    this.busy = false;
    if (!this.disposed) this.notify();
  }
}
