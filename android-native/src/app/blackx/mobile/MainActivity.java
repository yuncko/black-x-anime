package app.blackx.mobile;

import android.accounts.AccountManager;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {
    private static final int REQ_PICK_GOOGLE_ACCOUNT = 9001;
    private static final int REQ_POST_NOTIFICATIONS = 9002;
    private Dialog oauthDialog = null;
    private boolean volumeKeyScrollEnabled = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableHighRefreshRate120Hz();
        configurePitchBlackWindow();
        requestNotificationPermission();
    }

    @Override
    public void onResume() {
        super.onResume();
        enableHighRefreshRate120Hz();
        configurePitchBlackWindow();
    }

    /**
     * Intercept hardware & gesture navigation bar Back button on Android 12/13/14/15 (CMF Phone 1)
     * AND optional Volume Up/Down keys when reading Manhwa/Manga!
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event != null) {
            int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_BACK) {
                if (event.getAction() == KeyEvent.ACTION_UP) {
                    triggerJsBackNavigation();
                }
                return true;
            }
            if (volumeKeyScrollEnabled && (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN)) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    triggerJsVolumeScroll(code == KeyEvent.KEYCODE_VOLUME_DOWN ? "down" : "up");
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            return true;
        }
        if (volumeKeyScrollEnabled && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        triggerJsBackNavigation();
    }

    private void triggerJsVolumeScroll(String dir) {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().evaluateJavascript(
                    "if(window.__bxVolumeKeyScroll){window.__bxVolumeKeyScroll('" + dir + "');}",
                    null
                );
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setVolumeKeyScroll(final boolean enabled) {
        this.volumeKeyScrollEnabled = enabled;
    }

    @JavascriptInterface
    public void setScreenBrightness(final float level) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        if (params != null) {
                            params.screenBrightness = level;
                            window.setAttributes(params);
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    @JavascriptInterface
    public void enterPipMode() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (Build.VERSION.SDK_INT >= 24) {
                        enterPictureInPictureMode();
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    private void triggerJsBackNavigation() {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().evaluateJavascript(
                    "if(window.__bxHardwareBack){window.__bxHardwareBack();}else if(window.history.length>1){window.history.back();}",
                    null
                );
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Called from JS only when user is on Home root and double-presses Back to exit
     */
    @JavascriptInterface
    public void exitApp() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    finish();
                } catch (Exception ignored) {
                }
            }
        });
    }

    /**
     * True Edge-to-Edge Immersive Fullscreen & Landscape Control for Anime Video & Manhwa Reader
     */
    @JavascriptInterface
    public void setFullscreen(final boolean fullscreen, final boolean landscape) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        WindowManager.LayoutParams params = window.getAttributes();
                        if (Build.VERSION.SDK_INT >= 28 && params != null) {
                            // LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES = 1
                            params.layoutInDisplayCutoutMode = fullscreen ? 1 : 0;
                            window.setAttributes(params);
                        }
                        View decor = window.getDecorView();
                        if (fullscreen) {
                            // FLAG_FULLSCREEN (1024) | FLAG_KEEP_SCREEN_ON (128)
                            window.addFlags(1024 | 128);
                            if (decor != null) {
                                // IMMERSIVE_STICKY(4096) | FULLSCREEN(4) | HIDE_NAVIGATION(2) | LAYOUT_STABLE(256) | LAYOUT_HIDE_NAVIGATION(512) | LAYOUT_FULLSCREEN(1024)
                                decor.setSystemUiVisibility(5894);
                            }
                        } else {
                            window.clearFlags(1024 | 128);
                            if (decor != null) {
                                decor.setSystemUiVisibility(0);
                            }
                        }
                    }
                    if (fullscreen && landscape) {
                        // SCREEN_ORIENTATION_SENSOR_LANDSCAPE = 6
                        setRequestedOrientation(6);
                    } else {
                        // SCREEN_ORIENTATION_UNSPECIFIED = -1
                        setRequestedOrientation(-1);
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    private void enableHighRefreshRate120Hz() {
        try {
            Window window = getWindow();
            if (window == null) return;
            WindowManager.LayoutParams params = window.getAttributes();
            params.preferredRefreshRate = 120.0f;
            if (Build.VERSION.SDK_INT >= 28) {
                params.layoutInDisplayCutoutMode = 1;
            }
            if (Build.VERSION.SDK_INT >= 23) {
                Display display = getWindowManager().getDefaultDisplay();
                Display.Mode currentMode = display.getMode();
                Display.Mode[] modes = display.getSupportedModes();
                Display.Mode bestMode = currentMode;
                for (int i = 0; i < modes.length; i++) {
                    Display.Mode m = modes[i];
                    if (m.getPhysicalWidth() == currentMode.getPhysicalWidth()
                        && m.getPhysicalHeight() == currentMode.getPhysicalHeight()
                        && m.getRefreshRate() > bestMode.getRefreshRate()) {
                        bestMode = m;
                    }
                }
                params.preferredDisplayModeId = bestMode.getModeId();
            }
            window.setAttributes(params);
        } catch (Exception ignored) {
        }
    }

    private static String buildCleanChromeUserAgent(String rawUa) {
        if (rawUa == null || rawUa.isEmpty()) {
            return "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
        }
        String cleaned = rawUa.replace("; wv)", ")").replace("; wv;", ";").replace(" wv ", " ");
        cleaned = cleaned.replaceAll("Version/\\d+\\.\\d+\\s*", "");
        return cleaned;
    }

    private void configurePitchBlackWindow() {
        try {
            Window window = getWindow();
            int black = 0xFF000000;
            if (window != null) {
                window.setStatusBarColor(black);
                window.setNavigationBarColor(black);
                window.getDecorView().setBackgroundColor(black);
            }
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();
                webView.setBackgroundColor(black);
                webView.setLayerType(2, null);
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
                settings.setJavaScriptCanOpenWindowsAutomatically(true);
                settings.setMixedContentMode(0);
                settings.setUserAgentString(buildCleanChromeUserAgent(settings.getUserAgentString()));
                if (Build.VERSION.SDK_INT >= 23) {
                    settings.setOffscreenPreRaster(true);
                }
                webView.addJavascriptInterface(this, "BlackXNativeAuth");
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Native Android System Google Account Picker:
     * Opens the phone's built-in Google account chooser listing all Google accounts
     * already signed in on the device without typing email/password.
     */
    @JavascriptInterface
    public void pickPhoneGoogleAccount(final String fallbackAuthUrl) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent intent = AccountManager.newChooseAccountIntent(
                        null,
                        null,
                        new String[]{"com.google"},
                        true,
                        null,
                        null,
                        null,
                        null
                    );
                    if (intent != null) {
                        startActivityForResult(intent, REQ_PICK_GOOGLE_ACCOUNT);
                        return;
                    }
                } catch (Exception ignored) {
                }
                if (fallbackAuthUrl != null && !fallbackAuthUrl.isEmpty()) {
                    startGoogleLogin(fallbackAuthUrl);
                } else {
                    deliverOAuthErrorToJs("picker_unavailable");
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK_GOOGLE_ACCOUNT) {
            if (resultCode == -1 && data != null) {
                String email = data.getStringExtra("authAccount");
                if (email != null && !email.isEmpty()) {
                    deliverPhoneGoogleAccountToJs(email);
                    return;
                }
            }
            deliverOAuthErrorToJs("user_cancelled");
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @JavascriptInterface
    public void startGoogleLogin(final String authUrl) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (oauthDialog != null) {
                        try { oauthDialog.dismiss(); } catch (Exception ignored) {}
                        oauthDialog = null;
                    }
                    final Dialog dialog = new Dialog(MainActivity.this, 16973834);
                    oauthDialog = dialog;
                    Window w = dialog.getWindow();
                    if (w != null) {
                        w.requestFeature(1);
                        w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                        w.setStatusBarColor(0xFF000000);
                        w.setNavigationBarColor(0xFF000000);
                    }
                    WebView oauthWebView = new WebView(MainActivity.this);
                    oauthWebView.setBackgroundColor(0xFF000000);
                    WebSettings s = oauthWebView.getSettings();
                    s.setJavaScriptEnabled(true);
                    s.setDomStorageEnabled(true);
                    s.setDatabaseEnabled(true);
                    s.setJavaScriptCanOpenWindowsAutomatically(true);
                    s.setUserAgentString(buildCleanChromeUserAgent(s.getUserAgentString()));

                    CookieManager cm = CookieManager.getInstance();
                    if (cm != null) {
                        cm.setAcceptCookie(true);
                        if (Build.VERSION.SDK_INT >= 21) {
                            cm.setAcceptThirdPartyCookies(oauthWebView, true);
                        }
                    }

                    oauthWebView.setWebViewClient(new WebViewClient() {
                        private boolean completed = false;

                        private boolean handleUrl(String url) {
                            if (url == null || completed) return false;
                            if (url.startsWith("https://spry-oxide-1h7sp.firebaseapp.com/__/auth/handler")
                                || url.startsWith("http://localhost/__/auth/handler")
                                || url.startsWith("https://localhost/__/auth/handler")) {
                                completed = true;
                                try {
                                    if (oauthDialog != null) {
                                        oauthDialog.dismiss();
                                        oauthDialog = null;
                                    }
                                } catch (Exception ignored) {}
                                deliverOAuthRedirectToJs(url);
                                return true;
                            }
                            return false;
                        }

                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                            if (request != null && request.getUrl() != null) {
                                if (handleUrl(request.getUrl().toString())) return true;
                            }
                            return false;
                        }

                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            if (handleUrl(url)) return true;
                            return false;
                        }

                        @Override
                        public void onPageStarted(WebView view, String url, Bitmap favicon) {
                            if (handleUrl(url)) return;
                            super.onPageStarted(view, url, favicon);
                        }
                    });

                    dialog.setCancelable(true);
                    dialog.setOnCancelListener(new DialogInterface.OnCancelListener() {
                        @Override
                        public void onCancel(DialogInterface d) {
                            deliverOAuthErrorToJs("user_cancelled");
                        }
                    });

                    dialog.setContentView(
                        oauthWebView,
                        new ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    );
                    dialog.show();
                    oauthWebView.loadUrl(authUrl);
                } catch (Exception e) {
                    deliverOAuthErrorToJs(e.getMessage());
                }
            }
        });
    }

    private void deliverPhoneGoogleAccountToJs(String email) {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                String safe = email.replace("\\", "\\\\").replace("'", "\\'");
                String js = "window.__onBlackXPhoneGoogleAccountPicked && window.__onBlackXPhoneGoogleAccountPicked('" + safe + "');";
                this.bridge.getWebView().evaluateJavascript(js, null);
            }
        } catch (Exception ignored) {
        }
    }

    private void deliverOAuthRedirectToJs(String redirectUrl) {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                String safe = redirectUrl.replace("\\", "\\\\").replace("'", "\\'");
                String js = "window.__onBlackXGoogleOAuthRedirect && window.__onBlackXGoogleOAuthRedirect('" + safe + "');";
                this.bridge.getWebView().evaluateJavascript(js, null);
            }
        } catch (Exception ignored) {
        }
    }

    private void deliverOAuthErrorToJs(String err) {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                if (err == null) err = "error";
                String safe = err.replace("\\", "\\\\").replace("'", "\\'");
                String js = "window.__onBlackXGoogleOAuthError && window.__onBlackXGoogleOAuthError('" + safe + "');";
                this.bridge.getWebView().evaluateJavascript(js, null);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Native Android HTTP Engine (GET / POST with custom headers, zero CORS restrictions):
     * headersPipe format: "Header1:Value1||Header2:Value2"
     */
    private String executeNativeHttp(String urlStr, String method, String headersPipe, String bodyStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(12000);
            String reqMethod = (method != null && !method.isEmpty()) ? method.toUpperCase() : "GET";
            conn.setRequestMethod(reqMethod);
            conn.setRequestProperty(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            );

            if (headersPipe != null && !headersPipe.isEmpty()) {
                String[] pairs = headersPipe.split("\\|\\|");
                for (int i = 0; i < pairs.length; i++) {
                    String pair = pairs[i];
                    int colon = pair.indexOf(':');
                    if (colon > 0) {
                        String k = pair.substring(0, colon).trim();
                        String v = pair.substring(colon + 1).trim();
                        if (!k.isEmpty()) {
                            conn.setRequestProperty(k, v);
                        }
                    }
                }
            }

            if ("POST".equals(reqMethod) && bodyStr != null && !bodyStr.isEmpty()) {
                conn.setDoOutput(true);
                byte[] outBytes = bodyStr.getBytes("UTF-8");
                OutputStream os = conn.getOutputStream();
                os.write(outBytes);
                os.flush();
                os.close();
            }

            int code = conn.getResponseCode();
            // Handle manual 301/302/307/308 across protocols if needed
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                if (loc != null && !loc.isEmpty()) {
                    conn.disconnect();
                    URL redirUrl = new URL(url, loc);
                    conn = (HttpURLConnection) redirUrl.openConnection();
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(12000);
                    conn.setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                    );
                    code = conn.getResponseCode();
                }
            }

            InputStream is = (code >= 200 && code < 400) ? conn.getInputStream() : conn.getErrorStream();
            if (is == null) return "";
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[4096];
            int n;
            while ((n = reader.read(buf)) != -1) {
                sb.append(buf, 0, n);
            }
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return "";
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    @JavascriptInterface
    public String httpGetSync(final String urlStr, final String headersPipe) {
        return executeNativeHttp(urlStr, "GET", headersPipe, null);
    }

    @JavascriptInterface
    public String httpPostSync(final String urlStr, final String headersPipe, final String bodyStr) {
        return executeNativeHttp(urlStr, "POST", headersPipe, bodyStr);
    }

    @JavascriptInterface
    public void httpRequestAsync(
        final String reqId,
        final String urlStr,
        final String method,
        final String headersPipe,
        final String bodyStr
    ) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String resp = executeNativeHttp(urlStr, method, headersPipe, bodyStr);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (MainActivity.this.bridge != null && MainActivity.this.bridge.getWebView() != null) {
                                String escaped = resp
                                    .replace("\\", "\\\\")
                                    .replace("'", "\\'")
                                    .replace("\r", "\\r")
                                    .replace("\n", "\\n")
                                    .replace("\u2028", "\\u2028")
                                    .replace("\u2029", "\\u2029");
                                String safeId = reqId.replace("'", "");
                                String js = "window.__onBlackXHttpResult && window.__onBlackXHttpResult('" + safeId + "', '" + escaped + "');";
                                MainActivity.this.bridge.getWebView().evaluateJavascript(js, null);
                            }
                        } catch (Exception ignored) {
                        }
                    }
                });
            }
        }).start();
    }

    /**
     * Air-time reminders while the app is closed (v18.0): replaces every alarm with `json`
     * ([{"id","title","body","at"}]); returns how many were armed, -1 on failure.
     * The shipped bytecode comes from android-native/smali/MainActivity.scheduleEpisodeAlarms.smali
     * (tools/apk/patch-native.sh); this Java is the reading copy.
     */
    @JavascriptInterface
    public int scheduleEpisodeAlarms(String json) {
        try {
            return EpisodeAlarms.schedule(getApplicationContext(), json);
        } catch (Throwable t) {
            return -1;
        }
    }

    /**
     * Request Android 13+ (API 33+) POST_NOTIFICATIONS runtime permission
     */
    @JavascriptInterface
    public void requestNotificationPermission() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        Method checkSelf = Context.class.getMethod("checkSelfPermission", String.class);
                        int granted = (Integer) checkSelf.invoke(MainActivity.this, "android.permission.POST_NOTIFICATIONS");
                        if (granted != 0) {
                            Method reqPerm = MainActivity.this.getClass().getMethod(
                                "requestPermissions",
                                String[].class,
                                int.class
                            );
                            reqPerm.invoke(
                                MainActivity.this,
                                new Object[]{new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_POST_NOTIFICATIONS}
                            );
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    /**
     * Dispatch a REAL Android OS Status-Bar & Heads-Up Notification for new Anime Episodes!
     */
    @JavascriptInterface
    public void sendPhoneNotification(final String title, final String body, final int notifId) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Method getSysSvc = Context.class.getMethod("getSystemService", String.class);
                    Object nm = getSysSvc.invoke(MainActivity.this, "notification");
                    if (nm == null) return;

                    String channelId = "blackx_episodes_channel";
                    if (Build.VERSION.SDK_INT >= 26) {
                        Class<?> chanCls = Class.forName("android.app.NotificationChannel");
                        Constructor<?> chanCtor = chanCls.getConstructor(String.class, CharSequence.class, int.class);
                        // IMPORTANCE_HIGH = 4 (Heads-Up + Sound)
                        Object channel = chanCtor.newInstance(channelId, "Hearbor Episode Alerts", 4);
                        Method setDesc = chanCls.getMethod("setDescription", String.class);
                        setDesc.invoke(channel, "إشعارات نزول حلقات الأنمي والفصول الجديدة على Hearbor");
                        Method createChan = nm.getClass().getMethod("createNotificationChannel", chanCls);
                        createChan.invoke(nm, channel);
                    }

                    Class<?> builderCls = Class.forName("android.app.Notification$Builder");
                    Object builder;
                    if (Build.VERSION.SDK_INT >= 26) {
                        Constructor<?> bCtor = builderCls.getConstructor(Context.class, String.class);
                        builder = bCtor.newInstance(MainActivity.this, channelId);
                    } else {
                        Constructor<?> bCtor = builderCls.getConstructor(Context.class);
                        builder = bCtor.newInstance(MainActivity.this);
                    }

                    // Get app icon resource ID via getApplicationInfo().icon
                    int iconRes = 17301659; // fallback android.R.drawable.ic_media_play
                    try {
                        Method getAppInfo = Context.class.getMethod("getApplicationInfo");
                        Object appInfo = getAppInfo.invoke(MainActivity.this);
                        if (appInfo != null) {
                            Field iconField = appInfo.getClass().getField("icon");
                            int appIcon = iconField.getInt(appInfo);
                            if (appIcon != 0) iconRes = appIcon;
                        }
                    } catch (Exception ignored) {}

                    builderCls.getMethod("setSmallIcon", int.class).invoke(builder, iconRes);
                    builderCls.getMethod("setContentTitle", CharSequence.class).invoke(builder, title != null ? title : "Hearbor");
                    builderCls.getMethod("setContentText", CharSequence.class).invoke(builder, body != null ? body : "");
                    builderCls.getMethod("setAutoCancel", boolean.class).invoke(builder, true);

                    // Attach PendingIntent so tapping notification opens MainActivity
                    try {
                        Intent launchIntent = new Intent();
                        Class<?> piCls = Class.forName("android.app.PendingIntent");
                        Method getAct = piCls.getMethod("getActivity", Context.class, int.class, Intent.class, int.class);
                        // FLAG_IMMUTABLE (67108864) | FLAG_UPDATE_CURRENT (134217728) = 201326592
                        int flags = Build.VERSION.SDK_INT >= 23 ? 201326592 : 134217728;
                        Object pendingIntent = getAct.invoke(null, MainActivity.this, 0, launchIntent, flags);
                        if (pendingIntent != null) {
                            builderCls.getMethod("setContentIntent", piCls).invoke(builder, pendingIntent);
                        }
                    } catch (Exception ignored) {}

                    Object notification = builderCls.getMethod("build").invoke(builder);
                    Method notifyMethod = nm.getClass().getMethod("notify", int.class, Class.forName("android.app.Notification"));
                    notifyMethod.invoke(nm, notifId > 0 ? notifId : (int) (System.currentTimeMillis() % 100000), notification);
                } catch (Exception ignored) {
                }
            }
        });
    }
}
