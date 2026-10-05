import assert from 'node:assert/strict';
import { config } from 'dotenv';

// Creates missing QA users only. Never resets data, passwords or permissions.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes', 'Explicit local QA opt-in required');
assert.ok(process.env.LCM_QA_PASSWORD, 'QA password required');
config({ path: '.env', quiet: true });
const base=process.env.LCM_QA_BASE_URL ?? 'http://localhost:3000/api';
assert.ok(['http://localhost:3000/api', 'http://localhost:3001/api'].includes(base), 'Only fixed local QA ports allowed');
const health=await fetch(`${base}/health`).then(r=>r.json());
assert.equal(health.environment,'development','Local development API required');
assert.ok(process.env.INITIAL_ADMIN_PASSWORD,'Bootstrap admin password required');
async function login(username,password){
  const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
  assert.equal(response.status,200,`Login failed for ${username}; credentials are not printed`);
  return response.json();
}
const admin=await login('admin',process.env.INITIAL_ADMIN_PASSWORD);
const headers={authorization:`Bearer ${admin.accessToken}`,'content-type':'application/json'};
const users=[];let nextToken;
do{const query=new URLSearchParams({pageSize:'100',...(nextToken?{nextToken}:{})});const response=await fetch(`${base}/users?${query}`,{headers});assert.equal(response.status,200);const page=await response.json();users.push(...page.items);nextToken=page.nextToken;}while(nextToken);
let created=0;
for(const role of ['ADMIN','MANAGER','CASHIER','PURCHASING','WAREHOUSE','LOGISTICS','DRIVER']){
  const username=`qa.${role.toLowerCase()}`;const existing=users.find(u=>u.username===username);
  if(existing){assert.equal(existing.role,role,`${username}: unexpected existing role; not modified`);assert.equal(existing.status,'ACTIVE',`${username}: inactive; not modified`);}
  else{const response=await fetch(`${base}/users`,{method:'POST',headers,body:JSON.stringify({name:`QA ${role}`,username,email:`${username}@qa.local.invalid`,password:process.env.LCM_QA_PASSWORD,role})});assert.equal(response.status,201,`Create failed for ${username}`);created++;}
  await login(username,process.env.LCM_QA_PASSWORD);
  console.log(JSON.stringify({username,role,login:'PASS',created:!existing}));
}
console.log(JSON.stringify({result:'PASS',created,scope:'local QA users only; no reset or credential changes'}));
