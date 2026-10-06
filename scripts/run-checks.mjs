import {spawnSync} from 'node:child_process';
for(const file of ['verify.mjs','verify-filters.mjs','verify-server.mjs','verify-catalog.mjs','verify-upgrades.mjs','verify-people.mjs','verify-hints.mjs','verify-titles.mjs','verify-covers.mjs','verify-public.mjs','verify-pages.mjs','verify-feedback.mjs','verify-weekly.mjs']) {
  const result=spawnSync(process.execPath,[file],{stdio:'inherit'});
  if(result.status!==0) process.exit(result.status||1);
}
