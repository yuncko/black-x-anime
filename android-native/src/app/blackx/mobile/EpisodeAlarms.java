package app.blackx.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Air-time reminders that reach the phone while Hearbor is closed (APK v18.0, 2026-10-17).
 *
 * READING COPY. The shipped code is assembled from
 * android-native/smali/app/blackx/mobile/EpisodeAlarms.smali by tools/apk/patch-native.sh
 * (no Android SDK / D8 in this repository's toolbox); keep both in step.
 *
 * The web code (client/src/mobile/nativeAlarms.js) sends the whole list through
 * MainActivity.scheduleEpisodeAlarms(json) = [{"id":int,"title":str,"body":str,"at":epochMs}].
 * It replaces every alarm, is saved in SharedPreferences and armed again after a reboot or an
 * app update. An alarm intent carries only its id: the text shown is looked up in the saved
 * list, so another app cannot make Hearbor show its own text.
 */
public class EpisodeAlarms extends BroadcastReceiver {
    public static final String ACTION = "app.blackx.mobile.EPISODE_ALARM";
    public static final String CHANNEL = "blackx_episodes_channel";
    public static final String KEY = "list";
    public static final String PREFS = "bx_episode_alarms";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        try {
            if (intent != null && ACTION.equals(intent.getAction())) {
                show(ctx, intent.getIntExtra("id", 0));
            } else {
                rearm(ctx); // BOOT_COMPLETED / MY_PACKAGE_REPLACED
            }
        } catch (Throwable ignored) {
        }
    }

    /** From the JS bridge: replaces every scheduled reminder; returns how many were armed. */
    public static int schedule(Context ctx, String json) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, 0);
        cancelAll(ctx, sp.getString(KEY, "[]"));
        if (json == null) json = "[]";
        sp.edit().putString(KEY, json).apply();
        return arm(ctx, json);
    }

    static int rearm(Context ctx) {
        return arm(ctx, ctx.getSharedPreferences(PREFS, 0).getString(KEY, "[]"));
    }

    static PendingIntent pending(Context ctx, int id) {
        Intent it = new Intent(ctx, EpisodeAlarms.class);
        it.setAction(ACTION);
        it.putExtra("id", id);
        // FLAG_UPDATE_CURRENT, plus FLAG_IMMUTABLE from API 23
        int flags = Build.VERSION.SDK_INT >= 23 ? 0x0C000000 : 0x08000000;
        return PendingIntent.getBroadcast(ctx, id, it, flags);
    }

    static int arm(Context ctx, String json) {
        int count = 0;
        try {
            JSONArray arr = new JSONArray(json);
            AlarmManager am = (AlarmManager) ctx.getSystemService("alarm");
            if (am == null) return 0;
            long now = System.currentTimeMillis();
            int len = Math.min(arr.length(), 64);
            for (int i = 0; i < len; i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                long at = o.optLong("at", 0L);
                int id = o.optInt("id", 0);
                if (id == 0 || at <= now) continue; // only alarms still in the future
                PendingIntent pi = pending(ctx, id);
                // RTC_WAKEUP, allowed in Doze; inexact, so no SCHEDULE_EXACT_ALARM permission
                if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(0, at, pi);
                else am.set(0, at, pi);
                count++;
            }
        } catch (Throwable ignored) {
        }
        return count;
    }

    static void cancelAll(Context ctx, String json) {
        try {
            JSONArray arr = new JSONArray(json);
            AlarmManager am = (AlarmManager) ctx.getSystemService("alarm");
            if (am == null) return;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                int id = o.optInt("id", 0);
                if (id != 0) am.cancel(pending(ctx, id));
            }
        } catch (Throwable ignored) {
        }
    }

    static void show(Context ctx, int id) throws Exception {
        JSONArray arr = new JSONArray(ctx.getSharedPreferences(PREFS, 0).getString(KEY, "[]"));
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && o.optInt("id", 0) == id) {
                post(ctx, id, o.optString("title", "Hearbor"), o.optString("body", ""));
                return;
            }
        }
    }

    static void post(Context ctx, int id, String title, String body) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService("notification");
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            // the same channel as the in-app notifications (MainActivity.sendPhoneNotification)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Hearbor Episode Alerts", 4));
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
        }
        int icon = ctx.getApplicationInfo().icon;
        b.setSmallIcon(icon != 0 ? icon : 0x0108009b); // android.R.drawable.ic_media_play fallback
        b.setContentTitle(title);
        b.setContentText(body);
        b.setAutoCancel(true);
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) {
            int flags = Build.VERSION.SDK_INT >= 23 ? 0x0C000000 : 0x08000000;
            b.setContentIntent(PendingIntent.getActivity(ctx, id, launch, flags)); // a tap opens Hearbor
        }
        nm.notify(id, b.build());
    }
}
