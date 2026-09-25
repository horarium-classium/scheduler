import test from "node:test";
import assert from "node:assert/strict";
import { CloudWorkspace, SaveQueue, parseSnapshot, type WorkspaceSnapshot } from "../src/cloud-workspace.ts";
import type { TeacherState } from "../src/state.ts";
const school = "aaaaaaaa-0000-0000-0000-000000000001";
const id = (n: number) => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12,"0")}`;
function snapshot(): WorkspaceSnapshot {
  return { version: "v1", data: {
    school: { id: school, name: "Դպրոց", timezone: "Asia/Yerevan" },
    classes: [{ id: id(2), school_id: school, name: "5Ա", sort_order: 10, public_id: id(90), active: true }],
    time_slots: [{ id: id(3), school_id: school, start_time: "09:00:00", end_time: "09:45:00", sort_order: 20 }],
    subjects: [{ id: id(4), school_id: school, name: "Առարկա", color: "#abcdef", active: true }],
    teachers: [{ id: id(5), school_id: school, name: "Դասատու", active: true }],
    lessons: [{ id: id(6), school_id: school, class_id: id(2), time_slot_id: id(3), subject_id: id(4), teacher_id: null, weekday: 1, comment: "" }],
  }};
}
function workspace(value = snapshot()) { return new CloudWorkspace(school, value, { read: async () => value, save: async () => value }); }
const tick = () => new Promise(resolve => setImmediate(resolve));

test("cloud mapping preserves UUID links, nullable teachers, public IDs and noncontiguous sort orders", () => {
  const cloud = workspace(); const state = cloud.decode();
  assert.equal(state.lessons[0]!.classId, state.classes[0]!.id);
  assert.equal(state.lessons[0]!.teacherId, null);
  assert.deepEqual(cloud.changes(state), []);
  state.lastSelectedClassId = null;
  assert.deepEqual(cloud.changes(state), []);
  state.classes[0]!.name = "6Ա";
  assert.deepEqual(cloud.changes(state), [{ table: "classes", op: "update", row: { id: id(2), name: "6Ա", sort_order: 10 } }]);
});
test("cross-school rows, duplicate IDs and broken references fail before mounting", () => {
  const cross = snapshot(); cross.data.classes[0]!.school_id = id(99);
  assert.throws(() => parseSnapshot(cross, school));
  const duplicate = snapshot(); duplicate.data.classes.push(duplicate.data.classes[0]!);
  assert.throws(() => parseSnapshot(duplicate, school));
  const broken = snapshot(); broken.data.lessons[0]!.subject_id = id(99);
  assert.throws(() => workspace(broken).decode());
});
test("empty cloud data stays empty without demo or local import", () => {
  const value = snapshot(); for (const table of ["classes","time_slots","subjects","teachers","lessons"] as const) value.data[table] = [];
  const cloud = workspace(value); const state = cloud.decode();
  assert.equal(state.classes.length,0); assert.equal(state.lessons.length,0);
  assert.deepEqual(cloud.changes(state), []);
});
test("dependent lessons delete first and existing entities are not replaced", () => {
  const cloud = workspace(); const state = cloud.decode(); state.lessons = []; state.classes = []; state.lastSelectedClassId = null;
  assert.deepEqual(cloud.changes(state).map(c => [c.table,c.op]), [["lessons","delete"],["classes","delete"]]);
});
test("new UUIDs stay stable across retries and new references target them", () => {
  const cloud = workspace(); const state = cloud.decode();
  state.subjects.push({ id: 2, schoolId: 1, name: "Նոր", color: "#ffffff" }); state.lessons[0]!.subjectId = 2;
  const first = cloud.changes(state), second = cloud.changes(state);
  assert.deepEqual(first, second);
  assert.equal(first[1]!.row.subject_id, first[0]!.row.id);
});
test("save queue serializes edits and never acknowledges unsaved newer edits", async () => {
  const state = workspace().decode(); const saved: TeacherState[] = []; let release!: () => void;
  const queue = new SaveQueue(async draft => { saved.push(draft); await new Promise<void>(resolve => { release = resolve; }); }, () => {});
  queue.submit(state); state.school.name = "Նոր"; queue.submit(state);
  assert.equal(saved.length, 1); assert.equal(queue.dirty, true);
  release(); await tick(); assert.equal(saved.length, 2); assert.equal(saved[1]!.school.name, "Նոր"); assert.equal(queue.dirty, true);
  release(); await tick(); assert.equal(queue.dirty, false);
});
test("failed saves retain latest draft and do not retry without user action", async () => {
  const state = workspace().decode(); let calls = 0;
  const queue = new SaveQueue(async () => { ++calls; if (calls === 1) throw { code: "40001" }; }, () => {});
  queue.submit(state); await tick(); assert.ok(queue.error); assert.equal(queue.dirty, true);
  state.school.name = "Չպահպանված"; queue.submit(state); await tick(); assert.equal(calls, 1);
  assert.equal(queue.pending!.school.name, "Չպահպանված"); queue.retry(); await tick(); assert.equal(calls, 2); assert.equal(queue.dirty, false);
});
test("signout disposal stops queued writes and late UI notifications", async () => {
  const state = workspace().decode(); let release!: () => void; let calls = 0, notifications = 0;
  const queue = new SaveQueue(async () => { ++calls; await new Promise<void>(resolve => { release = resolve; }); }, () => { ++notifications; });
  queue.submit(state); queue.submit(state); queue.dispose(); const before = notifications; release(); await tick();
  assert.equal(calls, 1); assert.equal(notifications, before);
});

function publicationFixture() {
  const value = snapshot() as WorkspaceSnapshot & { publications: import("../src/cloud-workspace.ts").PublicationStatus[] };
  value.publications = [{ class_id: id(2), public_id: id(90), revision: null, published_at: null, is_current: false }];
  return value;
}
test("publication uses server UUID and acknowledged version, then validates confirmation", async () => {
  const value = publicationFixture();
  let calls = 0;
  const cloud = new CloudWorkspace(school, value, { read: async () => value, save: async () => value,
    publish: async (classId, version) => {
      calls++; assert.equal(classId,id(2)); assert.equal(version,"v1");
      const next = structuredClone(value); next.publications[0] = { ...next.publications[0]!, revision: 1, published_at: "2026-09-24T10:00:00Z", is_current: true };
      return {revision:1,publishedAt:next.publications[0].published_at,workspace:next};
    } });
  const state=cloud.decode(); const classId=state.classes[0]!.id;
  assert.equal(cloud.publicationState(state,classId),"unpublished");
  state.classes[0]!.name="Edited";
  await assert.rejects(cloud.publish(classId,state),/պահպանմանը/); assert.equal(calls,0);
  state.classes[0]!.name="5Ա";
  await cloud.publish(classId,state);
  assert.equal(cloud.publicationState(state,classId),"published");
  state.subjects[0]!.color="#ffffff";
  assert.equal(cloud.publicationState(state,classId),"changed");
  state.subjects[0]!.color="#abcdef";
  assert.equal(cloud.publicationState(state,classId),"published");
  state.timeSlots[0]!.start="08:30";
  assert.equal(cloud.publicationState(state,classId),"changed");
  state.timeSlots[0]!.start="09:00";
  state.lessons[0]!.comment="private comment";
  assert.equal(cloud.publicationState(state,classId),"changed");
  state.lessons[0]!.comment="";
  state.classes.push({id:99,name:"Other"});
  state.subjects.push({id:99,schoolId:1,name:"Unused",color:"#ffffff"});
  state.lastSelectedClassId=99;
  assert.equal(cloud.publicationState(state,classId),"published");
});
test("publication failures and malformed responses never report a published draft", async () => {
  const value=publicationFixture();
  let response: unknown={revision:1,publishedAt:"2026-09-24T10:00:00Z",workspace:value};
  const cloud=new CloudWorkspace(school,value,{read:async()=>value,save:async()=>value,publish:async()=>response});
  const state=cloud.decode();const classId=state.classes[0]!.id;
  await assert.rejects(cloud.publish(classId,state),/հաստատումը/);
  assert.equal(cloud.publicationState(state,classId),"unpublished");
  response={revision:1,publishedAt:"not a date",workspace:value};
  await assert.rejects(cloud.publish(classId,state),/պատասխանը/);
  const failed=new CloudWorkspace(school,value,{read:async()=>value,save:async()=>value,publish:async()=>{throw {code:"40001"};}});
  const initial=failed.decode();
  await assert.rejects(failed.publish(initial.classes[0]!.id,initial));
  assert.equal(failed.publicationState(initial,initial.classes[0]!.id),"unpublished");
  const old=workspace(); const oldState=old.decode();
  assert.equal(old.publicationState(oldState,oldState.classes[0]!.id),"unavailable");
  await assert.rejects(old.publish(oldState.classes[0]!.id,oldState),/միացված չէ/);
});
test("publication metadata must identify real unique classes with consistent revisions", () => {
  const value=publicationFixture();value.publications[0]!.class_id=id(999);
  assert.throws(()=>parseSnapshot(value,school));
  value.publications[0]!.class_id=id(2);value.publications[0]!.is_current=true;
  assert.throws(()=>parseSnapshot(value,school));
  value.publications[0]!.is_current=false;value.publications[0]!.revision=-1;
  assert.throws(()=>parseSnapshot(value,school));
});
