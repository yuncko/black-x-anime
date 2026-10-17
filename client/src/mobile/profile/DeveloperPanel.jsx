import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BxIcon from '../BxIcon.jsx';
import { adminGetErrors, apiErrorMessage } from '../apkApi.js';
import { bxApiUrl } from '../bxServers.js';
import { Empty, Field, Group, Row, Segmented, SwitchRow } from './ProfileUi.jsx';

/**
 * «لوحة المطور» (developer account only), in the profile hub's own design: grouped cards,
 * 56 px rows, segmented tabs, labelled fields — up to v18.0 it was ~650 lines of inline styles
 * inside MobileApkApp.jsx. Every action and its state still live in MobileApkApp (`dev`); this
 * file only renders, plus the two read-only views it loads itself: server health and the crash
 * reports (/api/app/admin/errors).
 */

const TIERS = [
  ['vip_monarch', 'باقة الملك (199 ج.م)', 'Monarch (199 EGP)'],
  ['vip_basic', 'الباقة الأساسية (99 ج.م)', 'Basic (99 EGP)']
];
const DURATIONS = [
  [30, '30 يوم', '30 days'],
  [90, '90 يوم', '90 days'],
  [365, 'سنة', '1 year'],
  [3650, 'مدى الحياة', 'Lifetime']
];
const REQUEST_TYPES = {
  anime: ['film', 'طلب أنمي', 'Anime request'],
  manga: ['book', 'طلب مانهوا', 'Manga request'],
  issue: ['wrench', 'بلاغ / دعم', 'Report / support']
};
// /api/health → firestoreAuth (docs/firestore-phase2.md)
const FIRESTORE_AUTH = {
  service_account: ['مفتاح الخدمة شغال — تقدر تنشر قواعد المرحلة 2', 'Service account works — phase-2 rules can be published'],
  service_account_pending: ['مفتاح الخدمة لسه بيتأكد', 'Service account being checked'],
  api_key: ['لسه بالمفتاح العام — خطوات المرحلة 2 في docs/firestore-phase2.md', 'Public key only — see docs/firestore-phase2.md'],
  invalid_key: ['مفتاح الخدمة غلط — راجع FIREBASE_SERVICE_ACCOUNT في Vercel', 'Invalid service account — check FIREBASE_SERVICE_ACCOUNT'],
  error: ['السيرفر ماقدرش يوصل لـ Firestore', 'The server cannot reach Firestore']
};

function fmtTime(iso, isRtl) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(isRtl ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function dayLabel(day, isRtl) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  if (day === today) return isRtl ? 'النهارده' : 'Today';
  if (day === yesterday) return isRtl ? 'امبارح' : 'Yesterday';
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
}

function Select({ value, onChange, options, isRtl, label }) {
  return (
    <select className="bxp-input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, ar, en]) => (
        <option key={String(v)} value={v}>
          {isRtl ? ar : en}
        </option>
      ))}
    </select>
  );
}

function BusyLabel({ busy, icon, children }) {
  return (
    <>
      <BxIcon name={busy ? 'loader' : icon} />
      {children}
    </>
  );
}

/* ------------------------------------------------------------------ VIP */

function VipTab({ isRtl, dev }) {
  const t = (ar, en) => (isRtl ? ar : en);
  const [confirmGate, setConfirmGate] = useState(false);
  const codes = Array.isArray(dev.codes) ? dev.codes.slice(0, 20) : [];
  return (
    <>
      <Group
        title={t('بوابة الـ VIP', 'VIP gate')}
        footer={t('بتتطبق على الموقع وكل نسخ التطبيق خلال دقيقة.', 'Applies to the website and every app within a minute.')}
      >
        <SwitchRow
          icon={dev.enforced ? 'lock' : 'unlock'}
          label={t('الاشتراك مطلوب للمشاهدة', 'Subscription required')}
          sub={dev.enforced ? t('مفعّل: المشاهدة للمشتركين بس', 'On: members with VIP only') : t('مقفول: الموقع والتطبيق مفتوحين للكل', 'Off: open to everyone')}
          checked={dev.enforced}
          disabled={dev.toggleBusy}
          onChange={() => setConfirmGate(true)}
        />
        {confirmGate ? (
          <div className="bxp-dev-confirm" role="alertdialog" aria-label={t('تأكيد', 'Confirm')}>
            <p>
              {dev.enforced
                ? t('هتفتح المشاهدة للكل من غير اشتراك. متأكد؟', 'Open watching to everyone without VIP?')
                : t('كل اللي مش مشترك هيتقفل عليه. متأكد؟', 'Everyone without VIP will be locked out. Sure?')}
            </p>
            <div className="bxp-actions is-row">
              <button
                type="button"
                className="bx-btn bx-btn-primary"
                disabled={dev.toggleBusy}
                onClick={() => {
                  setConfirmGate(false);
                  dev.onToggleEnforced();
                }}
              >
                {dev.enforced ? t('افتح للكل', 'Open to all') : t('فعّل البوابة', 'Turn on')}
              </button>
              <button type="button" className="bx-btn bx-btn-outline" onClick={() => setConfirmGate(false)}>
                {t('لأ', 'Cancel')}
              </button>
            </div>
          </div>
        ) : null}
      </Group>

      <Group title={t('كود اشتراك جديد', 'New VIP code')}>
        <div className="bxp-dev-form">
          <div className="bxp-dev-fields">
            <Field label={t('الباقة', 'Plan')}>
              <Select value={dev.genTier} onChange={dev.setGenTier} options={TIERS} isRtl={isRtl} label={t('الباقة', 'Plan')} />
            </Field>
            <Field label={t('المدة', 'Duration')}>
              <Select value={dev.genDays} onChange={(v) => dev.setGenDays(Number(v))} options={DURATIONS} isRtl={isRtl} label={t('المدة', 'Duration')} />
            </Field>
          </div>
          <button type="button" className="bx-btn bx-btn-primary bx-btn-block" disabled={dev.genBusy} onClick={dev.onGenerate}>
            <BusyLabel busy={dev.genBusy} icon="key">
              {dev.genBusy ? t('بيتولّد…', 'Generating…') : t('ولّد كود', 'Generate code')}
            </BusyLabel>
          </button>
        </div>
      </Group>

      {codes.length ? (
        <Group title={t(`آخر الأكواد (${dev.codes.length})`, `Latest codes (${dev.codes.length})`)} footer={t('دوس على الكود عشان تنسخه.', 'Tap a code to copy it.')}>
          {codes.map((c) => {
            const monarch = (c.tier || c.planId) === 'vip_monarch';
            const used = `${c.usedCount || 0}/${c.maxUses || 1}`;
            return (
              <div key={c.code} className="bxp-row bxp-row-split bxp-dev-code">
                <button type="button" className="bxp-row-hit" onClick={() => dev.onCopyCode(c.code)}>
                  <span className="bxp-row-ico" aria-hidden="true">
                    <BxIcon name={monarch ? 'crown' : 'zap'} size="1.1em" />
                  </span>
                  <span className="bxp-row-main">
                    <span className="bxp-row-label bxp-dev-mono" dir="ltr">
                      {c.code}
                    </span>
                    <span className="bxp-row-sub">
                      {monarch ? t('الملك', 'Monarch') : t('الأساسية', 'Basic')}
                      {c.durationDays ? ` • ${c.durationDays} ${t('يوم', 'days')}` : ''}
                      {` • ${t('استخدام', 'used')} ${used}`}
                    </span>
                  </span>
                </button>
                <button type="button" className="bxp-row-action" aria-label={t('امسح الكود', 'Delete code')} onClick={() => dev.onDeleteCode(c.code)}>
                  <BxIcon name="trash" />
                </button>
              </div>
            );
          })}
        </Group>
      ) : (
        <Empty icon="key" title={t('مفيش أكواد', 'No codes yet')} text={t('الأكواد اللي تولّدها هتظهر هنا.', 'Codes you generate appear here.')} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ members */

function UsersTab({ isRtl, dev }) {
  const t = (ar, en) => (isRtl ? ar : en);
  const u = dev.inspected;
  return (
    <>
      <Group title={t('ترقية عضو مباشرة', 'Grant VIP directly')} footer={t('من غير كود. «اسحب» يرجّعه للمجاني.', 'No code needed. “Revoke” sets the free plan.')}>
        <form
          className="bxp-dev-form"
          onSubmit={(e) => {
            e.preventDefault();
            dev.onGrant();
          }}
        >
          <Field label={t('اسم المستخدم أو الإيميل', 'Username or e-mail')}>
            <input className="bxp-input" type="text" dir="ltr" autoCapitalize="none" autoCorrect="off" value={dev.grantTarget} onChange={(e) => dev.setGrantTarget(e.target.value)} />
          </Field>
          <div className="bxp-dev-fields">
            <Field label={t('الباقة', 'Plan')}>
              <Select value={dev.grantTier} onChange={dev.setGrantTier} options={TIERS} isRtl={isRtl} label={t('الباقة', 'Plan')} />
            </Field>
            <Field label={t('المدة', 'Duration')}>
              <Select value={dev.grantDays} onChange={(v) => dev.setGrantDays(Number(v))} options={DURATIONS} isRtl={isRtl} label={t('المدة', 'Duration')} />
            </Field>
          </div>
          <div className="bxp-actions is-row">
            <button type="submit" className="bx-btn bx-btn-primary" disabled={dev.grantBusy || !String(dev.grantTarget || '').trim()}>
              <BusyLabel busy={dev.grantBusy} icon="crown">
                {t('رقّي', 'Grant')}
              </BusyLabel>
            </button>
            <button type="button" className="bx-btn bx-btn-outline" disabled={dev.grantBusy || !String(dev.grantTarget || '').trim()} onClick={dev.onRevoke}>
              <BxIcon name="ban" />
              {t('اسحب الـ VIP', 'Revoke')}
            </button>
          </div>
        </form>
      </Group>

      <Group title={t('بحث عن عضو', 'Find a member')}>
        <form
          className="bxp-dev-form bxp-dev-search"
          onSubmit={(e) => {
            e.preventDefault();
            dev.onInspect();
          }}
        >
          <input
            className="bxp-input"
            type="search"
            dir="ltr"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label={t('اسم المستخدم أو الإيميل', 'Username or e-mail')}
            placeholder={t('اسم المستخدم أو الإيميل', 'Username or e-mail')}
            value={dev.inspectQuery}
            onChange={(e) => dev.setInspectQuery(e.target.value)}
          />
          <button type="submit" className="bx-btn bx-btn-primary" disabled={dev.inspectBusy || !String(dev.inspectQuery || '').trim()}>
            <BusyLabel busy={dev.inspectBusy} icon="search">
              {t('ابحث', 'Search')}
            </BusyLabel>
          </button>
        </form>
      </Group>

      {u ? (
        <Group title={t('بيانات العضو', 'Member')}>
          <Row icon="user" label={u.displayName || u.username || u.email} sub={u.username ? `@${u.username}` : ''} />
          <Row icon="mail" label={u.email || '—'} />
          <Row icon="gem" label={t('الاشتراك', 'Plan')} value={u.vipStatus || t('مجاني', 'Free')} />
          <Row
            icon="film"
            label={t('النشاط', 'Activity')}
            value={t(`${u.stats?.favorites ?? 0} مفضلة • ${u.stats?.history ?? 0} مشاهدة`, `${u.stats?.favorites ?? 0} favourites • ${u.stats?.history ?? 0} watched`)}
          />
          {u.stats?.passwordStorage ? (
            <Row
              icon="shield-check"
              label={t('كلمة المرور', 'Password')}
              value={u.stats.passwordStorage === 'bcrypt' ? 'bcrypt' : u.stats.passwordStorage === 'legacy-sha256' ? t('قديمة (SHA-256)', 'legacy SHA-256') : t('دخول بجوجل', 'Google only')}
            />
          ) : null}
          <div className="bxp-dev-form">
            <div className="bxp-actions is-row">
              <button type="button" className="bx-btn bx-btn-primary" onClick={() => dev.onPickForGrant(u)}>
                <BxIcon name="crown" />
                {t('حدده للترقية', 'Use for grant')}
              </button>
              <button type="button" className="bx-btn bx-btn-outline" onClick={() => dev.setInspected(null)}>
                <BxIcon name="close" />
                {t('اقفل', 'Close')}
              </button>
            </div>
          </div>
        </Group>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ broadcast + pin */

function BroadcastTab({ isRtl, dev }) {
  const t = (ar, en) => (isRtl ? ar : en);
  return (
    <>
      <Group title={t('إشعار لكل الناس', 'Banner for everyone')} footer={t('بيظهر فوق في الموقع والتطبيق لحد ما تشيله.', 'Shown on top of the website and the app until you clear it.')}>
        {dev.broadcastMsg ? <Row icon="megaphone" label={dev.broadcastMsg} sub={t('الإشعار الحالي', 'Current banner')} /> : null}
        <form
          className="bxp-dev-form"
          onSubmit={(e) => {
            e.preventDefault();
            dev.onBroadcast(false);
          }}
        >
          <Field label={t('نص الإشعار', 'Message')}>
            <input className="bxp-input" type="text" dir="auto" maxLength={240} value={dev.broadcastInput} onChange={(e) => dev.setBroadcastInput(e.target.value)} />
          </Field>
          <div className="bxp-actions is-row">
            <button type="submit" className="bx-btn bx-btn-primary" disabled={dev.broadcastBusy || !String(dev.broadcastInput || '').trim()}>
              <BusyLabel busy={dev.broadcastBusy} icon="megaphone">
                {t('انشر', 'Publish')}
              </BusyLabel>
            </button>
            {dev.broadcastMsg ? (
              <button type="button" className="bx-btn bx-btn-outline" disabled={dev.broadcastBusy} onClick={() => dev.onBroadcast(true)}>
                <BxIcon name="trash" />
                {t('شيل الإشعار', 'Clear')}
              </button>
            ) : null}
          </div>
        </form>
      </Group>

      <Group title={t('ترشيح الرئيسية', 'Home spotlight')} footer={t('أنمي واحد بيتثبت أعلى الرئيسية للكل.', 'One title pinned on top of everyone’s home.')}>
        {dev.pinnedRec ? <Row icon="pin" label={dev.pinnedRec.titleAr || dev.pinnedRec.titleEn} sub={dev.pinnedRec.devNote || t('المثبت حالياً', 'Pinned now')} /> : null}
        <form
          className="bxp-dev-form"
          onSubmit={(e) => {
            e.preventDefault();
            dev.onPin(false);
          }}
        >
          <Field label={t('اسم الأنمي', 'Anime title')}>
            <input className="bxp-input" type="text" dir="auto" value={dev.pinTitle} onChange={(e) => dev.setPinTitle(e.target.value)} />
          </Field>
          <Field label={t('رسالة الترشيح (اختياري)', 'Note (optional)')}>
            <input className="bxp-input" type="text" dir="auto" maxLength={200} value={dev.pinNote} onChange={(e) => dev.setPinNote(e.target.value)} />
          </Field>
          <div className="bxp-actions is-row">
            <button type="submit" className="bx-btn bx-btn-primary" disabled={dev.pinBusy || !String(dev.pinTitle || '').trim()}>
              <BusyLabel busy={dev.pinBusy} icon="pin">
                {t('ثبّت', 'Pin')}
              </BusyLabel>
            </button>
            {dev.pinnedRec ? (
              <button type="button" className="bx-btn bx-btn-outline" disabled={dev.pinBusy} onClick={() => dev.onPin(true)}>
                <BxIcon name="trash" />
                {t('شيل الترشيح', 'Unpin')}
              </button>
            ) : null}
          </div>
        </form>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ requests */

function RequestsTab({ isRtl, dev }) {
  const t = (ar, en) => (isRtl ? ar : en);
  const list = Array.isArray(dev.requests) ? dev.requests : [];
  if (!list.length) return <Empty icon="mail" title={t('مفيش طلبات جديدة', 'No requests')} text={t('طلبات الأنمي والمانهوا والبلاغات بتوصل هنا.', 'Title requests and reports arrive here.')} />;
  return (
    <Group footer={t('«تم» بتشيل الطلب من القائمة.', '“Done” removes it from the list.')}>
      {list.map((req) => {
        const [icon, ar, en] = REQUEST_TYPES[req.type] || REQUEST_TYPES.issue;
        const when = fmtTime(req.createdAt, isRtl);
        return (
          <div key={req.id} className="bxp-row bxp-row-split bxp-dev-request">
            <div className="bxp-row-hit" role="group">
              <span className="bxp-row-ico" aria-hidden="true">
                <BxIcon name={icon} size="1.1em" />
              </span>
              <span className="bxp-row-main">
                <span className="bxp-row-label" dir="auto">
                  {req.text}
                </span>
                <span className="bxp-row-sub" dir="auto">
                  {isRtl ? ar : en} • {req.author || t('زائر', 'Guest')}
                  {when ? ` • ${when}` : ''}
                </span>
              </span>
            </div>
            <button type="button" className="bxp-row-action bxp-dev-done" aria-label={t('تم', 'Done')} onClick={() => dev.onDoneRequest(req.id)}>
              <BxIcon name="check" />
            </button>
          </div>
        );
      })}
    </Group>
  );
}

/* ------------------------------------------------------------------ health + crash reports */

function ErrorsTab({ isRtl, onCount }) {
  const t = (ar, en) => (isRtl ? ar : en);
  const [health, setHealth] = useState(null);
  const [state, setState] = useState({ loading: true, failed: '', days: [] });
  const [open, setOpen] = useState('');

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, failed: '' }));
    fetch(bxApiUrl('/api/health'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((h) => setHealth(h && typeof h === 'object' ? h : null))
      .catch(() => setHealth({ ok: false }));
    try {
      const res = await adminGetErrors(3);
      const days = Array.isArray(res?.days) ? res.days : [];
      setState({ loading: false, failed: '', days });
      onCount?.(days[0]?.entries?.length || 0);
    } catch (err) {
      setState({ loading: false, failed: apiErrorMessage(err, isRtl ? 'ar' : 'en'), days: [] });
    }
  }, [isRtl, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  const fsAuth = health?.firestoreAuth ? FIRESTORE_AUTH[health.firestoreAuth] || [health.firestoreAuth, health.firestoreAuth] : null;
  const total = state.days.reduce((n, d) => n + d.entries.length, 0);

  return (
    <>
      <Group title={t('حالة السيرفر', 'Server')}>
        <Row
          icon={health?.ok ? 'check' : 'alert'}
          label={t('الـ API', 'API')}
          value={health ? (health.ok ? t('شغال', 'Up') : t('مش بيرد', 'Down')) : '…'}
        />
        <Row
          icon="user"
          label={t('تسجيل الدخول', 'Sign-in')}
          value={health ? (health.authentication === 'ok' ? t('شغال', 'Working') : t('متوقف (JWT_SECRET)', 'Off (JWT_SECRET)')) : '…'}
        />
        <Row icon="shield-check" label={t('حماية الحسابات (المرحلة 2)', 'Account security (phase 2)')} sub={fsAuth ? (isRtl ? fsAuth[0] : fsAuth[1]) : '…'} />
      </Group>

      <div className="bxp-dev-toolbar">
        <h3 className="bxp-group-title">{t('أخطاء عند الزوار (آخر 3 أيام)', 'Visitors’ errors (last 3 days)')}</h3>
        <button type="button" className="bx-btn bx-btn-outline bx-btn-sm" disabled={state.loading} onClick={load}>
          <BusyLabel busy={state.loading} icon="refresh">
            {t('تحديث', 'Refresh')}
          </BusyLabel>
        </button>
      </div>

      {state.failed ? <Empty icon="alert" title={t('ماقدرناش نجيب الأخطاء', 'Could not load errors')} text={state.failed} /> : null}
      {!state.failed && !state.loading && total === 0 ? (
        <Empty icon="check" title={t('مفيش أخطاء متسجلة', 'No errors recorded')} text={t('أول ما زائر يقابل خطأ هيظهر هنا.', 'Errors visitors hit will show up here.')} />
      ) : null}

      {state.days
        .filter((d) => d.entries.length || d.dropped)
        .map((d) => (
          <Group
            key={d.day}
            title={`${dayLabel(d.day, isRtl)} (${d.entries.length})`}
            footer={d.dropped ? t(`و${d.dropped} تقرير لأخطاء تانية بعد أول 100.`, `+${d.dropped} more reports beyond the first 100 errors.`) : null}
          >
            {d.entries.map((e) => {
              const key = `${d.day}:${e.fp}`;
              const expanded = open === key;
              return (
                <div key={key} className={`bxp-dev-error${expanded ? ' is-open' : ''}`}>
                  <button type="button" className="bxp-row is-tap" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : key)}>
                    <span className="bxp-row-ico" aria-hidden="true">
                      <BxIcon name={e.platform === 'apk' ? 'smartphone' : 'globe'} size="1.1em" />
                    </span>
                    <span className="bxp-row-main">
                      <span className="bxp-row-label bxp-dev-mono" dir="ltr">
                        {e.message}
                      </span>
                      <span className="bxp-row-sub" dir="ltr">
                        {e.path} • {e.platform}
                        {e.build ? ` ${e.build}` : ''} • {fmtTime(e.lastAt, isRtl)}
                      </span>
                    </span>
                    <span className="bxp-row-badge">{`${e.count}×`}</span>
                  </button>
                  {expanded ? (
                    <div className="bxp-dev-stack">
                      {e.stack ? <pre dir="ltr">{e.stack}</pre> : null}
                      <p dir="ltr">
                        {e.kind} • {t('أول مرة', 'first')} {fmtTime(e.firstAt, isRtl)}
                      </p>
                      {e.ua ? <p dir="ltr">{e.ua}</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Group>
        ))}
      <p className="bxp-hint">
        {t(
          'التقارير مجهولة: رسالة الخطأ، أول سطور مكانه في الكود، الصفحة من غير باقي الرابط، ونوع المتصفح. مفيش حساب ولا إيميل.',
          'Reports are anonymous: the error, where it happened in the code, the page path and the browser type. No account, no e-mail.'
        )}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ shell */

export default function DeveloperPanel({ isRtl, dev }) {
  const t = (ar, en) => (isRtl ? ar : en);
  const [errorsToday, setErrorsToday] = useState(null);
  const requests = Array.isArray(dev.requests) ? dev.requests : [];
  const tabs = useMemo(
    () => [
      ['vip', 'VIP'],
      ['users', t('الأعضاء', 'Members')],
      ['broadcast', t('البث', 'Broadcast')],
      ['requests', t('الطلبات', 'Requests'), requests.length || null],
      ['errors', t('الأخطاء', 'Errors'), errorsToday || null]
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isRtl, requests.length, errorsToday]
  );
  const tab = tabs.some(([id]) => id === dev.tab) ? dev.tab : 'vip';

  return (
    <div className="bxp-devpanel" data-dev-tab={tab}>
      <div className="bxp-dev-stats">
        <button type="button" onClick={() => dev.setTab('vip')}>
          <strong>{Array.isArray(dev.codes) ? dev.codes.length : 0}</strong>
          <span>{t('كود', 'Codes')}</span>
        </button>
        <button type="button" onClick={() => dev.setTab('requests')}>
          <strong>{requests.length}</strong>
          <span>{t('طلب', 'Requests')}</span>
        </button>
        <button type="button" onClick={() => dev.setTab('vip')}>
          <strong>
            <BxIcon name={dev.enforced ? 'lock' : 'unlock'} size="0.95em" />
          </strong>
          <span>{dev.enforced ? t('VIP مفعّل', 'VIP on') : t('مفتوح للكل', 'Open')}</span>
        </button>
        <button type="button" onClick={() => dev.setTab('broadcast')}>
          <strong>
            <BxIcon name={dev.broadcastMsg ? 'megaphone' : 'circle-dashed'} size="0.95em" />
          </strong>
          <span>{dev.broadcastMsg ? t('إشعار شغال', 'Banner on') : t('مفيش إشعار', 'No banner')}</span>
        </button>
      </div>

      <div className="bxp-dev-tabs">
        <Segmented options={tabs} value={tab} onChange={dev.setTab} ariaLabel={t('أقسام لوحة المطور', 'Developer panel sections')} block />
      </div>

      {tab === 'vip' ? <VipTab isRtl={isRtl} dev={dev} /> : null}
      {tab === 'users' ? <UsersTab isRtl={isRtl} dev={dev} /> : null}
      {tab === 'broadcast' ? <BroadcastTab isRtl={isRtl} dev={dev} /> : null}
      {tab === 'requests' ? <RequestsTab isRtl={isRtl} dev={dev} /> : null}
      {tab === 'errors' ? <ErrorsTab isRtl={isRtl} onCount={setErrorsToday} /> : null}
    </div>
  );
}
