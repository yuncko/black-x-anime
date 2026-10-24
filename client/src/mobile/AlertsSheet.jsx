import React, { useMemo } from 'react';
import BottomSheet from './BottomSheet.jsx';
import BxIcon from './BxIcon.jsx';
import { coverForMode } from './dataSaver.js';
import { airingFor, airingLine } from './airingSchedule.js';
import { nativeAlarmsSupported } from './nativeAlarms.js';
import { isWebApp } from './webApp.js';

function lastRunText(at, isRtl) {
  if (!(at > 0)) return isRtl ? 'لسه ماحصلش فحص' : 'No check yet';
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return isRtl ? 'آخر فحص: دلوقتي' : 'Last check: just now';
  if (min < 60) return isRtl ? `آخر فحص: من ${min} د` : `Last check: ${min} min ago`;
  const h = Math.round(min / 60);
  return isRtl ? `آخر فحص: من ${h} س` : `Last check: ${h} h ago`;
}

function permissionText(isRtl) {
  if (typeof window === 'undefined') return '';
  if (window.BlackXNativeAuth?.sendPhoneNotification) return isRtl ? 'إشعارات التطبيق' : 'App notifications';
  if (!('Notification' in window)) return isRtl ? 'المتصفح ده مش بيدعم الإشعارات' : 'This browser has no notifications';
  if (Notification.permission === 'granted') return isRtl ? 'الإشعارات مسموحة' : 'Notifications allowed';
  if (Notification.permission === 'denied') return isRtl ? 'الإشعارات مقفولة من إعدادات المتصفح' : 'Notifications are blocked in the browser settings';
  return isRtl ? 'هنطلب إذن الإشعارات أول مرة' : 'Permission is asked the first time';
}

/**
 * New-episode alerts, as they really work (episodeAlerts.js): only the titles the user follows
 * (my list + "watching" / "planned"), checked while Hearbor is open — every 30 minutes, and every
 * 10 minutes for a while after one of them airs in Japan (real air times, airingSchedule.js).
 * The test button sends a notification that says it is a test.
 */
export default function AlertsSheet({ open, onClose, isRtl, followed, airingMap, lastRun, dataSaver, onTest, onOpen }) {
  const now = Date.now();
  const rows = useMemo(() => {
    const list = (Array.isArray(followed) ? followed : []).map((t) => ({ item: t, airing: airingFor(t, airingMap) }));
    // titles with a known next air time first, soonest first
    return list.sort((a, b) => (a.airing ? a.airing.airingAt : Infinity) - (b.airing ? b.airing.airingAt : Infinity));
  }, [followed, airingMap]);

  return (
    <BottomSheet open={open} onClose={onClose} title={isRtl ? 'تنبيهات الحلقات' : 'Episode alerts'} closeLabel={isRtl ? 'إغلاق' : 'Close'} className="bx-alerts-sheet">
      <div className="bx-alerts-how">
        <p>
          {isRtl
            ? 'بيوصلك إشعار لما حلقة جديدة تنزل على Hearbor من الأعمال اللي بتتابعها (قائمتي + بتتفرج + ناوي تتفرج). الفحص بيحصل وHearbor مفتوح: كل ٣٠ دقيقة، وكل ١٠ دقايق لمدة ٦ ساعات بعد ميعاد عرض حلقة من أعمالك في اليابان.'
            : 'You get a notification when a new episode of a title you follow (my list + watching + planned) reaches Hearbor. Checks run while Hearbor is open: every 30 minutes, and every 10 minutes for 6 hours after one of your titles airs in Japan.'}
        </p>
        <p className="bx-alerts-native" data-bx-native={nativeAlarmsSupported() ? 'on' : isWebApp() ? 'web' : 'old'}>
          <BxIcon name="bell-ring" size="1em" className="bx-ico-lead" />
          {nativeAlarmsSupported()
            ? isRtl
              ? 'وكمان التطبيق بيفكرك بميعاد العرض الياباني لأعمالك حتى وهو مقفول.'
              : 'The app also reminds you at the Japanese air time of your titles, even while it is closed.'
            : isWebApp()
            ? isRtl
              ? 'على الموقع الفحص بيحصل والموقع مفتوح بس. تطبيق الأندرويد بيفكرك بميعاد العرض حتى وهو مقفول.'
              : 'On the website checks run only while it is open. The Android app reminds you at air time even while closed.'
            : isRtl
            ? 'حدّث التطبيق لإصدار 18.0 عشان يفكرك بميعاد العرض حتى وهو مقفول.'
            : 'Update the app to version 18.0 to get air-time reminders even while it is closed.'}
        </p>
        <div className="bx-alerts-status">
          <span>
            <BxIcon name="clock" size="1em" className="bx-ico-lead" />
            {lastRunText(lastRun, isRtl)}
          </span>
          <span>
            <BxIcon name="bell" size="1em" className="bx-ico-lead" />
            {permissionText(isRtl)}
          </span>
        </div>
        <button type="button" className="bx-btn bx-btn-outline bx-btn-block" onClick={onTest}>
          <BxIcon name="bell" />
          {isRtl ? 'ابعت إشعار تجربة' : 'Send a test notification'}
        </button>
      </div>

      <h4 className="bx-alerts-head">
        {isRtl ? 'الأعمال اللي بتتابعها' : 'Titles you follow'}
        {rows.length ? <span>{rows.length}</span> : null}
      </h4>
      {rows.length === 0 ? (
        <div className="bx-empty bx-alerts-empty">
          <BxIcon name="bell" size="1.6rem" />
          <p>
            {isRtl
              ? 'لسه مش متابع أي عمل. اضغط + على أي أنمي عشان يتضاف لقائمتك وتوصلك تنبيهات حلقاته.'
              : 'You do not follow any title yet. Tap + on any anime to add it to your list and get its episode alerts.'}
          </p>
        </div>
      ) : (
        <div className="bx-alerts-list">
          {rows.slice(0, 30).map(({ item, airing }) => (
            <button
              key={item.objectID || item.slug}
              type="button"
              className="bx-alerts-row"
              onClick={() => onOpen(item)}
            >
              <img src={coverForMode(item.poster, dataSaver) || '/blackx-logo.png'} alt="" loading="lazy" decoding="async" />
              <span className="bx-alerts-copy">
                <span className="bx-alerts-title" dir="auto">
                  {item.titleEn || item.titleAr}
                </span>
                <span className="bx-alerts-sub">
                  {airing
                    ? `${isRtl ? 'في اليابان: ' : 'In Japan: '}${airingLine(airing, now, isRtl)}`
                    : isRtl
                    ? 'مفيش ميعاد عرض معروف'
                    : 'No known air time'}
                </span>
              </span>
              <BxIcon name={isRtl ? 'chevron-left' : 'chevron-right'} />
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
