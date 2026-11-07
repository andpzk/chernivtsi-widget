// Install once in Scriptable. Future widget code comes from andpzk/chernivtsi-widget.
// Each widget's Parameter (1–12) overrides the group below.
const LOCAL_SETTINGS = {group: 12, widgetWidth: 378};
const REPOSITORY = "andpzk/chernivtsi-widget";
const CHECK_INTERVAL = 60 * 60 * 1000;

async function loadWidget() {
  const fm = FileManager.local();
  const directory = fm.joinPath(fm.libraryDirectory(), "chernivtsi-widget-updater");
  fm.createDirectory(directory, true);
  const statePath = fm.joinPath(directory, "state.json");
  const backupPath = fm.joinPath(directory, "state-backup.json");
  const filePath = name => fm.joinPath(directory, name);
  const validFile = name => typeof name === "string" && /^[0-9a-f-]{36}\.js$/i.test(name) && fm.fileExists(filePath(name));
  let state = {current: null, previous: null, checkedAt: 0};
  for (const path of [statePath, backupPath]) {
    if (!fm.fileExists(path)) continue;
    try {
      const saved = JSON.parse(fm.readString(path));
      if (validFile(saved.current) || validFile(saved.previous)) {
        state = {current: validFile(saved.current) ? saved.current : null,
          previous: validFile(saved.previous) ? saved.previous : null,
          checkedAt: Number.isFinite(saved.checkedAt) ? saved.checkedAt : 0};
        break;
      }
    } catch (_) {}
  }
  function saveState() {
    try {
      if (fm.fileExists(statePath)) {
        const old = fm.readString(statePath);
        JSON.parse(old);
        fm.writeString(backupPath, old);
      }
    } catch (_) {}
    try { fm.writeString(statePath, JSON.stringify(state)); }
    catch (error) { console.log(`Update state: ${error.message}`); }
  }
  async function build(name) {
    const core = importModule(filePath(name));
    if (core.apiVersion !== 1 || typeof core.build !== "function") throw Error("Несумісна версія віджета");
    const widget = await core.build(LOCAL_SETTINGS);
    if (!widget || typeof widget.presentMedium !== "function") throw Error("Оновлення не створило віджет");
    return widget;
  }

  const now = Date.now();
  if (config.runsInApp || !state.current || now < state.checkedAt || now - state.checkedAt >= CHECK_INTERVAL) {
    state.checkedAt = now;
    let candidate = null;
    try {
      // Resolve main first: GitHub Raw can serve stale branch content even with no-cache.
      const latest = new Request(`https://api.github.com/repos/${REPOSITORY}/commits?sha=main&per_page=1&check=${UUID.string()}`);
      latest.timeoutInterval = 5;
      latest.headers = {"Accept": "application/vnd.github+json", "Cache-Control": "no-cache"};
      const commits = await latest.loadJSON();
      if (!latest.response || latest.response.statusCode !== 200) throw Error("Не вдалося перевірити останню версію GitHub");
      const sha = Array.isArray(commits) && commits[0] && commits[0].sha;
      if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) throw Error("GitHub повернув некоректний коміт");
      const request = new Request(`https://raw.githubusercontent.com/${REPOSITORY}/${sha}/widget.js`);
      request.timeoutInterval = 5;
      request.headers = {"Cache-Control": "no-cache"};
      const code = await request.loadString();
      if (!request.response || request.response.statusCode !== 200) throw Error("GitHub недоступний");
      if (typeof code !== "string" || code.length > 250000 || !code.startsWith("// Chernivtsi widget module (API 1)\n")) {
        throw Error("GitHub повернув не файл віджета");
      }
      if (!state.current || code !== fm.readString(filePath(state.current))) {
        candidate = UUID.string() + ".js";
        fm.writeString(filePath(candidate), code);
        const widget = await build(candidate);
        state.previous = state.current || state.previous;
        state.current = candidate;
        saveState();
        return widget;
      }
    } catch (error) {
      console.log(`Widget update: ${error.message}`);
      if (candidate && candidate !== state.current) {
        try { fm.remove(filePath(candidate)); } catch (_) {}
      }
    }
    saveState();
  }

  for (const name of [...new Set([state.current, state.previous])]) {
    if (!validFile(name)) continue;
    try {
      const widget = await build(name);
      if (name !== state.current) {
        state.current = name;
        state.previous = null;
        saveState();
      }
      return widget;
    } catch (error) { console.log(`Cached widget: ${error.message}`); }
  }

  const widget = new ListWidget();
  widget.backgroundColor = Color.dynamic(new Color("FFFFFF"), new Color("161616"));
  widget.setPadding(16, 16, 16, 16);
  const title = widget.addText("Потрібне перше завантаження");
  title.font = Font.semiboldSystemFont(16);
  title.textColor = Color.dynamic(new Color("181B23"), new Color("F6F7FB"));
  widget.addSpacer(8);
  const detail = widget.addText("Підключись до інтернету та запусти цей скрипт у Scriptable.");
  detail.font = Font.systemFont(12);
  detail.textColor = Color.dynamic(new Color("5D6370"), new Color("B5BDCD"));
  widget.refreshAfterDate = new Date(now + 15 * 60 * 1000);
  widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}`;
  return widget;
}

const widget = await loadWidget();
Script.setWidget(widget);
if (config.runsInApp) await widget.presentMedium();
Script.complete();
