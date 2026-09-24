import "./style.css";
import { findLessonConflict, isTimeSlotUsed, removeClassDraft, sortTimeSlots, validateTimeSlot, type SchoolClass, type Subject, type Teacher, type TimeSlot } from "./model";
import { isValidTimezone, type TeacherState } from "./state";
import { CloudWorkspace, SaveQueue, cloudError } from "./cloud-workspace";



export function mountEditor(workspace: CloudWorkspace, initial: TeacherState, role: "admin" | "scheduler"): () => void {
const controller = new AbortController();
interface Weekday { id: number; name: string; shortName: string; }
type Page = "workspace" | "settings" | "preview";
const SCHOOL_ID = 1;
const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#ffedd5"];
const weekdays: Weekday[] = [
  { id: 1, name: "Երկուշաբթի", shortName: "Երկ" }, { id: 2, name: "Երեքշաբթի", shortName: "Երք" },
  { id: 3, name: "Չորեքշաբթի", shortName: "Չրք" }, { id: 4, name: "Հինգշաբթի", shortName: "Հնգ" },
  { id: 5, name: "Ուրբաթ", shortName: "Ուրբ" }, { id: 6, name: "Շաբաթ", shortName: "Շբ" },
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
const syncBar = document.createElement("section"); syncBar.className = "cloud-sync-bar";
syncBar.innerHTML = `<span role="status"></span><button class="secondary-button retry-save" type="button" hidden>Կրկին փորձել</button><button class="secondary-button reload-cloud" type="button">Բեռնել սերվերից</button><button class="secondary-button download-draft" type="button">Ներբեռնել սևագիրը</button>`;
app?.before(syncBar);
const queue = new SaveQueue(value => workspace.save(value), updateSyncStatus);
function updateSyncStatus(): void {
  if (disposed) return;
  dirty = queue.dirty;
  const label = queue.error || (dirty ? "Պահպանում ենք ամպում…" : "Պահպանված է ամպում");
  syncBar.querySelector("span")!.textContent = label;
  syncBar.querySelector<HTMLButtonElement>(".retry-save")!.hidden = !queue.error;
  syncBar.querySelector<HTMLButtonElement>(".reload-cloud")!.disabled = queue.busy;
  updatePublicationStatus();
  app?.querySelectorAll(".save-status").forEach(el => { el.textContent = queue.error ? "Չպահպանված փոփոխություններ" : label; el.classList.toggle("status-warning", dirty); });
}
syncBar.querySelector(".retry-save")?.addEventListener("click", () => queue.retry());
syncBar.querySelector(".download-draft")?.addEventListener("click", () => downloadText(JSON.stringify(state, null, 2), "teacher-cloud-draft.json"));
syncBar.querySelector(".reload-cloud")?.addEventListener("click", async () => {
  if (publishing || queue.busy || (queue.dirty && !confirm("Կան չպահպանված փոփոխություններ։ Նախ ներբեռնեք սևագիրը։ Բեռնե՞լ սերվերից և հրաժարվել այդ փոփոխություններից։"))) return;
  const button = syncBar.querySelector<HTMLButtonElement>(".reload-cloud")!; button.disabled = true; if (app) app.inert = true;
  try {
    const latest = await workspace.reload();
    if (disposed) return;
    queue.pending = null; queue.error = ""; state = latest; dirty = false; publicationMessage = "";
    renderApp(); updateSyncStatus();
  } catch { if (!disposed) syncBar.querySelector("span")!.textContent = "Բեռնումը չհաջողվեց։ Սևագիրը չի փոխվել։"; }
  finally { button.disabled = false; if (app && !disposed) app.inert = false; }
});
let page: Page = "workspace";
let dirty = false;

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
  else if (page === "preview") renderPreview();
  else renderWorkspace();
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
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
  syncBar.querySelector<HTMLButtonElement>(".reload-cloud")!.disabled = true;
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

function renderToolbar(title: string, preview = false): string {
  return `<header class="workspace-toolbar"><div class="school-heading"><strong id="school-name"></strong><span>${title}</span></div>${statusMarkup()}<div class="toolbar-actions"><button id="settings-button" class="secondary-button" type="button">Կարգավորումներ</button>${preview ? `<button id="back-to-editor" class="secondary-button" type="button">Վերադառնալ խմբագրիչ</button>` : `<button id="preview-button" class="secondary-button" type="button" ${selectedClass() ? "" : "disabled"}>Նախադիտում</button>`}<button class="publish-button" type="button" disabled title="Հրապարակման backend-ը դեռ միացված չէ">Հրապարակել</button></div></header>`;
}

function wireToolbar(): void {
  document.querySelector(".publish-button")?.addEventListener("click", () => void publishSelectedClass());
  updatePublicationStatus();
  const schoolName = document.querySelector("#school-name"); if (schoolName) schoolName.textContent = state.school.name;
  document.querySelector("#settings-button")?.addEventListener("click", () => { page = "settings"; renderApp(); });
  document.querySelector("#preview-button")?.addEventListener("click", () => { page = "preview"; renderApp(); });
  document.querySelector("#back-to-editor")?.addEventListener("click", () => { page = "workspace"; renderApp(); });
}

function renderNotices(container: Element): void {
  const note = document.createElement("p");
  note.textContent = "Ամպային սևագիր · Հանրային դասացուցակը փոխվում է միայն հրապարակումից հետո։";
  container.append(note);
  if (publicationMessage) { const message = document.createElement("p"); message.setAttribute("role", "status"); message.textContent = publicationMessage; container.append(message); }
}

function renderWorkspace(): void {
  if (!app) return;
  const active = selectedClass();
  app.innerHTML = `<main class="workspace-page">${renderToolbar(active ? `${active.name} դասարան` : "Դասարան ընտրված չէ")}<div id="notices"></div><div class="workspace-layout"><aside class="class-sidebar"><div class="sidebar-heading"><h2>Դասարաններ</h2><button id="add-class" class="icon-button" type="button" aria-label="Ավելացնել դասարան" title="Ավելացնել դասարան">+</button></div><div id="class-switcher" class="class-switcher"></div><div id="class-actions" class="class-actions"></div></aside><section class="workspace-content"><div id="schedule-container"></div></section></div></main>`;
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
  const dialog = document.createElement("dialog"); dialog.className = "lesson-dialog"; dialog.innerHTML = `<form method="dialog" class="dialog-form" novalidate><header><h2></h2><button class="dialog-close cancel-dialog" type="button" aria-label="Փակել">×</button></header><div class="no-subjects" hidden><p>Դաս ավելացնելու համար նախ ստեղծեք առարկա։</p><button class="primary-button subject-settings-link" type="button">Ավելացնել առարկա</button></div><label class="subject-field">Առարկա<select name="subject" required></select></label><label class="teacher-field">Ուսուցիչ<select name="teacher"><option value="">Նշված չէ</option></select></label><label>Մեկնաբանություն<textarea name="comment" rows="3"></textarea></label><p class="form-error" role="alert"></p><footer><button class="danger-button delete-button" type="button" ${lesson ? "" : "hidden"}>Ջնջել</button><span></span><button class="secondary-button cancel-dialog" type="button">Չեղարկել</button><button class="primary-button save-lesson" type="submit">Պահել</button></footer></form>`; document.body.append(dialog);
  const heading = dialog.querySelector("h2"); if (heading) heading.textContent = `${schoolClass.name} — ${weekday.name} ${slot.start}–${slot.end}`;
  let conflictTarget: number | null = null;
  const form = dialog.querySelector<HTMLFormElement>("form"); const subject = dialog.querySelector<HTMLSelectElement>('[name="subject"]'); const teacher = dialog.querySelector<HTMLSelectElement>('[name="teacher"]'); const comment = dialog.querySelector<HTMLTextAreaElement>('[name="comment"]'); const error = dialog.querySelector(".form-error");
  for (const item of state.subjects) { const option = document.createElement("option"); option.value = String(item.id); option.textContent = item.name; option.selected = item.id === lesson?.subjectId; subject?.append(option); }
  for (const item of state.teachers) { const option = document.createElement("option"); option.value = String(item.id); option.textContent = item.name; option.selected = item.id === lesson?.teacherId; teacher?.append(option); }
  if (comment) comment.value = lesson?.comment ?? "";
  if (!state.subjects.length) { dialog.querySelector<HTMLElement>(".no-subjects")!.hidden = false; dialog.querySelector<HTMLElement>(".subject-field")!.hidden = true; dialog.querySelector<HTMLButtonElement>(".save-lesson")!.disabled = true; }
  dialog.querySelector(".subject-settings-link")?.addEventListener("click", () => { pendingCell = { classId, weekdayId, timeSlotId }; dialog.close("settings"); });
  form?.addEventListener("submit", (event) => { event.preventDefault(); const subjectId = Number(subject?.value); const subjectExists = state.subjects.some((item) => item.id === subjectId); if (!subjectExists) { if (error) error.textContent = "Ընտրեք առարկա։"; subject?.focus(); return; } const teacherId = teacher?.value ? Number(teacher.value) : null; if (teacherId !== null && !state.teachers.some((item) => item.id === teacherId)) { if (error) error.textContent = "Ընտրված ուսուցիչը գոյություն չունի։"; return; }
    const candidate = { id: lesson?.id ?? nextId(state.lessons), classId, weekday: weekdayId, timeSlotId, subjectId, teacherId, comment: comment?.value.trim() ?? "" };
    const conflict = findLessonConflict(candidate, state.lessons);
    error?.replaceChildren();
    if (conflict) {
      const other = conflict.lesson;
      const otherClass = state.classes.find((item) => item.id === other.classId);
      const otherSubject = state.subjects.find((item) => item.id === other.subjectId);
      const teacherName = state.teachers.find((item) => item.id === teacherId)?.name ?? "Ուսուցիչը";
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
  dialog.addEventListener("close", () => { const changed = dialog.returnValue === "changed"; const goToSettings = dialog.returnValue === "settings"; dialog.remove(); if (dialog.returnValue === "conflict" && conflictTarget !== null) { state.lastSelectedClassId = conflictTarget; page = "workspace"; persist(); renderApp(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.schedule-cell[data-weekday="${weekdayId}"][data-time-slot="${timeSlotId}"]`)?.focus()); return; } if (changed) renderWorkspace(); if (goToSettings) { page = "settings"; renderApp(); requestAnimationFrame(() => document.querySelector("#add-subject")?.scrollIntoView({ block: "center" })); return; } requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.schedule-cell[data-weekday="${weekdayId}"][data-time-slot="${timeSlotId}"]`)?.focus() ?? returnFocus.focus()); });
  dialog.showModal(); subject?.focus();
}

function renderPreview(): void {
  if (!app) return; const active = selectedClass();
  app.innerHTML = `<main class="workspace-page preview-page">${renderToolbar(active ? `${active.name} դասարան` : "Դասարան ընտրված չէ", true)}<div class="preview-note">Սա ընթացիկ սևագրի միայն ընթերցվող նախադիտումն է։ Այն հրապարակված չէ։</div><div id="notices"></div><section id="preview-content" class="preview-content"></section></main>`;
  wireToolbar(); const notices = document.querySelector("#notices"); if (notices) renderNotices(notices); const container = document.querySelector("#preview-content"); if (active && container) renderWeekTable(active.id, container, false); else if (container) container.textContent = "Նախադիտման համար դասարան չկա։";
}

function renderSettings(): void {
  if (!app) return;
  app.innerHTML = `<main class="page settings-page"><header class="editor-header settings-header"><button id="back-button" class="back-button" type="button">← Աշխատանքային էկրան</button><div><h1>Կարգավորումներ</h1><p>Ընդհանուր տվյալներ և տեղեկատուներ</p></div><span></span></header><div id="notices"></div><section class="panel school-settings"><h2>Դպրոցի տվյալներ</h2><div class="school-form"><label>Դպրոցի անուն<input id="school-name-input" autocomplete="organization"></label><label>Ժամային գոտի<input id="timezone-input" list="timezone-list" autocomplete="off"><datalist id="timezone-list"><option value="Asia/Yerevan"><option value="Europe/Moscow"><option value="Europe/Paris"><option value="America/New_York"></datalist></label><button id="save-school" class="primary-button settings-icon save-icon" type="button" aria-label="Պահել" title="Պահել"><span aria-hidden="true">✓</span></button></div><p id="school-error" class="form-error" role="alert"></p></section><section class="panel directory-settings"><div class="panel-header"><h2>Առարկաներ</h2><button id="add-subject" class="primary-button" type="button">+ Ավելացնել առարկա</button></div><div id="subject-list" class="directory-list"></div></section><section class="panel directory-settings"><div class="panel-header"><h2>Ուսուցիչներ</h2><button id="add-teacher" class="primary-button" type="button">+ Ավելացնել ուսուցիչ</button></div><div id="teacher-list" class="directory-list"></div></section><section class="panel slot-settings"><div class="panel-header"><h2>Դասաժամեր</h2><button id="add-slot" class="primary-button" type="button">+ Ավելացնել դասաժամ</button></div><p id="settings-message" class="settings-message" role="status"></p><div class="slot-table-wrapper"><table class="slot-table"><thead><tr><th>№</th><th>Սկիզբ</th><th>Ավարտ</th><th>Գործողություն</th></tr></thead><tbody id="slot-list"></tbody></table></div></section></main>`;
  const notices = document.querySelector("#notices"); if (notices) renderNotices(notices);
  const schoolInput = document.querySelector<HTMLInputElement>("#school-name-input"); const timezoneInput = document.querySelector<HTMLInputElement>("#timezone-input"); if (schoolInput) schoolInput.value = state.school.name; if (timezoneInput) timezoneInput.value = state.school.timezone;
  document.querySelector("#back-button")?.addEventListener("click", () => { page = "workspace"; renderApp(); if (pendingCell) { const cell = pendingCell; pendingCell = null; requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.schedule-cell[data-weekday="${cell.weekdayId}"][data-time-slot="${cell.timeSlotId}"]`)?.focus()); } });
  document.querySelector("#save-school")?.addEventListener("click", () => { const name = schoolInput?.value.trim() ?? ""; const timezone = timezoneInput?.value.trim() ?? ""; const error = document.querySelector("#school-error"); if (!name) { if (error) error.textContent = "Դպրոցի անունը պարտադիր է։"; return; } if (!isValidTimezone(timezone)) { if (error) error.textContent = "Մուտքագրեք վավեր IANA ժամային գոտի, օրինակ՝ Asia/Yerevan։"; return; } state.school = { name, timezone }; commit(); });
  document.querySelector("#add-subject")?.addEventListener("click", addSubject); document.querySelector("#add-teacher")?.addEventListener("click", addTeacher);
  document.querySelector("#add-slot")?.addEventListener("click", addSlotEditor); renderSubjects(); renderTeachers(); renderTimeSlots();
  if (role !== "admin") {
    app.querySelectorAll<HTMLInputElement | HTMLButtonElement>(".school-settings input, .school-settings button, .slot-settings input, .slot-settings button").forEach(el => { el.disabled = true; });
    const note = document.createElement("p"); note.textContent = "Դպրոցի տվյալներն ու դասաժամերը փոփոխում է ադմինիստրատորը։";
    app.querySelector(".school-settings")?.append(note);
  }
}

function normalizedDirectoryName(value: string): string { return value.trim().toLocaleLowerCase("hy"); }
function subjectNameError(name: string, excludedId?: number): string | null { if (!name.trim()) return "Առարկայի անունը պարտադիր է։"; return state.subjects.some((item) => item.id !== excludedId && normalizedDirectoryName(item.name) === normalizedDirectoryName(name)) ? "Այս անունով առարկա արդեն կա։" : null; }
function renderSubjects(): void {
  const list = document.querySelector("#subject-list"); if (!list) return; list.replaceChildren();
  if (!state.subjects.length) { list.textContent = "Առարկաներ դեռ չկան։"; list.classList.add("empty-directory"); return; }
  for (const item of state.subjects) list.append(createSubjectRow(item));
}
function createSubjectRow(item: Subject): HTMLElement {
  const row = document.createElement("div"); row.className = "directory-row subject-row"; row.innerHTML = `<span class="color-swatch"></span><input class="directory-name" aria-label="Առարկայի անուն"><div class="subject-color color-palette" role="group" aria-label="Առարկայի գույն"></div><button class="secondary-button save-directory settings-icon save-icon" type="button" aria-label="Պահել" title="Պահել"><span aria-hidden="true">✓</span></button><button class="danger-button delete-directory settings-icon delete-icon" type="button" aria-label="Ջնջել" title="Ջնջել"><span aria-hidden="true">×</span></button><p class="row-error" role="alert"></p>`;
  const name = row.querySelector<HTMLInputElement>(".directory-name")!; const color = row.querySelector<HTMLElement>(".subject-color")!; const swatch = row.querySelector<HTMLElement>(".color-swatch")!; name.value = item.name;
  let selectedColor = item.color;
  const colorNames = ["Կապույտ", "Կանաչ", "Դեղին", "Վարդագույն", "Մանուշակագույն", "Նարնջագույն"];
  const colors = palette.includes(item.color) ? palette : [item.color, ...palette];
  const updateSwatch = (): void => {
    swatch.style.backgroundColor = selectedColor;
    color.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.color === selectedColor)));
  };
  for (const value of colors) {
    const button = document.createElement("button"); button.type = "button"; button.className = "color-choice";
    button.dataset.color = value; button.style.backgroundColor = value;
    button.title = colorNames[palette.indexOf(value)] ?? "Ներկայիս գույն"; button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => { selectedColor = value; updateSwatch(); }); color.append(button);
  }
  updateSwatch();
  row.querySelector(".save-directory")?.addEventListener("click", () => { const error = subjectNameError(name.value, item.id); const errorElement = row.querySelector(".row-error"); if (errorElement) errorElement.textContent = error ?? ""; if (error) return; item.name = name.value.trim(); item.color = selectedColor; commit(); });
  row.querySelector(".delete-directory")?.addEventListener("click", () => { if (state.lessons.some((lesson) => lesson.subjectId === item.id)) { const error = row.querySelector(".row-error"); if (error) error.textContent = "Չի կարելի ջնջել․ առարկան օգտագործվում է դասացուցակում։"; return; } state.subjects.splice(state.subjects.indexOf(item), 1); commit(); }); return row;
}
function addSubject(): void { const name = prompt("Առարկայի անունը:"); if (name === null) return; const error = subjectNameError(name); if (error) { alert(error); return; } state.subjects.push({ id: nextId(state.subjects), schoolId: SCHOOL_ID, name: name.trim(), color: palette[0]! }); commit(); }

function renderTeachers(): void {
  const list = document.querySelector("#teacher-list"); if (!list) return; list.replaceChildren(); if (!state.teachers.length) { list.textContent = "Ուսուցիչներ դեռ չկան։ Դասերը կարելի է պահել առանց ուսուցչի։"; list.classList.add("empty-directory"); return; }
  for (const item of state.teachers) list.append(createTeacherRow(item));
}
function createTeacherRow(item: Teacher): HTMLElement {
  const row = document.createElement("div"); row.className = "directory-row teacher-row"; row.innerHTML = `<input class="directory-name" aria-label="Ուսուցչի անուն"><button class="secondary-button save-directory settings-icon save-icon" type="button" aria-label="Պահել" title="Պահել"><span aria-hidden="true">✓</span></button><button class="danger-button delete-directory settings-icon delete-icon" type="button" aria-label="Ջնջել" title="Ջնջել"><span aria-hidden="true">×</span></button><p class="row-error" role="alert"></p>`; const name = row.querySelector<HTMLInputElement>(".directory-name")!; name.value = item.name;
  row.querySelector(".save-directory")?.addEventListener("click", () => { const value = name.value.trim(); const error = row.querySelector(".row-error"); if (!value) { if (error) error.textContent = "Ուսուցչի անունը պարտադիր է։"; return; } item.name = value; commit(); });
  row.querySelector(".delete-directory")?.addEventListener("click", () => { if (state.lessons.some((lesson) => lesson.teacherId === item.id)) { const error = row.querySelector(".row-error"); if (error) error.textContent = "Չի կարելի ջնջել․ ուսուցիչը նշանակված է դասի։"; return; } state.teachers.splice(state.teachers.indexOf(item), 1); commit(); }); return row;
}
function addTeacher(): void { const name = prompt("Ուսուցչի անունը:"); if (name === null) return; if (!name.trim()) { alert("Ուսուցչի անունը պարտադիր է։"); return; } const duplicate = state.teachers.some((item) => normalizedDirectoryName(item.name) === normalizedDirectoryName(name)); if (duplicate && !confirm("Այս անունով ուսուցիչ արդեն կա։ Ավելացնե՞լ առանձին մարդ որպես նոր գրառում։")) return; state.teachers.push({ id: nextId(state.teachers), schoolId: SCHOOL_ID, name: name.trim() }); commit(); }

function renderTimeSlots(): void {
  const list = document.querySelector<HTMLTableSectionElement>("#slot-list"); if (!list) return; list.replaceChildren(); const slots = sortTimeSlots(state.timeSlots.filter((item) => item.schoolId === SCHOOL_ID));
  if (!slots.length) { const row = list.insertRow(); const cell = row.insertCell(); cell.colSpan = 4; cell.className = "empty-settings"; cell.textContent = "Դասաժամեր չկան։ Ավելացրեք առաջին դասաժամը։"; return; }
  slots.forEach((slot, index) => appendSlotRow(list, slot, index + 1));
}
function appendSlotRow(list: HTMLTableSectionElement, slot: TimeSlot, number: number): void {
  const row = document.createElement("tr"); row.innerHTML = `<td>${number}</td><td><input type="time" aria-label="Սկիզբ" name="start" required></td><td><input type="time" aria-label="Ավարտ" name="end" required></td><td><div class="slot-actions"><button class="secondary-button update-slot settings-icon save-icon" type="button" aria-label="Պահել" title="Պահել"><span aria-hidden="true">✓</span></button><button class="danger-button remove-slot settings-icon delete-icon" type="button" aria-label="Ջնջել" title="Ջնջել"><span aria-hidden="true">×</span></button></div><p class="row-error" role="alert"></p></td>`;
  const start = row.querySelector<HTMLInputElement>('[name="start"]'); const end = row.querySelector<HTMLInputElement>('[name="end"]'); if (start) start.value = slot.start; if (end) end.value = slot.end;
  row.querySelector(".update-slot")?.addEventListener("click", () => { const candidate = { start: start?.value ?? "", end: end?.value ?? "" }; const validationError = validateTimeSlot(candidate, state.timeSlots, SCHOOL_ID, slot.id); const error = row.querySelector(".row-error"); if (error) error.textContent = validationError ?? ""; if (validationError) return; slot.start = candidate.start; slot.end = candidate.end; persist(); renderSettings(); });
  row.querySelector(".remove-slot")?.addEventListener("click", () => { if (isTimeSlotUsed(slot.id, state.lessons)) { const error = row.querySelector(".row-error"); if (error) error.textContent = "Չի կարելի ջնջել․ այս դասաժամն օգտագործվում է դասացուցակում։"; return; } state.timeSlots.splice(state.timeSlots.indexOf(slot), 1); persist(); renderSettings(); }); list.append(row);
}
function addSlotEditor(): void {
  const list = document.querySelector<HTMLTableSectionElement>("#slot-list"); if (!list || list.querySelector(".new-slot-row")) return; if (list.querySelector(".empty-settings")) list.replaceChildren();
  const row = document.createElement("tr"); row.className = "new-slot-row"; row.innerHTML = `<td>Նոր</td><td><input type="time" aria-label="Սկիզբ" name="start" required></td><td><input type="time" aria-label="Ավարտ" name="end" required></td><td><div class="slot-actions"><button class="primary-button save-new-slot" type="button">Ավելացնել</button><button class="secondary-button cancel-new-slot" type="button">Չեղարկել</button></div><p class="row-error" role="alert"></p></td>`; list.append(row);
  const start = row.querySelector<HTMLInputElement>('[name="start"]'); const end = row.querySelector<HTMLInputElement>('[name="end"]'); start?.focus();
  row.querySelector(".save-new-slot")?.addEventListener("click", () => { const candidate = { start: start?.value ?? "", end: end?.value ?? "" }; const validationError = validateTimeSlot(candidate, state.timeSlots, SCHOOL_ID); const error = row.querySelector(".row-error"); if (error) error.textContent = validationError ?? ""; if (validationError) return; state.timeSlots.push({ id: nextId(state.timeSlots), schoolId: SCHOOL_ID, ...candidate }); persist(); renderSettings(); });
  row.querySelector(".cancel-new-slot")?.addEventListener("click", renderTimeSlots);
}

window.addEventListener("beforeunload", (event) => { if (!dirty && !publishing) return; event.preventDefault(); event.returnValue = ""; }, { signal: controller.signal });
window.addEventListener("teacher-before-leave", (event) => {
  if (publishing) { event.preventDefault(); return; }
  if (queue.dirty && !confirm("Կան չպահպանված փոփոխություններ։ Նախ ներբեռնեք սևագիրը։ Միևնույն է դուրս գա՞լ։")) event.preventDefault();
}, { signal: controller.signal });
renderApp();
updateSyncStatus();
return () => { disposed = true; queue.dispose(); controller.abort(); syncBar.remove(); if (app) app.inert = false; document.querySelectorAll("dialog").forEach(dialog => dialog.remove()); app?.replaceChildren(); };
}
