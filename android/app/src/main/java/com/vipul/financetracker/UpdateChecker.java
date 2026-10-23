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
import android.graphics.drawable.Icon;
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
 *  - a new Android build (GitHub release "Finance App v1.0.N") → tap to download it
 *  - a new web deployment on Vercel → the app already shows it, the notification says so
 * It checks when the app opens and roughly every hour in the background.
 */
final class UpdateChecker {
    private static final String PREFS = "updates";
    private static final String KEY_WEB = "web_deployment";
    private static final String KEY_APK = "apk_notified";
    private static final String CHANNEL = "updates";
    private static final String RELEASE_API = "https://api.github.com/repos/vipulanand2002/finance-tracker/releases/latest";

    private UpdateChecker() { }

    private static final String KEY_HISTORY = "history";

    /** Every update notice is also kept here so the app's bell panel can list it. */
    static void addHistory(Context c, String kind, int number, String title, String body, String path, String url) {
        try {
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(p.getString(KEY_HISTORY, "[]"));
            JSONObject o = new JSONObject();
            o.put("kind", kind);
            o.put("number", number);
            o.put("title", title);
            o.put("body", body);
            o.put("path", path == null ? "" : path);
            o.put("url", url == null ? "" : url);
            o.put("time", System.currentTimeMillis());
            JSONArray next = new JSONArray();
            next.put(o);
            for (int i = 0; i < old.length() && next.length() < 20; i++) next.put(old.get(i));
            p.edit().putString(KEY_HISTORY, next.toString()).apply();
        } catch (Exception ignored) { }
    }

    static String history(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_HISTORY, "[]");
    }

    static void clearHistory(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_HISTORY).apply();
    }

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
        // No download involved: the app itself already shows the new web version
        String title = "Web update applied — no download needed";
        String body = (message.isEmpty() ? "A new version of the site is live." : message) + " Tap to see the app version.";
        addHistory(c, "web", 0, title, body, "/settings/home-screen", null);
        post(c, 3000 + Math.abs(id.hashCode() % 1000), title, body, openApp(c, "/settings/home-screen"));
    }

    private static void checkApk(Context c) throws Exception {
        JSONObject rel = new JSONObject(get(RELEASE_API, true));
        // Release tags look like v1.0.5; the last number is the build number
        Matcher m = Pattern.compile("v\\d+\\.\\d+\\.(\\d+)").matcher(rel.optString("tag_name", ""));
        if (!m.find()) return;
        int latest = Integer.parseInt(m.group(1));

        PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
        int installed = Build.VERSION.SDK_INT >= 28 ? (int) info.getLongVersionCode() : info.versionCode;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (latest <= installed || latest <= p.getInt(KEY_APK, 0)) return;

        String page = rel.optString("html_url", "");
        String apk = page;
        JSONArray assets = rel.optJSONArray("assets");
        if (assets != null && assets.length() > 0) apk = assets.getJSONObject(0).optString("browser_download_url", page);

        p.edit().putInt(KEY_APK, latest).apply();
        int id = 2000 + (latest % 1000);
        String name = rel.optString("name", "").isEmpty() ? "Finance App" : rel.optString("name", "");
        // Tapping opens the release page (notes + Download button); the action downloads the APK directly
        String title = "New app version available";
        String body = name + " is ready. Tap to open the download page, then open the file to update the app.";
        addHistory(c, "apk", latest, title, body, null, page);
        post(c, id, title, body, browse(c, id, page), "Download APK", browse(c, id + 1000, apk));
    }

    private static PendingIntent browse(Context c, int requestCode, String url) {
        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, requestCode, view, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openApp(Context c, String path) {
        Intent open = new Intent(c, MainActivity.class);
        open.setAction("com.vipul.financetracker.OPEN_FROM_UPDATE");
        open.putExtra(MainActivity.EXTRA_PATH, path);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 7002, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Each update gets its own id and is not auto-cancelled, so they pile up in the panel as a record. */
    private static void post(Context c, int id, String title, String body, PendingIntent tap) {
        post(c, id, title, body, tap, null, null);
    }

    private static void post(Context c, int id, String title, String body, PendingIntent tap, String actionLabel, PendingIntent action) {
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
        if (action != null && actionLabel != null) {
            b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_notification), actionLabel, action).build());
        }
        nm.notify(id, b.build());
    }
}
