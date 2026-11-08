const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../widget.js'), 'utf8');

async function render(width, state = 'off', group = '12', family = 'medium', tomorrow = false, missingSymbol = false, clearEvening = false) {
  const images = [], texts = [], drawings = [];
  class Container {
    constructor(){this.children=[];}
    addStack(){const c=new Container();this.children.push(c);return c;}
    addText(text){const c={text,centerAlignText(){}};this.children.push(c);texts.push(c);return c;}
    addSpacer(){}
    addImage(image){const c={image,applyFittingContentMode(){}};images.push(c);return c;}
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
    strokePath(){this.ops.push({kind:'stroke',path:this.path,color:this.stroke});}
    drawImageInRect(image,rect){this.ops.push({kind:'image',image,rect});}
    getImage(){return {size:this.size,ops:this.ops,opaque:this.opaque};}
  }
  class Color {constructor(hex,alpha=1){Object.assign(this,{hex,alpha});}static dynamic(light,dark){return {light,dark};}}
  class FixedDate extends Date {static now(){return Date.parse(tomorrow?'2026-11-07T21:40:00Z':'2026-11-07T17:01:00Z');}}
  const cache={date:'2026-11-07',group:12,source:'official',emergency:false,checkedAt:FixedDate.now(),sourceAt:FixedDate.now(),cells:Array(48).fill('on')};
  cache.cells.fill(state,38,42);cache.cells.fill('possible',42,43);
  if(clearEvening)cache.cells.fill('on',38);
  if(tomorrow){cache.tomorrow={...cache,date:'2026-11-08',cells:Array(48).fill('on')};cache.tomorrow.cells.fill('off',0,2);cache.tomorrow.cells.fill('possible',2,3);}
  const ctx=vm.createContext({console:{log(){}},Intl,Date:FixedDate,module:{exports:{}},ListWidget,DrawContext,Path:Shape,Color,
    Size:class {constructor(width,height){Object.assign(this,{width,height});}},
    Point:class {constructor(x,y){Object.assign(this,{x,y});}},
    Rect:class {constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},
    LinearGradient:class {},Font:{systemFont:size=>({size}),semiboldSystemFont:size=>({size})},
    DateFormatter:class {useNoDateStyle(){}useShortTimeStyle(){}string(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}},
    Device:{isUsingDarkAppearance(){throw Error('Unavailable in widgets');}},SFSymbol:{named:name=>missingSymbol?null:({image:{symbol:name}})},
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
      assert.ok(texts.some(t=>t.text.includes('кеш')));
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
  const surface=host.children[0],expectedWidth=Number.isFinite(width)&&width>=300&&width<=500?width:378;
  assert.equal(surface.size.width,expectedWidth);
  assert.equal(surface.padding.join(','),clearEvening?'16,16,16,16':'12,16,16,16');
  if(clearEvening){
    assert.equal(texts.find(t=>t.text==='Без відключень').font.size,26);
    assert.equal(texts.find(t=>t.text==='До кінця дня').font.size,11);
    assert.equal(texts.find(t=>t.text==='Чернівці').font.size,14);
  }
  assert.ok(surface.vertical);
  assert.equal(surface.backgroundImage.size.width,expectedWidth);
  assert.equal(surface.backgroundImage.opaque,false);
  assert.ok(surface.backgroundImage.ops.some(op=>op.kind==='stroke'));
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
    assert.deepEqual(labels,['00','03','06','09','12','15','18','21','24']);
    if(state==='off'&&!tomorrow)assert.ok(texts.some(t=>t.text==='Відключення триває'));
    if(tomorrow){assert.ok(texts.some(t=>t.text==='Наступне відключення · завтра'));assert.ok(texts.some(t=>t.text==='00:00'));assert.ok(texts.some(t=>t.text==='01:00'));assert.ok(texts.some(t=>t.text.includes('завтра · можливе заживлення')));}
    const colors=drawings.flatMap(d=>d.ops.map(op=>op.color?.hex));
    assert.ok(colors.includes('72C69B')&&(clearEvening||colors.includes('CFB879')));
    if(state==='off')assert.ok(colors.includes('DC8587'));
  } else assert.ok(texts.some(t=>t.text==='Вкажіть групу від 1 до 12'));
}
(async()=>{
  for(const width of [338,364,378,379.333,382,undefined,NaN,900])await render(width);
  for(const state of ['on','possible','unknown'])await render(378,state);
  for(const width of [338,378,382])await render(width,'on','12','medium',false,false,true);
  for(const state of ['on','off','possible','unknown'])await render(378,state,'12','medium',false,true);
  await render(378,'off','invalid');
  await render(378,'off','12','medium',true);
  for(const family of ['accessoryRectangular','accessoryCircular','accessoryInline'])await render(378,'off','12',family);
  console.log('PASS: glass layers, dynamic theme colors, widget-only APIs, sizing, status states, timeline/marker/labels, offline data and invalid group. Native pixels require iPhone verification.');
})().catch(error=>{console.error(error);process.exitCode=1;});
