import "./style.css";
import { copyClassCode } from "./class-code";
import { findLessonConflict, hasDuplicateTeacherName, isSubjectUsed, isTeacherUsed, isTimeSlotUsed, removeClassDraft, sortTimeSlots, validateSubjectName, validateTeacherName, validateTimeSlot, type SchoolClass, type Subject, type Teacher, type TimeSlot } from "./model";
import { isValidTimezone, type TeacherState } from "./state";
import { CloudWorkspace, SaveQueue, cloudError } from "./cloud-workspace";



export function mountEditor(workspace: CloudWorkspace, initial: TeacherState, role: "admin" | "scheduler"): () => void {
const controller = new AbortController();
interface Weekday { id: number; name: string; shortName: string; }
type Page = "workspace" | "settings";
interface SubjectEditorState {
  mode: "create" | "edit";
  subjectId: number | null;
  initialName: string;
  initialColor: string;
  name: string;
  color: string;
  returnFocusSelector: string;
}
interface TeacherEditorState {
  mode: "create" | "edit";
  teacherId: number | null;
  initialName: string;
  name: string;
  returnFocusSelector: string;
}
interface SlotEditorState {
  mode: "create" | "edit";
  slotId: number | null;
  initialStart: string;
  initialEnd: string;
  start: string;
  end: string;
  returnFocusSelector: string;
}
const SCHOOL_ID = 1;
const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#ffedd5"];
const weekdays: Weekday[] = [
  { id: 1, name: "Երկուշաբթի", shortName: "Երկ" }, 
  { id: 2, name: "Երեքշաբթի", shortName: "Երք" },
  { id: 3, name: "Չորեքշաբթի", shortName: "Չրք" }, 
  { id: 4, name: "Հինգշաբթի", shortName: "Հնգ" },
  { id: 5, name: "Ուրբաթ", shortName: "Ուրբ" }, 
  { id: 6, name: "Շաբաթ", shortName: "Շբ" },
];

const app = document.querySelector<HTMLDivElement>("#app");
let state = initial;
let highWaterId = Math.max(0, ...[...state.classes, ...state.timeSlots, ...state.subjects, ...state.teachers, ...state.lessons].map(row => row.id));
function nextId(items: ReadonlyArray<{ id: number }>): number {
  highWaterId = Math.max(highWaterId, ...items.map(row => row.id)) + 1;
  return highWaterId;
}
let disposed = false;
let publishing = false;
let publicationMessage = "";
const queue = new SaveQueue(value => workspace.save(value), updateSyncStatus);
function updateSyncStatus(): void {
  if (disposed) return;
  dirty = queue.dirty;
  const label = queue.error || (dirty ? "Պահպանում ենք ամպում…" : "Պահպանված է ամպում");
  updateClassCode();
  updatePublicationStatus();
  app?.querySelectorAll(".save-status").forEach(el => { el.textContent = queue.error ? "Չպահպանված փոփոխություններ" : label; el.classList.toggle("status-warning", dirty); });
}
let page: Page = "workspace";
let dirty = false;
let subjectEditor: SubjectEditorState | null = null;
let teacherEditor: TeacherEditorState | null = null;
let slotEditor: SlotEditorState | null = null;

let pendingCell: { classId: number; weekdayId: number; timeSlotId: number } | null = null;

function selectedClass(): SchoolClass | undefined {
  return state.classes.find((item) => item.id === state.lastSelectedClassId);
}

function normalizeSelection(): void {
  if (!selectedClass()) state.lastSelectedClassId = state.classes[0]?.id ?? null;
}

function persist(): void {
  queue.submit(state); // Only the acknowledgement updates the saved indicator.
}

function commit(render = true): void {
  persist();
  if (render) renderApp();
}

function renderApp(): void {
  if (!app) return;
  normalizeSelection();
  if (page === "settings") renderSettings();
  else renderWorkspace();
}

function publicationLabel(classId: number): string {
  const labels = { unavailable: "Հրապարակման վիճակը հասանելի չէ", unpublished: "Դեռ չի հրապարակվել",
    published: "Հրապարակված է", changed: "Չհրապարակված փոփոխություններ" };
  return labels[workspace.publicationState(state, classId)];
}
function updatePublicationStatus(): void {
  const active = selectedClass();
  const label = app?.querySelector<HTMLElement>(".publish-status");
  if (label) {
    label.textContent = active ? publicationLabel(active.id) : "Դասարան ընտրված չէ";
    const publication = active && workspace.publication(active.id);
    label.title = publication?.revision ? `Տարբերակ ${publication.revision} · ${new Date(publication.published_at!).toLocaleString("hy-AM")}` : "";
  }
  const button = app?.querySelector<HTMLButtonElement>(".publish-button");
  if (button) {
    button.disabled = publishing || queue.dirty || !!queue.error || !active || !workspace.publicationAvailable;
    button.textContent = publishing ? "Հրապարակում ենք…" : "Հրապարակել";
    button.title = !workspace.publicationAvailable ? "Հրապարակման backend-ը դեռ միացված չէ" : queue.dirty || queue.error ? "Նախ սպասեք սևագրի պահպանմանը" : "Հրապարակել միայն ընտրված դասարանը";
  }
  app?.querySelectorAll<HTMLElement>(".class-state[data-class-id]").forEach(el => {
    const id = Number(el.dataset.classId);
    el.textContent = `${state.lessons.some(l => l.classId === id) ? "" : "Դատարկ · "}${publicationLabel(id)}`;
  });
}
async function publishSelectedClass(): Promise<void> {
  const active = selectedClass();
  if (!active || publishing || queue.dirty || queue.error || !workspace.publicationAvailable) return;
  if (!state.lessons.some(l => l.classId === active.id) && !confirm("Հրապարակե՞լ դատարկ դասացուցակը։ Այն կփոխարինի այս դասարանի նախկին հրապարակմանը։")) return;
  publishing = true; publicationMessage = ""; updatePublicationStatus();
  if (app) app.inert = true;
  try {
    await workspace.publish(active.id, state);
    if (!disposed) publicationMessage = `«${active.name}» դասարանի հրապարակումը հաստատված է։`;
  } catch (error) {
    if (!disposed) publicationMessage = `Հրապարակումը չի հաստատվել։ ${cloudError(error)}`;
  } finally {
    publishing = false;
    if (!disposed) { if (app) app.inert = false; renderApp(); updateSyncStatus(); }
  }
}
function statusMarkup(): string {
  const saveLabel = queue.error ? "Չպահպանված փոփոխություններ" : dirty ? "Պահպանում ենք ամպում…" : "Պահպանված է ամպում";
  return `<div class="workspace-status"><span class="save-status ${dirty ? "status-warning" : ""}">${saveLabel}</span><span class="publish-status">${selectedClass() ? publicationLabel(selectedClass()!.id) : "Դասարան ընտրված չէ"}</span></div>`;
}

function escapeToolbarText(value: string): string {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
function renderToolbar(title: string): string {
  const codeMarkup = selectedClass() ? `<span class="class-code" hidden><span class="class-code-value"></span><button class="copy-class-code icon-button" type="button" aria-label="Պատճենել դասարանի կոդը" title="Պատճենել դասարանի կոդը">⧉</button></span>` : "";
  return `<header class="workspace-toolbar"><div class="school-heading"><strong id="school-name"></strong><span>${escapeToolbarText(title)}${codeMarkup}</span></div>${statusMarkup()}<div class="toolbar-actions"><button id="settings-button" class="secondary-button" type="button">Կարգավորումներ</button><button class="publish-button" type="button" disabled title="Հրապարակման backend-ը դեռ միացված չէ">Հրապարակել</button></div></header>`;
}

function updateClassCode(): void {
  const active = selectedClass();
  const container = app?.querySelector<HTMLElement>(".class-code");
  if (!container) return;
  const code = active ? workspace.joinCode(active.id) : undefined;
  const value = container.querySelector(".class-code-value");
  if (value) value.textContent = code ?? "";
  container.hidden = !code;
}

function wireToolbar(): void {
  updateClassCode();
  document.querySelector(".copy-class-code")?.addEventListener("click", async () => {
    const active = selectedClass();
    if (!active) return;
    const message = await copyClassCode(workspace.publication(active.id), workspace.joinCode(active.id), text => navigator.clipboard.writeText(text));
    if (disposed || selectedClass()?.id !== active.id) return;
    publicationMessage = message;
    const notices = document.querySelector("#notices");
    if (notices) { notices.replaceChildren(); renderNotices(notices); }
  });
  document.querySelector(".publish-button")?.addEventListener("click", () => void publishSelectedClass());
  updatePublicationStatus();
  const schoolName = document.querySelector("#school-name"); if (schoolName) schoolName.textContent = state.school.name;
  document.querySelector("#settings-button")?.addEventListener("click", () => { page = "settings"; renderApp(); });
}

function renderNotices(container: Element): void {
  if (publicationMessage) { const message = document.createElement("p"); message.setAttribute("role", "status"); message.textContent = publicationMessage; container.append(message); }
}

function renderWorkspace(): void {
  if (!app) return;
  const active = selectedClass();
  app.innerHTML = `<main class="workspace-page">${renderToolbar(active ? `${active.name} դասարան` : "Դասարան ընտրված չէ")}<div class="workspace-layout"><aside class="class-sidebar"><div class="sidebar-heading"><h2>Դասարաններ</h2><button id="add-class" class="icon-button" type="button" aria-label="Ավելացնել դասարան" title="Ավելացնել դասարան">+</button></div><div id="class-switcher" class="class-switcher"></div><div id="class-actions" class="class-actions"></div></aside><section class="workspace-content"><div id="schedule-container"></div><div id="notices"></div></section></div></main>`;
  wireToolbar(); const notices = document.querySelector("#notices"); if (notices) renderNotices(notices);
  renderClassSwitcher();
  document.querySelector("#add-class")?.addEventListener("click", addClass);
  const container = document.querySelector("#schedule-container");
  if (active && container) renderWeekTable(active.id, container, true);
  else if (container) container.innerHTML = `<div class="empty-workspace"><h2>Դասարաններ չկան</h2><p>Սկսելու համար ավելացրեք առաջին դասարանը։</p><button id="empty-add-class" class="primary-button" type="button">Ավելացնել դասարան</button></div>`;
  document.querySelector("#empty-add-class")?.addEventListener("click", addClass);
}

function renderClassSwitcher(): void {
  const list = document.querySelector("#class-switcher"); const actions = document.querySelector("#class-actions"); if (!list || !actions) return;
  for (const schoolClass of state.classes) {
    const button = document.createElement("button"); button.type = "button"; button.className = "class-switch-button";
    const count = state.lessons.filter((lesson) => lesson.classId === schoolClass.id).length;
    button.innerHTML = `<span class="class-name"></span><span class="class-state" data-class-id="${schoolClass.id}">${count ? "" : "Դատարկ · "}${publicationLabel(schoolClass.id)}</span>`;
    const name = button.querySelector(".class-name"); if (name) name.textContent = schoolClass.name;
    if (schoolClass.id === state.lastSelectedClassId) { button.classList.add("selected"); button.setAttribute("aria-current", "true"); button.setAttribute("aria-label", `${schoolClass.name}, ընտրված դասարան`); }
    button.addEventListener("click", () => { state.lastSelectedClassId = schoolClass.id; commit(); }); list.append(button);
  }
  if (selectedClass()) {
    actions.innerHTML = `<button id="rename-class" class="sidebar-action" type="button">Վերանվանել</button><button id="delete-class" class="sidebar-action danger-text" type="button">Ջնջել</button>`;
    document.querySelector("#rename-class")?.addEventListener("click", renameClass);
    document.querySelector("#delete-class")?.addEventListener("click", deleteClass);
  }
}

function normalizedClassName(value: string): string { return value.trim().toLocaleLowerCase("hy"); }
function requestClassName(promptText: string, current = "", excludedId?: number): string | null {
  const value = prompt(promptText, current); if (value === null) return null; const name = value.trim();
  if (!name) { alert("Դասարանի անունը չի կարող դատարկ լինել։"); return null; }
  if (state.classes.some((item) => item.id !== excludedId && normalizedClassName(item.name) === normalizedClassName(name))) { alert(`«${name}» դասարանն արդեն գոյություն ունի։`); return null; }
  return name;
}
function addClass(): void { const name = requestClassName("Մուտքագրեք դասարանի անունը:"); if (!name) return; const item = { id: nextId(state.classes), name }; state.classes.push(item); state.lastSelectedClassId = item.id; commit(); }
function renameClass(): void { const item = selectedClass(); if (!item) return; const name = requestClassName("Դասարանի նոր անունը:", item.name, item.id); if (!name) return; item.name = name; commit(); }
function deleteClass(): void {
  const item = selectedClass(); if (!item) return;
  if (workspace.publication(item.id)?.revision) { alert("Հրապարակում ունեցող դասարանը չի կարելի ջնջել։"); return; }
  const lessonCount = state.lessons.filter((lesson) => lesson.classId === item.id).length;
  if (!confirm(`Ջնջե՞լ «${item.name}» դասարանը և դրա ${lessonCount} դաս${lessonCount === 1 ? "ը" : "երը"}։ Մյուս դասարաններն ու դպրոցի դասաժամերը չեն փոխվի։`)) return;
  const result = removeClassDraft(item.id, state.classes, state.lessons); state.classes = result.classes; state.lessons = result.lessons; state.lastSelectedClassId = result.nextSelectedClassId; commit();
}

function renderWeekTable(classId: number, container: Element, editable: boolean): void {
  const schoolSlots = sortTimeSlots(state.timeSlots.filter((slot) => slot.schoolId === SCHOOL_ID));
  container.innerHTML = `<div class="schedule-panel"><div class="schedule-table-wrapper"><table class="week-table"><thead><tr><th class="time-column">Ժամը</th>${weekdays.map((day) => `<th title="${day.name}" aria-label="${day.name}">${day.shortName}</th>`).join("")}</tr></thead><tbody></tbody></table></div></div>`;
  const body = container.querySelector("tbody"); if (!body) return;
  if (!schoolSlots.length) { const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 7; cell.className = "empty-schedule"; cell.textContent = "Դասաժամեր չկան։ Ավելացրեք դրանք կարգավորումներից։"; return; }
  for (const slot of schoolSlots) {
    const row = document.createElement("tr"); const timeCell = document.createElement("th"); timeCell.scope = "row"; timeCell.className = "time-cell"; timeCell.textContent = `${slot.start}–${slot.end}`; row.append(timeCell);
    for (const day of weekdays) {
      const cell = document.createElement("td"); const lesson = state.lessons.find((item) => item.classId === classId && item.weekday === day.id && item.timeSlotId === slot.id);
      const subjectData = lesson ? state.subjects.find((item) => item.id === lesson.subjectId) : undefined;
      const element = document.createElement(editable ? "button" : "div"); element.className = `schedule-cell ${lesson ? "has-lesson" : "empty-cell"}`;
      if (element instanceof HTMLButtonElement) { element.type = "button"; element.dataset.weekday = String(day.id); element.dataset.timeSlot = String(slot.id); element.setAttribute("aria-label", `${day.name}, ${slot.start}–${slot.end}${subjectData ? `, ${subjectData.name}` : ", դատարկ"}`); element.addEventListener("click", () => openLessonDialog(classId, day.id, slot.id, element)); }
      if (lesson && subjectData) { element.setAttribute("style", `background-color: ${subjectData.color}`); const subject = document.createElement("span"); subject.className = "cell-subject"; subject.textContent = subjectData.name; subject.title = lesson.comment.trim() || subjectData.name; element.append(subject); if (lesson.comment.trim()) { element.title = lesson.comment; const marker = document.createElement("span"); marker.className = "comment-marker"; marker.textContent = "●"; marker.title = lesson.comment; element.append(marker); } }
      else element.textContent = editable ? "+" : "—";
      cell.append(element); row.append(cell);
    }
    body.append(row);
  }
}

function openLessonDialog(classId: number, weekdayId: number, timeSlotId: number, returnFocus: HTMLButtonElement): void {
  const schoolClass = state.classes.find((item) => item.id === classId); const weekday = weekdays.find((item) => item.id === weekdayId); const slot = state.timeSlots.find((item) => item.id === timeSlotId);
  const lesson = state.lessons.find((item) => item.classId === classId && item.weekday === weekdayId && item.timeSlotId === timeSlotId); if (!schoolClass || !weekday || !slot) return;
  const dialog = document.createElement("dialog"); dialog.className = "lesson-dialog"; dialog.innerHTML = `<form method="dialog" class="dialog-form" novalidate><header><h2></h2><button class="dialog-close cancel-dialog" type="button" aria-label="Փակել">×</button></header><div class="no-subjects" hidden><p>Դաս ավելացնելու համար նախ ստեղծեք առարկա։</p><button class="primary-button subject-settings-link" type="button">Ավելացնել առարկա</button></div><label class="subject-field">Առարկա<select name="subject" required></select></label><label>Դասատու<select name="teacher"><option value="">Նշված չէ</option></select></label><label>Մեկնաբանություն<textarea name="comment" rows="3"></textarea></label><p class="form-error" role="alert"></p><footer><button class="danger-button delete-button" type="button" ${lesson ? "" : "hidden"}>Ջնջել</button><span></span><button class="secondary-button cancel-dialog" type="button">Չեղարկել</button><button class="primary-button save-lesson" type="submit">Պահել</button></footer></form>`; document.body.append(dialog);
  const heading = dialog.querySelector("h2"); if (heading) heading.textContent = `${schoolClass.name} — ${weekday.name} ${slot.start}–${slot.end}`;
  let conflictTarget: number | null = null;
  const form = dialog.querySelector<HTMLFormElement>("form"); const subject = dialog.querySelector<HTMLSelectElement>('[name="subject"]'); const teacher = dialog.querySelector<HTMLSelectElement>('[name="teacher"]'); const comment = dialog.querySelector<HTMLTextAreaElement>('[name="comment"]'); const error = dialog.querySelector(".form-error");
  for (const item of state.subjects) { const option = document.createElement("option"); option.value = String(item.id); option.textContent = item.name; option.selected = item.id === lesson?.subjectId; subject?.append(option); }
  for (const item of state.teachers) { const option = document.createElement("option"); option.value = String(item.id); option.textContent = item.name; option.selected = item.id === lesson?.teacherId; teacher?.append(option); }
  if (comment) comment.value = lesson?.comment ?? "";
  if (!state.subjects.length) { dialog.querySelector<HTMLElement>(".no-subjects")!.hidden = false; dialog.querySelector<HTMLElement>(".subject-field")!.hidden = true; dialog.querySelector<HTMLButtonElement>(".save-lesson")!.disabled = true; }
  dialog.querySelector(".subject-settings-link")?.addEventListener("click", () => { pendingCell = { classId, weekdayId, timeSlotId }; dialog.close("settings"); });
  form?.addEventListener("submit", (event) => { event.preventDefault(); const subjectId = Number(subject?.value); const subjectExists = state.subjects.some((item) => item.id === subjectId); if (!subjectExists) { if (error) error.textContent = "Ընտրեք առարկա։"; subject?.focus(); return; } const teacherId = teacher?.value ? Number(teacher.value) : null; if (teacherId !== null && !state.teachers.some((item) => item.id === teacherId)) { if (error) error.textContent = "Ընտրված դասատուն գոյություն չունի։"; return; }
    const candidate = { id: lesson?.id ?? nextId(state.lessons), classId, weekday: weekdayId, timeSlotId, subjectId, teacherId, comment: comment?.value.trim() ?? "" };
    const conflict = findLessonConflict(candidate, state.lessons);
    error?.replaceChildren();
    if (conflict) {
      const other = conflict.lesson;
      const otherClass = state.classes.find((item) => item.id === other.classId);
      const otherSubject = state.subjects.find((item) => item.id === other.subjectId);
      const teacherName = state.teachers.find((item) => item.id === teacherId)?.name ?? "Դասատուն";
      if (error) {
        error.textContent = conflict.kind === "cell" ? "Այս վանդակում արդեն դաս կա։" : `${teacherName}ը այս ժամին արդեն դաս ունի․ ${otherClass?.name} · ${weekday.name} · ${slot.start}–${slot.end} · ${otherSubject?.name}։ Փոփոխությունը չի պահպանվել։`;
        const open = document.createElement("button");
        open.type = "button"; open.className = "secondary-button";
        open.textContent = `Բացել ${otherClass?.name ?? "դասարանը"} (չեղարկել այս փոփոխությունը)`;
        open.addEventListener("click", () => { conflictTarget = other.classId; dialog.close("conflict"); });
        error.append(document.createElement("br"), open);
      }
      return;
    }
 if (lesson) { lesson.subjectId = subjectId; lesson.teacherId = teacherId; lesson.comment = comment?.value.trim() ?? ""; } else state.lessons.push(candidate); persist(); dialog.close("changed"); });
  dialog.querySelector(".delete-button")?.addEventListener("click", () => { if (lesson) state.lessons.splice(state.lessons.indexOf(lesson), 1); persist(); dialog.close("changed"); });
  dialog.querySelectorAll(".cancel-dialog").forEach((button) => button.addEventListener("click", () => dialog.close("cancel")));
  dialog.addEventListener("close", () => { const changed = dialog.returnValue === "changed"; const goToSettings = dialog.returnValue === "settings"; dialog.remove(); if (dialog.returnValue === "conflict" && conflictTarget !== null) { state.lastSelectedClassId = conflictTarget; page = "workspace"; persist(); renderApp(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.schedule-cell[data-weekday="${weekdayId}"][data-time-slot="${timeSlotId}"]`)?.focus()); return; } if (changed) renderWorkspace(); if (goToSettings) { page = "settings"; renderApp(); openSubjectCreator(); return; } requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.schedule-cell[data-weekday="${weekdayId}"][data-time-slot="${timeSlotId}"]`)?.focus() ?? returnFocus.focus()); });
  dialog.showModal(); subject?.focus();
}

function renderSettings(): void {
  if (!app) return;
  app.innerHTML = `<main class="page settings-page"><header class="editor-header settings-header"><button id="back-button" class="back-button" type="button">← Խմբագրիչ</button><div><h1>Կարգավորումներ</h1><p>Ընդհանուր տվյալներ և տեղեկատուներ</p></div><span></span></header><section class="panel school-settings"><div class="panel-header"><h2>Դպրոցի տվյալներ</h2><button id="save-school" class="primary-button" type="button">Պահպանել</button></div><div class="school-form"><label>Դպրոցի անուն<input id="school-name-input" autocomplete="organization"></label><label>Ժամային գոտի<input id="timezone-input" list="timezone-list" autocomplete="off"><datalist id="timezone-list"><option value="Asia/Yerevan"><option value="Europe/Moscow"><option value="Europe/Paris"><option value="America/New_York"></datalist></label></div><p id="school-error" class="form-error" role="alert"></p></section><section class="panel directory-settings"><div class="panel-header"><h2>Առարկաներ</h2><button id="add-subject" class="primary-button" type="button">+ Ավելացնել առարկա</button></div><div id="subject-list" class="directory-list"></div></section><section class="panel directory-settings"><div class="panel-header"><h2>Դասատուներ</h2><button id="add-teacher" class="primary-button" type="button">+ Ավելացնել դասատու</button></div><div id="teacher-list" class="directory-list"></div></section><section class="panel"><div class="panel-header"><h2>Դասաժամեր</h2><button id="add-slot" class="primary-button" type="button">+ Ավելացնել դասաժամ</button></div><div id="slot-list" class="directory-list"></div></section></main>`;
  const schoolInput = document.querySelector<HTMLInputElement>("#school-name-input"); const timezoneInput = document.querySelector<HTMLInputElement>("#timezone-input"); if (schoolInput) schoolInput.value = state.school.name; if (timezoneInput) timezoneInput.value = state.school.timezone;
  document.querySelector("#back-button")?.addEventListener("click", () => { if (!closeSettingsEditor()) return; page = "workspace"; renderApp(); if (pendingCell) { const cell = pendingCell; pendingCell = null; requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.schedule-cell[data-weekday="${cell.weekdayId}"][data-time-slot="${cell.timeSlotId}"]`)?.focus()); } });
  document.querySelector("#save-school")?.addEventListener("click", () => { const name = schoolInput?.value.trim() ?? ""; const timezone = timezoneInput?.value.trim() ?? ""; const error = document.querySelector("#school-error"); if (!name) { if (error) error.textContent = "Դպրոցի անունը պարտադիր է։"; return; } if (!isValidTimezone(timezone)) { if (error) error.textContent = "Մուտքագրեք վավեր IANA ժամային գոտի, օրինակ՝ Asia/Yerevan։"; return; } state.school = { name, timezone }; commit(); });
  document.querySelector("#add-subject")?.addEventListener("click", addSubject); document.querySelector("#add-teacher")?.addEventListener("click", addTeacher);
  document.querySelector("#add-slot")?.addEventListener("click", addSlotEditor); renderSubjects(); renderTeachers(); renderTimeSlots();
  if (role !== "admin") {
    app.querySelectorAll<HTMLInputElement | HTMLButtonElement>(".school-settings input, .school-settings button").forEach(el => { el.disabled = true; });
    const note = document.createElement("p"); note.textContent = "Դպրոցի տվյալները փոփոխում է ադմինիստրատորը։";
    app.querySelector(".school-settings")?.append(note);
  }
}

function settingsEditorChanged(): boolean {
  if (subjectEditor) return subjectEditor.name !== subjectEditor.initialName || subjectEditor.color !== subjectEditor.initialColor;
  if (teacherEditor) return teacherEditor.name !== teacherEditor.initialName;
  if (slotEditor) return slotEditor.start !== slotEditor.initialStart || slotEditor.end !== slotEditor.initialEnd;
  return false;
}
function closeSettingsEditor(force = false): boolean {
  if (!force && settingsEditorChanged() && !confirm("Չպահպանված փոփոխությունները կկորչեն։ Շարունակե՞լ։")) return false;
  subjectEditor = null; teacherEditor = null; slotEditor = null;
  return true;
}
function renderSettingsDirectories(): void { renderSubjects(); renderTeachers(); renderTimeSlots(); }
function focusSettingsEditor(selector: string): void { requestAnimationFrame(() => document.querySelector<HTMLInputElement>(selector)?.focus()); }
function openSubjectEditor(item: Subject): void {
  if (subjectEditor?.mode === "edit" && subjectEditor.subjectId === item.id) return;
  if (!closeSettingsEditor()) return;
  subjectEditor = { mode: "edit", subjectId: item.id, initialName: item.name, initialColor: item.color, name: item.name, color: item.color, returnFocusSelector: `[data-subject-id="${item.id}"]` };
  renderSettingsDirectories(); focusSettingsEditor(".subject-editor-name");
}
function openSubjectCreator(): void {
  if (subjectEditor?.mode === "create") { focusSettingsEditor(".subject-editor-name"); return; }
  if (!closeSettingsEditor()) return;
  subjectEditor = { mode: "create", subjectId: null, initialName: "", initialColor: palette[0]!, name: "", color: palette[0]!, returnFocusSelector: "#add-subject" };
  renderSettingsDirectories(); focusSettingsEditor(".subject-editor-name");
}
function renderSubjects(): void {
  const list = document.querySelector("#subject-list"); if (!list) return; list.replaceChildren();
  list.classList.remove("empty-directory");
  if (subjectEditor?.mode === "create") list.append(createSubjectEditor());
  if (!state.subjects.length && subjectEditor?.mode !== "create") { list.textContent = "Առարկաներ դեռ չկան։"; list.classList.add("empty-directory"); return; }
  for (const item of state.subjects) list.append(subjectEditor?.mode === "edit" && subjectEditor.subjectId === item.id ? createSubjectEditor(item) : createSubjectRow(item));
}
function createSubjectRow(item: Subject): HTMLElement {
  const button = document.createElement("button"); button.type = "button"; button.className = "directory-summary"; button.dataset.subjectId = String(item.id); button.setAttribute("aria-label", `Խմբագրել «${item.name}» առարկան`);
  const swatch = document.createElement("span"); swatch.className = "color-swatch"; swatch.style.backgroundColor = item.color; swatch.setAttribute("aria-hidden", "true");
  const name = document.createElement("span"); name.className = "directory-summary-name"; name.textContent = item.name;
  const edit = document.createElement("span"); edit.className = "directory-edit-icon"; edit.textContent = "✎"; edit.setAttribute("aria-hidden", "true");
  button.append(swatch, name, edit); button.addEventListener("click", () => openSubjectEditor(item)); return button;
}
function createSubjectEditor(item?: Subject): HTMLElement {
  const editor = subjectEditor;
  if (!editor) return document.createElement("div");
  const form = document.createElement("form"); form.className = "directory-editor subject-editor"; form.noValidate = true;
  form.innerHTML = `<label>Անուն<input class="subject-editor-name" autocomplete="off"></label><fieldset><legend>Գույն</legend><div class="subject-color color-palette" role="group" aria-label="Առարկայի գույն"></div></fieldset><p class="row-error" role="alert"></p><footer>${item ? `<button class="directory-delete subject-delete" type="button">Ջնջել առարկան</button>` : "<span></span>"}<button class="secondary-button cancel-subject-editor" type="button">Չեղարկել</button><button class="primary-button" type="submit">${item ? "Պահպանել" : "Ավելացնել"}</button></footer>`;
  const name = form.querySelector<HTMLInputElement>(".subject-editor-name")!; const color = form.querySelector<HTMLElement>(".subject-color")!; name.value = editor.name;
  const colorNames = ["Կապույտ", "Կանաչ", "Դեղին", "Վարդագույն", "Մանուշակագույն", "Նարնջագույն"];
  const colors = palette.includes(editor.color) ? palette : [editor.color, ...palette];
  const updateSwatch = (): void => {
    color.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.color === editor.color)));
  };
  for (const value of colors) {
    const button = document.createElement("button"); button.type = "button"; button.className = "color-choice";
    button.dataset.color = value; button.style.backgroundColor = value;
    button.title = colorNames[palette.indexOf(value)] ?? "Ներկայիս գույն"; button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => { editor.color = value; updateSwatch(); }); color.append(button);
  }
  updateSwatch();
  name.addEventListener("input", () => { editor.name = name.value; });
  form.addEventListener("submit", (event) => {
    event.preventDefault(); editor.name = name.value;
    const error = validateSubjectName(editor.name, state.subjects, item?.id); const errorElement = form.querySelector(".row-error");
    if (errorElement) errorElement.textContent = error ?? ""; if (error) { name.focus(); return; }
    if (item) { item.name = editor.name.trim(); item.color = editor.color; subjectEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-subject-id="${item.id}"]`)?.focus()); return; }
    const created = { id: nextId(state.subjects), schoolId: SCHOOL_ID, name: editor.name.trim(), color: editor.color }; state.subjects.push(created); subjectEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-subject-id="${created.id}"]`)?.focus());
  });
  form.querySelector(".cancel-subject-editor")?.addEventListener("click", () => { const selector = editor.returnFocusSelector; closeSettingsEditor(true); renderSettingsDirectories(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus()); });
  form.querySelector(".subject-delete")?.addEventListener("click", () => {
    if (!item) return; const error = form.querySelector(".row-error");
    if (isSubjectUsed(item.id, state.lessons)) { if (error) error.textContent = "Չի կարելի ջնջել․ առարկան օգտագործվում է դասացուցակում։"; return; }
    if (!confirm(`Ջնջե՞լ «${item.name}» առարկան։`)) return;
    state.subjects.splice(state.subjects.indexOf(item), 1); subjectEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#add-subject")?.focus());
  });
  form.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); const selector = editor.returnFocusSelector; closeSettingsEditor(true); renderSettingsDirectories(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus()); } });
  return form;
}
function addSubject(): void { openSubjectCreator(); }

function renderTeachers(): void {
  const list = document.querySelector("#teacher-list"); if (!list) return; list.replaceChildren(); list.classList.remove("empty-directory");
  if (teacherEditor?.mode === "create") list.append(createTeacherEditor());
  if (!state.teachers.length && teacherEditor?.mode !== "create") { list.textContent = "Դասատուներ դեռ չկան։ Դասերը կարելի է պահել առանց դասատուի։"; list.classList.add("empty-directory"); return; }
  for (const item of state.teachers) list.append(teacherEditor?.mode === "edit" && teacherEditor.teacherId === item.id ? createTeacherEditor(item) : createTeacherRow(item));
}
function createTeacherRow(item: Teacher): HTMLElement {
  const button = document.createElement("button"); button.type = "button"; button.className = "directory-summary"; button.dataset.teacherId = String(item.id); button.setAttribute("aria-label", `Խմբագրել «${item.name}» դասատուին`);
  button.innerHTML = `<span class="directory-summary-icon" aria-hidden="true"></span><span class="directory-summary-name"></span><span class="directory-edit-icon" aria-hidden="true">✎</span>`;
  button.querySelector(".directory-summary-icon")!.textContent = Array.from(item.name.trim())[0] ?? "Դ"; button.querySelector(".directory-summary-name")!.textContent = item.name; button.addEventListener("click", () => openTeacherEditor(item)); return button;
}
function openTeacherEditor(item: Teacher): void {
  if (teacherEditor?.mode === "edit" && teacherEditor.teacherId === item.id) return;
  if (!closeSettingsEditor()) return;
  teacherEditor = { mode: "edit", teacherId: item.id, initialName: item.name, name: item.name, returnFocusSelector: `[data-teacher-id="${item.id}"]` };
  renderSettingsDirectories(); focusSettingsEditor(".teacher-editor-name");
}
function openTeacherCreator(): void {
  if (teacherEditor?.mode === "create") { focusSettingsEditor(".teacher-editor-name"); return; }
  if (!closeSettingsEditor()) return;
  teacherEditor = { mode: "create", teacherId: null, initialName: "", name: "", returnFocusSelector: "#add-teacher" };
  renderSettingsDirectories(); focusSettingsEditor(".teacher-editor-name");
}
function createTeacherEditor(item?: Teacher): HTMLElement {
  const editor = teacherEditor; if (!editor) return document.createElement("div");
  const form = document.createElement("form"); form.className = "directory-editor"; form.noValidate = true;
  form.innerHTML = `<label>Անուն<input class="teacher-editor-name" autocomplete="off"></label><p class="row-error" role="alert"></p><footer>${item ? `<button class="directory-delete teacher-delete" type="button">Ջնջել դասատուին</button>` : "<span></span>"}<button class="secondary-button cancel-teacher-editor" type="button">Չեղարկել</button><button class="primary-button" type="submit">${item ? "Պահպանել" : "Ավելացնել"}</button></footer>`;
  const name = form.querySelector<HTMLInputElement>(".teacher-editor-name")!; name.value = editor.name; name.addEventListener("input", () => { editor.name = name.value; });
  form.addEventListener("submit", (event) => {
    event.preventDefault(); editor.name = name.value; const error = validateTeacherName(editor.name); const errorElement = form.querySelector(".row-error");
    if (errorElement) errorElement.textContent = error ?? ""; if (error) { name.focus(); return; }
    if (hasDuplicateTeacherName(editor.name, state.teachers, item?.id) && !confirm("Այս անունով դասատու արդեն կա։ Պահպանե՞լ որպես առանձին մարդ։")) { name.focus(); return; }
    if (item) { item.name = editor.name.trim(); teacherEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-teacher-id="${item.id}"]`)?.focus()); return; }
    const created = { id: nextId(state.teachers), schoolId: SCHOOL_ID, name: editor.name.trim() }; state.teachers.push(created); teacherEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-teacher-id="${created.id}"]`)?.focus());
  });
  form.querySelector(".cancel-teacher-editor")?.addEventListener("click", () => { const selector = editor.returnFocusSelector; closeSettingsEditor(true); renderSettingsDirectories(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus()); });
  form.querySelector(".teacher-delete")?.addEventListener("click", () => {
    if (!item) return; const error = form.querySelector(".row-error");
    if (isTeacherUsed(item.id, state.lessons)) { if (error) error.textContent = "Չի կարելի ջնջել․ դասատուն նշանակված է դասի։"; return; }
    if (!confirm(`Ջնջե՞լ «${item.name}» դասատուին։`)) return;
    state.teachers.splice(state.teachers.indexOf(item), 1); teacherEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#add-teacher")?.focus());
  });
  form.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); const selector = editor.returnFocusSelector; closeSettingsEditor(true); renderSettingsDirectories(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus()); } });
  return form;
}
function addTeacher(): void { openTeacherCreator(); }

function renderTimeSlots(): void {
  const list = document.querySelector("#slot-list"); if (!list) return; list.replaceChildren(); list.classList.remove("empty-directory"); const slots = sortTimeSlots(state.timeSlots.filter((item) => item.schoolId === SCHOOL_ID));
  if (slotEditor?.mode === "create") list.append(createSlotEditor());
  if (!slots.length && slotEditor?.mode !== "create") { list.textContent = "Դասաժամեր չկան։ Ավելացրեք առաջին դասաժամը։"; list.classList.add("empty-directory"); return; }
  slots.forEach((slot, index) => list.append(slotEditor?.mode === "edit" && slotEditor.slotId === slot.id ? createSlotEditor(slot) : createSlotRow(slot, index + 1)));
}
function createSlotRow(slot: TimeSlot, number: number): HTMLElement {
  const button = document.createElement("button"); button.type = "button"; button.className = "directory-summary slot-summary"; button.dataset.slotId = String(slot.id); button.setAttribute("aria-label", `Խմբագրել ${slot.start}–${slot.end} դասաժամը`);
  button.innerHTML = `<span class="slot-number"></span><span class="slot-range"></span><span class="directory-edit-icon" aria-hidden="true">✎</span>`;
  button.querySelector(".slot-number")!.textContent = `${number}.`; button.querySelector(".slot-range")!.textContent = `${slot.start} – ${slot.end}`; button.addEventListener("click", () => openSlotEditor(slot)); return button;
}
function openSlotEditor(slot: TimeSlot): void {
  if (slotEditor?.mode === "edit" && slotEditor.slotId === slot.id) return;
  if (!closeSettingsEditor()) return;
  slotEditor = { mode: "edit", slotId: slot.id, initialStart: slot.start, initialEnd: slot.end, start: slot.start, end: slot.end, returnFocusSelector: `[data-slot-id="${slot.id}"]` };
  renderSettingsDirectories(); focusSettingsEditor(".slot-editor-start");
}
function addSlotEditor(): void {
  if (slotEditor?.mode === "create") { focusSettingsEditor(".slot-editor-start"); return; }
  if (!closeSettingsEditor()) return;
  slotEditor = { mode: "create", slotId: null, initialStart: "", initialEnd: "", start: "", end: "", returnFocusSelector: "#add-slot" };
  renderSettingsDirectories(); focusSettingsEditor(".slot-editor-start");
}
function createSlotEditor(slot?: TimeSlot): HTMLElement {
  const editor = slotEditor; if (!editor) return document.createElement("div");
  const form = document.createElement("form"); form.className = "directory-editor"; form.noValidate = true;
  form.innerHTML = `<div class="slot-fields"><label>Սկիզբ<input class="slot-editor-start" type="time" required></label><label>Ավարտ<input class="slot-editor-end" type="time" required></label></div><p class="row-error" role="alert"></p><footer>${slot ? `<button class="directory-delete slot-delete" type="button">Ջնջել դասաժամը</button>` : "<span></span>"}<button class="secondary-button cancel-slot-editor" type="button">Չեղարկել</button><button class="primary-button" type="submit">${slot ? "Պահպանել" : "Ավելացնել"}</button></footer>`;
  const start = form.querySelector<HTMLInputElement>(".slot-editor-start")!; const end = form.querySelector<HTMLInputElement>(".slot-editor-end")!; start.value = editor.start; end.value = editor.end;
  start.addEventListener("input", () => { editor.start = start.value; }); end.addEventListener("input", () => { editor.end = end.value; });
  form.addEventListener("submit", (event) => {
    event.preventDefault(); editor.start = start.value; editor.end = end.value; const candidate = { start: editor.start, end: editor.end }; const validationError = validateTimeSlot(candidate, state.timeSlots, SCHOOL_ID, slot?.id); const error = form.querySelector(".row-error");
    if (error) error.textContent = validationError ?? ""; if (validationError) { start.focus(); return; }
    if (slot) { slot.start = candidate.start; slot.end = candidate.end; slotEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-slot-id="${slot.id}"]`)?.focus()); return; }
    const created = { id: nextId(state.timeSlots), schoolId: SCHOOL_ID, ...candidate }; state.timeSlots.push(created); slotEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-slot-id="${created.id}"]`)?.focus());
  });
  form.querySelector(".cancel-slot-editor")?.addEventListener("click", () => { const selector = editor.returnFocusSelector; closeSettingsEditor(true); renderSettingsDirectories(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus()); });
  form.querySelector(".slot-delete")?.addEventListener("click", () => {
    if (!slot) return; const error = form.querySelector(".row-error");
    if (isTimeSlotUsed(slot.id, state.lessons)) { if (error) error.textContent = "Չի կարելի ջնջել․ այս դասաժամն օգտագործվում է դասացուցակում։"; return; }
    if (!confirm(`Ջնջե՞լ ${slot.start}–${slot.end} դասաժամը։`)) return;
    state.timeSlots.splice(state.timeSlots.indexOf(slot), 1); slotEditor = null; commit(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#add-slot")?.focus());
  });
  form.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); const selector = editor.returnFocusSelector; closeSettingsEditor(true); renderSettingsDirectories(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(selector)?.focus()); } });
  return form;
}

window.addEventListener("beforeunload", (event) => { if (!dirty && !publishing) return; event.preventDefault(); event.returnValue = ""; }, { signal: controller.signal });
window.addEventListener("teacher-before-leave", (event) => {
  if (publishing) { event.preventDefault(); return; }
  if (queue.dirty && !confirm("Կան չպահպանված փոփոխություններ։ Միևնույն է դուրս գա՞լ։")) event.preventDefault();
}, { signal: controller.signal });
renderApp();
updateSyncStatus();
return () => { disposed = true; queue.dispose(); controller.abort(); if (app) app.inert = false; document.querySelectorAll("dialog").forEach(dialog => dialog.remove()); app?.replaceChildren(); };
}
