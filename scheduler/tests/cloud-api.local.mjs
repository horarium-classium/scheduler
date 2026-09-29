// Explicit local integration check. Never run against a hosted Supabase URL.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { CloudWorkspace } from '../src/cloud-workspace.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = process.env.SUPABASE_CLI || join(root, 'node_modules/.bin/supabase');
const config = JSON.parse(execFileSync(cli, ['status','--workdir',root,'--output','json'], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }));
const url = new URL(config.API_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
const school = 'aaaaaaaa-0000-0000-0000-000000000001';
const client = createClient(config.API_URL, config.ANON_KEY, { auth:{persistSession:false,autoRefreshToken:false} });
const login = await client.auth.signInWithPassword({email:'admin-a@local.test',password:'local-password'});
assert.equal(login.error,null);
const membership = await client.from('school_members').select('school_id, role, schools(id,name)').eq('user_id',login.data.user.id);
assert.equal(membership.error,null); assert.equal(membership.data[0].school_id,school);
const read = async () => { const r=await client.rpc('teacher_workspace_read',{p_school:school}); if(r.error)throw r.error; return r.data; };
const save = async (version, changes) => { const r=await client.rpc('teacher_workspace_save',{p_school:school,p_version:version,p_changes:changes});if(r.error)throw r.error;return r.data; };
const cloud = new CloudWorkspace(school, await read(), {read,save});
const state = cloud.decode(); assert.deepEqual(cloud.changes(state),[]);
const original = structuredClone(state);
state.classes.push({id:100,name:'Cloud API test '+Date.now()});
try {
 await cloud.save(state);
 const otherDevice = new CloudWorkspace(school,await read(),{read,save});
 assert.ok(otherDevice.decode().classes.some(c=>c.name===state.classes.at(-1).name));
 state.classes.at(-1).name += ' edited'; await cloud.save(state);
 await assert.rejects(otherDevice.save({...otherDevice.decode(),school:{name:'Stale',timezone:'Asia/Yerevan'}}),e=>e.code==='40001');
 console.log('Local API: authenticated membership, adapter round trip, second-device read and stale-write rejection passed.');
} finally { await cloud.save(original); await client.auth.signOut(); }
