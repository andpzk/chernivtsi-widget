const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../widget.js'),'utf8');
function render({time='19:01',hour12=false,kind='normal',family='accessoryRectangular',cached=false,sourceName='official',error=''}={}) {
  const texts=[];
  class Widget {
    addText(text){texts.push(text);return {centerAlignText(){}};}
    addSpacer(){}
    setPadding(){}
  }
  const ctx=vm.createContext({Intl,Date,module:{exports:{}},ListWidget:Widget,Color:class{},
    Font:{systemFont(){},semiboldSystemFont(){}},Script:{name:()=> 'Світло'},
    DateFormatter:class{useNoDateStyle(){}useShortTimeStyle(){}string(date){return new Intl.DateTimeFormat('en-US',{hour:hour12?'numeric':'2-digit',minute:'2-digit',hourCycle:hour12?'h12':'h23'}).format(date);}}
  });
  vm.runInContext(source,ctx);
  const now=ctx.kyivTimestamp('2026-11-07',time);
  const cells=Array(48).fill('on');cells.fill('off',38,42);cells.fill('possible',42,43);
  const data={cells,date:'2026-11-07',source:sourceName,sourceAt:now,checkedAt:now-60000,cached,emergency:kind==='emergency'};
  if(kind==='unknown')cells.fill('unknown');
  if(kind==='yesterday')data.date='2026-11-06';
  if(kind==='stale')data.sourceAt=now-3*3600000;
  const widget=ctx.makeLockScreenWidget(kind==='empty'?null:data,12,now,error,family);
  assert.ok(widget.refreshAfterDate.getTime()>now);
  assert.match(widget.url,/group=12$/);
  return {texts,refresh:widget.refreshAfterDate.getTime(),now};
}
for(const hour12 of [false,true]){
  const off=render({hour12});
  assert.ok(off.texts.includes('Без світла'));
  assert.ok(off.texts.includes(`Можливе заживлення з ${hour12?'9:00 PM':'21:00'}`));
  const possible=render({time:'21:01',hour12});
  assert.ok(possible.texts.includes('Можливе заживлення'));
  assert.ok(possible.texts.includes(`Заживлення з ${hour12?'9:30 PM':'21:30'}`));
  const on=render({time:'18:59',hour12});
  assert.ok(on.texts.includes(`Відключення о ${hour12?'7:00 PM':'19:00'}`));
  assert.equal(on.refresh-on.now,60000);
}
assert.ok(render({cached:true}).texts.at(-1).endsWith('· кеш'));
assert.ok(render({sourceName:'community'}).texts.at(-1).endsWith('· резерв'));
assert.ok(render({kind:'stale'}).texts.at(-1).endsWith('· давні'));
for(const kind of ['empty','yesterday','unknown','emergency']){
  const result=render({kind});
  assert.ok(!result.texts.some(t=>/з 21:00|о 19:00/.test(t)),'Missing/emergency data must not predict a power transition');
}
assert.ok(render({kind:'emergency'}).texts.includes('Аварійні відключення'));
assert.ok(render({time:'23:59'}).texts.includes('За графіком до кінця доби'));
assert.equal(render({family:'accessoryInline'}).texts.length,1);
assert.ok(render({family:'accessoryCircular'}).texts.includes('21:00'));
assert.ok(render({error:'Вкажіть групу від 1 до 12'}).texts.includes('Перевірте групу'));
assert.ok(render({error:'Не вдалося прочитати дані'}).texts.includes('Немає даних'));
console.log('PASS: Lock Screen status/next transition, system-style time, refresh boundary, cache/source labels, missing/old/emergency data, midnight and all accessory families.');
