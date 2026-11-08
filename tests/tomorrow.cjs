const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../widget.js'),'utf8');
const todayHtml=fs.readFileSync(path.join(__dirname,'fixtures/official-2026-11-07.html'),'utf8');
const tomorrowHtml=fs.readFileSync(path.join(__dirname,'fixtures/official-2026-11-08.html'),'utf8');
const captured=Date.parse('2026-11-07T21:00:00Z'); // 23:00 Kyiv, after the 22:30 publication.
function setup({now=captured,today=todayHtml,tomorrow=tomorrowHtml,cache=null}={}) {
  const requests=[],writes=[],texts=[];
  class FixedDate extends Date {static now(){return now;}}
  class Container {
    addStack(){return new Container();}addSpacer(){}layoutVertically(){}centerAlignContent(){}setPadding(){}
    addText(text){texts.push(text);return {centerAlignText(){}};}
    addImage(){return {applyFittingContentMode(){}};}
  }
  const ctx=vm.createContext({Date:FixedDate,Intl,module:{exports:{}},console:{log(){}},
    Request:class{constructor(url){this.url=url;requests.push(url);this.response={statusCode:200};}async loadString(){const body=this.url.endsWith('?next')?tomorrow:this.url.includes('raw.githubusercontent')?null:today;if(body===null)throw Error('Offline');return body;}},
    FileManager:{local:()=>({documentsDirectory:()=>'/cache',joinPath:(a,b)=>a+'/'+b,fileExists:()=>!!cache,readString:()=>JSON.stringify(cache),writeString:(p,s)=>writes.push(JSON.parse(s))})},
    SFSymbol:{named:name=>({image:{symbol:name}})},ListWidget:Container,Color:class{},Font:{systemFont(){},semiboldSystemFont(){}},Script:{name:()=> 'Світло'},
    Size:class{constructor(width,height){Object.assign(this,{width,height});}},Rect:class{},
    DrawContext:class{setFillColor(){}fillRect(){}fillEllipse(){}getImage(){return {}; }},
    DateFormatter:class{useNoDateStyle(){}useShortTimeStyle(){}string(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}}
  });
  vm.runInContext(source,ctx);return {ctx,requests,writes,texts};
}
(async()=>{
  const sample=setup(),{ctx}=sample;
  assert.equal(ctx.shiftDate('2026-12-31',1),'2027-01-01');
  assert.equal(ctx.shiftDate('2028-02-28',1),'2028-02-29');
  assert.equal(ctx.shiftDate('2026-03-29',1),'2026-03-30');
  assert.equal(ctx.shiftDate('2026-10-25',1),'2026-10-26');
  for(let group=1;group<=12;group++) {
    const current=ctx.parseOfficial(todayHtml,group,captured);
    const next=ctx.parseOfficial(tomorrowHtml,group,captured,'2026-11-08');
    assert.equal(current.cells.length,48);assert.equal(next.cells.length,48);
    assert.equal(next.sourceAt,ctx.kyivTimestamp('2026-11-07','22:30'));
    assert.ok(next.sourceAt<captured,'Publication time belongs to today');
    assert.equal(next.date,'2026-11-08');
  }
  assert.throws(()=>ctx.parseOfficial(todayHtml,12,captured,'2026-11-08'),/requested date/);
  assert.throws(()=>ctx.parseOfficial(tomorrowHtml.replace('<o>в</o>',''),1,captured,'2026-11-08'),/Incomplete/);
  assert.throws(()=>ctx.parseOfficial(tomorrowHtml.replace('<b>22:30</b>','<b>23:30</b>'),12,captured,'2026-11-08'),/future/);
  const data=await ctx.getSchedule(12,captured);
  assert.equal(sample.requests.length,2);assert.equal(sample.writes.length,1);
  assert.equal(data.tomorrow.date,'2026-11-08');assert.equal(data.tomorrow.source,'official');
  for(const missing of [null,todayHtml,'<html>Not published</html>',tomorrowHtml.replaceAll('<u>з</u>','<u>?</u>')]) {
    const run=setup({tomorrow:missing});const result=await run.ctx.getSchedule(12,captured);
    assert.equal(result.date,'2026-11-07');assert.equal(result.tomorrow,undefined,'Missing/bad future data must not discard today or become a forecast');
  }
  const offline=setup({today:null,tomorrow:null,cache:data});
  const saved=await offline.ctx.getSchedule(12,captured);
  assert.ok(saved.cached&&saved.tomorrow.cached);assert.equal(saved.tomorrow.date,'2026-11-08');
  const partial=setup({tomorrow:null,cache:data});
  const partialData=await partial.ctx.getSchedule(12,captured);
  assert.ok(!partialData.cached&&partialData.tomorrow.cached);assert.ok(partial.ctx.scheduleQuality(partialData).cached);
  const withdrawn=setup({tomorrow:'<html>Not published</html>',cache:data});
  assert.equal((await withdrawn.ctx.getSchedule(12,captured)).tomorrow,undefined);
  const wrongDate=structuredClone(data);wrongDate.tomorrow.date='2026-11-09';
  const invalid=setup({today:null,tomorrow:null,cache:wrongDate});
  assert.equal((await invalid.ctx.getSchedule(12,captured)).tomorrow,undefined);
  const corrupt=structuredClone(data);corrupt.tomorrow.cells[0]='garbage';
  const bad=setup({today:null,tomorrow:null,cache:corrupt});
  assert.equal((await bad.ctx.getSchedule(12,captured)).tomorrow,undefined);
  const midnight=ctx.kyivTimestamp('2026-11-08','00:05');
  const rollover=setup({now:midnight,today:null,tomorrow:null,cache:data});
  const rolled=await rollover.ctx.getSchedule(12,midnight);
  assert.equal(rolled.date,'2026-11-08');assert.ok(rolled.cached);assert.deepEqual([...rolled.cells],[...data.tomorrow.cells]);assert.equal(rolled.tomorrow,undefined);
  const emergency=setup({today:'<article class="wrap_article_v2_emergency">Emergency</article>'});
  assert.ok((await emergency.ctx.getSchedule(12,captured)).emergency);
  const cells=Array(48).fill('on');cells.fill('off',46);
  const nextCells=Array(48).fill('on');nextCells.fill('off',0,2);nextCells.fill('possible',2,3);nextCells.fill('off',10,12);
  const model=ctx.lockScreenSchedule(cells,'23:40',nextCells);
  assert.equal(model.current.end,1500,'Same status must join across midnight');
  assert.equal(model.next.start,1500);assert.equal(model.next.state,'possible');
  assert.equal(model.segments.find(p=>p.start<=1500&&p.end>1500).state,'possible');
  assert.ok(!model.segments.some(p=>p.state==='unknown'));
  const view=ctx.eventView(cells,47,nextCells);
  assert.equal(view.value,'23:00');assert.equal(view.detail,'01:00');assert.match(view.headline,/до завтра/);assert.match(view.following,/01:00 – 01:30 завтра/);
  const upcoming=ctx.eventView(Array(48).fill('on'),47,nextCells);
  assert.equal(upcoming.value,'00:00');assert.match(upcoming.headline,/завтра/);
  const futureData={...data,cells,tomorrow:{...data.tomorrow,cells:nextCells}};
  const at=ctx.kyivTimestamp('2026-11-07','23:40');
  sample.texts.length=0;
  ctx.makeLockScreenWidget({...futureData,cells:Array(48).fill('on')},12,at,'','accessoryRectangular');
  assert.ok(sample.texts.includes('Без відключень')&&sample.texts.includes('до кінця дня'),'Prioritize a clear evening over tomorrow on the Lock Screen');
  assert.ok(!sample.texts.includes('00:00'));
  for(const family of ['accessoryRectangular','accessoryInline','accessoryCircular']){
    sample.texts.length=0;ctx.makeLockScreenWidget(futureData,12,at,'',family);
    if(family==='accessoryRectangular'){assert.equal(sample.texts.slice(0,3).join(''),'01:30 – 05:00');assert.ok(!sample.texts.some(t=>/завтра|[+−]1|група/.test(t)));}
    else if(family==='accessoryCircular'){assert.ok(sample.texts.includes('Завтра о'));assert.ok(sample.texts.includes('01:00'));}
    else assert.ok(sample.texts.some(t=>t.includes('01:00 завтра')));
  }
  assert.equal(ctx.lockScreenTarget(futureData,at).at,Date.parse('2026-11-07T23:30:00Z'));
  assert.equal(ctx.lockScreenTarget(futureData,at).endAt,Date.parse('2026-11-08T03:00:00Z'));
  const beforeMidnight={...futureData,cells:Array(48).fill('on')};beforeMidnight.cells.fill('off',46);
  const night=ctx.lockScreenTarget(beforeMidnight,ctx.kyivTimestamp('2026-11-07','22:30'));
  assert.equal(night.time,'23:00');assert.equal(night.endTime,'01:00');
  const unknown=nextCells.slice();unknown[0]='unknown';
  assert.equal(ctx.lockScreenSchedule(cells,'23:40',unknown).next.state,'unknown','Do not skip uncertainty to predict restoration');
  assert.equal(ctx.lockScreenTarget({...futureData,tomorrow:{...futureData.tomorrow,cells:unknown}},at),null);
  for(const [date,duration] of [['2026-03-28','4 год'],['2026-10-24','6 год']]) {
    const at=ctx.kyivTimestamp(date,'23:00'),future=Array(48).fill('on');future.fill('off',0,8);
    const day={date,cells:Array(48).fill('off'),group:12,source:'official',sourceAt:at,checkedAt:at,emergency:false};
    day.tomorrow={...day,date:ctx.shiftDate(date,1),cells:future};sample.texts.length=0;
    ctx.makeLockScreenWidget(day,12,at,'','accessoryRectangular');assert.equal(sample.texts.slice(0,3).join(''),'04:00 – —');assert.equal((ctx.lockScreenTarget(day,at).at-at)/3600000,Number(duration[0]),'Target must retain elapsed Kyiv time across DST');
  }
  for (const [instant, end] of [
    ['2026-10-25T00:15:00Z',7],
    ['2026-10-25T01:15:00Z',7],
    ['2026-03-29T00:45:00Z',7]
  ]) {
    const at=Date.parse(instant),day={date:ctx.kyivParts(at).date,cells:Array(48).fill('on'),source:'official',sourceAt:at,checkedAt:at};
    day.cells.fill('off',0,end);sample.texts.length=0;
    ctx.makeLockScreenWidget(day,12,at,'','accessoryRectangular');
    assert.equal(ctx.lockScreenTarget(day,at).at-at,15*60000,`Actual restoration during DST: ${instant}`);
    assert.ok(sample.texts[0]=== (instant.includes('03-29')?'04:00':'03:30'));
    if(instant==='2026-10-25T00:15:00Z')assert.equal(ctx.lockScreenTarget(day,at).endAt,Date.parse('2026-10-25T01:00:00Z'),'Interval ends when rollback returns to an off slot');
  }
  const springAt=Date.parse('2026-03-29T00:45:00Z');
  const spring={date:'2026-03-29',cells:Array(48).fill('off'),source:'official',sourceAt:springAt,checkedAt:springAt};
  spring.cells[6]='on';spring.cells.fill('on',10);
  assert.equal(ctx.lockScreenTarget(spring,springAt).at,Date.parse('2026-03-29T02:00:00Z'),'A skipped on interval must not become the restoration target');
  spring.cells[8]='unknown';
  assert.equal(ctx.lockScreenTarget(spring,springAt),null,'Unknown data after the clock jump must stop the search');
  assert.ok(!ctx.validCache({...data,date:'2026-02-30'},12,captured));
  console.log('PASS: official today/tomorrow fixtures for all groups, publication dates, invalid/withdrawn future data, cache migration/rollover, overnight event ranges and every Lock Screen family.');
})().catch(error=>{console.error(error);process.exitCode=1;});
