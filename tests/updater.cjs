const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const installer = fs.readFileSync(path.join(root, 'Install.js'), 'utf8');
const prefix = '// Chernivtsi widget module (API 1)\n';
const hour = 3600000;
const start = Date.parse('2026-11-07T18:00:00Z');
const statePath = '/lib/chernivtsi-widget-updater/state.json';
let serial = 0;

function release(version, fails = false) {
  return prefix + `module.exports = {apiVersion:1, async build(settings) {
    ${fails ? 'throw Error("Broken release");' : ''}
    return {version:${JSON.stringify(version)},group:args.widgetParameter||settings.group,width:settings.widgetWidth,async presentMedium(){}};
  }};`;
}
async function run(files, {remote=release('one'),offline=false,status=200,apiStatus=200,sha='a'.repeat(40),app=false,now=start,group='12',brokenStateWrite=false}={}) {
  let widget, finished=false, requests=0, imports=0;
  const missingReads=[];
  const urls=[];
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const fm = {
    libraryDirectory:()=>'/lib', joinPath:(a,b)=>a+'/'+b, createDirectory(){},
    fileExists:p=>files.has(p), readString(p){if(!files.has(p)){missingReads.push(p);throw Error('Missing');}return files.get(p);},
    writeString(p,s){if(brokenStateWrite&&p===statePath){files.set(p,'{partial');throw Error('Interrupted write');}files.set(p,s);},
    remove:p=>files.delete(p)
  };
  const sandbox = {Date:FixedDate,Set,console:{log(){}},
    FileManager:{local:()=>fm},
    UUID:{string:()=>`00000000-0000-0000-0000-${String(++serial).padStart(12,'0')}`},
    Request:class {
      constructor(url){urls.push(url);this.api=url.startsWith('https://api.github.com/');this.response={statusCode:this.api?apiStatus:status};
        if(this.api) assert.match(url,/^https:\/\/api\.github\.com\/repos\/andpzk\/chernivtsi-widget\/commits\?sha=main&per_page=1&check=[0-9a-f-]{36}$/);
        else {assert.equal(url,`https://raw.githubusercontent.com/andpzk/chernivtsi-widget/${sha}/widget.js`);requests++;}
      }
      async loadJSON(){assert.ok(this.api);if(offline)throw Error('Offline');return [{sha}];}
      async loadString(){assert.ok(!this.api);if(offline)throw Error('Offline');return remote;}
    },
    ListWidget:class {constructor(){this.texts=[];}setPadding(){}addSpacer(){}addText(t){this.texts.push(t);return {};}async presentMedium(){}},
    Color:class {static dynamic(a,b){return {a,b};}},Font:{systemFont(){},semiboldSystemFont(){}},
    config:{runsInApp:app,runsInWidget:!app},args:{widgetParameter:group},
    Script:{name:()=> 'Чернівці Світло',setWidget:w=>widget=w,complete:()=>finished=true}
  };
  const context=vm.createContext(sandbox);
  sandbox.importModule=p=>{imports++;return vm.runInContext(`(function(module){${fm.readString(p)}\nreturn module.exports;})({exports:{}})`,context);};
  await vm.runInContext(`(async()=>{${installer}})()`,context);
  assert.ok(finished);
  assert.deepEqual(missingReads,[], 'Missing files must be checked before reading: Scriptable logs even caught errors');
  return {widget,requests,imports,urls};
}

(async()=>{
  const files=new Map();
  let result=await run(files,{group:'7'});
  assert.equal(result.widget.version,'one');assert.equal(result.widget.group,'7');assert.equal(result.widget.width,undefined,'New installs let the module detect device dimensions');
  assert.equal(result.requests,1);
  const first=JSON.parse(files.get(statePath)).current;
  assert.ok(files.has('/lib/chernivtsi-widget-updater/'+first));
  result=await run(files,{now:start+60000,remote:release('two')});
  assert.equal(result.requests,0);assert.equal(result.widget.version,'one');
  result=await run(files,{now:start+120000,app:true,remote:release('two')});
  assert.equal(result.requests,1);assert.equal(result.widget.version,'two');
  const manualURL=result.urls[0];
  result=await run(files,{now:start+120000,app:true,remote:release('two'),sha:'b'.repeat(40)});
  assert.notEqual(result.urls[0],manualURL,'Each manual check must use a fresh API URL');
  assert.equal(result.urls[1],`https://raw.githubusercontent.com/andpzk/chernivtsi-widget/${'b'.repeat(40)}/widget.js`);
  const second=JSON.parse(files.get(statePath)).current;
  for(const options of [{apiStatus:403},{apiStatus:429},{sha:'main'},{sha:'../main'}]) {
    result=await run(files,{...options,app:true,remote:release('bad')});
    assert.equal(result.widget.version,'two');
    assert.equal(result.requests,0,'Failed commit lookup must not download an unverified branch URL');
  }
  assert.equal(JSON.parse(files.get(statePath)).previous,first);
  result=await run(files,{now:start+2*hour,offline:true});
  assert.equal(result.widget.version,'two');
  for(const options of [{remote:'<html>error</html>'},{status:404},{remote:prefix+'invalid javascript here'},{remote:release('bad',true)},{remote:prefix+'module.exports={apiVersion:2};'}]) {
    result=await run(files,{...options,app:true,now:start+3*hour});
    assert.equal(result.widget.version,'two');
    assert.equal(JSON.parse(files.get(statePath)).current,second);
  }
  const count=files.size;
  result=await run(files,{now:start+4*hour,remote:release('two')});
  assert.equal(result.widget.version,'two');assert.equal(files.size,count,'Unchanged code must not create another module');
  files.set('/lib/chernivtsi-widget-updater/'+second,release('broken-local',true));
  result=await run(files,{now:start+4*hour+1000});
  assert.equal(result.widget.version,'one','A broken current module must fall back to previous');
  assert.equal(JSON.parse(files.get(statePath)).current,first);
  result=await run(files,{app:true,remote:release('three'),brokenStateWrite:true,now:start+5*hour});
  assert.equal(result.widget.version,'three');
  result=await run(files,{offline:true,now:start+6*hour});
  assert.equal(result.widget.version,'one','An interrupted state write must keep the earlier working version reachable');
  const empty=await run(new Map(),{offline:true});
  assert.ok(empty.widget.texts.includes('Потрібне перше завантаження'));
  const current=fs.readFileSync(path.join(root,'widget.js'),'utf8');
  assert.ok(current.startsWith(prefix));
  assert.ok(current.endsWith('module.exports = {apiVersion: 1, build: buildWidget};\n'));
  new Function('module',current);
  console.log('PASS: install, hourly checks, manual update, offline cache, bad HTTP/content/syntax/API/runtime, rollback, interrupted state write, local settings and first-run error.');
})().catch(error=>{console.error(error);process.exitCode=1;});
