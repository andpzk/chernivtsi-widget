package ua.chernivtsi.electricity;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import javax.net.ssl.HttpsURLConnection;

final class ScheduleStore {
    private static final String TAG = "ChernivtsiSchedule";
    private final SharedPreferences prefs;

    ScheduleStore(Context context) {
        prefs = context.getSharedPreferences("schedules", Context.MODE_PRIVATE);
    }

    Schedule.Pair cached(int group, Instant now) {
        LocalDate date = Schedule.kyiv(now).toLocalDate();
        return Schedule.select(null, null, null, read(group, "today", now), read(group, "tomorrow", now), false, date);
    }

    void refresh(Iterable<Integer> groups) {
        String main = download(Schedule.OFFICIAL_URL);
        String next = download(Schedule.OFFICIAL_URL + "?next");
        Instant now = Instant.now();
        LocalDate date = Schedule.kyiv(now).toLocalDate();
        JSONObject feed = null;
        boolean feedRequested = false;
        SharedPreferences.Editor edit = prefs.edit();
        for (int group : groups) {
            if (Thread.currentThread().isInterrupted()) return;
            Schedule.Day today = Schedule.official(main, group, date, now);
            Schedule.Day futureFromMain = Schedule.official(main, group, date.plusDays(1), now);
            Schedule.Day future = Schedule.official(next, group, date.plusDays(1), now);
            if (future == null || (futureFromMain != null && futureFromMain.sourceAt.isAfter(future.sourceAt))) {
                future = futureFromMain;
            }
            Schedule.Day savedToday = read(group, "today", now);
            Schedule.Day savedTomorrow = read(group, "tomorrow", now);
            Schedule.Pair saved = Schedule.select(null, null, null, savedToday, savedTomorrow, false, date);
            Schedule.Day community = null;
            if (today == null && !(saved.today != null && (saved.today.emergency || (saved.today.official && future != null)))) {
                if (!feedRequested) {
                    feed = readFeed();
                    feedRequested = true;
                }
                community = community(feed, group, now);
            }
            Schedule.Pair pair = Schedule.select(today, future, community, savedToday, savedTomorrow, next != null, date);
            write(edit, group, "today", pair.today);
            write(edit, group, "tomorrow", pair.tomorrow);
        }
        if (!Thread.currentThread().isInterrupted()) edit.apply();
    }

    private static JSONObject readFeed() {
        String raw = download(Schedule.FALLBACK_URL);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            Log.w(TAG, "Community feed is invalid");
            return null;
        }
    }

    private static Schedule.Day community(JSONObject feed, int group, Instant now) {
        if (feed == null) return null;
        LocalDate date = Schedule.kyiv(now).toLocalDate();
        try {
            Instant updated = Instant.parse(feed.getString("lastUpdated"));
            if (updated.isBefore(now.minusSeconds(7200)) || updated.isAfter(now.plusSeconds(300))) return null;
            JSONObject days = feed.getJSONObject("fact").getJSONObject("data");
            JSONObject hours = null;
            for (Iterator<String> keys = days.keys(); keys.hasNext(); ) {
                String key = keys.next();
                if (!key.matches("[0-9]{1,12}")) continue;
                if (!Schedule.kyiv(Instant.ofEpochSecond(Long.parseLong(key))).toLocalDate().equals(date)) continue;
                if (hours != null) return null;
                hours = days.getJSONObject(key).getJSONObject("GPV" + group);
            }
            if (hours == null || hours.length() != 24) return null;
            List<String> states = new ArrayList<>(24);
            for (int i = 1; i <= 24; i++) states.add(hours.getString(Integer.toString(i)));
            String cells = Schedule.communityCells(states);
            return cells == null ? null : new Schedule.Day(date, cells, updated, now, false, false);
        } catch (JSONException | java.time.DateTimeException e) {
            return null;
        }
    }

    private Schedule.Day read(int group, String key, Instant now) {
        String raw = prefs.getString(group + "." + key, null);
        if (raw == null) return null;
        try {
            String[] parts = raw.split("\\|", -1);
            if (parts.length != 6 || !parts[1].matches("[+~?\\-]{48}")) return null;
            Schedule.Day day = new Schedule.Day(LocalDate.parse(parts[0]), parts[1], Instant.parse(parts[2]),
                    Instant.parse(parts[3]), Boolean.parseBoolean(parts[4]), Boolean.parseBoolean(parts[5]));
            return Schedule.fresh(day, now) ? day : null;
        } catch (java.time.DateTimeException e) {
            return null;
        }
    }

    private static void write(SharedPreferences.Editor edit, int group, String key, Schedule.Day day) {
        String name = group + "." + key;
        if (day == null) edit.remove(name);
        else edit.putString(name, day.date + "|" + day.cells + "|" + day.sourceAt + "|" + day.checkedAt
                + "|" + day.emergency + "|" + day.official);
    }

    private static String download(String url) {
        return download(url, 512 * 1024, true);
    }

    static String download(String url, int maxBytes, boolean followRedirects) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(followRedirects);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0");
            connection.setRequestProperty("Cache-Control", "no-cache");
            if (connection.getResponseCode() != 200) return null;
            long stop = android.os.SystemClock.elapsedRealtime() + 8000;
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream body = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                for (int length; (length = input.read(buffer)) != -1; ) {
                    if (body.size() + length > maxBytes || Thread.currentThread().isInterrupted()
                            || android.os.SystemClock.elapsedRealtime() > stop) return null;
                    body.write(buffer, 0, length);
                }
                return new String(body.toByteArray(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            Log.w(TAG, "Schedule download failed: " + e.getClass().getSimpleName());
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
