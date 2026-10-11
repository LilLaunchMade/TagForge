// SPDX-License-Identifier: GPL-3.0-or-later
// Collect exact installed frontend dependency notices. No network access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
fs.mkdirSync('docs/licenses/npm',{recursive:true});
const list=[];
for(const [dir,item] of Object.entries(lock.packages)){
  if(!dir)continue;
  const file=path.join(dir,'package.json');if(!fs.existsSync(file))continue;
  const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
  const notices=fs.readdirSync(dir).filter(n=>/^(license|copying|notice)/i.test(n)&&fs.statSync(path.join(dir,n)).isFile());
  for(const name of notices)fs.copyFileSync(path.join(dir,name),`docs/licenses/npm/${pkg.name.replaceAll('/','_')}-${pkg.version}-${name}`);
  list.push({name:pkg.name,version:pkg.version,license:pkg.license??item.license??'UNKNOWN',development:!!item.dev,notices});
}
fs.writeFileSync('docs/licenses/npm-inventory.json',JSON.stringify(list,null,2)+'\n');
console.log(`Collected notices for ${list.length} installed packages.`);
if(list.some(p=>p.license==='UNKNOWN'))process.exitCode=1;
