// Chernivtsi widget module (API 1)
// Scriptable: Calm / Calendar-style medium Home Screen widget. Default outage group: 12.
// Widget Parameter can override the group with a number from 1 to 12.
const DEFAULT_GROUP = 12;
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

function parseOfficial(html, group, now) {
  const table = html.match(/<div\b[^>]*\bid=["']gsv["'][^>]*>([\s\S]*)/i);
  if (!table) {
    if (/class=["'][^"']*wrap_article_v2_emergency\b/i.test(html)) {
      return {date: kyivParts(now).date, emergency: true, source: "official",
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
  if (date !== kyivParts(now).date) throw new Error("Official schedule is not for today");
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
  const sourceAt = kyivTimestamp(date, `${sourceTime[1].padStart(2, "0")}:${sourceTime[2]}`);
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
      if (validCache(saved, group, now)) cached = saved;
    }
  } catch (e) { console.log(`Cache read: ${e.message}`); }
  let data;
  try {
    data = parseOfficial(await download(OFFICIAL_URL), group, now);
  } catch (e) {
    console.log(`Official source: ${e.message}`);
    // A known emergency must never be overwritten by a binary community schedule.
    if (cached && cached.emergency && cached.date === kyivParts(now).date) {
      return {...cached, cached: true};
    }
    try { data = parseFallback(JSON.parse(await download(FALLBACK_URL)), group, now); }
    catch (fallbackError) {
      console.log(`Community source: ${fallbackError.message}`);
      return cached ? {...cached, cached: true} : null;
    }
  }
  data = {...data, group, checkedAt: Date.now()};
  try { fm.writeString(path, JSON.stringify(data)); }
  catch (e) { console.log(`Cache write: ${e.message}`); }
  return data;
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

function eventView(cells, slot) {
  const view = scheduleView(cells, slot);
  const ranges = periods(cells);
  const current = ranges.findIndex(p => p.start <= slot && p.end > slot);
  const index = view.state === "unknown" ? -1 : view.state === "on" ? current + 1 : current;
  const primary = ranges[index];
  const following = primary && primary.state !== "unknown" ? ranges[index + 1] : null;
  const labels = {on:"заживлення", off:"відключення", possible:"можливе заживлення", unknown:"немає даних"};
  const headline = view.state === "off" ? "Відключення триває" : view.state === "possible" ? "Невизначений період" : view.headline;
  return {...view, headline, value:primary ? clock(primary.start) : view.value,
    detail:primary ? clock(primary.end) : view.detail,
    following:following ? `Потім ${clock(following.start)} – ${clock(following.end)} · ${labels[following.state]}` : ""};
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

function makeWidget(data, group, now, error = "", settings = {}) {
  const widget = new ListWidget();
  const ink = themeColor("181B23", "F6F7FB");
  const muted = themeColor("5D6370", "B5BDCD");
  const amber = themeColor("916214", "CFB879");
  const red = themeColor("A95E64", "DC8587");
  const green = themeColor("487E64", "72C69B");
  const gradient = new LinearGradient();
  gradient.colors = [themeColor("FFFFFF", "202020"), themeColor("F6F6F6", "161616"), themeColor("F0F0F0", "0B0B0B")];
  gradient.locations = [0, 0.5, 1];
  gradient.startPoint = new Point(0.5, 0);
  gradient.endPoint = new Point(0.5, 1);
  widget.backgroundGradient = gradient;
  widget.setPadding(12, 16, 16, 16);
  widget.refreshAfterDate = new Date(nextRefreshAt(error ? null : data, now));
  widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}&group=${group}`;
  const p = kyivParts(now);
  const usable = data && data.date === p.date && !error;
  const view = usable && !data.emergency ? eventView(data.cells, p.slot) : null;
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
    return widget;
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
    addText(main, view.value, /^\d{2}:\d{2}$/.test(view.value) ? timeSize : 22, new Color("FF0033"), true);
    if (/^\d{2}:\d{2}$/.test(view.detail)) {
      main.addSpacer(8);
      addText(main, "—", 22, muted);
      main.addSpacer(8);
      addText(main, view.detail, timeSize, new Color("FF0033"), true);
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
    const displayWidth = Number.isFinite(settings.widgetWidth) && settings.widgetWidth >= 300 && settings.widgetWidth <= 500 ? settings.widgetWidth - 32 : 346;
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
  return widget;
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
