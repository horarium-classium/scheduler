// No listener or hosted connection: real PostgreSQL via WASM. The Auth fixture
// reproduces auth.uid()/roles, not GoTrue. Production migrations are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { CloudWorkspace } from "../../apps/teacher/src/cloud-workspace.ts";
import ts from "../../apps/teacher/node_modules/typescript/lib/typescript.js";
import { load as studentModule } from "../../apps/student/tests/load.mjs";
const school = "aaaaaaaa-0000-0000-0000-000000000001";
const other = "bbbbbbbb-0000-0000-0000-000000000001";
const classA = "aaaaaaaa-1000-0000-0000-000000000001";
const classB = "aaaaaaaa-1000-0000-0000-000000000002";
const publicA = "aaaaaaaa-1100-0000-0000-000000000001";
const admin = "10000000-0000-0000-0000-000000000001";
const scheduler = "10000000-0000-0000-0000-000000000002";
const subject = "aaaaaaaa-3000-0000-0000-000000000001";
const slot = "aaaaaaaa-2000-0000-0000-000000000001";

async function fixture() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`create schema extensions; create schema auth;
    create role anon; create role authenticated;
    grant usage on schema public, auth to anon, authenticated;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users(id) values ('${admin}'), ('${scheduler}'),
      ('10000000-0000-0000-0000-000000000003'), ('10000000-0000-0000-0000-000000000004');`);
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
    // pgcrypto is used only by seed password hashing. No publication function
    // depends on it; gen_random_uuid() is built into PostgreSQL.
    await db.exec(sql.replace('create extension if not exists pgcrypto with schema extensions;', ''));
  }
  const seed = await readFile(new URL('../seed.sql', import.meta.url), 'utf8');
  await db.exec(seed.slice(seed.indexOf('insert into public.schools')));
  return db;
}
async function as(db, role, user = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec('set role ' + role);
}
async function scalar(db, sql, params = []) { return (await db.query(sql, params)).rows[0].value; }
const read = db => scalar(db, 'select teacher_workspace_read($1) as value', [school]);
const published = db => scalar(db, 'select get_published_schedule($1) as value', [publicA]);
async function publish(db, classId = classA, version) {
  version ??= (await read(db)).version;
  return scalar(db, 'select publish_schedule($1,$2,$3) as value', [school,classId,version]);
}
async function rejected(db, sql, params, code) {
  await assert.rejects(db.query(sql,params), e => (Array.isArray(code) ? code : [code]).includes(e.code));
}

test('publication migrations: atomic snapshots, privacy, roles, retries and lifecycle', async t => {
  const db = await fixture(); t.after(() => db.close());
  await as(db,'authenticated',admin);
  assert.equal(await published(db), null);
  assert.equal((await read(db)).publications[0].revision, null);
  const before = (await read(db)).version;
  const first = await publish(db);
  assert.equal(first.revision,1);
  assert.equal(first.workspace.version,before, 'publishing does not stale a draft save');
  assert.equal(first.workspace.publications.find(p => p.class_id === classA).is_current,true);
  assert.equal(first.workspace.publications.find(p => p.class_id === classB).revision,null);
  const original = await published(db);
  assert.equal(original.formatVersion,1);
  assert.equal(original.timezone,'Asia/Yerevan');
  assert.equal(original.className,'5Ա');
  assert.equal(Object.keys(original.schedule).length,7);
  assert.deepEqual(original.schedule['Երկուշաբթի'],[{start:'09:00',end:'09:45',lesson:'Մաթեմատիկա'}]);
  assert.deepEqual(original.schedule['Կիրակի'],[]);
  assert.deepEqual(Object.keys(original).sort(),['className','formatVersion','publicId','publishedAt','revision','schedule','schoolName','timezone'].sort());
  assert.equal((await scalar(db,'select published_by as value from schedule_publications where class_id=$1',[classA])),admin);
  const retry = await publish(db);
  assert.equal(retry.revision,1); assert.equal(retry.publishedAt,first.publishedAt);

  // Check the public payload against the unchanged, actual Student parser.
  const source = await readFile(new URL('../../apps/student/src/schedule.ts',import.meta.url),'utf8');
  const js = ts.transpileModule(source.replace('import { invoke } from "@tauri-apps/api/core";','const invoke = () => {};'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const student = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  assert.deepEqual(student.validateSchedule(original.schedule), original.schedule);

  await db.query('update subjects set name=$1 where id=$2',['Նոր անուն',subject]);
  assert.deepEqual(await published(db),original,'draft edits cannot mutate publication');
  assert.equal((await read(db)).publications.find(p=>p.class_id===classA).is_current,false);
  await rejected(db,'select publish_schedule($1,$2,$3)',[school,classA,before],'40001');
  assert.deepEqual(await published(db),original,'stale publish preserves previous output');
  await as(db,'authenticated',scheduler);
  assert.equal((await publish(db)).revision,2,'scheduler can publish');
  assert.equal((await published(db)).schedule['Երկուշաբթի'][0].lesson,'Նոր անուն');
  assert.equal(await scalar(db,'select count(*)::int as value from schedule_publications where class_id=$1',[classA]),2);
  assert.equal(await scalar(db,"select payload->'schedule'->'Երկուշաբթի'->0->>'lesson' as value from schedule_publications where class_id=$1 and revision=1",[classA]),'Մաթեմատիկա');
  await rejected(db,"insert into schedule_publications(school_id,class_id,revision,format_version,payload) values ($1,$2,99,1,'{}')",[school,classA],'42501');
  await rejected(db,'update schedule_publications set revision=99',[],'42501');
  await rejected(db,'delete from schedule_publications',[],'42501');
  await rejected(db,'select publish_schedule($1,$2,$3)',[other,classA,before],'42501');
  await rejected(db,'select publish_schedule($1,$2,$3)',[school,'bbbbbbbb-1000-0000-0000-000000000001',(await read(db)).version],'22023');

  const second=await published(db);
  await db.query('update subjects set active=false where id=$1',[subject]);
  assert.equal((await read(db)).publications.find(p=>p.class_id===classA).is_current,false);
  await rejected(db,'select publish_schedule($1,$2,$3)',[school,classA,(await read(db)).version],'23514');
  assert.deepEqual(await published(db),second,'invalid links cannot replace public snapshot');
  await db.query('update subjects set active=true where id=$1',[subject]);
  await as(db,'authenticated',admin);
  await db.query("update time_slots set start_time='08:30',end_time='09:15' where id=$1",[slot]);
  assert.equal((await read(db)).publications.find(p=>p.class_id===classA).is_current,false);
  assert.equal((await published(db)).schedule['Երկուշաբթի'][0].start,'09:00');
  await publish(db);
  assert.equal((await published(db)).schedule['Երկուշաբթի'][0].start,'08:30');
  await db.query('update classes set name=$1 where id=$2',['7Ա',classA]);
  assert.equal((await published(db)).className,'5Ա');
  await publish(db); assert.equal((await published(db)).className,'7Ա');
  await rejected(db,'delete from classes where id=$1',[classA],['23503','23001']);

  await as(db,'authenticated','10000000-0000-0000-0000-000000000004');
  await rejected(db,'select publish_schedule($1,$2,$3)',[school,classA,before],'42501');
  await as(db,'anon');
  assert.equal((await published(db)).className,'7Ա');
  assert.equal(await scalar(db,'select get_published_schedule($1) as value',['00000000-0000-0000-0000-000000000000']),null);
  await rejected(db,'select * from lessons',[],'42501');
  await rejected(db,'select * from schedule_publications',[],'42501');
  await rejected(db,'select teacher_workspace_read($1)',[school],'42501');
  await rejected(db,'select private.publication_source($1,$2)',[school,classA],'42501');
  await rejected(db,'select publish_schedule($1,$2,$3)',[school,classA,before],'42501');

  await as(db,'authenticated',admin);
  const empty=await publish(db,classB); assert.equal(empty.revision,1);
  const bPublic=(await read(db)).publications.find(p=>p.class_id===classB).public_id;
  const emptyPayload=await scalar(db,'select get_published_schedule($1) as value',[bPublic]);
  assert.ok(Object.values(emptyPayload.schedule).every(day=>day.length===0));
  await db.query('delete from lessons where class_id=$1',[classA]);
  await rejected(db,'delete from classes where id=$1',[classA],['23503','23001']);
  assert.equal((await published(db)).schedule['Երկուշաբթի'].length,1);
  await publish(db);
  assert.ok(Object.values((await published(db)).schedule).every(day=>day.length===0),'empty publication clears previous lessons');
  assert.deepEqual(await scalar(db,'select get_published_schedule($1) as value',[bPublic]),emptyPayload);
  await db.query('update classes set active=false where id=$1',[classA]);
  assert.equal(await published(db),null,'archived class stops public access');
  await rejected(db,'select publish_schedule($1,$2,$3)',[school,classA,(await read(db)).version],'22023');
});

test('Teacher adapter round trip through real workspace/publication SQL', async t => {
  const db=await fixture();t.after(()=>db.close());await as(db,'authenticated',admin);
  const cloud=new CloudWorkspace(school,await read(db),{
    read:()=>read(db),
    save:(version,changes)=>scalar(db,'select teacher_workspace_save($1,$2,$3::jsonb) as value',[school,version,JSON.stringify(changes)]),
    publish:(classId,version)=>publish(db,classId,version),
  });
  let state=cloud.decode(); const classId=state.classes.find(c=>c.name==='5Ա').id;
  assert.equal(cloud.publicationState(state,classId),'unpublished');
  await cloud.publish(classId,state); assert.equal(cloud.publicationState(state,classId),'published');
  state.subjects.find(s=>s.name==='Մաթեմատիկա').color='#ffffff';
  assert.equal(cloud.publicationState(state,classId),'changed');
  await cloud.save(state); assert.equal(cloud.publicationState(state,classId),'changed');
  await cloud.publish(classId,state); assert.equal(cloud.publicationState(state,classId),'published');
  assert.equal(cloud.publication(classId).revision,2);
  state.school.name='Անվանափոխված դպրոց';
  state.school.timezone='Europe/Paris';
  await cloud.save(state); assert.equal(cloud.publicationState(state,classId),'changed');
  assert.notEqual((await published(db)).schoolName,state.school.name);
  await cloud.publish(classId,state); assert.equal((await published(db)).schoolName,state.school.name);
  assert.equal((await published(db)).timezone,'Europe/Paris');
  await as(db,'authenticated',scheduler);
  state.school.name='Forbidden scheduler edit';
  await assert.rejects(cloud.save(state),e=>e.code==='42501');
  state=await cloud.reload(); assert.equal(cloud.publicationState(state,state.classes.find(c=>c.name==='5Ա').id),'published');
});

test('Teacher save/publish → Student connect/restart/offline/switch/empty/invalidation', async t => {
  const db = await fixture(); t.after(() => db.close());
  const { Connection } = await import(await studentModule('connection'));
  const { fetchPublication } = await import(await studentModule('publication'));
  await as(db, 'authenticated', admin);
  const cloud = new CloudWorkspace(school, await read(db), {
    read: () => read(db),
    save: (version, changes) => scalar(db, 'select teacher_workspace_save($1,$2,$3::jsonb) as value', [school, version, JSON.stringify(changes)]),
    publish: (classId, version) => publish(db, classId, version),
  });
  const state = cloud.decode();
  const a = state.classes.find(c => c.name === '5Ա').id;
  const b = state.classes.find(c => c.id !== a).id;
  await cloud.publish(a, state);
  let saved = null, token = 0, offline = false;
  const views = [];
  const storage = { read: async () => structuredClone(saved), begin: async () => ++token,
    commit: async (current, record, cached) => { assert.equal(current, token); if (!cached) saved = structuredClone(record); } };
  const config = { environment: 'http://127.0.0.1:54321', key: 'sb_publishable_fixture' };
  const fetcher = (config, id) => fetchPublication(config, id, async (_url, init) => {
    if (offline) throw new Error('offline');
    await as(db, 'anon');
    return Response.json(await scalar(db, 'select get_published_schedule($1) as value', [JSON.parse(init.body).p_public_id]));
  });
  const student = () => new Connection(config, storage, view => views.push(view), fetcher);
  const first = student(); assert.equal(await first.restore(), false);
  const code = cloud.publication(a).public_id;
  await first.preview(code); await first.confirm();
  assert.equal(views.at(-1).publication.schedule['Երկուշաբթի'][0].lesson, 'Մաթեմատիկա');
  offline = true;
  const restarted = student(); await restarted.restore(); await restarted.refresh();
  assert.equal(views.at(-1).source, 'cached');
  await as(db, 'authenticated', admin);
  state.subjects.find(s => s.name === 'Մաթեմատիկա').name = 'Նոր առարկա';
  await cloud.save(state); await cloud.publish(a, state);
  offline = false;
  const updated = student(); await updated.restore(); await updated.refresh();
  assert.equal(views.at(-1).publication.revision, 2);
  assert.equal(views.at(-1).publication.schedule['Երկուշաբթի'][0].lesson, 'Նոր առարկա');
  await as(db, 'authenticated', admin); await cloud.publish(b, state);
  await updated.preview(cloud.publication(b).public_id); await updated.confirm();
  assert.equal(saved.publicId, cloud.publication(b).public_id);
  assert.ok(Object.values(saved.publication.schedule).every(day => !day.length));
  await updated.preview(code); await updated.confirm();
  await as(db, 'authenticated', admin);
  state.lessons = state.lessons.filter(lesson => lesson.classId !== a);
  await cloud.save(state); await cloud.publish(a, state);
  await updated.refresh(); assert.ok(Object.values(saved.publication.schedule).every(day => !day.length));
  await as(db, 'authenticated', admin); await db.query('update classes set active=false where id=$1', [classA]);
  await updated.refresh(); assert.equal(saved.publication, null);
  offline = true;
  const unavailable = student(); await unavailable.restore(); await assert.rejects(unavailable.refresh());
});
