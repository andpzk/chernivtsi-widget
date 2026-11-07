const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../widget.js'),'utf8');
function render({time='19:01',hour12=false,kind='normal',family='accessoryRectangular',cached=false,sourceName='official',error=''}={}) {
  const texts=[],images=[],drawings=[];
  class Widget {
    addText(text){texts.push(text);return {centerAlignText(){}};}
    addSpacer(){}
    setPadding(){}
    addStack(){return new Widget();}
    layoutVertically(){}
    centerAlignContent(){}
    addImage(image){const node={image,applyFittingContentMode(){}};images.push(node);return node;}
  }
  class DrawContext {
    constructor(){this.ops=[];drawings.push(this);}
    setFillColor(color){this.color=color;}
    fillRect(rect){this.ops.push({rect,color:this.color});}
    fillEllipse(rect){this.ops.push({rect,color:this.color,ellipse:true});}
    getImage(){return {size:this.size,ops:this.ops};}
  }
  const ctx=vm.createContext({Intl,Date,module:{exports:{}},ListWidget:Widget,DrawContext,
    Color:class{constructor(hex,alpha=1){Object.assign(this,{hex,alpha});}},
    Size:class{constructor(width,height){Object.assign(this,{width,height});}},
    Rect:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},
    Font:{systemFont(){},semiboldSystemFont(){}},Script:{name:()=> 'Світло'},
    DateFormatter:class{useNoDateStyle(){}useShortTimeStyle(){}string(date){return new Intl.DateTimeFormat('en-US',{hour:hour12?'numeric':'2-digit',minute:'2-digit',hourCycle:hour12?'h12':'h23'}).format(date);}}
  });
  vm.runInContext(source,ctx);
  const now=ctx.kyivTimestamp('2026-11-07',time);
  const cells=Array(48).fill('on');cells.fill('off',38,42);cells.fill('possible',42,43);
  const data={cells,date:'2026-11-07',source:sourceName,sourceAt:now,checkedAt:now-60000,cached,emergency:kind==='emergency'};
  if(kind==='unknown')cells.fill('unknown');
  if(kind==='gap')cells.fill('unknown',42,43);
  if(kind==='late')cells.fill('off',44);
  if(kind==='yesterday')data.date='2026-11-06';
  if(kind==='stale')data.sourceAt=now-3*3600000;
  const widget=ctx.makeLockScreenWidget(kind==='empty'?null:data,12,now,error,family);
  assert.ok(widget.refreshAfterDate.getTime()>now);
  assert.match(widget.url,/group=12$/);
  return {texts,refresh:widget.refreshAfterDate.getTime(),now,ctx,cells,images,drawings};
}
for(const hour12 of [false,true]){
  const off=render({hour12});
  assert.ok(off.texts.includes('12 · Без світла'));
  assert.ok(off.texts.includes('Можливе заживлення'));
  assert.ok(off.texts.includes(hour12?'9:00 PM':'21:00'));
  assert.ok(off.texts.includes('ще 1 год 59 хв'));
  const possible=render({time:'21:01',hour12});
  assert.ok(possible.texts.includes('12 · Можливе світло'));
  assert.ok(possible.texts.includes('Планове заживлення'));
  assert.ok(possible.texts.includes(hour12?'9:30 PM':'21:30'));
  assert.ok(possible.texts.includes('ще 29 хв'));
  const on=render({time:'18:59',hour12});
  assert.ok(on.texts.includes('Відключення'));
  assert.ok(on.texts.includes(hour12?'7:00 PM':'19:00'));
  assert.equal(on.refresh-on.now,60000);
}
assert.ok(render({cached:true}).texts.includes('кеш'));
assert.ok(render({sourceName:'community'}).texts.includes('резерв'));
assert.ok(render({kind:'stale'}).texts.includes('давні'));
const fallback=render({cached:true,sourceName:'community'});
assert.ok(fallback.texts.includes('кеш · резерв'));
assert.ok(fallback.texts.includes('↻ 19:00'));
assert.ok(!fallback.texts.some(t=>t.startsWith('ще ')));
for(const kind of ['empty','yesterday','unknown','emergency']){
  const result=render({kind});
  assert.ok(!result.texts.some(t=>t==='21:00'||t.startsWith('ще ')),'Missing/emergency data must not predict a power transition');
  assert.equal(result.images.length,kind==='unknown'?1:0);
}
assert.ok(render({kind:'emergency'}).texts.includes('Аварійні відключення'));
assert.ok(render({time:'23:59'}).texts.includes('Далі графіка немає'));
const late=render({time:'23:59',kind:'late'});
assert.ok(late.texts.includes('—'));
assert.ok(late.texts.includes('01 +1')&&late.texts.includes('04 +1'));
assert.ok(late.drawings[0].ops.some(op=>op.color.alpha===0.35));
assert.equal(late.refresh-late.now,60000);
const hour=render({time:'17:59'});
assert.equal(hour.refresh-hour.now,60000,'Request the next hour even without a state change');
assert.ok(render({kind:'gap'}).texts.includes('Немає даних з'));
assert.ok(render({time:'21:00',kind:'gap'}).texts.includes('—'));
assert.equal(render({family:'accessoryInline'}).texts.length,1);
assert.ok(render({family:'accessoryCircular'}).texts.includes('21:00'));
assert.ok(render({error:'Вкажіть групу від 1 до 12'}).texts.includes('Перевірте групу'));
assert.ok(render({error:'Не вдалося прочитати дані'}).texts.includes('Немає даних'));
// Every minute shares one coordinate system for state, strip and marker, including day edges.
const sample=render(),{ctx,cells}=sample;
for(let minute=0;minute<1440;minute++) {
  const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  const model=ctx.lockScreenSchedule(cells,time);
  assert.equal(model.segments[0].start,model.start);
  assert.equal(model.segments.at(-1).end,model.end);
  assert.equal(model.segments.reduce((n,p)=>n+p.end-p.start,0),360);
  for(let i=1;i<model.segments.length;i++)assert.equal(model.segments[i].start,model.segments[i-1].end);
  const at=model.segments.find(p=>minute>=p.start&&minute<p.end);
  assert.equal(at.state,cells[Math.floor(minute/30)]);
  assert.equal(model.current.state,at.state);
  assert.ok(Math.abs(model.start+model.marker*360-minute)<1e-8);
  if(model.next)assert.ok(model.next.start>minute);
}
for(const [time,state,next] of [['18:59','on','off'],['19:00','off','possible'],['21:00','possible','on'],['21:30','on',undefined]]){
  const model=ctx.lockScreenSchedule(cells,time);assert.equal(model.current.state,state);assert.equal(model.next?.state,next);
}
assert.equal(ctx.lockScreenAxis(-60),'23 −1');
assert.equal(ctx.lockScreenAxis(1440),'00 +1');
assert.equal(render({hour12:true}).ctx.lockScreenAxis(1440),'12 +1');
for(const time of ['00:00','19:01','21:01','23:59']) {
  const result=render({time}),drawing=result.drawings[0];
  assert.equal(drawing.respectScreenScale,true);assert.equal(drawing.opaque,false);
  assert.ok(drawing.ops.length<2500);
  for(const op of drawing.ops){assert.equal(op.color.hex,'FFFFFF');assert.ok(Object.values(op.rect).every(Number.isFinite));assert.ok(op.rect.x>=0&&op.rect.x+op.rect.width<=150);assert.ok(op.rect.y>=0&&op.rect.y+op.rect.height<=14);}
  const model=result.ctx.lockScreenSchedule(result.cells,time),pin=drawing.ops.at(-2).rect;
  assert.ok(Math.abs(pin.x+pin.width/2-model.marker*150)<1e-8);
}
console.log('PASS: Schedule strip coverage/marker for all 1440 minutes, midnight, exact transitions, unknown/emergency states, cached/source notices, 12/24-hour labels, native drawing geometry and other accessory families.');
