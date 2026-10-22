package com.vipul.financetracker;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * "Add your transactions" reminders. They are scheduled on the phone itself with the
 * system alarm clock, so they follow the device's time and timezone and need no server.
 */
final class Reminders {
    private static final String PREFS = "reminders";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_TIMES = "times";          // "10:00,14:00,22:00"
    private static final String KEY_SCHEDULED = "scheduled";  // request codes currently set
    private static final String CHANNEL = "reminders";
    static final String DEFAULT_TIMES = "10:00,14:00,22:00";

    private Reminders() { }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean(KEY_ENABLED, false);
    }

    static String timesCsv(Context c) {
        return prefs(c).getString(KEY_TIMES, DEFAULT_TIMES);
    }

    static boolean canPost(Context c) {
        return Build.VERSION.SDK_INT < 33
                || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean canScheduleExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    static void save(Context c, boolean enabled, String timesCsv) {
        prefs(c).edit().putBoolean(KEY_ENABLED, enabled).putString(KEY_TIMES, timesCsv).apply();
        schedule(c);
    }

    private static List<int[]> parseTimes(String csv) {
        List<int[]> out = new ArrayList<>();
        if (csv == null) return out;
        for (String t : csv.split(",")) {
            String[] hm = t.trim().split(":");
            if (hm.length != 2) continue;
            try {
                int h = Integer.parseInt(hm[0]);
                int m = Integer.parseInt(hm[1]);
                if (h >= 0 && h < 24 && m >= 0 && m < 60) out.add(new int[]{h, m});
            } catch (NumberFormatException ignored) { }
        }
        return out;
    }

    private static PendingIntent alarmIntent(Context c, int requestCode) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction("com.vipul.financetracker.REMIND");
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** (Re)sets one alarm per chosen time, each for its next occurrence on the device clock. */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        SharedPreferences p = prefs(c);

        // Drop whatever was set before
        String old = p.getString(KEY_SCHEDULED, "");
        for (String code : old.split(",")) {
            if (code.isEmpty()) continue;
            try { am.cancel(alarmIntent(c, Integer.parseInt(code))); } catch (NumberFormatException ignored) { }
        }

        StringBuilder set = new StringBuilder();
        if (p.getBoolean(KEY_ENABLED, false)) {
            for (int[] hm : parseTimes(p.getString(KEY_TIMES, DEFAULT_TIMES))) {
                int code = hm[0] * 60 + hm[1];
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.HOUR_OF_DAY, hm[0]);
                cal.set(Calendar.MINUTE, hm[1]);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() <= System.currentTimeMillis() + 1000) cal.add(Calendar.DAY_OF_MONTH, 1);

                PendingIntent pi = alarmIntent(c, code);
                try {
                    if (canScheduleExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                } catch (SecurityException e) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                }
                if (set.length() > 0) set.append(',');
                set.append(code);
            }
        }
        p.edit().putString(KEY_SCHEDULED, set.toString()).apply();
    }

    /** Shows the "add your transactions" notification now. */
    static void notifyNow(Context c) {
        if (!canPost(c)) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Transaction reminders", NotificationManager.IMPORTANCE_DEFAULT));
        }

        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        String title = hour < 12 ? "Good morning" : hour < 17 ? "Afternoon check-in" : "Evening wrap-up";
        String body = hour < 12 ? "Remember to add your transactions from yesterday and today."
                : hour < 17 ? "Add any transactions from this morning so nothing gets missed."
                : "Before the day ends, add today’s transactions.";

        Intent open = new Intent(c, MainActivity.class);
        open.setAction("com.vipul.financetracker.OPEN_FROM_REMINDER");
        open.putExtra(MainActivity.EXTRA_PATH, "/add");
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(c, 9001, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new android.app.Notification.Builder(c, CHANNEL)
                : new android.app.Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setContentIntent(content)
                .setAutoCancel(true);
        nm.notify(1, b.build());
    }
}
