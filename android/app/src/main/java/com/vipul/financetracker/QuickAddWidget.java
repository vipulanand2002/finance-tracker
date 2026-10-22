package com.vipul.financetracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Home-screen widget with one-tap "Expense" and "Income" buttons. */
public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);
            views.setOnClickPendingIntent(R.id.widget_expense, open(context, "/add?type=expense", 1));
            views.setOnClickPendingIntent(R.id.widget_income, open(context, "/add?type=income", 2));
            views.setOnClickPendingIntent(R.id.widget_title, open(context, "/dashboard", 3));
            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent open(Context context, String path, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.vipul.financetracker.OPEN" + requestCode);
        intent.putExtra(MainActivity.EXTRA_PATH, path);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
