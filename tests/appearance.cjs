const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../widget.js'), 'utf8');

async function render(width, state = 'off', group = '12', family = 'medium', tomorrow = false, missingSymbol = false, clearEvening = false, screenWidth = null, format12 = false, warnings = false) {
  const images = [], texts = [], drawings = [];
  class Container {
    constructor(){this.children=[];}
    addStack(){const c=new Container();this.children.push(c);return c;}
    addText(text){const c={text,centerAlignText(){}};this.children.push(c);texts.push(c);return c;}
    addSpacer(length){this.children.push({spacer:length});}
    addImage(image){const c={image,applyFittingContentMode(){}};this.children.push(c);images.push(c);return c;}
    layoutVertically(){this.vertical=true;}
    setPadding(...padding){this.padding=padding;}
    centerAlignContent(){}
    topAlignContent(){}
  }
  class ListWidget extends Container {async presentMedium(){}}
  class Shape {
    constructor(){this.points=[];}
    move(p){this.points.push(p);}
    addLine(p){this.points.push(p);}
    closeSubpath(){}
    addRoundedRect(rect){this.rect=rect;}
  }
  class DrawContext {
    constructor(){this.ops=[];drawings.push(this);}
    setFillColor(color){this.fill=color;}
    setStrokeColor(color){this.stroke=color;}
    setLineWidth(width){this.lineWidth=width;}
    fillEllipse(rect){this.ops.push({kind:'ellipse',rect,color:this.fill});}
    fillRect(rect){this.ops.push({kind:'rect',rect,color:this.fill});}
    addPath(shape){this.path=shape;}
    fillPath(){this.ops.push({kind:'path',path:this.path,color:this.fill});}
    strokePath(){this.ops.push({kind:'stroke',path:this.path,color:this.stroke,lineWidth:this.lineWidth});}
    drawImageInRect(image,rect){this.ops.push({kind:'image',image,rect});}
    getImage(){return {size:this.size,ops:this.ops,opaque:this.opaque};}
  }
  class Color {constructor(hex,alpha=1){Object.assign(this,{hex,alpha});}static dynamic(light,dark){return {light,dark};}}
  const beforeOutage=family==='small'&&state==='on';
  class FixedDate extends Date {static now(){return Date.parse(tomorrow?'2026-11-07T21:40:00Z':beforeOutage?'2026-11-07T15:30:00Z':'2026-11-07T17:01:00Z');}}
  const cache={date:'2026-11-07',group:12,source:'official',emergency:state==='emergency',checkedAt:FixedDate.now(),sourceAt:FixedDate.now(),cells:Array(48).fill('on')};
  if(family==='small')cache.checkedAt-=7*60*1000;
  if(warnings){cache.source='community';cache.sourceAt-=3*60*60*1000;}
  cache.cells.fill(beforeOutage?'off':state,38,42);cache.cells.fill('possible',42,43);
  if(cache.emergency)cache.cells.fill('unknown');
  if(clearEvening)cache.cells.fill('on',38);
  if(tomorrow){cache.tomorrow={...cache,date:'2026-11-08',cells:Array(48).fill('on')};cache.tomorrow.cells.fill('off',0,2);cache.tomorrow.cells.fill('possible',2,3);}
  const ctx=vm.createContext({console:{log(){}},Intl,Date:FixedDate,module:{exports:{}},ListWidget,DrawContext,Path:Shape,Color,
    Size:class {constructor(width,height){Object.assign(this,{width,height});}},
    Point:class {constructor(x,y){Object.assign(this,{x,y});}},
    Rect:class {constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},
    LinearGradient:class {},Font:{systemFont:size=>({size}),semiboldSystemFont:size=>({size})},
    DateFormatter:class {useNoDateStyle(){}useShortTimeStyle(){}string(d){return format12 ? `${d.getHours()%12||12}:${String(d.getMinutes()).padStart(2,'0')} ${d.getHours()<12?"AM":"PM"}` : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}},
    Device:{screenSize(){if(!screenWidth)throw Error("No screen API");return {width:screenWidth,height:956};},isUsingDarkAppearance(){throw Error('Unavailable in widgets');}},SFSymbol:{named:name=>missingSymbol?null:({image:{symbol:name}})},
    config:{runsInApp:false,runsInWidget:true,widgetFamily:family},args:{widgetParameter:group},Script:{name:()=> 'Чернівці Світло'},
    Request:class {async loadString(){throw Error('Offline test');}},
    FileManager:{local:()=>({documentsDirectory:()=>'/cache',joinPath:(a,b)=>a+'/'+b,fileExists:()=>true,readString:()=>JSON.stringify(cache),writeString(){}})}
  });
  vm.runInContext(source,ctx);
  const host=await ctx.module.exports.build({widgetWidth:width});
  assert.ok(host instanceof ListWidget,'Updater must receive the actual ListWidget, not its content stack');
  assert.ok(host.refreshAfterDate instanceof Date);
  assert.match(host.url,/scriptable:\/\/\/run\?/);
  if(family.startsWith('accessory')) {
    assert.equal(drawings.length,family==='accessoryRectangular'?1:0,'Only the rectangular accessory draws a compact strip');
    assert.equal(host.backgroundGradient,undefined);
    if(family!=='accessoryRectangular')assert.ok(texts.some(t=>t.text.includes('12')));
    if(family==='accessoryInline')assert.equal(texts.length,1);
    if(family==='accessoryCircular')assert.equal(host.addAccessoryWidgetBackground,true);
    if(family==='accessoryRectangular') {
      assert.equal(texts.slice(0,3).map(t=>t.text).join(''),'21:30 – —');
      assert.ok(texts.some(t=>t.text.includes('кінець невідомий')));
      assert.ok(!texts.some(t=>/↻|група|12 ·|Можливе заживлення/.test(t.text)));
      assert.ok(!texts.some(t=>t.text.includes('кеш')));
      assert.deepEqual({...drawings[0].size},{width:150,height:14});
      assert.equal(drawings[0].respectScreenScale,true);
      assert.equal(drawings[0].opaque,false);
      assert.equal(images[0].tintColor.hex,'FFFFFF');
      assert.deepEqual({...images.at(-1).imageSize},{width:150,height:14});
      for(const op of drawings[0].ops) {
        assert.equal(op.color.hex,'FFFFFF','Monochrome strip must not bake in Home Screen colors');
        if(op.rect)assert.ok(Object.values(op.rect).every(Number.isFinite));
      }
    }
    return;
  }
  assert.equal(host.padding.join(','),'0,0,0,0');
  const surface=host.children[0],expectedWidth=screenWidth ? ({320:292,393:338,440:378})[screenWidth] : Number.isFinite(width)&&width>=300&&width<=500?width:378;
  assert.equal(surface.size.width,0,"Native content stack must use automatic width");
  if(family==='small') {
    const size=({320:141,393:158,440:530/3})[screenWidth];
    assert.deepEqual({...surface.backgroundImage.size},{width:size,height:size},'Use the square glass surface');
    assert.ok(host.backgroundGradient.colors.every(c=>c.light&&c.dark));
    const groupLabel=`Чернівці · ${group==='12'?'12':'?'}`;
    if(group!=='12') {
      assert.equal(texts[0].text,groupLabel);
      assert.equal(texts.find(t=>t.text==='Вкажіть групу від 1 до 12').lineLimit,2);
      assert.equal(drawings.length,1,'Invalid schedules show a message without a timeline');
      return;
    }
    if(state==='emergency') {
      assert.equal(texts[0].text,groupLabel);
      assert.equal(texts.find(t=>t.text==='Аварійні відключення').lineLimit,2);
      assert.equal(drawings.length,1,'Emergency mode suppresses the forecast');
      return;
    }
    const labels={on:'Є',off:'Нема',possible:'Можливо',unknown:'Невідомо'};
    assert.equal(texts[0].text,labels[state]);
    assert.equal(texts[0].font.size,13);
    const dial=surface.children.find(child=>child.backgroundImage);
    const content=dial.children[1];
    const checkedTime=ctx.displayTimes(ctx.kyivParts(cache.checkedAt).time);
    if(clearEvening) assert.ok(texts.some(t=>t.text==='Без відключень'));
    else if(state==='unknown') assert.ok(texts.some(t=>t.text==='Немає даних'));
    else {
      const headline=state==='possible'?'Невизначений період':tomorrow?'Наступне · завтра':state==='off'?'Ще триває':'Наступне';
      const range=tomorrow?(format12?'12:00 AM–1:00 AM':'00:00–01:00')
        :state==='possible'?'19:00–21:30':format12?'7:00 PM–9:00 PM':'19:00–21:00';
      assert.deepEqual(texts.map(t=>t.text),[labels[state],headline,range,groupLabel,...(missingSymbol?['↻']:[]),checkedTime]);
      for(const label of [headline,range]) {
        const text=texts.find(t=>t.text===label);
        assert.ok(text,`Show ${label} inside the dial without breaking the line`);
        assert.equal(text.lineLimit,1);
        if(label===headline) assert.equal(text.font.size,13);
        const row=content.children.find(child=>child.children?.includes(text));
        assert.ok(row,'Center the label inside the schedule dial');
        assert.deepEqual(row.children,[{spacer:undefined},text,{spacer:undefined}]);
      }
      const event=texts.find(t=>t.text===range);
      if(format12) assert.ok(event.font.size>=(size>170?16:14)&&event.font.size<=18,'Enlarge AM/PM ranges within the available space');
      else assert.equal(event.font.size,24);
    }
    assert.equal(texts.at(-1).text,checkedTime,'Show the stored check time below the city');
    assert.equal(texts.at(missingSymbol?-3:-2).text,groupLabel);
    assert.equal(texts.find(t=>t.text===groupLabel).font.size,13);
    if(missingSymbol) assert.equal(texts.at(-2).text,'↻');
    else assert.ok(images.some(image=>image.image.symbol==='arrow.clockwise'));
    assert.ok(!texts.some(t=>/^Потім/.test(t.text)));
    assert.ok(!texts.some(t=>/^\d\d$/.test(t.text)),'The dial has no hour numerals');
    assert.deepEqual({...dial.size},{width:size,height:size});
    assert.deepEqual(surface.children,[dial],'The full-square dial holds all visible content');
    assert.deepEqual({...dial.backgroundImage.size},{...dial.size});
    assert.equal(drawings.length,3,'Render a separate tintable marker over the ring');
    const centerX=dial.size.width/2, centerY=dial.size.height/2;
    const arcs=dial.backgroundImage.ops;
    assert.ok(arcs.every(op=>op.kind==='stroke'&&op.lineWidth===4.5),'Use a bolder schedule ring');
    const colors={on:'72C69B',off:'DC8587',possible:'CFB879',unknown:'707986'};
    const states=cache.cells.filter((cell,i)=>cell!==cache.cells[i-1]);
    assert.deepEqual(arcs.map(op=>op.color.hex),states.map(state=>colors[state]));
    const first=arcs[0].path.points[0];
    assert.equal(first.x,centerX,'Midnight starts at the top');
    const ringInset=({320:8,393:12,440:17})[screenWidth];
    assert.equal(first.y,ringInset,'Tighten the ring while leaving room on smaller screens');
    const last=arcs.at(-1).path.points.at(-1);
    assert.ok(Math.hypot(first.x-last.x,first.y-last.y)<1e-9,'The arcs cover the full day');
    for(let i=1;i<arcs.length;i++)assert.deepEqual(arcs[i].path.points[0],arcs[i-1].path.points.at(-1));
    function checkMarker(frame, minute) {
      const region=frame.children.find(child=>child.children.some(node=>node.tintColor?.light?.hex==='181B23'));
      assert.ok(region,'Place a theme-aware marker in the dial margin');
      const marker=region.children[0];
      assert.equal(marker.tintColor.dark.hex,'FFFFFF');
      assert.equal(marker.image.ops.length,1,'Draw one solid stroke');
      const [top,left,bottom,right]=region.padding;
      assert.ok([top,left,bottom,right].every(value=>value>=0));
      assert.ok(Math.abs(left+marker.imageSize.width+right-region.size.width)<1e-9);
      assert.ok(Math.abs(top+marker.imageSize.height+bottom-region.size.height)<1e-9);
      const point=marker.image.ops[0].path.points.at(-1);
      const lastRegion=region===frame.children.at(-1);
      const x=point.x+left+(lastRegion&&!frame.vertical?size-region.size.width:0);
      const y=point.y+top+(lastRegion&&frame.vertical?size-region.size.height:0);
      const angle=minute/1440*2*Math.PI;
      const outerRadius=size/2-ringInset+3.5;
      assert.ok(Math.hypot(x-(centerX+Math.sin(angle)*outerRadius),y-(centerY-Math.cos(angle)*outerRadius))<1e-9,'Marker uses the current Kyiv minute');
    }
    checkMarker(dial,tomorrow?23*60+40:beforeOutage?17*60+30:19*60+1);
    if(tomorrow&&!format12) {
      for(let minute=0;minute<1440;minute+=15) {
        const frame=new Container();
        frame.size=dial.size;
        ctx.addDialContent(frame,`${Math.floor(minute/60)}:${minute%60}`);
        checkMarker(frame,minute);
      }
    }
    return;
  }
  const inset=expectedWidth<350?4:0;
  if(tomorrow){
    const todayLabel=surface.children.findIndex(child=>child.text==='Сьогодні');
    const tomorrowLabel=surface.children.findIndex(child=>child.text==='Завтра');
    assert.ok(todayLabel>=0 && todayLabel<tomorrowLabel,'Label both days in order');
    const todayChart=surface.children[todayLabel+1];
    const tomorrowChart=surface.children[tomorrowLabel+1];
    assert.equal(todayChart.size.width,expectedWidth-32);
    assert.deepEqual(tomorrowChart.size,todayChart.size,'Both day bars use the same native frame');
    assert.deepEqual(tomorrowChart.padding,todayChart.padding);
    assert.deepEqual(tomorrowChart.backgroundImage.size,todayChart.backgroundImage.size);
    assert.equal(todayChart.children.filter(child=>child.tintColor?.light?.hex==='000000').length,1);
    assert.equal(images.filter(image=>image.tintColor?.light?.hex==='000000').length,1,'Only today gets the current-time marker');
    assert.deepEqual(tomorrowChart.backgroundImage.ops.map(op=>op.color.hex),['DC8587','CFB879','72C69B']);
    const ruler=surface.children[tomorrowLabel+2];
    assert.equal(ruler.size.width,todayChart.size.width);
    assert.equal(ruler.backgroundImage.ops.length,9,'One common ruler follows the two bars');
    assert.equal(ruler,surface.children.at(-2),'Hour labels follow the ruler');
    const eventRow=surface.children.findIndex(child=>child.children?.some(node=>node.text==='—'));
    assert.deepEqual(surface.children.slice(eventRow+1,todayLabel),[{spacer:1}],'Keep the event time close to the today label');
    const [top,,bottom]=surface.padding;
    assert.equal(top,bottom);
    assert.ok(top>(inset?3:8),'Increase both outer vertical insets');
    assert.ok(!texts.some(t=>t.text.startsWith('Потім')));
  }else{
    assert.deepEqual(surface.padding,[(clearEvening?16:12)-inset,16,16-inset,16]);
    assert.ok(!texts.some(t=>t.text==='Сьогодні'||t.text==='Завтра'));
  }
  if(family==='medium' && group==='12'){
    const nextHour=Math.floor(FixedDate.now()/3600000)*3600000+3600000;
    const scheduled=ctx.nextRefreshAt(cache,FixedDate.now());
    assert.equal(host.refreshAfterDate.getTime(),tomorrow?scheduled:Math.min(nextHour,scheduled),
      'Check for publication before midnight while the medium widget has no tomorrow data');
  }
  if(clearEvening){
    assert.equal(texts.find(t=>t.text==='Без відключень').font.size,26);
    assert.equal(texts.find(t=>t.text==='До кінця дня').font.size,11);
    assert.equal(texts.find(t=>t.text==='Чернівці').font.size,14);
  }
  assert.ok(!texts.some(t=>/\u0434\u0430\u0432\u043d\u0456|\u0414\u0410\u0412\u041d\u0406|\u0417\u0411\u0415\u0420\u0415\u0416\u0415\u041d\u041e|\u0420\u0435\u0437\u0435\u0440\u0432:/.test(t.text)),'Technical cache/source-age labels stay hidden');
  assert.ok(surface.vertical);
  assert.equal(surface.backgroundImage.size.width,expectedWidth);
  assert.equal(surface.backgroundImage.opaque,false);
  assert.equal(surface.backgroundImage.ops.length,80);
  assert.ok(surface.backgroundImage.ops.every(op=>op.kind==='ellipse'),'Glass keeps soft reflections without a drawn rim');
  assert.ok(host.backgroundGradient.colors.every(c=>c.light&&c.dark),'Background must remain theme-aware after rendering');
  for(const drawing of drawings) {
    assert.ok(drawing.size.width>0&&drawing.size.height>0);
    assert.ok(drawing.size.width*drawing.size.height<100000,'Keep raster surfaces small for widget memory limits');
    for(const op of drawing.ops) if(op.rect)assert.ok(Object.values(op.rect).every(Number.isFinite));
  }
  if(group==='12') {
    const currentState=tomorrow?'on':state;
    const expectedSymbol={on:'bolt.fill',off:'bolt.slash.fill',possible:'bolt.fill',unknown:'questionmark.circle'}[currentState];
    const statusIcon=images.find(image=>image.image.symbol===expectedSymbol);
    if(missingSymbol) assert.equal(statusIcon,undefined);
    else {
      assert.ok(statusIcon,'Show a distinct status icon alongside the label');
      assert.deepEqual({...statusIcon.imageSize},{width:12,height:14});
      assert.equal(statusIcon.tintColor.dark.hex,{on:'72C69B',off:'DC8587',possible:'CFB879',unknown:'CFB879'}[currentState]);
      if(currentState==='possible')assert.ok(!texts.some(t=>t.text==='?'));
    }
    assert.ok(texts.some(t=>t.text==={on:'Є світло',off:'Нема світла',possible:'Зараз буде',unknown:'Немає даних'}[currentState]),'Keep the readable status when icons are unavailable');
    const marker=images.find(image=>image.tintColor?.light?.hex==='000000');
    assert.ok(marker);assert.equal(marker.tintColor.dark.hex,'F6F7FB');
    assert.equal(marker.imageSize.width,expectedWidth-32);
    const labels=texts.filter(t=>t.font?.size===12).map(t=>t.text);
    assert.deepEqual(labels,format12&&!tomorrow?['12','3','6','9','12','3','6','9','12']:['00','03','06','09','12','15','18','21','24']);
    const ticks=surface.children.at(-1);
    assert.deepEqual(ticks.padding,[0,0,0,0]);
    assert.equal(ticks.children.length,17);
    assert.equal(ticks.size.width,expectedWidth-32);
    ticks.children.forEach((child,i)=>{
      assert.equal(child.children,undefined,'Do not constrain native hour text inside narrow nested cells');
      if(i%2)assert.deepEqual(child,{spacer:undefined});
      else {assert.equal(child.font.size,12);assert.equal(child.text,labels[i/2]);}
    });
    if(state==='off'&&!tomorrow)assert.ok(texts.some(t=>t.text==='Відключення триває'));
    if(tomorrow){
      assert.ok(texts.some(t=>t.text==='Наступне відключення · завтра'));
      assert.ok(texts.some(t=>t.text===(format12?'12:00 AM':'00:00')));
      assert.ok(texts.some(t=>t.text===(format12?'1:00 AM':'01:00')));
    }
    const colors=drawings.flatMap(d=>d.ops.map(op=>op.color?.hex));
    assert.ok(colors.includes('72C69B')&&(clearEvening||colors.includes('CFB879')));
    if(state==='off')assert.ok(colors.includes('DC8587'));
  } else assert.ok(texts.some(t=>t.text==='Вкажіть групу від 1 до 12'));
}
(async()=>{
  const device={screenSize:()=>({width:393,height:852})};
  const sizing=vm.createContext({module:{exports:{}},Device:device});
  vm.runInContext(source,sizing);
  for(const [screenWidth,screenHeight,width,height] of [[393,852,338,158],[852,393,338,158],[440,956,378,530/3],[390,844,338,158],[375,812,329,155],[430,932,364,170]]) {
    device.screenSize=()=>({width:screenWidth,height:screenHeight});
    for(const legacy of [undefined,378,500])assert.deepEqual({...sizing.homeWidgetSize(legacy)},{width,height},'Automatic and old installer sizes must fit the actual device');
  }
  device.screenSize=()=>({width:360,height:780});
  assert.ok(sizing.homeWidgetSize(378).width<360,'Unrecognized screen uses a bounded fallback');

  for(const screen of [393,440])for(const format12 of [false,true])for(const state of ['on','off','possible','unknown'])await render(378,state,'12','medium',false,false,false,screen,format12);
  for(const screen of [393,440]){
    await render(378,'off','12','medium',false,false,false,screen,true,true);
    await render(378,'on','12','medium',false,false,true,screen,true);
  }
  for(const width of [338,364,378,379.333,382,undefined,NaN,900])await render(width);
  for(const state of ['on','possible','unknown'])await render(378,state);
  for(const width of [338,378,382])await render(width,'on','12','medium',false,false,true);
  for(const state of ['on','off','possible','unknown'])await render(378,state,'12','medium',false,true);
  await render(378,'off','invalid');
  for(const screen of [320,393,440])for(const format12 of [false,true])await render(378,'off','12','medium',true,false,false,screen,format12);
  for(const screen of [393,440])for(const format12 of [false,true])for(const state of ['on','off'])await render(500,state,'12','small',false,false,false,screen,format12);
  await render(378,'on','12','small',true,false,false,393);
  await render(378,'on','12','small',true,false,false,320);
  await render(378,'on','12','small',true,false,false,393,true);
  await render(378,'on','12','small',true,false,false,440,true);
  await render(378,'on','12','small',false,false,true,393);
  await render(378,'unknown','12','small',false,true,false,393);
  await render(378,'possible','12','small',false,false,false,393);
  await render(378,'emergency','12','small',false,false,false,393);
  await render(378,'off','invalid','small',false,false,false,393);
  for(const family of ['accessoryRectangular','accessoryCircular','accessoryInline'])await render(378,'off','12',family);
  console.log('PASS: glass layers, dynamic theme colors, widget-only APIs, sizing, status states, timeline/marker/labels, offline data and invalid group. Native pixels require iPhone verification.');
})().catch(error=>{console.error(error);process.exitCode=1;});
