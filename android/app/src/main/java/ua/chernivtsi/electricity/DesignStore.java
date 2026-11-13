package ua.chernivtsi.electricity;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

final class DesignStore {
    private static final String URL = "https://raw.githubusercontent.com/andpzk/chernivtsi-widget/android-design-v1/android/design.properties";
    private static final String KEY = "validated_design";
    private final SharedPreferences prefs;

    DesignStore(Context context) {
        prefs = context.getSharedPreferences("widget_design", Context.MODE_PRIVATE);
    }

    WidgetDesign current() {
        WidgetDesign saved = WidgetDesign.parse(prefs.getString(KEY, null));
        return saved == null ? WidgetDesign.DEFAULT : saved;
    }

    void refresh() {
        String source = ScheduleStore.download(URL + "?check=" + System.currentTimeMillis(), 2048, false);
        WidgetDesign update = WidgetDesign.newer(source, current());
        if (update != null && !Thread.currentThread().isInterrupted()) {
            prefs.edit().putString(KEY, source).apply();
            Log.i("ChernivtsiDesign", "Applied GitHub design revision " + update.revision());
        }
    }
}
