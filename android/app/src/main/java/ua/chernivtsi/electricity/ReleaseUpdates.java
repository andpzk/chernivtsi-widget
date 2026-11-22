package ua.chernivtsi.electricity;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class ReleaseUpdates {
    private static final String REPO = "andpzk/chernivtsi-widget";
    private static final String API = "https://api.github.com/repos/" + REPO + "/releases/latest";
    private static final String CHANNEL = "app_updates";
    private static final int NOTICE = 100;
    private static final long HOUR = 3_600_000L;

    static Intent download(String version) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/" + REPO
                + "/releases/download/android-v" + version + "/Chernivtsi-Svitlo.apk"));
    }

    // Compare numeric components so 1.10 follows 1.9, and 1.8.0 equals 1.8.
    static boolean newer(String candidate, String installed) {
        String format = "[0-9]{1,6}([.][0-9]{1,6}){1,2}";
        if (!candidate.matches(format) || !installed.matches(format)) return false;
        String[] a = candidate.split("[.]"), b = installed.split("[.]");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int left = i < a.length ? Integer.parseInt(a[i]) : 0;
            int right = i < b.length ? Integer.parseInt(b[i]) : 0;
            if (left != right) return left > right;
        }
        return false;
    }

    static synchronized String check(Context context, boolean background) {
        SharedPreferences prefs = context.getSharedPreferences("release_updates", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long next = prefs.getLong("next", 0);
        String version = prefs.getString("version", "");
        if (now >= next || next - now > 24 * HOUR) {
            String json = ScheduleStore.download(API, 128 * 1024, false);
            long delay = HOUR;
            if (json != null) {
                try {
                    version = availableVersion(new JSONObject(json));
                    delay = 24 * HOUR;
                } catch (JSONException ignored) {
                    // Retry a malformed response without losing the last valid release.
                }
            }
            prefs.edit().putString("version", version).putLong("next", now + delay).apply();
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!newer(version, BuildConfig.VERSION_NAME)) {
            manager.cancel(NOTICE);
            return "";
        }
        if (background && !version.equals(prefs.getString("notified", "")) && manager.areNotificationsEnabled()
                && (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED)) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Оновлення застосунку",
                    NotificationManager.IMPORTANCE_DEFAULT));
            if (manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE) {
                PendingIntent open = PendingIntent.getActivity(context, NOTICE, download(version),
                        PendingIntent.FLAG_IMMUTABLE);
                manager.notify(NOTICE, new Notification.Builder(context, CHANNEL)
                        .setSmallIcon(android.R.drawable.stat_sys_download_done)
                        .setContentTitle("Чернівці Світло · доступна версія " + version)
                        .setContentText("Натисни, щоб завантажити оновлення.")
                        .setContentIntent(open).setAutoCancel(true)
                        .addAction(new Notification.Action.Builder(null, "Оновити", open).build()).build());
                prefs.edit().putString("notified", version).apply();
            }
        }
        return version;
    }

    private static String availableVersion(JSONObject release) throws JSONException {
        String tag = release.getString("tag_name");
        if (release.getBoolean("draft") || release.getBoolean("prerelease") || !tag.startsWith("android-v")) return "";
        String version = tag.substring("android-v".length());
        if (!newer(version, BuildConfig.VERSION_NAME)) return "";
        JSONArray assets = release.getJSONArray("assets");
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            if ("uploaded".equals(asset.optString("state")) && asset.optLong("size") > 0
                    && download(version).getDataString().equals(asset.optString("browser_download_url"))) return version;
        }
        return "";
    }
}
