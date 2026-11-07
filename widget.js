// Chernivtsi widget module (API 1)
// Scriptable: Calm / Calendar-style medium Home Screen widget. Default outage group: 12.
// Widget Parameter can override the group with a number from 1 to 12.
const DEFAULT_GROUP = 12;
const GLASS_STYLE = true;
const OFFICIAL_URL = "https://oblenergo.cv.ua/shutdowns/";
const FALLBACK_URL = "https://raw.githubusercontent.com/chaichuk/UA-power-outages-monitor/main/artifacts/chernivtsi.json";
const REFRESH_MINUTES = 15;
const COLORS = {on: "55D6A0", off: "FF7979", possible: "F5C66B", unknown: "64748B"};
const LABELS = {on: "Заживлено", off: "Відключення", possible: "Можливо заживлено", unknown: "Немає даних"};

function kyivParts(value) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`,
    slot: Number(p.hour) * 2 + Math.floor(Number(p.minute) / 30)};
}

function kyivTimestamp(date, time) {
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall)) throw new Error("Invalid date/time");
  let result = wall;
  for (let i = 0; i < 2; i++) {
    const p = kyivParts(result);
    result += wall - Date.parse(`${p.date}T${p.time}:00Z`);
  }
  return result;
}

function plain(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").trim();
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function parseOfficial(html, group, now, expectedDate = kyivParts(now).date) {
  const table = html.match(/<div\b[^>]*\bid=["']gsv["'][^>]*>([\s\S]*)/i);
  if (!table) {
    if (/class=["'][^"']*wrap_article_v2_emergency\b/i.test(html)) {
      return {date: expectedDate, emergency: true, source: "official",
        sourceAt: now, cells: Array(48).fill("unknown")};
    }
    throw new Error("Official schedule is unavailable");
  }
  const dateMatch = table[1].match(/<ul\b[^>]*>\s*<p\b[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  const updated = html.match(/<[^>]+\bid=["']gsv_a["'][^>]*>([\s\S]*?)<\/div>/i);
  const sourceTime = updated && plain(updated[1]).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const row = table[1].match(new RegExp(`<div\\b[^>]*\\bid=["']inf${group}["'][^>]*>([\\s\\S]*?)<\\/div>`, "i"));
  const axis = table[1].match(/<\/ul>\s*<div\b[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!dateMatch || !row || !axis || !sourceTime) throw new Error("Official page format changed");
  const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  if (date !== expectedDate) throw new Error("Official schedule is not for today/requested date");
  const hours = [...axis[1].matchAll(/<b\b[^>]*>\s*(\d{1,2})\s*<em\b[^>]*>:00<\/em>\s*<\/b>/gi)]
    .map(m => Number(m[1]));
  if (hours.length && hours[hours.length - 1] === 0) hours.pop();
  if (!hours.length || hours.some((h, i) => h !== hours[0] + i) || hours[hours.length - 1] !== 23) {
    throw new Error("Unexpected official time axis");
  }
  const tokens = [...row[1].matchAll(/<(u|o|s)\b[^>]*>([^<]*)<\/\1>/gi)];
  if (tokens.length !== hours.length * 2) throw new Error("Incomplete official schedule row");
  const cells = Array(48).fill("unknown");
  const tags = {u: "on", o: "off", s: "possible"};
  const words = {u: "З", o: "В", s: "МЗ"};
  tokens.forEach((m, i) => {
    const tag = m[1].toLowerCase();
    if (plain(m[2]).toUpperCase() !== words[tag]) throw new Error("Unknown official status");
    cells[hours[0] * 2 + i] = tags[tag];
  });
  // The next-day page reports today's publication time, not a timestamp tomorrow.
  const sourceAt = kyivTimestamp(kyivParts(now).date, `${sourceTime[1].padStart(2, "0")}:${sourceTime[2]}`);
  if (sourceAt > now + 300000) throw new Error("Official update time is in the future");
  return {date, cells, emergency: false, source: "official", sourceAt};
}

function parseFallback(json, group, now) {
  const sourceAt = Date.parse(json.lastUpdated);
  if (!Number.isFinite(sourceAt) || now - sourceAt > 2 * 60 * 60 * 1000 || sourceAt > now + 300000) {
    throw new Error("Community feed is stale");
  }
  const date = kyivParts(now).date;
  const days = Object.entries(json.fact && json.fact.data || {})
    .filter(([ts]) => /^\d+$/.test(ts) && kyivParts(Number(ts) * 1000).date === date);
  if (days.length !== 1) throw new Error("Community schedule is not for today");
  const hours = days[0][1][`GPV${group}`];
  if (!hours || Object.keys(hours).length !== 24) throw new Error("Incomplete community schedule");
  const map = {yes: ["on", "on"], no: ["off", "off"], first: ["off", "on"], second: ["on", "off"]};
  const cells = [];
  for (let h = 1; h <= 24; h++) {
    if (!Object.prototype.hasOwnProperty.call(map, hours[h])) throw new Error("Unknown community status");
    cells.push(...map[hours[h]]);
  }
  return {date, cells, emergency: false, source: "community", sourceAt};
}

function validCache(data, group, now) {
  return data && data.group === group && ["official", "community"].includes(data.source)
    && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && typeof data.emergency === "boolean"
    && Number.isFinite(Date.parse(`${data.date}T12:00:00Z`))
    && new Date(`${data.date}T12:00:00Z`).toISOString().slice(0,10) === data.date
    && Number.isFinite(data.checkedAt) && Number.isFinite(data.sourceAt)
    && data.checkedAt <= now + 300000 && data.sourceAt <= now + 300000 && now - data.checkedAt < 86400000
    && Array.isArray(data.cells) && data.cells.length === 48
    && data.cells.every(s => Object.prototype.hasOwnProperty.call(COLORS, s));
}

function periods(cells) {
  const out = [];
  for (let i = 0; i < cells.length;) {
    const start = i, state = cells[i++];
    while (i < cells.length && cells[i] === state) i++;
    out.push({start, end: i, state});
  }
  return out;
}

function clock(slot) {
  return `${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`;
}

async function download(url) {
  const request = new Request(url);
  request.timeoutInterval = 8;
  request.headers = {"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"};
  const body = await request.loadString();
  if (!request.response || request.response.statusCode !== 200) throw new Error("HTTP request failed");
  return body;
}

async function getSchedule(group, now) {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), `chernivtsi-widget-${group}.json`);
  let cached = null;
  try {
    if (fm.fileExists(path)) {
      const saved = JSON.parse(fm.readString(path));
      if (validCache(saved, group, now)) {
        cached = saved;
        if (cached.tomorrow && (!validCache({...cached.tomorrow, group}, group, now)
            || cached.tomorrow.date !== shiftDate(cached.date, 1))) delete cached.tomorrow;
        if (cached.tomorrow && cached.tomorrow.date === kyivParts(now).date) cached = {...cached.tomorrow, group};
      }
    }
  } catch (e) { console.log(`Cache read: ${e.message}`); }
  let data;
  const [todayPage, tomorrowPage] = await Promise.allSettled([download(OFFICIAL_URL), download(`${OFFICIAL_URL}?next`)]);
  try {
    if (todayPage.status === "rejected") throw todayPage.reason;
    data = parseOfficial(todayPage.value, group, now);
  } catch (e) {
    console.log(`Official source: ${e.message}`);
    // A known emergency must never be overwritten by a binary community schedule.
    if (cached && cached.emergency && cached.date === kyivParts(now).date) {
      return {...cached, cached: true};
    }
    try { data = parseFallback(JSON.parse(await download(FALLBACK_URL)), group, now); }
    catch (fallbackError) {
      console.log(`Community source: ${fallbackError.message}`);
      data = cached ? {...cached, cached: true} : null;
    }
  }
  if (!data) return null;
  if (!data.cached) data = {...data, group, checkedAt: Date.now()};
  // Replace optional future data on every successful read; never retain a withdrawn schedule.
  if (!data.emergency && data.date === kyivParts(now).date) {
    if (tomorrowPage.status === "fulfilled") {
      delete data.tomorrow;
      try {
        const tomorrow = parseOfficial(tomorrowPage.value, group, now, shiftDate(data.date, 1));
        if (!tomorrow.emergency) data.tomorrow = {...tomorrow, checkedAt:Date.now()};
      } catch (e) { console.log(`Tomorrow schedule: ${e.message}`); }
    } else if (cached && cached.date === data.date && cached.tomorrow) {
      data.tomorrow = {...cached.tomorrow, cached:true};
    }
  }
  try { if (!data.cached || tomorrowPage.status === "fulfilled") fm.writeString(path, JSON.stringify(data)); }
  catch (e) { console.log(`Cache write: ${e.message}`); }
  return data;
}

function nextDayCells(data) {
  const day = data && data.tomorrow;
  return day && !day.emergency && day.date === shiftDate(data.date, 1)
    && Array.isArray(day.cells) && day.cells.length === 48
    && day.cells.every(s => Object.prototype.hasOwnProperty.call(COLORS,s)) ? day.cells : null;
}

function scheduleQuality(data) {
  if (!nextDayCells(data)) return data;
  const day = data.tomorrow;
  return {...data, cached:!!(data.cached || day.cached),
    sourceAt:Math.min(data.sourceAt,day.sourceAt), checkedAt:Math.min(data.checkedAt,day.checkedAt)};
}

function themeColor(light, dark) {
  return Color.dynamic(new Color(light), new Color(dark));
}

let systemTimeFormatter;
function displayTimes(value) {
  if (!/\b(?:[01]\d|2[0-4]):[0-5]\d\b/.test(value)) return value;
  if (!systemTimeFormatter) {
    systemTimeFormatter = new DateFormatter();
    systemTimeFormatter.useNoDateStyle();
    systemTimeFormatter.useShortTimeStyle();
  }
  return value.replace(/\b([01]\d|2[0-4]):([0-5]\d)\b/g, (_, hour, minute) => {
    // Format Kyiv clock components, without converting them to the phone's timezone.
    const wall = new Date(2000, 0, 15, Number(hour), Number(minute));
    return systemTimeFormatter.string(wall).replace(/[\u00a0\u202f]/g, " ");
  });
}

function addText(container, value, size, color, bold = false) {
  let displayed = displayTimes(value);
  if (displayed.length > 30) displayed = displayed.replace(" · можливе світло", " · можливо");
  if (size >= 29 && displayed.length > 5) size = Math.min(size, 31);
  if (size === 20 && displayed.length > 8) size = 16;
  const text = container.addText(displayed);
  text.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  text.textColor = color;
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.8;
  return text;
}

function addCheckedTime(container, checkedAt, color) {
  const row = container.addStack();
  row.centerAlignContent();
  row.spacing = 3;
  const symbol = SFSymbol.named("arrow.clockwise");
  if (symbol) {
    const icon = row.addImage(symbol.image);
    icon.imageSize = new Size(9, 9);
    icon.tintColor = color;
  } else addText(row, "↻", 10, color);
  addText(row, kyivParts(checkedAt).time, 9, color);
}

function timeline(cells, time) {
  // Keep the soft bar palette stable; only the separate marker changes with appearance.
  const colors = {on:"72C69B", off:"DC8587", possible:"CFB879", unknown:"707986"};
  const ctx = new DrawContext();
  const barHeight = 12, inset = 4;
  ctx.size = new Size(600, barHeight + inset * 2);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  function fillBarSpan(x, width) {
    if (width <= 0) return;
    const r = barHeight / 2, end = x + width;
    if (x >= r && end <= 600 - r) {
      ctx.fillRect(new Rect(x, inset, width, barHeight));
      return;
    }
    // Clip colored spans to the rounded outer ends.
    const xs = [x];
    for (const start of [0, 600 - r]) {
      for (let i = 0; i <= 12; i++) {
        const px = start + r * i / 12;
        if (px > x && px < end) xs.push(px);
      }
    }
    xs.push(end);
    const top = px => r - Math.sqrt(Math.max(0, r * r - (Math.min(px, 600 - px, r) - r) ** 2));
    const path = new Path();
    path.move(new Point(x, inset + top(x)));
    for (const px of xs.slice(1)) path.addLine(new Point(px, inset + top(px)));
    for (const px of xs.slice().reverse()) path.addLine(new Point(px, inset + barHeight - top(px)));
    path.closeSubpath();
    ctx.addPath(path);
    ctx.fillPath();
  }
  periods(cells).forEach(({start, end, state}) => {
    const x = start === 0 ? 0 : 16 + start / 48 * 568;
    const right = end === 48 ? 600 : 16 + end / 48 * 568;
    ctx.setFillColor(new Color(colors[state]));
    fillBarSpan(x, right - x);
  });
  return ctx.getImage();
}

function timelineRuler() {
  const ctx = new DrawContext();
  ctx.size = new Size(600, 10);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const color = new Color(config.runsInApp && Device.isUsingDarkAppearance() ? "B5BDCD" : "5D6370");
  ctx.setFillColor(color);
  ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"].forEach((time, i) => {
    const x = 16 + i * 71;
    ctx.fillRect(new Rect(Math.max(0, Math.min(598, x - 1)), 2, 2, 5));
  });
  return ctx.getImage();
}

function scheduleView(cells, slot) {
  const state = cells[slot];
  const remaining = periods(cells).filter(x => x.end > slot);
  const current = remaining[0];
  const future = remaining.slice(1);
  const possible = remaining.find(x => x.state === "possible");
  const following = possible ? `${clock(possible.start)}–${clock(possible.end)} · можливе світло` : "";
  if (state === "unknown") return {state, headline:"Графік на цей час", value:"Немає даних", detail:"Перевірте пізніше", following};
  if (state === "on") {
    const next = future[0];
    if (!next) return {state, headline:"Відключень не заплановано", value:"До 24:00", detail:"", following};
    const headlines = {off:"Наступне відключення", possible:"Невизначений період", unknown:"Дані відсутні з"};
    return {state, headline:headlines[next.state], value:clock(next.start), detail:`до ${clock(next.end)}`, following};
  }
  // An unknown interval interrupts any prediction of restoration beyond it.
  const next = future.find(x => x.state === "on" || x.state === "unknown");
  if (next) return {state, headline:next.state === "on" ? "Планове заживлення" : "Дані відсутні з",
    value:clock(next.start), detail:state === "off" ? `відключено до ${clock(current.end)}` : "", following};
  return {state, headline:state === "off" ? "Відключення" : "Час заживлення",
    value:state === "off" && current.end === 48 ? "До 24:00" : "Невідомо", detail:"Далі немає прогнозу", following};
}

function eventView(cells, slot, tomorrow = null) {
  const view = scheduleView(cells, slot);
  const ranges = periods(tomorrow ? cells.concat(tomorrow) : cells);
  const current = ranges.findIndex(p => p.start <= slot && p.end > slot);
  const index = view.state === "unknown" ? -1 : view.state === "on" ? current + 1 : current;
  const primary = ranges[index];
  const following = primary && primary.state !== "unknown" ? ranges[index + 1] : null;
  const labels = {on:"заживлення", off:"відключення", possible:"можливе заживлення", unknown:"немає даних"};
  let headline = view.state === "off" ? "Відключення триває" : view.state === "possible" ? "Невизначений період" : view.headline;
  if (tomorrow && primary) {
    if (view.state === "on") headline = {off:"Наступне відключення",possible:"Невизначений період",unknown:"Дані відсутні з"}[primary.state] || headline;
    headline += primary.start >= 48 ? " · завтра" : primary.end > 48 ? " · до завтра" : "";
  }
  const rangeClock = end => clock(end > 48 ? end % 48 || 48 : end);
  const followingDay = following && following.start >= 48 ? " завтра" : following && following.end > 48 ? " до завтра" : "";
  return {...view, headline, value:primary ? clock(primary.start % 48) : view.value,
    detail:primary ? rangeClock(primary.end) : view.detail,
    following:following ? `Потім ${clock(following.start % 48)} – ${rangeClock(following.end)}${followingDay} · ${labels[following.state]}` : ""};
}

function timelineGraphic(cells, time) {
  const bar = timeline(cells, time), ruler = timelineRuler();
  const barHeight = 600 * bar.size.height / bar.size.width;
  const rulerHeight = 600 * ruler.size.height / ruler.size.width;
  const ctx = new DrawContext();
  ctx.size = new Size(600, barHeight + rulerHeight);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.drawImageInRect(bar, new Rect(0, 0, 600, barHeight));
  ctx.drawImageInRect(ruler, new Rect(0, barHeight, 600, rulerHeight));
  return ctx.getImage();
}

function timelineMarker(graphic, time) {
  const ctx = new DrawContext();
  const height = 600 * graphic.size.height / graphic.size.width;
  ctx.size = new Size(600, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const [hour, minute] = time.split(":").map(Number);
  const x = 16 + (hour + minute / 60) / 24 * 568;
  ctx.setFillColor(new Color("FFFFFF"));
  ctx.fillRect(new Rect(x - 1.5, 0, 3, height - 10));
  return ctx.getImage();
}

function nextRefreshAt(data, now) {
  const current = kyivParts(now);
  let next = now + REFRESH_MINUTES * 60000;
  // Kyiv schedule slots change on half-hours; also refresh when the local date changes.
  const halfHour = 30 * 60000;
  for (let boundary = (Math.floor(now / halfHour) + 1) * halfHour; boundary < next; boundary += halfHour) {
    const at = kyivParts(boundary);
    const changes = data && data.date === current.date && !data.emergency
      && data.cells[at.slot] !== data.cells[current.slot];
    if (at.date !== current.date || changes) next = boundary;
  }
  return next;
}

function glassReflections(width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  // Neutral transparent highlights work with both dynamic background palettes.
  for (let i = 40; i > 0; i--) {
    const scale = i / 40;
    ctx.setFillColor(new Color("FFFFFF", 0.007));
    ctx.fillEllipse(new Rect(width * (0.2 - scale * 0.75), -height * (0.22 + scale * 0.6), width * scale * 1.5, height * scale * 1.2));
    ctx.setFillColor(new Color("DCEAFF", 0.004));
    ctx.fillEllipse(new Rect(width * (1 - scale * 0.7), height * (1.22 - scale * 0.5), width * scale * 1.4, height * scale));
  }
  const rim = new Path();
  rim.addRoundedRect(new Rect(0.6, 0.6, width - 1.2, height - 1.2), 26, 26);
  ctx.addPath(rim);
  ctx.setStrokeColor(new Color("FFFFFF", 0.2));
  ctx.setLineWidth(0.7);
  ctx.strokePath();
  // Bright corners taper into the rim instead of outlining the whole card equally.
  for (const bottom of [false, true]) {
    const edge = new Path();
    const mirror = (x, y) => new Point(bottom ? width - x : x, bottom ? height - y : y);
    edge.move(mirror(0.6, 26));
    for (let i = 1; i <= 16; i++) {
      const angle = Math.PI + i / 16 * Math.PI / 2;
      edge.addLine(mirror(26 + 25.4 * Math.cos(angle), 26 + 25.4 * Math.sin(angle)));
    }
    ctx.addPath(edge);
    ctx.setStrokeColor(new Color("FFFFFF", bottom ? 0.32 : 0.5));
    ctx.strokePath();
    for (let x = 26; x < width * 0.8; x += 2) {
      const opacity = (bottom ? 0.25 : 0.4) * Math.pow(1 - (x - 26) / (width * 0.8 - 26), 2);
      ctx.setFillColor(new Color("FFFFFF", opacity));
      ctx.fillRect(new Rect(bottom ? width - x - 2 : x, bottom ? height - 1.1 : 0.4, 2, 0.7));
    }
  }
  return ctx.getImage();
}

function lockScreenSchedule(cells, time, tomorrow = null) {
  const [hour, minute] = time.split(":").map(Number);
  const now = hour * 60 + minute, start = hour * 60 - 60, end = start + 360;
  const ranges = periods(tomorrow ? cells.concat(tomorrow) : cells).map(p => ({...p, start:p.start * 30, end:p.end * 30}));
  const current = ranges.find(p => p.start <= now && p.end > now);
  const next = current && current.state !== "unknown" ? ranges.find(p => p.start === current.end) : null;
  const coverage = [{start:-60,end:0,state:"unknown"}, ...ranges, {start:tomorrow ? 2880 : 1440,end:3240,state:"unknown"}];
  const segments = coverage.filter(p => p.end > start && p.start < end)
    .map(p => ({state:p.state, start:Math.max(start,p.start), end:Math.min(end,p.end)}));
  return {now, start, end, current, next, segments, marker:(now - start) / 360};
}

function lockScreenAxis(minute) {
  const hour = (Math.floor(minute / 60) + 24) % 24;
  const label = displayTimes(`${String(hour).padStart(2,"0")}:00`).match(/\p{Number}+/u)?.[0] || String(hour);
  return label + (minute < 0 ? " −1" : minute >= 1440 ? " +1" : "");
}

function lockScreenStrip(model, width) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, 14);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  // Alpha and patterns survive monochrome tint; all geometry shares the same time scale.
  for (let x = 0; x < width; x += 0.5) {
    const minute = model.start + (x + 0.25) / width * 360;
    const state = model.segments.find(p => p.start <= minute && p.end > minute).state;
    const edge = Math.min(x + 0.25, width - x - 0.25, 3.5);
    const inset = 3.5 - Math.sqrt(Math.max(0, 3.5 ** 2 - (edge - 3.5) ** 2));
    ctx.setFillColor(new Color("FFFFFF", {on:0.9,off:0.25,possible:0.8,unknown:0.35}[state]));
    if (state === "on" || state === "off") ctx.fillRect(new Rect(x, 4 + inset, 0.5, 7 - inset * 2));
    else for (let y = 0; y < 7; y++) {
      const top = Math.max(y,inset), bottom = Math.min(y + 1,7 - inset);
      const visible = state === "possible" ? (x + y * 0.5) % 3 < 1 : x % 4 < 1 && y >= 2 && y < 5;
      if (visible && bottom > top) ctx.fillRect(new Rect(x, 4 + top, 0.5, bottom - top));
    }
  }
  const marker = model.marker * width;
  ctx.setFillColor(new Color("FFFFFF"));
  ctx.fillRect(new Rect(marker - 0.75, 1, 1.5, 13));
  ctx.fillEllipse(new Rect(marker - 1.5, 0, 3, 3));
  return ctx.getImage();
}

function addLockScreenSchedule(widget, data, group, p, checked, ink, now) {
  const model = lockScreenSchedule(data.cells, p.time, nextDayCells(data)), next = model.next;
  const frame = widget.addStack();
  frame.addSpacer();
  const content = frame.addStack();
  content.layoutVertically();
  // shortcut: 150pt fits the compact accessory; recalibrate if native device evidence shows clipping.
  const width = 150;
  content.size = new Size(width, 0);
  frame.addSpacer();
  const header = content.addStack();
  const status = {on:"Є світло",off:"Без світла",possible:"Можливе світло",unknown:"Немає даних"}[model.current.state];
  addText(header, `${group} · ${status}`, 8.5, ink);
  header.addSpacer();
  const [checkedTime, ...notices] = checked.split(" · ");
  addText(header, checkedTime, 7.5, ink);
  const event = content.addStack();
  event.centerAlignContent();
  addText(event, next ? clock(next.start / 30 % 48) : "—", 20, ink, true);
  event.addSpacer();
  // Data-quality notices take the countdown's space; never hide them to fit the accessory.
  if (notices.length) addText(event, notices.join(" · "), 7.5, ink);
  else if (next) {
    const left = next.start >= 1440
      ? Math.ceil((kyivTimestamp(shiftDate(data.date,1),clock(next.start / 30 % 48)) - now) / 60000)
      : next.start - model.now;
    const duration = left >= 60 ? `${Math.floor(left / 60)} год${left % 60 ? ` ${left % 60} хв` : ""}` : `${left} хв`;
    addText(event, `ще ${duration}`, 8, ink);
  }
  let label = next ? {on:"Планове заживлення",off:"Відключення",possible:"Можливе заживлення",unknown:"Немає даних з"}[next.state] : "Далі графіка немає";
  if (next && next.start >= 1440) label += " · завтра";
  addText(content, label, 10, ink);
  content.addSpacer(1);
  const strip = content.addImage(lockScreenStrip(model, width));
  strip.imageSize = new Size(width,14);
  strip.tintColor = ink;
  strip.applyFittingContentMode();
  const axis = content.addStack();
  [model.start, model.start + 180, model.end].forEach((minute,index) => {
    const cell = axis.addStack();
    cell.size = new Size(width / 3, 0);
    if (index) cell.addSpacer();
    addText(cell, lockScreenAxis(minute), 8, ink);
    if (index !== 2) cell.addSpacer();
  });
}

function makeLockScreenWidget(data, group, now, error, family) {
  if (data) data = scheduleQuality(data);
  const widget = new ListWidget();
  const ink = new Color("FFFFFF");
  widget.refreshAfterDate = new Date(nextRefreshAt(error ? null : data, now));
  widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}&group=${group}`;
  const p = kyivParts(now);
  const usable = data && data.date === p.date && !error;
  const state = usable && !data.emergency ? data.cells[p.slot] : "unknown";
  const names = {on:"Є світло", off:"Без світла", possible:"Можливе заживлення", unknown:"Немає даних"};
  const status = error ? (error.includes("групу") ? "Перевірте групу" : "Немає даних") : !usable ? "Немає графіка" : data.emergency ? "Аварійні відключення" : names[state];
  let detail = error || (!usable ? "Оновіть у Scriptable" : data.emergency ? "Час заживлення невідомий" : "Далі немає даних");
  let nextTime = "";
  if (usable && !data.emergency && state !== "unknown") {
    const next = lockScreenSchedule(data.cells, p.time, nextDayCells(data)).next;
    if (next) {
      nextTime = clock(next.start / 30 % 48) + (next.start >= 1440 ? " завтра" : "");
      detail = `${{on:"Заживлення з", off:"Відключення о", possible:"Можливе заживлення з", unknown:"Немає даних з"}[next.state]} ${nextTime}`;
    } else if (state === "on") detail = "За графіком до кінця доби";
  }
  const stale = usable && now - data.sourceAt > 7200000;
  const checked = usable ? `↻ ${kyivParts(data.checkedAt).time}${data.cached ? " · кеш" : stale ? " · давні" : ""}${data.source === "community" ? " · резерв" : ""}` : "";
  if (family === "accessoryInline") {
    // Inline accessories accept a single text element; keep all essential meaning in it.
    addText(widget, `${group} · ${status}${nextTime ? ` · зміна ${nextTime}` : ""}${data && data.cached ? " · кеш" : ""}`, 12, ink);
    return widget;
  }
  widget.setPadding(2, 3, 2, 3);
  if (family === "accessoryCircular") {
    widget.addAccessoryWidgetBackground = true;
    const shortStatus = state === "possible" && usable && !data.emergency ? "Можливо" : status;
    const line = (text, size, bold = false) => addText(widget, text, size, ink, bold).centerAlignText();
    widget.addSpacer();
    line(shortStatus, 9, true);
    line(nextTime ? nextTime.includes("завтра") ? "Завтра о" : "Зміна о" : "Графік", 8);
    line(nextTime.replace(" завтра", "") || "—", 14, true);
    line(`${group}${data && data.cached ? " · кеш" : " група"}`, 8);
    widget.addSpacer();
    return widget;
  }
  if (usable && !data.emergency) {
    // The six-hour window advances on the hour even when the scheduled state is unchanged.
    widget.refreshAfterDate = new Date(Math.min(widget.refreshAfterDate.getTime(), (Math.floor(now / 3600000) + 1) * 3600000));
    addLockScreenSchedule(widget, data, group, p, checked, ink, now);
    return widget;
  }
  addText(widget, `Чернівці · ${group}`, 10, ink);
  addText(widget, status, 13, ink, true);
  addText(widget, detail, 10, ink);
  if (checked) addText(widget, checked, 9, ink);
  return widget;
}

function makeWidget(data, group, now, error = "", settings = {}) {
  if (["accessoryRectangular", "accessoryInline", "accessoryCircular"].includes(config.widgetFamily)) {
    return makeLockScreenWidget(data, group, now, error, config.widgetFamily);
  }
  if (data) data = scheduleQuality(data);
  const host = new ListWidget();
  const widget = host.addStack();
  widget.layoutVertically();
  const surfaceWidth = Number.isFinite(settings.widgetWidth) && settings.widgetWidth >= 300 && settings.widgetWidth <= 500 ? settings.widgetWidth : 378;
  const surfaceHeight = Math.abs(surfaceWidth - 378) < 2 ? 530 / 3 : 170;
  widget.size = new Size(surfaceWidth, surfaceHeight);
  host.setPadding(0, 0, 0, 0);
  const ink = themeColor("181B23", "F6F7FB");
  const muted = themeColor(GLASS_STYLE ? "525E70" : "5D6370", "B5BDCD");
  const amber = themeColor("916214", "CFB879");
  const red = themeColor("A95E64", "DC8587");
  const green = themeColor("487E64", "72C69B");
  const gradient = new LinearGradient();
  gradient.colors = GLASS_STYLE
    ? [themeColor("F5F8FC", "35464E"), themeColor("E8EEF5", "1E2836"), themeColor("E1E8F1", "171F2D"), themeColor("DCE4EE", "35445B")]
    : [themeColor("FFFFFF", "202020"), themeColor("F6F6F6", "161616"), themeColor("F0F0F0", "0B0B0B")];
  gradient.locations = GLASS_STYLE ? [0, 0.3, 0.65, 1] : [0, 0.5, 1];
  gradient.startPoint = new Point(GLASS_STYLE ? 0 : 0.5, 0);
  gradient.endPoint = new Point(GLASS_STYLE ? 1 : 0.5, 1);
  host.backgroundGradient = gradient;
  if (GLASS_STYLE) {
    widget.cornerRadius = 26;
    widget.backgroundImage = glassReflections(surfaceWidth, surfaceHeight);
  }
  widget.setPadding(12, 16, 16, 16);
  host.refreshAfterDate = new Date(nextRefreshAt(error ? null : data, now));
  host.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}&group=${group}`;
  const p = kyivParts(now);
  const usable = data && data.date === p.date && !error;
  const view = usable && !data.emergency ? eventView(data.cells, p.slot, nextDayCells(data)) : null;
  const header = widget.addStack();
  header.topAlignContent();
  addText(header, "Чернівці", 14, ink, true);
  header.addSpacer();
  if (view) {
    const color = view.state === "on" ? green : view.state === "off" ? red : amber;
    const names = {on:"Є світло", off:"Без світла", possible:"Можливо світло", unknown:"Немає даних"};
    const badge = header.addStack();
    badge.centerAlignContent();
    badge.spacing = 5;
    const dot = badge.addImage(SFSymbol.named("circle.fill").image);
    dot.imageSize = new Size(6, 6);
    dot.tintColor = color;
    addText(badge, names[view.state], 14, color, true);
  } else addText(header, p.date.slice(8) + "." + p.date.slice(5, 7), 11, muted);
  const metadata = widget.addStack();
  metadata.centerAlignContent();
  addText(metadata, `${group} група`, 10, muted);
  metadata.addSpacer();
  if (view) addCheckedTime(metadata, data.checkedAt, muted);
  widget.addSpacer(2);
  if (view) widget.addSpacer();
  if (!usable) {
    widget.addSpacer();
    addText(widget, error || "Немає графіка на сьогодні", 19, ink, true);
    widget.addSpacer(5);
    addText(widget, "Торкніться, щоб перевірити ще раз", 11, muted);
    widget.addSpacer();
    addText(widget, data ? `Останні дані: ${data.date}` : "Успішного оновлення ще не було", 11, muted);
    return host;
  }
  const stale = now - data.sourceAt > 7200000;
  const notices = [];
  if (data.cached) notices.push("ЗБЕРЕЖЕНО");
  if (stale) notices.push("ДАВНІ ДАНІ");
  if (data.source === "community") notices.push("Резерв: без сірих зон / аварій");
  if (data.emergency) {
    widget.addSpacer();
    addText(widget, "Аварійні відключення", 20, red, true);
    widget.addSpacer(5);
    addText(widget, "Час заживлення невідомий", 12, muted);
    widget.addSpacer();
  } else {
    const title = widget.addStack();
    title.addSpacer();
    addText(title, view.headline, 11, muted);
    title.addSpacer();
    const main = widget.addStack();
    main.centerAlignContent();
    main.addSpacer();
    const timeSize = notices.length ? 29 : 36;
    addText(main, view.value, /^\d{2}:\d{2}$/.test(view.value) ? timeSize : 22, ink, true);
    if (/^\d{2}:\d{2}$/.test(view.detail)) {
      main.addSpacer(8);
      addText(main, "—", 22, muted);
      main.addSpacer(8);
      addText(main, view.detail, timeSize, ink, true);
    }
    main.addSpacer();
    const subtitle = view.following || (/^\d{2}:\d{2}$/.test(view.detail) ? "" : view.detail);
    if (subtitle) {
      const following = widget.addStack();
      following.addSpacer();
      addText(following, subtitle, 10, muted);
      following.addSpacer();
    }
    const chartGap = 2;
    widget.addSpacer(notices.length ? Math.max(2, Math.round(chartGap / 2)) : chartGap);
    widget.addSpacer();
  }
  if (notices.length) addText(widget, notices.join(" · "), 10, amber).lineLimit = 2;
  if (!view) addCheckedTime(widget, data.checkedAt, muted);
  if (view) {
    widget.addSpacer(4);
    const graphic = timelineGraphic(data.cells, p.time);
    const chart = widget.addStack();
    const displayWidth = surfaceWidth - 32;
    // Both layers must share one frame; a flexible spacer shifted the marker relative to the bar.
    chart.size = new Size(displayWidth, displayWidth * graphic.size.height / graphic.size.width);
    chart.setPadding(0, 0, 0, 0);
    chart.backgroundImage = graphic;
    // Tint stays dynamic after rendering; DrawContext would freeze the marker color.
    const marker = chart.addImage(timelineMarker(graphic, p.time));
    marker.resizable = true;
    marker.imageSize = chart.size;
    marker.tintColor = themeColor("000000", "F6F7FB");
    marker.applyFittingContentMode();
    const ticks = widget.addStack();
    ticks.size = new Size(displayWidth, 0);
    const axisFont = 12;
    ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"].forEach((time, i) => {
      if (i) ticks.addSpacer();
      let label = displayTimes(time).replace(/[:.][0٠۰]{2}(?![0-9٠-٩۰-۹])/u, "");
      if (i === 8 && /^\p{Number}+$/u.test(label)) label = "24";
      label = label.match(/\p{Number}+/u)?.[0] || label;
      addText(ticks, label, axisFont, muted);
    });
  } else widget.addSpacer();
  return host;
}

async function buildWidget(settings = {}) {
  const rawGroup = args.widgetParameter || (args.queryParameters && args.queryParameters.group) || settings.group || DEFAULT_GROUP;
  const group = Number(rawGroup);
  const now = Date.now();
  let data = null, error = "";
  if (!Number.isInteger(group) || group < 1 || group > 12) error = "Вкажіть групу від 1 до 12";
  else {
    try { data = await getSchedule(group, now); }
    catch (e) { console.log(e.message); error = "Не вдалося прочитати дані"; }
  }
  const widget = makeWidget(data, Number.isInteger(group) ? group : "?", Date.now(), error, settings);
  return widget;
}

module.exports = {apiVersion: 1, build: buildWidget};
