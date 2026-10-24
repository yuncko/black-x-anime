import React, { useEffect, useRef, useState } from 'react';
import BxIcon from './BxIcon.jsx';
import { PARTY_REACTIONS, formatClock, relativeTime } from './watchParty.js';

/** Copy text: the Clipboard API, else a hidden textarea (older WebViews). */
export async function copyText(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function eventLine(m, isRtl) {
  if (m.kind === 'join') return isRtl ? `${m.name || 'حد'} دخل الحفلة` : `${m.name || 'Someone'} joined`;
  if (m.kind === 'leave') return isRtl ? `${m.name || 'حد'} خرج` : `${m.name || 'Someone'} left`;
  return '';
}

/**
 * The watch party panel under the player (beside it in the computer's cinema mode).
 * Everything shown comes from the room and chat documents: no sample messages, no viewer
 * counts — the people list is who joined, from their own join / leave events.
 */
export default function PartyPanel({ party, isRtl, isWeb, canHost, onClose, onToast }) {
  const [codeInput, setCodeInput] = useState('');
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const now = Date.now();
  const active = Boolean(party.code);
  const visibleMessages = party.messages.filter((m) => m.kind !== 'react');

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length]);

  useEffect(() => {
    if (active) party.markRead();
    // reading the chat while the panel is open counts as read
  }, [active, party.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    const ok = await party.send(value);
    if (!ok) onToast?.(isRtl ? 'الرسالة موصلتش — جرّب تاني' : 'Message not sent — try again');
  };

  const copy = async (value, what) => {
    const ok = await copyText(value);
    onToast?.(
      ok
        ? what === 'link'
          ? isRtl
            ? 'اتنسخ لينك الدعوة — ابعته لصحابك'
            : 'Invite link copied — send it to your friends'
          : isRtl
          ? 'اتنسخ كود الغرفة'
          : 'Room code copied'
        : isRtl
        ? 'ماقدرناش ننسخ — انسخه بإيدك'
        : 'Could not copy — copy it by hand',
      ok ? 'check' : 'x-circle'
    );
  };

  const share = async () => {
    try {
      await navigator.share({
        title: 'Hearbor',
        text: isRtl ? `تعالى نتفرج سوا على ${party.room?.title || 'Hearbor'}` : `Watch ${party.room?.title || 'Hearbor'} with me`,
        url: party.link
      });
    } catch {
      /* closed */
    }
  };

  const members = party.members.filter((m) => m.present && m.name);

  return (
    <section className="bx-party" aria-label={isRtl ? 'حفلة المشاهدة' : 'Watch party'} data-bx-party={party.status}>
      <header className="bx-party-head">
        <span className="bx-party-title">
          <BxIcon name="popcorn" className="bx-ico-lead" />
          {isRtl ? 'حفلة مشاهدة' : 'Watch party'}
          {active ? <span className="bx-party-code">{party.code}</span> : null}
        </span>
        <button type="button" className="bx-icon-btn bx-icon-btn-sm" aria-label={isRtl ? 'إخفاء' : 'Hide'} onClick={onClose}>
          <BxIcon name="close" />
        </button>
      </header>

      {!active ? (
        <div className="bx-party-idle">
          <p className="bx-party-lead">
            {isRtl
              ? 'اتفرجوا مع بعض في نفس اللحظة: صاحب الغرفة بيشغّل ويوقف ويقدّم والكل بيمشي معاه، وفيه شات للغرفة.'
              : 'Watch together at the same moment: the host plays, pauses and seeks for everyone, with a chat for the room.'}
          </p>
          <button type="button" className="bx-btn bx-btn-block" disabled={!canHost || party.status === 'busy'} onClick={party.create}>
            <BxIcon name="popcorn" />
            {party.status === 'busy' ? (isRtl ? 'لحظة…' : 'One moment…') : isRtl ? 'افتح غرفة للحلقة دي' : 'Open a room for this episode'}
          </button>
          <form
            className="bx-party-join"
            onSubmit={(e) => {
              e.preventDefault();
              party.join(codeInput);
            }}
          >
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value);
                if (party.error) party.clearError();
              }}
              placeholder={isRtl ? 'عندك كود؟ اكتبه هنا' : 'Have a code? Type it here'}
              aria-label={isRtl ? 'كود الغرفة' : 'Room code'}
              maxLength={20}
            />
            <button type="submit" className="bx-btn bx-btn-outline" disabled={!codeInput.trim() || party.status === 'busy'}>
              {isRtl ? 'ادخل' : 'Join'}
            </button>
          </form>
          {party.error ? <p className="bx-party-error">{party.error}</p> : null}
          {isWeb ? (
            <p className="bx-party-note">
              {isRtl ? 'على الموقع صاحبك يفتح لينك الدعوة ويدخل على طول.' : 'On the website your friend just opens the invite link.'}
            </p>
          ) : null}
        </div>
      ) : party.status === 'ended' ? (
        <div className="bx-party-idle">
          <p className="bx-party-lead">{isRtl ? 'صاحب الغرفة قفل الحفلة.' : 'The host ended the party.'}</p>
          <button type="button" className="bx-btn bx-btn-outline bx-btn-block" onClick={party.dismissEnded}>
            {isRtl ? 'تمام' : 'OK'}
          </button>
        </div>
      ) : (
        <div className="bx-party-live">
          <div className="bx-party-meta">
            <span>
              {party.role === 'host'
                ? isRtl
                  ? 'انت صاحب الغرفة: اللي بتعمله في الفيديو بيحصل عند الكل.'
                  : 'You are the host: what you do in the video happens for everyone.'
                : isRtl
                ? `الفيديو ماشي مع ${party.room?.hostName || 'صاحب الغرفة'}.`
                : `Following ${party.room?.hostName || 'the host'}.`}
            </span>
            <div className="bx-party-actions">
              {isWeb && party.link ? (
                <button type="button" className="bx-chip" onClick={() => copy(party.link, 'link')}>
                  <BxIcon name="link" size="1em" />
                  {isRtl ? 'انسخ لينك الدعوة' : 'Copy invite link'}
                </button>
              ) : null}
              <button type="button" className="bx-chip" onClick={() => copy(party.code, 'code')}>
                <BxIcon name="copy" size="1em" />
                {isRtl ? 'انسخ الكود' : 'Copy code'}
              </button>
              {isWeb && party.link && typeof navigator !== 'undefined' && navigator.share ? (
                <button type="button" className="bx-chip" onClick={share}>
                  <BxIcon name="share" size="1em" />
                  {isRtl ? 'مشاركة' : 'Share'}
                </button>
              ) : null}
              <button type="button" className="bx-chip bx-party-leave" onClick={() => party.leave()}>
                <BxIcon name="logout" size="1em" />
                {party.role === 'host' ? (isRtl ? 'اقفل الحفلة' : 'End party') : isRtl ? 'اخرج' : 'Leave'}
              </button>
            </div>
          </div>

          {members.length ? (
            <p className="bx-party-members">
              <span>{isRtl ? 'اللي دخلوا:' : 'Joined:'}</span> {members.map((m) => m.name).join(isRtl ? '، ' : ', ')}
            </p>
          ) : null}

          {party.role === 'guest' && party.needsTap ? (
            <button type="button" className="bx-party-banner" onClick={party.resync}>
              <BxIcon name="play" />
              {isRtl ? 'دوس هنا عشان الفيديو يبدأ مع الحفلة' : 'Tap here to start the video with the party'}
            </button>
          ) : party.role === 'guest' && party.detached ? (
            <button type="button" className="bx-party-banner" onClick={party.resync}>
              <BxIcon name="refresh" />
              {isRtl ? 'انت موقف لوحدك — ارجع للحفلة' : 'You are on your own — back to the party'}
            </button>
          ) : party.role === 'guest' && party.hostAway ? (
            <p className="bx-party-banner is-static">
              <BxIcon name="clock" />
              {isRtl ? 'صاحب الغرفة مبعتش تحديث من شوية — ممكن النت عنده فصل أو قفل.' : 'No update from the host for a while — they may be offline.'}
            </p>
          ) : null}

          <div className="bx-party-chat" ref={listRef} aria-live="polite">
            {visibleMessages.length === 0 ? (
              <p className="bx-party-empty">{isRtl ? 'لسه مفيش رسايل.' : 'No messages yet.'}</p>
            ) : (
              visibleMessages.map((m) =>
                m.kind === 'join' || m.kind === 'leave' ? (
                  <p key={m.id} className="bx-party-event">
                    {eventLine(m, isRtl)}
                  </p>
                ) : (
                  <div key={m.id} className={`bx-party-msg${m.pending ? ' is-pending' : ''}${m.failed ? ' is-failed' : ''}`}>
                    <div className="bx-party-msg-head">
                      <strong dir="auto">{m.name}</strong>
                      <span>
                        {Number.isFinite(m.pos) ? <span className="bx-party-pos">{formatClock(m.pos)}</span> : null}
                        {m.failed ? (isRtl ? 'موصلتش' : 'not sent') : relativeTime(m.at, now, isRtl)}
                      </span>
                    </div>
                    <p dir="auto">{m.text}</p>
                  </div>
                )
              )
            )}
          </div>

          <div className="bx-party-reactions" role="group" aria-label={isRtl ? 'رياكشن' : 'Reactions'}>
            {PARTY_REACTIONS.map((emoji) => (
              <button key={emoji} type="button" onClick={() => party.react(emoji)} aria-label={emoji}>
                {emoji}
              </button>
            ))}
          </div>

          <form className="bx-party-form" onSubmit={submit}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isRtl ? 'اكتب رسالة للغرفة…' : 'Message the room…'}
              aria-label={isRtl ? 'رسالة' : 'Message'}
              maxLength={300}
            />
            <button type="submit" className="bx-btn" disabled={!text.trim()}>
              {isRtl ? 'ابعت' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

/** Reactions float over the video for a few seconds, for everyone in the room. */
export function PartyReactions({ messages }) {
  const [items, setItems] = useState([]);
  const seen = useRef(new Set());
  useEffect(() => {
    const fresh = messages.filter((m) => m.kind === 'react' && !seen.current.has(m.id) && Date.now() - Number(m.at) < 8000);
    messages.forEach((m) => m.kind === 'react' && seen.current.add(m.id));
    if (!fresh.length) return undefined;
    const add = fresh.map((m, i) => ({ id: m.id, emoji: m.text, name: m.name, left: 12 + ((i * 23 + m.id.length * 7) % 70) }));
    setItems((prev) => [...prev.slice(-10), ...add]);
    const t = setTimeout(() => setItems((prev) => prev.filter((x) => !add.some((a) => a.id === x.id))), 3600);
    return () => clearTimeout(t);
  }, [messages]);
  if (!items.length) return null;
  return (
    <div className="bx-party-float" aria-hidden="true">
      {items.map((it) => (
        <span key={it.id} style={{ insetInlineStart: `${it.left}%` }}>
          <b>{it.emoji}</b>
          <small dir="auto">{it.name}</small>
        </span>
      ))}
    </div>
  );
}
