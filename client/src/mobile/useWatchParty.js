import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DRIFT_PLAYING_SEC,
  HOST_HEARTBEAT_MS,
  HOST_PAUSED_HEARTBEAT_MS,
  appendMessages,
  expectedPosition,
  makeMessage,
  membersFromChat,
  normalizeRoomCode,
  parseRoom,
  partyLink,
  partyPollPlan,
  roomIsOver,
  sameContent,
  syncAction
} from './watchParty.js';

/** No new state from the host for this long: tell the guests (closed tab, lost connection). */
const HOST_AWAY_MS = 75000;

/**
 * The watch party of the player (watchParty.js has the protocol).
 *
 *  - host: writes the room whenever their video plays / pauses / seeks / changes speed, when
 *    they switch episode, and every 10 s while playing (30 s paused) so guests stay aligned;
 *  - guest: reads the room every 2.5 s while the host plays (4 s paused, 15 s in a background
 *    tab — partyPollPlan), opens the host's episode
 *    (`onNavigate`) and keeps its video within 2.5 s of the host. A guest who pauses or seeks
 *    on their own is "detached" until they press «ارجع للحفلة» or play again;
 *  - everyone: the chat document is read every 2.5 s for a minute after anything was said,
 *    every 7.5 s when it is quiet (30 s in a background tab); sending appends with a
 *    precondition (no lost messages).
 *
 * Media events do not bubble, but a capturing listener on `document` still sees them, so the
 * hook follows whichever <video> the app is showing (`videoRef.current`).
 */
export default function useWatchParty({ transport, videoRef, member, current, onNavigate, notify, isRtl = true, isWeb = false }) {
  const [code, setCode] = useState('');
  const [role, setRole] = useState(null); // 'host' | 'guest' | null
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | busy | active | ended
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [detached, setDetached] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [hostAway, setHostAway] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(0);

  const live = useRef({});
  live.current = { code, role, room, current, member, detached, status };
  const receivedAtRef = useRef(0);
  const heardAtRef = useRef(0);
  const seqRef = useRef(0);
  const lastSeqRef = useRef(-1);
  const syncingUntilRef = useRef(0);
  const navigatingRef = useRef('');
  const pushTimerRef = useRef(0);
  const chatActiveAtRef = useRef(0); // last time something was said / sent (chat polling speed)
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  const say = useCallback((ar, en, icon) => notifyRef.current?.(isRtl ? ar : en, icon), [isRtl]);
  const markSyncing = () => {
    syncingUntilRef.current = Date.now() + 900;
  };

  const reset = useCallback(() => {
    setCode('');
    setRole(null);
    setRoom(null);
    setStatus('idle');
    setMessages([]);
    setDetached(false);
    setNeedsTap(false);
    setHostAway(false);
    navigatingRef.current = '';
    lastSeqRef.current = -1;
  }, []);

  /* ---------------------------------------------------------------- host */
  const pushState = useCallback(
    async (extra = {}) => {
      const { code: c, role: r, current: cur, member: me, room: prev } = live.current;
      if (r !== 'host' || !c) return;
      const content = cur || prev;
      if (!content) return;
      const v = videoRef.current;
      const playingHere = Boolean(cur && v);
      seqRef.current += 1;
      const next = {
        v: 2,
        code: c,
        hostId: me.uid,
        hostName: me.name,
        slug: content.slug,
        source: content.source || '',
        objectID: content.objectID || '',
        title: content.title || '',
        poster: content.poster || '',
        episode: Number(content.episode) || 1,
        epName: content.epName || '',
        position: playingHere ? Number(v.currentTime) || 0 : Number(prev?.position) || 0,
        paused: playingHere ? Boolean(v.paused) : true,
        rate: playingHere ? Number(v.playbackRate) || 1 : 1,
        updatedAt: Date.now(),
        seq: seqRef.current,
        endedAt: 0,
        ...extra
      };
      try {
        await transport.writeRoom(next);
        setRoom(parseRoom(next));
      } catch {
        /* the next heartbeat writes again */
      }
    },
    [transport, videoRef]
  );

  const schedulePush = useCallback(() => {
    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushState(), 250);
  }, [pushState]);

  const create = useCallback(async () => {
    const { current: cur, member: me } = live.current;
    if (!cur) {
      say('شغّل حلقة الأول وبعدين افتح الغرفة', 'Play an episode first, then open a room', 'popcorn');
      return false;
    }
    setStatus('busy');
    setError('');
    try {
      const v = videoRef.current;
      const created = await transport.createRoom({
        hostId: me.uid,
        hostName: me.name,
        slug: cur.slug,
        source: cur.source || '',
        objectID: cur.objectID || '',
        title: cur.title || '',
        poster: cur.poster || '',
        episode: Number(cur.episode) || 1,
        epName: cur.epName || '',
        position: v ? Number(v.currentTime) || 0 : 0,
        paused: v ? Boolean(v.paused) : true,
        rate: v ? Number(v.playbackRate) || 1 : 1,
        updatedAt: Date.now(),
        seq: 1,
        endedAt: 0
      });
      seqRef.current = 1;
      setCode(created.code);
      setRole('host');
      setRoom(created);
      setStatus('active');
      setMessages([]);
      setDetached(false);
      setLastReadAt(Date.now());
      transport
        .appendChat(created.code, [makeMessage({ uid: me.uid, name: me.name, kind: 'join' })])
        .then((list) => setMessages(list))
        .catch(() => {});
      say(`الغرفة جاهزة — الكود ${created.code}`, `Room ready — code ${created.code}`, 'popcorn');
      return true;
    } catch {
      setStatus('idle');
      setError(isRtl ? 'ماقدرناش نفتح الغرفة — اتأكد من النت وجرّب تاني' : 'Could not open the room — check your connection and try again');
      return false;
    }
  }, [transport, videoRef, say, isRtl]);

  /* --------------------------------------------------------------- guest */
  const join = useCallback(
    async (input) => {
      const c = normalizeRoomCode(input);
      if (!c) {
        setError(isRtl ? 'الكود ده مش صحيح' : 'That code is not valid');
        return false;
      }
      const me = live.current.member;
      setStatus('busy');
      setError('');
      try {
        const r = await transport.readRoom(c);
        if (!r) {
          setStatus('idle');
          setError(isRtl ? 'مفيش غرفة بالكود ده' : 'No room with that code');
          return false;
        }
        if (roomIsOver(r)) {
          setStatus('idle');
          setError(isRtl ? 'الحفلة دي خلصت' : 'That party has ended');
          return false;
        }
        const meHost = r.hostId === me.uid;
        receivedAtRef.current = Date.now();
        heardAtRef.current = Date.now();
        lastSeqRef.current = r.seq;
        seqRef.current = r.seq;
        setCode(r.code);
        setRoom(r);
        setRole(meHost ? 'host' : 'guest');
        setStatus('active');
        setDetached(false);
        setNeedsTap(false);
        setLastReadAt(Date.now());
        transport
          .readChat(r.code)
          .then((list) => setMessages(list))
          .catch(() => {});
        if (!meHost) {
          transport
            .appendChat(r.code, [makeMessage({ uid: me.uid, name: me.name, kind: 'join' })])
            .then((list) => setMessages(list))
            .catch(() => {});
        }
        if (!sameContent(r, live.current.current)) {
          navigatingRef.current = `${r.slug}:${r.episode}`;
          navigateRef.current?.(r);
        }
        say(
          meHost ? `رجعت لغرفتك ${r.code}` : `دخلت حفلة ${r.hostName || ''}`.trim(),
          meHost ? `Back in your room ${r.code}` : `You joined ${r.hostName || 'the'} party`,
          'popcorn'
        );
        return true;
      } catch {
        setStatus('idle');
        setError(isRtl ? 'ماقدرناش ندخل الغرفة — اتأكد من النت وجرّب تاني' : 'Could not join — check your connection and try again');
        return false;
      }
    },
    [transport, say, isRtl]
  );

  const leave = useCallback(
    async ({ silent = false } = {}) => {
      const { code: c, role: r, member: me, room: prev } = live.current;
      if (!c) return;
      reset();
      try {
        if (r === 'host' && prev) {
          seqRef.current += 1;
          await transport.writeRoom({ ...prev, endedAt: Date.now(), updatedAt: Date.now(), seq: seqRef.current });
        }
        await transport.appendChat(c, [makeMessage({ uid: me.uid, name: me.name, kind: 'leave' })]);
      } catch {
        /* the room still ends for guests once it goes stale */
      }
      if (!silent) say(r === 'host' ? 'قفلت الحفلة' : 'خرجت من الحفلة', r === 'host' ? 'You ended the party' : 'You left the party');
    },
    [transport, reset, say]
  );

  const send = useCallback(
    async (text, kind = 'msg') => {
      const { code: c, member: me } = live.current;
      if (!c) return false;
      const v = videoRef.current;
      const msg = makeMessage({ uid: me.uid, name: me.name, text, kind, pos: v ? Number(v.currentTime) : null });
      if (!msg.text) return false;
      chatActiveAtRef.current = Date.now();
      setMessages((prev) => appendMessages(prev, [{ ...msg, pending: true }]));
      setLastReadAt(Date.now());
      try {
        const list = await transport.appendChat(c, [msg]);
        setMessages((prev) => appendMessages(list, prev.filter((m) => m.pending && m.id !== msg.id)));
        return true;
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, pending: false, failed: true } : m)));
        return false;
      }
    },
    [transport, videoRef]
  );

  const react = useCallback((emoji) => send(emoji, 'react'), [send]);

  const resync = useCallback(() => {
    setDetached(false);
    setNeedsTap(false);
    const v = videoRef.current;
    const { room: r } = live.current;
    if (!v || !r) return;
    const act = syncAction({ room: r, receivedAt: receivedAtRef.current, now: Date.now(), current: v.currentTime, paused: v.paused, duration: v.duration });
    if (!act) return;
    markSyncing();
    if (act.seekTo !== null) {
      try {
        v.currentTime = act.seekTo;
      } catch {
        /* not seekable yet */
      }
    }
    if (!r.paused) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => setNeedsTap(true));
    } else if (!v.paused) v.pause();
  }, [videoRef]);

  const markRead = useCallback(() => setLastReadAt(Date.now()), []);

  /* ------------------------------------------------------------- timers */
  // Read the room (guests) and the chat (everyone), each on its own interval (partyPollPlan).
  useEffect(() => {
    if (!code || status === 'ended') return undefined;
    let stop = false;
    let timer = 0;
    let running = false;
    let lastRoomAt = 0;
    let lastChatAt = 0;
    let lastChatKey = '';
    chatActiveAtRef.current = Date.now(); // just joined / started: people say hi
    const isHidden = () => typeof document !== 'undefined' && document.hidden;
    const tick = async () => {
      if (stop || running) return;
      running = true;
      const plan = partyPollPlan({
        role: live.current.role,
        hidden: isHidden(),
        roomPaused: Boolean(live.current.room?.paused),
        chatActiveAt: chatActiveAtRef.current,
        lastRoomAt,
        lastChatAt,
        now: Date.now()
      });
      try {
        if (live.current.role === 'guest' && plan.room) {
          lastRoomAt = Date.now();
          const r = await transport.readRoom(code);
          if (stop) return;
          if (r && (r.seq !== lastSeqRef.current || r.updatedAt !== live.current.room?.updatedAt)) {
            lastSeqRef.current = r.seq;
            receivedAtRef.current = Date.now();
            heardAtRef.current = Date.now();
            setHostAway(false);
            setRoom(r);
            if (roomIsOver(r)) {
              setStatus('ended');
              say('صاحب الغرفة قفل الحفلة', 'The host ended the party', 'popcorn');
              return;
            }
            const key = `${r.slug}:${r.episode}`;
            if (!sameContent(r, live.current.current) && navigatingRef.current !== key) {
              navigatingRef.current = key;
              say(`صاحب الغرفة راح للحلقة ${r.episode}`, `The host moved to episode ${r.episode}`, 'popcorn');
              navigateRef.current?.(r);
            }
          } else if (r && roomIsOver(r)) {
            setStatus('ended');
            return;
          } else if (heardAtRef.current && Date.now() - heardAtRef.current > HOST_AWAY_MS) {
            setHostAway(true);
          }
        }
        if (plan.chat) {
          lastChatAt = Date.now();
          const list = await transport.readChat(code);
          const last = list.length ? list[list.length - 1] : null;
          const key = last ? `${list.length}:${last.id || last.at || ''}` : '0';
          if (lastChatKey && key !== lastChatKey) chatActiveAtRef.current = Date.now();
          lastChatKey = key;
          if (!stop) setMessages((prev) => appendMessages(list, prev.filter((m) => m.pending || m.failed)));
        }
      } catch {
        /* offline for a moment: keep trying */
      }
      running = false;
      if (stop) return;
      const next = partyPollPlan({
        role: live.current.role,
        hidden: isHidden(),
        roomPaused: Boolean(live.current.room?.paused),
        chatActiveAt: chatActiveAtRef.current,
        lastRoomAt,
        lastChatAt,
        now: Date.now()
      });
      timer = setTimeout(tick, next.delay);
    };
    // Back from a background tab: catch up now instead of after the 15 s background interval.
    const onVisible = () => {
      if (isHidden() || stop || running) return;
      clearTimeout(timer);
      timer = setTimeout(tick, 50);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    timer = setTimeout(tick, 700);
    return () => {
      stop = true;
      clearTimeout(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code, status, transport, say]);

  // Guests: keep the video on the host's position.
  useEffect(() => {
    if (!code || role !== 'guest' || status !== 'active') return undefined;
    const t = setInterval(() => {
      const { room: r, current: cur, detached: off } = live.current;
      const v = videoRef.current;
      if (!r || !v || off || !sameContent(r, cur) || v.readyState < 1) return;
      const act = syncAction({ room: r, receivedAt: receivedAtRef.current, now: Date.now(), current: v.currentTime, paused: v.paused, duration: v.duration });
      if (!act) return;
      if (act.seekTo !== null) {
        markSyncing();
        try {
          v.currentTime = act.seekTo;
        } catch {
          /* not seekable yet */
        }
      }
      if (act.pause) {
        markSyncing();
        v.pause();
      }
      if (act.play) {
        markSyncing();
        const p = v.play();
        if (p && typeof p.then === 'function') p.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [code, role, status, videoRef]);

  // Host: heartbeat.
  useEffect(() => {
    if (!code || role !== 'host' || status !== 'active') return undefined;
    let timer = 0;
    const beat = () => {
      pushState();
      const v = videoRef.current;
      timer = setTimeout(beat, v && !v.paused ? HOST_HEARTBEAT_MS : HOST_PAUSED_HEARTBEAT_MS);
    };
    timer = setTimeout(beat, HOST_HEARTBEAT_MS);
    return () => clearTimeout(timer);
  }, [code, role, status, pushState, videoRef]);

  // Host: switching title / episode is announced at once.
  const contentKey = current ? `${current.slug}:${current.episode}` : '';
  useEffect(() => {
    if (!code || role !== 'host' || status !== 'active' || !contentKey) return;
    schedulePush();
  }, [contentKey, code, role, status, schedulePush]);

  // Video events: the host announces them, a guest acting alone becomes "detached".
  useEffect(() => {
    if (!code || status !== 'active' || typeof document === 'undefined') return undefined;
    const onMedia = (e) => {
      const v = videoRef.current;
      if (!v || e.target !== v) return;
      const { role: r, room: rm, current: cur } = live.current;
      if (r === 'host') {
        if (e.type !== 'play' && e.type !== 'pause' && e.type !== 'seeked' && e.type !== 'ratechange') return;
        schedulePush();
        return;
      }
      if (r !== 'guest' || Date.now() < syncingUntilRef.current || !rm || !sameContent(rm, cur)) return;
      if (e.type === 'play') {
        setDetached(false);
        setNeedsTap(false);
      } else if (e.type === 'pause' && !rm.paused && !v.ended) {
        setDetached(true);
      } else if (e.type === 'seeked') {
        const want = expectedPosition(rm, receivedAtRef.current, Date.now());
        if (Math.abs(v.currentTime - want) > DRIFT_PLAYING_SEC) setDetached(true);
      }
    };
    const types = ['play', 'pause', 'seeked', 'ratechange'];
    types.forEach((t) => document.addEventListener(t, onMedia, true));
    return () => types.forEach((t) => document.removeEventListener(t, onMedia, true));
  }, [code, status, videoRef, schedulePush]);

  useEffect(() => () => clearTimeout(pushTimerRef.current), []);

  const members = useMemo(() => membersFromChat(messages), [messages]);
  const unread = useMemo(
    () => messages.filter((m) => m.kind === 'msg' && m.uid !== member?.uid && Number(m.at) > lastReadAt).length,
    [messages, member, lastReadAt]
  );
  const link = useMemo(() => (isWeb && room && typeof window !== 'undefined' ? partyLink(window.location.origin, room) : ''), [isWeb, room]);

  return {
    code,
    role,
    room,
    status,
    error,
    messages,
    members,
    detached,
    needsTap,
    hostAway,
    unread,
    link,
    create,
    join,
    leave,
    send,
    react,
    resync,
    markRead,
    clearError: () => setError(''),
    dismissEnded: reset
  };
}
