package ua.chernivtsi.electricity;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

public class PowerWidget extends AppWidgetProvider {
    public static final class Ring extends PowerWidget {}
    public static final class Wide extends PowerWidget {}

    private static SharedPreferences groups(Context context) {
        return context.getSharedPreferences("widget_groups", Context.MODE_PRIVATE);
    }

    static int group(Context context, int id) {
        return groups(context).getInt(Integer.toString(id), 0);
    }

    static void setGroup(Context context, int id, int group) {
        groups(context).edit().putInt(Integer.toString(id), group).apply();
    }

    static boolean owns(Context context, int id) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(id);
        return info != null && (info.provider.equals(new ComponentName(context, Ring.class))
                || info.provider.equals(new ComponentName(context, Wide.class)));
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) show(context, id, false);
        RefreshService.schedule(context, false);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        show(context, id, false);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor edit = groups(context).edit();
        for (int id : ids) edit.remove(Integer.toString(id));
        edit.apply();
        RefreshService.schedule(context, false);
    }

    static Set<Integer> activeIds(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        Set<Integer> ids = new LinkedHashSet<>();
        for (Class<?> provider : new Class<?>[]{Ring.class, Wide.class}) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, provider))) {
                if (group(context, id) != 0) ids.add(id);
            }
        }
        return ids;
    }

    static void show(Context context, int id, boolean loading) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(id);
        int group = group(context, id);
        if (info == null || group < 1 || group > 12) return;
        boolean wide = info.provider.getClassName().equals(Wide.class.getName());
        Bundle options = manager.getAppWidgetOptions(id);
        float width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, wide ? 285 : 132);
        float height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 132);
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<SizeF> sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (sizes != null && !sizes.isEmpty()) {
                SizeF portrait = sizes.get(0);
                for (SizeF size : sizes) if (size.getHeight() > portrait.getHeight()) portrait = size;
                width = portrait.getWidth();
                height = portrait.getHeight();
            }
        }
        width = Math.max(60, width);
        height = Math.max(60, height);
        float density = Math.min(context.getResources().getDisplayMetrics().density, 640f / Math.max(width, height));
        boolean dark = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        Instant now = Instant.now();
        Schedule.Pair data = new ScheduleStore(context).cached(group, now);
        WidgetArt.Model model = new WidgetArt.Model(data, group, now, wide, loading && data.today == null,
                android.text.format.DateFormat.is24HourFormat(context));
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget);
        view.setViewVisibility(R.id.loading, View.GONE);
        view.setImageViewBitmap(R.id.chart, WidgetArt.draw(Math.round(width * density), Math.round(height * density),
                wide, dark, model, new DesignStore(context).current()));
        view.setContentDescription(R.id.chart, model.accessibility(wide));
        Intent open = new Intent(context, GroupActivity.class)
                .setAction(GroupActivity.ACTION_WIDGET_MENU)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        view.setOnClickPendingIntent(R.id.chart, PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(id, view);
    }
}
