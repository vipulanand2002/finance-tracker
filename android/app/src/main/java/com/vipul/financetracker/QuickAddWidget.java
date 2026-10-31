package com.vipul.financetracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.widget.RemoteViews;

import java.util.Map;

/**
 * Home-screen widget with one-tap "Expense" and "Income" buttons. Enlarged, it also
 * shows "Paste SMS": wider → a third button in the row, taller → a full-width row.
 */
public class QuickAddWidget extends AppWidgetProvider {

    // Sizes (dp) at which the bigger layouts take over
    private static final float WIDE_DP = 260f;
    private static final float TALL_DP = 110f;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) manager.updateAppWidget(id, build(context, manager, id));
    }

    // Resized on the home screen (only needed before Android 12, which picks by size itself)
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, build(context, manager, id));
    }

    private static RemoteViews build(Context context, AppWidgetManager manager, int id) {
        if (Build.VERSION.SDK_INT >= 31) {
            // The launcher shows the biggest layout that fits as the widget is resized
            Map<SizeF, RemoteViews> bySize = new ArrayMap<>();
            bySize.put(new SizeF(150f, 50f), views(context, R.layout.widget_quick_add));
            bySize.put(new SizeF(WIDE_DP, 50f), views(context, R.layout.widget_quick_add_wide));
            bySize.put(new SizeF(150f, TALL_DP), views(context, R.layout.widget_quick_add_tall));
            return new RemoteViews(bySize);
        }
        Bundle o = manager.getAppWidgetOptions(id);
        int width = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);   // portrait width
        int height = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT); // portrait height
        int layout = height >= TALL_DP ? R.layout.widget_quick_add_tall
                : width >= WIDE_DP ? R.layout.widget_quick_add_wide
                : R.layout.widget_quick_add;
        return views(context, layout);
    }

    private static RemoteViews views(Context context, int layout) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setOnClickPendingIntent(R.id.widget_expense, open(context, "/add?type=expense", 1));
        views.setOnClickPendingIntent(R.id.widget_income, open(context, "/add?type=income", 2));
        views.setOnClickPendingIntent(R.id.widget_title, open(context, "/dashboard", 3));
        if (layout != R.layout.widget_quick_add) views.setOnClickPendingIntent(R.id.widget_paste, paste(context));
        return views;
    }

    private static PendingIntent open(Context context, String path, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.vipul.financetracker.OPEN" + requestCode);
        intent.putExtra(MainActivity.EXTRA_PATH, path);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // A widget can't read the clipboard (Android only lets the app on screen do that),
    // so this opens the app, which reads it and shows Add from SMS.
    private static PendingIntent paste(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.vipul.financetracker.PASTE_SMS");
        intent.putExtra(MainActivity.EXTRA_PASTE_SMS, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 4, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
