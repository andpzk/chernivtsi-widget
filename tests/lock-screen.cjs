const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../widget.js'),'utf8');
function render({time='19:01',hour12=false,kind='normal',family='accessoryRectangular',cached=false,sourceName='official',error='',missingSymbol=false}={}) {
  const texts=[],images=[],drawings=[],textNodes=[],containers=[];
  class Widget {
    constructor(){this.children=[];containers.push(this);}
    addText(text){texts.push(text);const node={text,centerAlignText(){}};textNodes.push(node);this.children.push(node);return node;}
    addSpacer(length){this.children.push({spacer:length});}
    setPadding(){}
    addStack(){const child=new Widget();this.children.push(child);return child;}
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
    SFSymbol:{named:name=>missingSymbol?null:{image:{symbol:name}}},
    Font:{systemFont:size=>({size}),semiboldSystemFont:size=>({size})},Script:{name:()=> 'Світло'},
    DateFormatter:class{useNoDateStyle(){}useShortTimeStyle(){}string(date){return new Intl.DateTimeFormat('en-US',{hour:hour12?'numeric':'2-digit',minute:'2-digit',hourCycle:hour12?'h12':'h23'}).format(date);}}
  });
  vm.runInContext(source,ctx);
  const now=ctx.kyivTimestamp('2026-11-07',time);
  const cells=Array(48).fill('on');cells.fill('off',38,42);cells.fill('possible',42,43);
  const data={cells,date:'2026-11-07',source:sourceName,sourceAt:now,checkedAt:now-60000,cached,emergency:kind==='emergency'};
  if(kind==='unknown')cells.fill('unknown');
  if(kind==='cancelled')cells.fill('on',38);
  if(kind==='possibleLater'){cells.fill('on',38);cells[46]='possible';}
  if(kind==='unknownLater'){cells.fill('on',38);cells[46]='unknown';}
  if(kind==='gap')cells.fill('unknown',42,43);
  if(kind==='late')cells.fill('off',44);
  if(kind==='bounded')cells.fill('off',44);
  if(kind==='endgap')cells.fill('unknown',44);
  if(kind==='noon'){cells.fill('on');cells.fill('off',24,28);}
  if(kind==='screenshot'){cells.fill('off');cells.fill('on',3,10);}
  if(kind==='yesterday')data.date='2026-11-06';
  if(kind==='stale')data.sourceAt=now-3*3600000;
  const widget=ctx.makeLockScreenWidget(kind==='empty'?null:data,12,now,error,family);
  assert.ok(widget.refreshAfterDate.getTime()>now);
  assert.match(widget.url,/group=12$/);
  return {texts,refresh:widget.refreshAfterDate.getTime(),now,ctx,cells,data,images,drawings,textNodes,containers};
}
const clipped=render({time:'00:20',hour12:true,kind:'screenshot'});
const completeTimes=clipped.textNodes.filter(t=>t.text.includes(':'));
assert.deepEqual(completeTimes.map(t=>t.text),['1:30 AM','5:00 AM'],'Clock and AM/PM must share one scalable text element');
for(const text of completeTimes){assert.equal(text.lineLimit,1);assert.ok(text.minimumScaleFactor<=0.65);}
for(const hour12 of [false,true]){
  const off=render({hour12,kind:'bounded'});
  assert.equal(off.texts.slice(0,3).join(''),hour12?'9:30 PM – 10:00 PM':'21:30 – 22:00');
  assert.equal(off.images[0].image.symbol,'bolt');
  assert.ok(!off.texts.some(t=>/Нема світла|Зараз буде|Можливе|↻|група|год|хв|планового/.test(t)));
  const digits=off.textNodes.filter(t=>t.text.includes(':'));
  assert.equal(digits.length,2);assert.equal(digits[0].font.size,digits[1].font.size);
  const possible=render({time:'21:01',hour12,kind:'bounded'});
  assert.equal(possible.texts.slice(0,3).join(''),hour12?'9:30 PM – 10:00 PM':'21:30 – 22:00');
  const on=render({time:'18:59',hour12});
  assert.equal(on.texts.slice(0,3).join(''),hour12?'7:00 PM – 9:00 PM':'19:00 – 21:00');
  assert.equal(on.images[0].image.symbol,'bolt.slash');
  assert.equal(on.refresh-on.now,60000);
}
for(const kind of ['normal','endgap']) {
  const partial=render({kind});
  assert.equal(partial.texts.slice(0,3).join(''),'21:30 – —');
  assert.ok(partial.texts.some(t=>t.includes('кінець невідомий')));
}
const noSymbol=render({kind:'bounded',missingSymbol:true});
assert.ok(noSymbol.texts.some(t=>t.includes('Заживлення')),'Missing symbol keeps event meaning readable');
assert.ok(noSymbol.texts.includes('21:30')&&noSymbol.texts.includes('22:00'));
const noon=render({time:'11:59',kind:'noon',hour12:true});
assert.equal(noon.texts.slice(0,3).join(''),'12:00 PM – 2:00 PM','Already-localized noon must not gain a second PM');
assert.ok(render({cached:true,kind:'bounded'}).texts.includes('кеш'));
assert.ok(render({sourceName:'community',kind:'bounded'}).texts.includes('резерв'));
assert.ok(render({kind:'stale'}).texts.some(t=>t.includes('давні')));
const fallback=render({cached:true,sourceName:'community',kind:'bounded'});
assert.ok(fallback.texts.includes('кеш · резерв'));
assert.ok(!fallback.texts.some(t=>t.startsWith('↻')));
assert.equal(fallback.texts.slice(0,3).join(''),'21:30 – 22:00');
assert.ok(!fallback.texts.some(t=>t.startsWith('ще ')));
for(const kind of ['empty','yesterday','unknown','emergency']){
  const result=render({kind});
  assert.ok(!result.texts.some(t=>/^\d{1,2}:\d{2}/.test(t)),'Missing/emergency data must not predict event clocks');
  assert.equal(result.images.length,kind==='unknown'?2:0);
}
assert.ok(render({kind:'emergency'}).texts.includes('Аварійні відключення'));
for(const time of ['19:01','23:59']) {
  const clear=render({time,kind:'cancelled'});
  assert.ok(clear.texts.includes('Без відключень'));
  assert.ok(clear.texts.includes('до кінця дня'));
  assert.equal(clear.images[0].image.symbol,'bolt');
  assert.equal(clear.drawings.length,1,'Keep the schedule strip');
  assert.ok(!clear.texts.includes('Час невідомий'));
  const event=clear.containers.find(c=>c.size?.width===150&&c.children.some(child=>child.children?.some(t=>t.text==='Без відключень')));
  assert.equal(event.children[0].size.width,16,'Icon starts the same-width row as the strip');
  assert.deepEqual(event.children.at(-1),{spacer:undefined},'Trailing flexible space must anchor the short message to the left');
  const home=clear.ctx.eventView(clear.cells,clear.ctx.kyivParts(clear.now).slot);
  assert.equal(home.value,'Без відключень');
  assert.equal(home.headline,'До кінця дня');
}
for(const kind of ['possibleLater','unknownLater']) {
  const uncertain=render({kind});
  assert.ok(!uncertain.texts.includes('Без відключень'));
  assert.notEqual(uncertain.ctx.eventView(uncertain.cells,38).value,'Без відключень');
}
assert.ok(render({kind:'cancelled',cached:true}).texts.includes('кеш'));
assert.ok(render({kind:'cancelled',missingSymbol:true}).texts.includes('Без відключень'));
const late=render({time:'23:59',kind:'late'});
assert.ok(late.texts.includes('Час невідомий'));
assert.ok(late.texts.includes('01')&&late.texts.includes('04'));
assert.ok(late.drawings[0].ops.some(op=>op.color.alpha===0.35));
assert.equal(late.refresh-late.now,60000);
const hour=render({time:'17:59'});
assert.equal(hour.refresh-hour.now,60000,'Request the next hour even without a state change');
assert.ok(render({kind:'gap'}).texts.includes('Час невідомий'));
assert.ok(render({time:'21:00',kind:'gap'}).texts.includes('Час невідомий'));
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
for(const [time,target] of [['18:59','19:00'],['19:00','21:30'],['21:00','21:30'],['21:30',null]]) {
  assert.equal(ctx.lockScreenTarget(sample.data,ctx.kyivTimestamp('2026-11-07',time))?.time ?? null,target);
}
const interrupted=cells.slice();interrupted[42]='unknown';
assert.equal(ctx.lockScreenTarget({...sample.data,cells:interrupted},sample.now),null);
assert.equal(ctx.lockScreenTarget({...sample.data,cells:Array(48).fill('unknown')},sample.now),null);
const onGap=cells.slice();onGap[37]='unknown';
assert.equal(ctx.lockScreenTarget({...sample.data,cells:onGap},ctx.kyivTimestamp('2026-11-07','18:00')),null,'No cutoff prediction across unknown data');
const errorView=render({kind:'empty'});
assert.ok(errorView.texts.includes('Чернівці'));
assert.ok(!errorView.texts.some(t=>t.includes('12')));
assert.equal(ctx.lockScreenAxis(-60),'23');
assert.equal(ctx.lockScreenAxis(1440),'00');
assert.equal(render({hour12:true}).ctx.lockScreenAxis(1440),'12');
for(const time of ['00:00','19:01','21:01','23:59']) {
  const result=render({time}),drawing=result.drawings[0];
  assert.equal(drawing.respectScreenScale,true);assert.equal(drawing.opaque,false);
  assert.ok(drawing.ops.length<2500);
  for(const op of drawing.ops){assert.equal(op.color.hex,'FFFFFF');assert.ok(Object.values(op.rect).every(Number.isFinite));assert.ok(op.rect.x>=0&&op.rect.x+op.rect.width<=150);assert.ok(op.rect.y>=0&&op.rect.y+op.rect.height<=14);}
  const model=result.ctx.lockScreenSchedule(result.cells,time),pin=drawing.ops.at(-2).rect;
  assert.ok(Math.abs(pin.x+pin.width/2-model.marker*150)<1e-8);
}
console.log('PASS: Schedule strip coverage/marker for all 1440 minutes, midnight, exact transitions, unknown/emergency states, cached/source notices, 12/24-hour labels, native drawing geometry and other accessory families.');
