// Explicit local-only HTTP integration. Creates an isolated school/user, cleans
// up its own UUIDs, and never resets the database or reads project .env files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { createClient } = createRequire(new URL('../../apps/teacher/package.json', import.meta.url))('@supabase/supabase-js');
import { CloudWorkspace } from '../../apps/teacher/src/cloud-workspace.ts';
import { load } from '../../apps/student/tests/load.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const status = spawnSync(join(root, 'node_modules/.bin/supabase'), ['status', '--workdir', root, '--output', 'json'], { encoding: 'utf8' });
if (status.status !== 0) throw new Error('Local Supabase status failed; start the local stack first.');
const config = JSON.parse(status.stdout); // Contains credentials: never print it.
const endpoint = new URL(config.API_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(endpoint.hostname) && endpoint.port === '54321', 'Local endpoint required');
const container = 'supabase_db_horarium-classium';
function sql(statement) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Local fixture SQL failed');
  return result.stdout.trim();
}
assert.equal(sql("select to_regprocedure('public.get_published_schedule(text)') is not null;"), 't', 'Apply local publication migrations first');
const tables = ['profiles', 'schools', 'school_members', 'classes', 'time_slots', 'subjects', 'teachers', 'lessons', 'schedule_publications'];
function fingerprint() {
  return sql(`select md5(string_agg(value, '' order by value)) from (${tables.map(table => `select '${table}:' || to_jsonb(t)::text as value from public.${table} t`).join(' union all ')}) records;`);
}
const before = fingerprint();
const school = randomUUID();
const email = `publication-${randomUUID()}@local.test`;
const password = randomUUID() + randomUUID();
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const teacher = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const directory = await mkdtemp(join(tmpdir(), 'horarium-publication-local-'));
const cachePath = join(directory, 'publication-v3.json');
let userId, stage = 'create fixture';
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error('Local Auth fixture creation failed');
  userId = created.data.user.id;
  assert.match(userId, /^[0-9a-f-]{36}$/);
  sql(`begin;
    insert into public.schools(id,name,timezone) values ('${school}','Student local integration','America/New_York');
    insert into public.school_members(school_id,user_id,role) values ('${school}','${userId}','admin');
    commit;`);
  const login = await teacher.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error('Local Auth login failed');
  const rpc = async (name, args) => {
    const result = await teacher.rpc(name, args);
    if (result.error) throw new Error(`Local RPC ${name} failed (${result.error.code})`);
    return result.data;
  };
  const read = () => rpc('teacher_workspace_read', { p_school: school });
  const cloud = new CloudWorkspace(school, await read(), {
    read,
    save: (version, changes) => rpc('teacher_workspace_save', { p_school: school, p_version: version, p_changes: changes }),
    publish: (classId, version) => rpc('publish_schedule', { p_school: school, p_class: classId, p_version: version }),
  });
  const state = cloud.decode();
  state.classes = [{ id: 1, name: 'Փորձ Ա' }, { id: 2, name: 'Փորձ Բ' }];
  state.subjects = [{ id: 1, schoolId: 1, name: 'Մաթեմատիկա', color: '#dbeafe' }];
  state.timeSlots = [{ id: 1, schoolId: 1, start: '09:00', end: '09:45' }];
  state.lessons = [{ id: 1, classId: 1, weekday: 1, timeSlotId: 1, subjectId: 1, teacherId: null, comment: 'private' }];
  state.lastSelectedClassId = 1;
  stage = 'Teacher save and publication';
  await cloud.save(state); await cloud.publish(1, state);
  const codeA = cloud.joinCode(1);
  const codeB = cloud.joinCode(2);
  const { Connection } = await import(await load('connection'));
  const { fetchPublication, validateCache } = await import(await load('publication'));
  const { schoolTime } = await import(await load('school-time'));
  const studentConfig = { environment: endpoint.origin, key: config.PUBLISHABLE_KEY || config.ANON_KEY };
  let offline = false, token = 0, lastView;
  // Real disk persists across controller instances. This adapter is deliberately
  // not evidence for Tauri IPC/native UI; Rust storage is tested separately.
  const storage = {
    read: async () => { try { return JSON.parse(await readFile(cachePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    begin: async () => ++token,
    commit: async (current, record, cached) => {
      assert.equal(current, token);
      validateCache(record);
      if (!cached) { await writeFile(cachePath + '.tmp', JSON.stringify(record)); await rename(cachePath + '.tmp', cachePath); }
    },
  };
  const fetcher = (config, id) => fetchPublication(config, id, (...args) => {
    if (offline) return Promise.reject(new TypeError('Simulated disconnected transport'));
    return fetch(...args);
  });
  const student = () => new Connection(studentConfig, storage, view => { lastView = view; }, fetcher);
  stage = 'Student confirm and offline restart';
  let connection = student(); assert.equal(await connection.restore(), false);
  const preview = await connection.preview(codeA);
  assert.equal(preview.schoolName, state.school.name); assert.equal(preview.className, 'Փորձ Ա');
  assert.equal(await connection.confirm(), true);
  assert.equal(lastView.publication.schedule['Երկուշաբթի'][0].lesson, 'Մաթեմատիկա');
  assert.equal(lastView.publication.timezone, 'America/New_York');
  assert.equal(schoolTime(new Date('2026-09-21T02:00:00Z'), lastView.publication.timezone).date, '2026-09-20');
  offline = true; connection = student(); await connection.restore(); await connection.refresh();
  assert.equal(lastView.source, 'cached');
  stage = 'new revision and class change';
  state.subjects[0].name = 'Նոր առարկա'; await cloud.save(state); await cloud.publish(1, state);
  offline = false; connection = student(); await connection.restore(); await connection.refresh();
  assert.equal(lastView.publication.revision, 2); assert.equal(lastView.publication.schedule['Երկուշաբթի'][0].lesson, 'Նոր առարկա');
  await assert.rejects(connection.preview('not-a-uuid'));
  assert.equal(connection.selection.joinCode, codeA);
  await assert.rejects(connection.preview(codeB)); // Not published yet.
  assert.equal(connection.selection.joinCode, codeA);
  await cloud.publish(2, state);
  await connection.preview(codeB); await connection.confirm();
  assert.equal(connection.selection.joinCode, codeB);
  assert.ok(Object.values(lastView.publication.schedule).every(day => day.length === 0));
  await connection.preview(codeA); await connection.confirm();
  stage = 'empty publication and persistent unavailable state';
  state.lessons = []; await cloud.save(state); await cloud.publish(1, state);
  await connection.refresh(); assert.equal(lastView.publication.revision, 3);
  assert.ok(Object.values(lastView.publication.schedule).every(day => day.length === 0));
  const archive = await teacher.from('classes').update({ active: false }).eq('school_id', school).eq('join_code', codeA);
  if (archive.error) throw new Error('Local archive failed');
  await connection.refresh(); assert.equal(lastView.publication, null);
  offline = true; connection = student(); await connection.restore();
  await assert.rejects(connection.refresh()); assert.equal(connection.selection.publication, null);
  stage = 'anonymous privacy';
  const anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const draft = await anon.rpc('teacher_workspace_read', { p_school: school });
  assert.ok(draft.error, 'Anonymous access to drafts must fail');
  console.log('PASS: real local Auth/PostgREST, Teacher save/publish, Student join-code confirmation, timezone, offline restart, revision refresh, class switch, empty publication, persistent null and anonymous privacy.');
} catch {
  throw new Error(`Local publication integration failed at: ${stage}. Credentials omitted.`);
} finally {
  await teacher.auth.signOut();
  sql(`begin;
    delete from public.schedule_publications where school_id='${school}';
    delete from public.lessons where school_id='${school}';
    delete from private.class_join_codes where class_id in (select id from public.classes where school_id='${school}');
    delete from public.classes where school_id='${school}';
    delete from public.time_slots where school_id='${school}';
    delete from public.subjects where school_id='${school}';
    delete from public.teachers where school_id='${school}';
    delete from public.school_members where school_id='${school}';
    delete from public.schools where id='${school}';
    commit;`);
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw new Error('Local Auth fixture cleanup failed');
  }
  await rm(directory, { recursive: true, force: true });
  assert.equal(fingerprint(), before, 'Pre-existing public data must remain unchanged');
  console.log('PASS: isolated school/user/cache removed; pre-existing public data fingerprint unchanged.');
}
