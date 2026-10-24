.class public Lapp/blackx/mobile/EpisodeAlarms;
.super Landroid/content/BroadcastReceiver;
.source "EpisodeAlarms.java"

# Air-time reminders that reach the phone while Hearbor is closed (APK v18.0, 2026-10-17).
# Java version for reading: android-native/src/app/blackx/mobile/EpisodeAlarms.java.
# The web code (client/src/mobile/nativeAlarms.js) sends the whole list through
# MainActivity.scheduleEpisodeAlarms(json) = [{"id":int,"title":str,"body":str,"at":epochMs}];
# it replaces every alarm, is saved in SharedPreferences and armed again after a reboot or an
# app update (BOOT_COMPLETED / MY_PACKAGE_REPLACED). An alarm intent carries only its id: the
# text shown is looked up in the saved list, so another app cannot make Hearbor show its text.


# static fields
.field public static final ACTION:Ljava/lang/String; = "app.blackx.mobile.EPISODE_ALARM"

.field public static final CHANNEL:Ljava/lang/String; = "blackx_episodes_channel"

.field public static final KEY:Ljava/lang/String; = "list"

.field public static final PREFS:Ljava/lang/String; = "bx_episode_alarms"


# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/content/BroadcastReceiver;-><init>()V

    return-void
.end method

.method public static schedule(Landroid/content/Context;Ljava/lang/String;)I
    .locals 4

    const-string v0, "bx_episode_alarms"

    const/4 v1, 0x0

    invoke-virtual {p0, v0, v1}, Landroid/content/Context;->getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;

    move-result-object v0

    const-string v1, "list"

    const-string v2, "[]"

    invoke-interface {v0, v1, v2}, Landroid/content/SharedPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    invoke-static {p0, v2}, Lapp/blackx/mobile/EpisodeAlarms;->cancelAll(Landroid/content/Context;Ljava/lang/String;)V

    if-nez p1, :cond_has_json

    const-string p1, "[]"

    :cond_has_json
    invoke-interface {v0}, Landroid/content/SharedPreferences;->edit()Landroid/content/SharedPreferences$Editor;

    move-result-object v3

    invoke-interface {v3, v1, p1}, Landroid/content/SharedPreferences$Editor;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;

    move-result-object v3

    invoke-interface {v3}, Landroid/content/SharedPreferences$Editor;->apply()V

    invoke-static {p0, p1}, Lapp/blackx/mobile/EpisodeAlarms;->arm(Landroid/content/Context;Ljava/lang/String;)I

    move-result v0

    return v0
.end method

.method static rearm(Landroid/content/Context;)I
    .locals 3

    const-string v0, "bx_episode_alarms"

    const/4 v1, 0x0

    invoke-virtual {p0, v0, v1}, Landroid/content/Context;->getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;

    move-result-object v0

    const-string v1, "list"

    const-string v2, "[]"

    invoke-interface {v0, v1, v2}, Landroid/content/SharedPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    invoke-static {p0, v0}, Lapp/blackx/mobile/EpisodeAlarms;->arm(Landroid/content/Context;Ljava/lang/String;)I

    move-result v0

    return v0
.end method

.method static pending(Landroid/content/Context;I)Landroid/app/PendingIntent;
    .locals 4

    new-instance v0, Landroid/content/Intent;

    const-class v1, Lapp/blackx/mobile/EpisodeAlarms;

    invoke-direct {v0, p0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const-string v1, "app.blackx.mobile.EPISODE_ALARM"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setAction(Ljava/lang/String;)Landroid/content/Intent;

    const-string v1, "id"

    invoke-virtual {v0, v1, p1}, Landroid/content/Intent;->putExtra(Ljava/lang/String;I)Landroid/content/Intent;

    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v2, 0x17

    # FLAG_UPDATE_CURRENT (0x08000000), plus FLAG_IMMUTABLE (0x04000000) from API 23
    const v3, 0x8000000

    if-lt v1, v2, :cond_flags_done

    const v3, 0xc000000

    :cond_flags_done
    invoke-static {p0, p1, v0, v3}, Landroid/app/PendingIntent;->getBroadcast(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v0

    return-object v0
.end method

.method static arm(Landroid/content/Context;Ljava/lang/String;)I
    .locals 12

    const/4 v0, 0x0

    :try_start_0
    new-instance v1, Lorg/json/JSONArray;

    invoke-direct {v1, p1}, Lorg/json/JSONArray;-><init>(Ljava/lang/String;)V

    const-string v2, "alarm"

    invoke-virtual {p0, v2}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v2

    check-cast v2, Landroid/app/AlarmManager;

    if-eqz v2, :end_loop

    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J

    move-result-wide v3

    invoke-virtual {v1}, Lorg/json/JSONArray;->length()I

    move-result v5

    const/16 v6, 0x40

    if-le v5, v6, :cond_len_ok

    move v5, v6

    :cond_len_ok
    const/4 v6, 0x0

    :loop
    if-ge v6, v5, :end_loop

    invoke-virtual {v1, v6}, Lorg/json/JSONArray;->optJSONObject(I)Lorg/json/JSONObject;

    move-result-object v7

    if-eqz v7, :next

    const-string v8, "at"

    const-wide/16 v9, 0x0

    invoke-virtual {v7, v8, v9, v10}, Lorg/json/JSONObject;->optLong(Ljava/lang/String;J)J

    move-result-wide v9

    const-string v8, "id"

    const/4 v11, 0x0

    invoke-virtual {v7, v8, v11}, Lorg/json/JSONObject;->optInt(Ljava/lang/String;I)I

    move-result v11

    if-eqz v11, :next

    # only alarms still in the future
    cmp-long v8, v9, v3

    if-lez v8, :next

    invoke-static {p0, v11}, Lapp/blackx/mobile/EpisodeAlarms;->pending(Landroid/content/Context;I)Landroid/app/PendingIntent;

    move-result-object v7

    sget v8, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v11, 0x17

    if-lt v8, v11, :cond_old_api

    # RTC_WAKEUP, allowed in Doze; inexact (no SCHEDULE_EXACT_ALARM permission needed)
    const/4 v8, 0x0

    invoke-virtual {v2, v8, v9, v10, v7}, Landroid/app/AlarmManager;->setAndAllowWhileIdle(IJLandroid/app/PendingIntent;)V

    goto :counted

    :cond_old_api
    const/4 v8, 0x0

    invoke-virtual {v2, v8, v9, v10, v7}, Landroid/app/AlarmManager;->set(IJLandroid/app/PendingIntent;)V

    :counted
    add-int/lit8 v0, v0, 0x1

    :next
    add-int/lit8 v6, v6, 0x1

    goto :loop

    :end_loop
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    return v0

    :catch_0
    move-exception v1

    return v0
.end method

.method static cancelAll(Landroid/content/Context;Ljava/lang/String;)V
    .locals 7

    :try_start_0
    new-instance v0, Lorg/json/JSONArray;

    invoke-direct {v0, p1}, Lorg/json/JSONArray;-><init>(Ljava/lang/String;)V

    const-string v1, "alarm"

    invoke-virtual {p0, v1}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Landroid/app/AlarmManager;

    if-eqz v1, :end

    invoke-virtual {v0}, Lorg/json/JSONArray;->length()I

    move-result v2

    const/4 v3, 0x0

    :loop
    if-ge v3, v2, :end

    invoke-virtual {v0, v3}, Lorg/json/JSONArray;->optJSONObject(I)Lorg/json/JSONObject;

    move-result-object v4

    if-eqz v4, :next

    const-string v5, "id"

    const/4 v6, 0x0

    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->optInt(Ljava/lang/String;I)I

    move-result v6

    if-eqz v6, :next

    invoke-static {p0, v6}, Lapp/blackx/mobile/EpisodeAlarms;->pending(Landroid/content/Context;I)Landroid/app/PendingIntent;

    move-result-object v4

    invoke-virtual {v1, v4}, Landroid/app/AlarmManager;->cancel(Landroid/app/PendingIntent;)V

    :next
    add-int/lit8 v3, v3, 0x1

    goto :loop

    :end
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    return-void

    :catch_0
    move-exception v0

    return-void
.end method

.method static show(Landroid/content/Context;I)V
    .locals 8

    const-string v0, "bx_episode_alarms"

    const/4 v1, 0x0

    invoke-virtual {p0, v0, v1}, Landroid/content/Context;->getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;

    move-result-object v0

    const-string v1, "list"

    const-string v2, "[]"

    invoke-interface {v0, v1, v2}, Landroid/content/SharedPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    new-instance v1, Lorg/json/JSONArray;

    invoke-direct {v1, v0}, Lorg/json/JSONArray;-><init>(Ljava/lang/String;)V

    invoke-virtual {v1}, Lorg/json/JSONArray;->length()I

    move-result v2

    const/4 v3, 0x0

    :loop
    if-ge v3, v2, :end

    invoke-virtual {v1, v3}, Lorg/json/JSONArray;->optJSONObject(I)Lorg/json/JSONObject;

    move-result-object v4

    if-eqz v4, :next

    const-string v5, "id"

    const/4 v6, 0x0

    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->optInt(Ljava/lang/String;I)I

    move-result v6

    if-ne v6, p1, :next

    const-string v5, "title"

    const-string v6, "Hearbor"

    invoke-virtual {v4, v5, v6}, Lorg/json/JSONObject;->optString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v6

    const-string v5, "body"

    const-string v7, ""

    invoke-virtual {v4, v5, v7}, Lorg/json/JSONObject;->optString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v7

    invoke-static {p0, p1, v6, v7}, Lapp/blackx/mobile/EpisodeAlarms;->post(Landroid/content/Context;ILjava/lang/String;Ljava/lang/String;)V

    return-void

    :next
    add-int/lit8 v3, v3, 0x1

    goto :loop

    :end
    return-void
.end method

.method static post(Landroid/content/Context;ILjava/lang/String;Ljava/lang/String;)V
    .locals 7

    const-string v0, "notification"

    invoke-virtual {p0, v0}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/NotificationManager;

    if-nez v0, :cond_has_manager

    return-void

    :cond_has_manager
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v2, 0x1a

    if-lt v1, v2, :cond_old_builder

    # the same channel as the in-app notifications (MainActivity.sendPhoneNotification)
    new-instance v3, Landroid/app/NotificationChannel;

    const-string v4, "blackx_episodes_channel"

    const-string v5, "Hearbor Episode Alerts"

    const/4 v6, 0x4

    invoke-direct {v3, v4, v5, v6}, Landroid/app/NotificationChannel;-><init>(Ljava/lang/String;Ljava/lang/CharSequence;I)V

    invoke-virtual {v0, v3}, Landroid/app/NotificationManager;->createNotificationChannel(Landroid/app/NotificationChannel;)V

    new-instance v3, Landroid/app/Notification$Builder;

    invoke-direct {v3, p0, v4}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    goto :cond_have_builder

    :cond_old_builder
    new-instance v3, Landroid/app/Notification$Builder;

    invoke-direct {v3, p0}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;)V

    :cond_have_builder
    invoke-virtual {p0}, Landroid/content/Context;->getApplicationInfo()Landroid/content/pm/ApplicationInfo;

    move-result-object v4

    iget v4, v4, Landroid/content/pm/ApplicationInfo;->icon:I

    if-nez v4, :cond_has_icon

    # android.R.drawable.ic_media_play, like sendPhoneNotification's fallback
    const v4, 0x108009b

    :cond_has_icon
    invoke-virtual {v3, v4}, Landroid/app/Notification$Builder;->setSmallIcon(I)Landroid/app/Notification$Builder;

    invoke-virtual {v3, p2}, Landroid/app/Notification$Builder;->setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    invoke-virtual {v3, p3}, Landroid/app/Notification$Builder;->setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    const/4 v4, 0x1

    invoke-virtual {v3, v4}, Landroid/app/Notification$Builder;->setAutoCancel(Z)Landroid/app/Notification$Builder;

    # a tap opens Hearbor
    invoke-virtual {p0}, Landroid/content/Context;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v4

    invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;

    move-result-object v5

    invoke-virtual {v4, v5}, Landroid/content/pm/PackageManager;->getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v4

    if-eqz v4, :cond_no_launch

    const v5, 0x8000000

    const/16 v6, 0x17

    if-lt v1, v6, :cond_launch_flags

    const v5, 0xc000000

    :cond_launch_flags
    invoke-static {p0, p1, v4, v5}, Landroid/app/PendingIntent;->getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object v4

    invoke-virtual {v3, v4}, Landroid/app/Notification$Builder;->setContentIntent(Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    :cond_no_launch
    invoke-virtual {v3}, Landroid/app/Notification$Builder;->build()Landroid/app/Notification;

    move-result-object v4

    invoke-virtual {v0, p1, v4}, Landroid/app/NotificationManager;->notify(ILandroid/app/Notification;)V

    return-void
.end method


# virtual methods
.method public onReceive(Landroid/content/Context;Landroid/content/Intent;)V
    .locals 3

    :try_start_0
    if-nez p2, :cond_has_intent

    invoke-static {p1}, Lapp/blackx/mobile/EpisodeAlarms;->rearm(Landroid/content/Context;)I

    goto :done

    :cond_has_intent
    invoke-virtual {p2}, Landroid/content/Intent;->getAction()Ljava/lang/String;

    move-result-object v0

    const-string v1, "app.blackx.mobile.EPISODE_ALARM"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_rearm

    const-string v1, "id"

    const/4 v2, 0x0

    invoke-virtual {p2, v1, v2}, Landroid/content/Intent;->getIntExtra(Ljava/lang/String;I)I

    move-result v1

    invoke-static {p1, v1}, Lapp/blackx/mobile/EpisodeAlarms;->show(Landroid/content/Context;I)V

    goto :done

    # BOOT_COMPLETED / MY_PACKAGE_REPLACED: put the saved reminders back
    :cond_rearm
    invoke-static {p1}, Lapp/blackx/mobile/EpisodeAlarms;->rearm(Landroid/content/Context;)I

    :done
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    return-void

    :catch_0
    move-exception v0

    return-void
.end method
