package ua.chernivtsi.electricity;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

final class DesignStore {
    private static final String URL = "https://raw.githubusercontent.com/andpzk/chernivtsi-widget/android-design-v1/android/design.properties";
    private static final String KEY = "validated_design";
    private static final String COPY_URL = "https://raw.githubusercontent.com/andpzk/chernivtsi-widget/main/android/notifications.properties";
    private static final String COPY_KEY = "validated_notifications";
    private final Context context;
    private final SharedPreferences prefs;

    DesignStore(Context context) {
        this.context = context;
        prefs = context.getSharedPreferences("widget_design", Context.MODE_PRIVATE);
    }

    WidgetDesign current() {
        WidgetDesign saved = WidgetDesign.parse(prefs.getString(KEY, null));
        return saved == null ? WidgetDesign.DEFAULT : saved;
    }

    NotificationCopy copy() {
        try (java.util.Scanner reader = new java.util.Scanner(
                context.getAssets().open("notifications.properties"), "UTF-8")) {
            NotificationCopy defaults = NotificationCopy.parse(reader.useDelimiter("\\A").next());
            return defaults.updated(prefs.getString(COPY_KEY, null));
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Missing bundled notification templates", e);
        }
    }

    void refresh() {
        String text = ScheduleStore.download(COPY_URL, NotificationCopy.LIMIT, false);
        if (text != null && !Thread.currentThread().isInterrupted()) {
            NotificationCopy saved = copy();
            if (saved.updated(text) != saved) prefs.edit().putString(COPY_KEY, text).apply();
        }
        String source = ScheduleStore.download(URL + "?check=" + System.currentTimeMillis(), 2048, false);
        WidgetDesign update = WidgetDesign.newer(source, current());
        if (update != null && !Thread.currentThread().isInterrupted()) {
            prefs.edit().putString(KEY, source).apply();
            Log.i("ChernivtsiDesign", "Applied GitHub design revision " + update.revision());
        }
    }
}
