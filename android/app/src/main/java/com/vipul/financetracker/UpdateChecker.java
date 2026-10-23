package com.vipul.financetracker;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tells the user when something new has shipped, with a notification that stays in the
 * panel until they dismiss it:
 *  - a new Android build (GitHub release "Android app build N") → tap to download it
 *  - a new web deployment on Vercel → the app already shows it, the notification says so
 * It checks when the app opens and roughly every hour in the background.
 */
final class UpdateChecker {
    private static final String PREFS = "updates";
    private static final String KEY_WEB = "web_deployment";
    private static final String KEY_APK = "apk_notified";
    private static final String CHANNEL = "updates";
    private static final String RELEASE_API = "https://api.github.com/repos/vipulanand2002/finance-tracker/releases/tags/android-latest";

    private UpdateChecker() { }

    static PendingIntent checkIntent(Context c) {
        Intent i = new Intent(c, UpdateReceiver.class);
        i.setAction("com.vipul.financetracker.CHECK_UPDATES");
        return PendingIntent.getBroadcast(c, 7001, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Hourly (inexact, battery-friendly) background check. */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setInexactRepeating(AlarmManager.RTC, System.currentTimeMillis() + 10 * 60 * 1000L, AlarmManager.INTERVAL_HOUR, checkIntent(c));
    }

    /** Runs the checks on a background thread. */
    static void checkAsync(Context c, Runnable done) {
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                checkWeb(app);
            } catch (Exception ignored) { }
            try {
                checkApk(app);
            } catch (Exception ignored) { }
            if (done != null) done.run();
        }).start();
    }

    private static String get(String url, boolean github) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestProperty("User-Agent", "FinanceTrackerApp");
        if (github) conn.setRequestProperty("Accept", "application/vnd.github+json");
        if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
        BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        return sb.toString();
    }

    private static void checkWeb(Context c) throws Exception {
        JSONObject v = new JSONObject(get(MainActivity.BASE_URL + "/api/version", false));
        String id = v.optString("id", "");
        if (id.isEmpty()) return;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String last = p.getString(KEY_WEB, null);
        p.edit().putString(KEY_WEB, id).apply();
        if (last == null || last.equals(id)) return; // first run just records the baseline

        String message = v.optString("message", "");
        post(c, 3000 + Math.abs(id.hashCode() % 1000), "Finance Tracker updated",
                message.isEmpty() ? "A new version of the app is live. Open it to see what’s new." : message,
                openApp(c));
    }

    private static void checkApk(Context c) throws Exception {
        JSONObject rel = new JSONObject(get(RELEASE_API, true));
        Matcher m = Pattern.compile("build\\s+(\\d+)", Pattern.CASE_INSENSITIVE).matcher(rel.optString("name", ""));
        if (!m.find()) return;
        int latest = Integer.parseInt(m.group(1));

        PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
        int installed = Build.VERSION.SDK_INT >= 28 ? (int) info.getLongVersionCode() : info.versionCode;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (latest <= installed || latest <= p.getInt(KEY_APK, 0)) return;

        String url = rel.optString("html_url", "");
        JSONArray assets = rel.optJSONArray("assets");
        if (assets != null && assets.length() > 0) url = assets.getJSONObject(0).optString("browser_download_url", url);

        p.edit().putInt(KEY_APK, latest).apply();
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        post(c, 2000 + (latest % 1000), "New app version available",
                "Build " + latest + " is ready. Tap to download and install it over the current app.",
                PendingIntent.getActivity(c, 2000 + (latest % 1000), view, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    private static PendingIntent openApp(Context c) {
        Intent open = new Intent(c, MainActivity.class);
        open.setAction("com.vipul.financetracker.OPEN_FROM_UPDATE");
        open.putExtra(MainActivity.EXTRA_PATH, "/dashboard");
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 7002, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Each update gets its own id and is not auto-cancelled, so they pile up in the panel as a record. */
    private static void post(Context c, int id, String title, String body, PendingIntent tap) {
        if (!Reminders.canPost(c)) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(tap)
                .setAutoCancel(false)
                .setWhen(System.currentTimeMillis());
        nm.notify(id, b.build());
    }
}
