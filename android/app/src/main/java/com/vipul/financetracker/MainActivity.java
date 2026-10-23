package com.vipul.financetracker;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A thin shell around the live web app. Everything on screen comes from the Vercel
 * deployment, so every deploy shows up here with no new APK needed.
 */
public class MainActivity extends Activity {
    // Production URL of the web app (deployed by Vercel from the master branch)
    static final String BASE_URL = "https://finance-tracker-mauve-sigma-65.vercel.app";
    static final String EXTRA_PATH = "path";
    private static final int FILE_CHOOSER = 1001;
    private static final int REQ_NOTIFICATIONS = 1002;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#09090b"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                // Keep the app's own pages and the sign-in providers inside the app;
                // send everything else (mailto:, tel:, other sites) to the system.
                // Google refuses to sign in inside an app window, so the sign-in step is
                // opened in the phone's browser; it comes back through financetracker://auth.
                boolean isSignIn = host != null && host.endsWith(".supabase.co")
                        && uri.getPath() != null && uri.getPath().startsWith("/auth/v1/authorize");
                if (!isSignIn && host != null && host.equals(Uri.parse(BASE_URL).getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        // Receipt uploads: let the page open the system file / camera picker
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Lets the Settings page control the on-device reminders
        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        Reminders.schedule(this); // keep alarms in step after updates / clock changes

        // Update notifications need permission on Android 13+; ask once up front
        if (Build.VERSION.SDK_INT >= 33 && !Reminders.canPost(this)) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
        UpdateChecker.schedule(this);
        UpdateChecker.checkAsync(this, null);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(urlFor(getIntent()));
        }
    }

    private static String urlFor(Intent intent) {
        // Back from Google sign-in: finish the login inside the app
        if (intent != null && intent.getData() != null && "financetracker".equals(intent.getData().getScheme())) {
            String q = intent.getData().getEncodedQuery();
            return BASE_URL + "/auth/callback" + (q != null ? "?" + q : "");
        }
        String path = intent != null ? intent.getStringExtra(EXTRA_PATH) : null;
        return BASE_URL + (path != null ? path : "/dashboard");
    }

    // The widget re-opens the running app with a different page to show
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getStringExtra(EXTRA_PATH) != null || intent.getData() != null) web.loadUrl(urlFor(intent));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER && filePathCallback != null) {
            filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    /** window.AndroidApp — only exists inside this app, which is how the web page knows it's on Android. */
    private class Bridge {
        @JavascriptInterface
        public String getState() {
            try {
                JSONObject o = new JSONObject();
                o.put("enabled", Reminders.enabled(MainActivity.this));
                JSONArray times = new JSONArray();
                for (String t : Reminders.timesCsv(MainActivity.this).split(",")) if (!t.trim().isEmpty()) times.put(t.trim());
                o.put("times", times);
                o.put("permission", Reminders.canPost(MainActivity.this));
                o.put("exact", Reminders.canScheduleExact(MainActivity.this));
                android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                o.put("version", info.versionName);
                o.put("build",Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
                return o.toString();
            } catch (JSONException | android.content.pm.PackageManager.NameNotFoundException e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void save(boolean enabled, String timesCsv) {
            Reminders.save(MainActivity.this, enabled, timesCsv);
        }

        @JavascriptInterface
        public void requestPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && !Reminders.canPost(MainActivity.this)) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
                } else {
                    notifyWeb();
                }
            });
        }

        @JavascriptInterface
        public String getUpdates() {
            return UpdateChecker.history(MainActivity.this);
        }

        @JavascriptInterface
        public void clearUpdates() {
            UpdateChecker.clearHistory(MainActivity.this);
        }

        @JavascriptInterface
        public void sendTest() {
            Reminders.notifyNow(MainActivity.this);
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            if (Build.VERSION.SDK_INT >= 31) {
                runOnUiThread(() -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
                    } catch (ActivityNotFoundException ignored) { }
                });
            }
        }
    }

    /** Tell the page to re-read the reminder state (permission may just have changed). */
    private void notifyWeb() {
        web.evaluateJavascript("window.dispatchEvent(new Event('androidstate'))", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATIONS) notifyWeb();
    }

    @Override
    protected void onResume() {
        super.onResume();
        notifyWeb(); // e.g. back from the system "alarms & reminders" screen
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // keep the signed-in session
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
