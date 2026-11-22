const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../widget.js'), 'utf8');
const now = Date.parse('2026-11-22T13:00:00Z');
const files = new Map(), sent = [], logs = [];
let denied = false, storageFailed = false;
const ctx = vm.createContext({module: {exports: {}}, Date, Intl,
  console: {log: text => logs.push(text)}, Script: {name: () => 'Чернівці Світло'},
  FileManager: {local: () => ({documentsDirectory: () => '/cache', joinPath: (a,b) => `${a}/${b}`,
    fileExists: p => files.has(p), readString: p => files.get(p), writeString: (p,s) => {
      if (storageFailed) throw Error('Disk full');
      files.set(p,s);
    }})},
  Notification: class {async schedule() {if (denied) throw Error('Denied'); sent.push({...this});}}
});
vm.runInContext(source, ctx);
const day = (date = '2026-11-22', state = 'on') => ({date, cells: Array(48).fill(state), emergency: false, source: 'official'});
const notify = (data, group = 12, at = now) => ctx.notifyScheduleChange(data, group, at);

(async () => {
  for (const line of fs.readFileSync(path.join(__dirname, 'fixtures/notification-changes.tsv'), 'utf8').trimEnd().split(/\r?\n/)) {
    const [old, current, slot, today, count, detail] = line.split('\t');
    const changes = [];
    ctx.describeChange(changes, old, current, Number(slot), today === '1');
    assert.equal(changes.length, Number(count));
    if (changes.length) assert.ok(changes[0].includes(detail), changes[0]);
  }

  const data = day();
  await notify(data);
  assert.equal(sent.length, 0, 'First successful read establishes a baseline silently');
  await notify({...data, sourceAt: now + 1000, checkedAt: now + 2000});
  assert.equal(sent.length, 0, 'Timestamps alone do not mean the schedule changed');
  data.cells[36] = 'off';
  await notify(data);
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /Група 12/);
  assert.match(sent[0].body, /Сьогодні.*18:00–18:30.*відключення/);
  assert.equal(new URL(sent[0].openURL).searchParams.get('group'), '12');
  await notify(data);
  assert.equal(sent.length, 1, 'Repeated refreshes do not repeat a notification');
  await notify({...data, cells: Array(48).fill('off'), cached: true});
  await notify({...data, cells: Array(48).fill('off'), source: 'community'});
  await notify(null);
  await notify({...data, cells: []});
  assert.equal(sent.length, 1, 'Offline, fallback and missing data cannot announce a site change');
  await notify({...data, cells: data.cells.map((v,i) => i < 30 ? 'unknown' : v)});
  assert.equal(sent.length, 1, 'Omitted elapsed hours do not cause false alerts');
  const tomorrow = day('2026-11-23', 'off');
  data.cells[36] = 'on';
  await notify({...data, tomorrow});
  assert.match(sent.at(-1).body, /До кінця дня.*\nЗавтра.*Опубліковано графік.*00:00–24:00/);
  assert.equal(sent.length, 2, 'Publication of tomorrow is a change');
  await notify(data);
  await notify({...data, tomorrow});
  assert.equal(sent.length, 2, 'Missing and reappearing tomorrow data do not repeat publication');
  await notify(tomorrow, 12, Date.parse('2026-11-22T22:01:00Z'));
  assert.equal(sent.length, 2, 'Midnight rollover of an already seen day is silent');
  await notify({...tomorrow, emergency: true, cells: Array(48).fill('unknown')}, 12, Date.parse('2026-11-22T22:01:00Z'));
  assert.equal(sent.length, 3, 'Emergency declaration is announced');
  await notify(tomorrow, 12, Date.parse('2026-11-22T22:01:00Z'));
  assert.equal(sent.length, 4, 'Restored schedule is announced');
  await notify(day(), 11);
  assert.equal(sent.length, 4, 'Groups have separate baselines');
  denied = true;
  await notify(day(undefined, 'off'), 11);
  assert.equal(sent.length, 4);
  denied = false;
  await notify(day(undefined, 'off'), 11);
  assert.equal(sent.length, 5, 'Failed scheduling leaves the change available for retry');
  files.set('/cache/chernivtsi-notifications-official-10.json', '{broken');
  await notify(day(), 10);
  assert.equal(sent.length, 5, 'Corrupt state resets silently');
  storageFailed = true;
  await notify(day(), 9);
  assert.ok(logs.some(s => s.includes('Disk full')), 'Storage errors are contained and logged');
  storageFailed = false;

  // Exercise the production caller, not only the comparison helper.
  vm.runInContext(`args = {widgetParameter: '8'};
    getSchedule = async () => ({date: kyivParts(Date.now()).date, cells: Array(48).fill('on'), source: 'official', emergency: false});
    makeWidget = () => ({refreshAfterDate: new Date(Date.now() + 86400000)});`, ctx);
  ctx.config = {runsInApp: false};
  let prompts = 0, choice = 0;
  ctx.Alert = class {
    addAction() {} addCancelAction() {}
    async presentAlert() { prompts++; return choice; }
  };
  ctx.Notification.prototype.setTriggerDate = function(date) { this.trigger = date.getTime(); };
  const widget = await ctx.module.exports.build();
  assert.equal(prompts, 0);
  ctx.config.runsInApp = true;
  denied = true;
  await ctx.module.exports.build();
  assert.equal(prompts, 2, 'A scheduling error shows recovery instructions');
  denied = false;
  const started = Date.now();
  await ctx.module.exports.build();
  assert.ok(sent.at(-1).trigger >= started + 60000 && sent.at(-1).trigger <= Date.now() + 60000);
  const count = sent.length;
  await ctx.module.exports.build();
  assert.equal(prompts, 3, 'Successful test is offered once');
  files.delete('/cache/chernivtsi-notification-test-v1.txt');
  choice = -1;
  await ctx.module.exports.build();
  await ctx.module.exports.build();
  assert.equal(prompts, 4, 'Skipping dismisses future offers');
  assert.equal(sent.length, count, 'Skipping does not schedule a notification');
  assert.ok(widget.refreshAfterDate.getTime() <= Date.now() + 30 * 60000);
  assert.ok(files.has('/cache/chernivtsi-notifications-official-8.json'));
  console.log('PASS: notifications baseline, changes, deduplication, cache/fallback, tomorrow, midnight, emergencies, groups, failures and build integration.');
})().catch(e => {console.error(e); process.exitCode = 1;});
