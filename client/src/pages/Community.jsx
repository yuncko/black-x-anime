import { imgFallback } from '../hooks/hooks.js';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';
import { UserBadges, VerifiedBadge } from '../components/UserBadges.jsx';
import UserHoverCard, { ANIME_MEME_STICKERS, VoiceNoteWavePlayer } from '../components/UserHoverCard.jsx';
import OrnamentAvatar from '../ornaments/OrnamentAvatar.jsx';
import { useOrnamentPrefs } from '../ornaments/useOrnamentPrefs.js';
import { onCommunitySnapshot, syncCommunityPostToFirestore } from '../firebase.js';
import { useVoiceRecorder } from '../components/VoiceRecorder.jsx';

const TOPICS = [
  { id: 'general', nameEn: 'General', nameAr: 'عام', icon: '💬' },
  { id: 'one-piece', nameEn: 'One Piece', nameAr: 'ون بيس', icon: '⚔️' },
  { id: 'jojo', nameEn: 'JoJo Bizarre Adventure', nameAr: 'جوجو', icon: '⚡' },
  { id: 'bleach', nameEn: 'Bleach', nameAr: 'بليتش', icon: '🗡️' },
  { id: 'black-clover', nameEn: 'Black Clover', nameAr: 'بلاك كلوفر', icon: '🍀' },
  { id: 'reviews', nameEn: 'Reviews & Ratings', nameAr: 'مراجعات وتقييمات', icon: '⭐' },
  { id: 'theories', nameEn: 'Episode Theories', nameAr: 'نظريات وتحليلات', icon: '💡' },
  { id: 'memes', nameEn: 'Anime Memes', nameAr: 'ميمز وطرائف', icon: '🎭' }
];

const REACTIONS = [
  { type: 'like', emoji: '👍', labelEn: 'Like', labelAr: 'إعجاب', color: '#22d3ee' },
  { type: 'love', emoji: '❤️', labelEn: 'Love', labelAr: 'أحببته', color: '#f43f5e' },
  { type: 'haha', emoji: '😂', labelEn: 'Haha', labelAr: 'أضحكني', color: '#fbbf24' },
  { type: 'wow', emoji: '🤩', labelEn: 'Wow', labelAr: 'واو', color: '#8b5cf6' },
  { type: 'sad', emoji: '😢', labelEn: 'Sad', labelAr: 'محزن', color: '#60a5fa' }
];

function formatTimeAgo(dateString, lang = 'ar') {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return lang === 'ar' ? 'الآن' : 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return lang === 'ar' ? `منذ ${diffMin} د` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return lang === 'ar' ? `منذ ${diffHr} س` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return lang === 'ar' ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
  return past.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
}

export default function Community({ onOpenAuth }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState('general');

  // Composer state
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [showMemePicker, setShowMemePicker] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Real voice recording via microphone
  const voiceRecorder = useVoiceRecorder(lang);
  const [attachedVoiceUrl, setAttachedVoiceUrl] = useState(null);
  const [attachedVoiceDuration, setAttachedVoiceDuration] = useState(0);

  useEffect(() => {
    if (voiceRecorder.audioUrl) {
      setAttachedVoiceUrl(voiceRecorder.audioUrl);
      const dur = Math.max(1, voiceRecorder.recordSec || 2);
      setAttachedVoiceDuration(dur);
      pushToast(lang === 'ar' ? `🎙️ تم تسجيل الصوت بنجاح (${dur}ث)!` : `🎙️ Voice note recorded (${dur}s)!`, 'success');
    }
  }, [voiceRecorder.audioUrl]);

  // Active reactions picker & open comment boxes
  const [reactionPickerPostId, setReactionPickerPostId] = useState(null);
  const [openComments, setOpenComments] = useState({}); // postId -> bool
  const [commentsData, setCommentsData] = useState({}); // postId -> array
  const [loadingComments, setLoadingComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({}); // postId -> string
  const [submittingComment, setSubmittingComment] = useState({});
  const [followingSet, setFollowingSet] = useState(new Set());

  /* the logged-in member's live 3D ornament (cached, so the feed paints it
     instantly and works offline; the CSS frame covers the no-WebGL case) */
  const { frameStyle: myFrame } = useOrnamentPrefs(user?.id, { fetch: !!user });

  const isDev = user?.role === 'developer' || user?.email?.toLowerCase() === 'mz0970mmz@gmail.com' || user?.isDeveloper;

  // Load who user is following
  useEffect(() => {
    if (user?.username) {
      api.get(`/api/community/network/${encodeURIComponent(user.username)}`)
        .then((res) => {
          if (res?.following && Array.isArray(res.following)) {
            setFollowingSet(new Set(res.following));
          }
        })
        .catch(() => {});
    }
  }, [user?.username]);

  const handleToggleFollow = async (targetAuthor) => {
    if (!user) {
      onOpenAuth?.('login');
      return;
    }
    if (!targetAuthor || targetAuthor === user.username) return;
    const isFollowing = followingSet.has(targetAuthor);
    try {
      if (isFollowing) {
        await api.post('/api/community/unfollow', { targetUsername: targetAuthor });
        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(targetAuthor);
          return next;
        });
        pushToast(lang === 'ar' ? `تم إلغاء متابعة ${targetAuthor}` : `Unfollowed @${targetAuthor}`, 'info');
      } else {
        await api.post('/api/community/follow', { targetUsername: targetAuthor });
        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.add(targetAuthor);
          return next;
        });
        pushToast(lang === 'ar' ? `✓ تمت متابعة ${targetAuthor} بنجاح!` : `Followed @${targetAuthor}!`, 'success');
      }
    } catch (err) {
      pushToast(err.message || 'Follow action failed', 'error');
    }
  };

  // Load posts from API + bind Firestore real-time snapshot
  const loadPosts = useCallback(async () => {
    try {
      const data = await api.get('/api/community/posts');
      if (data && data.posts) {
        setPosts(data.posts);
      }
    } catch (err) {
      console.warn('API posts load note:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();

    // Bind Firestore real-time listener if available
    if (!user) return undefined; // live Firestore sync only for signed-in users
    const unsub = onCommunitySnapshot((fsPosts) => {
      if (fsPosts && fsPosts.length > 0) {
        // Merge with existing posts to ensure real-time update
        setPosts((prev) => {
          const map = new Map();
          // Put Firestore items first
          fsPosts.forEach((p) => map.set(String(p.id), p));
          // Keep local API items if not present
          prev.forEach((p) => {
            if (!map.has(String(p.id))) {
              map.set(String(p.id), p);
            }
          });
          return Array.from(map.values()).sort((a, b) => {
            if (b.is_pinned !== a.is_pinned) return (b.is_pinned || 0) - (a.is_pinned || 0);
            return new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0);
          });
        });
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [loadPosts]);

  // Handle post creation
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (!user) {
      if (typeof onOpenAuth === 'function') onOpenAuth('login');
      return;
    }

    setSubmitting(true);
    const chosenTopicObj = TOPICS.find((tp) => tp.id === selectedTopic) || TOPICS[0];
    const tagName = lang === 'ar' ? chosenTopicObj.nameAr : chosenTopicObj.nameEn;

    try {
      const payload = {
        content: content.trim(),
        tag: selectedTopic,
        tagName: `${chosenTopicObj.icon} ${tagName}`,
        imageUrl: imageUrl.trim(),
        voiceUrl: attachedVoiceUrl || '',
        voiceDuration: attachedVoiceDuration || 0,
        isPinned: isDev && isPinned
      };

      const res = await api.post('/api/community/posts', payload);
      if (res && res.post) {
        setPosts((prev) => [res.post, ...prev]);

        // Also push to Firestore for cross-device real-time sync
        syncCommunityPostToFirestore(res.post);

        setContent('');
        setImageUrl('');
        setAttachedVoiceUrl(null);
        setAttachedVoiceDuration(0);
        voiceRecorder.cancelRecording();
        setShowImageInput(false);
        setIsPinned(false);
        pushToast(t('community.postSuccess'), 'success');
      }
    } catch (err) {
      pushToast(err?.message || 'Failed to publish post', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle or submit reaction
  const handleReact = async (postId, reactionType = 'like') => {
    if (!user) {
      if (typeof onOpenAuth === 'function') onOpenAuth('login');
      return;
    }

    setReactionPickerPostId(null);

    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const currentReaction = p.userReaction;
        const isSame = currentReaction === reactionType;
        const newReaction = isSame ? null : reactionType;

        const updatedReactions = { ...(p.reactions || { like: 0, love: 0, haha: 0, wow: 0, sad: 0 }) };
        if (currentReaction && updatedReactions[currentReaction] > 0) {
          updatedReactions[currentReaction]--;
        }
        if (newReaction) {
          updatedReactions[newReaction] = (updatedReactions[newReaction] || 0) + 1;
        }

        const newLikesCount = Math.max(0, (p.likes_count || 0) + (isSame ? -1 : currentReaction ? 0 : 1));

        return {
          ...p,
          userReaction: newReaction,
          reactions: updatedReactions,
          likes_count: newLikesCount
        };
      })
    );

    try {
      const res = await api.post(`/api/community/posts/${postId}/react`, { reactionType });

      if (res && res.ok) {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            return {
              ...p,
              userReaction: res.userReaction,
              reactions: res.reactions || p.reactions,
              likes_count: res.likesCount !== undefined ? res.likesCount : p.likes_count
            };
          })
        );
      }
    } catch (err) {
      console.warn('React error:', err);
    }
  };

  // Toggle comments and fetch them
  const toggleComments = async (postId) => {
    const nextState = !openComments[postId];
    setOpenComments((prev) => ({ ...prev, [postId]: nextState }));

    if (nextState && !commentsData[postId]) {
      setLoadingComments((prev) => ({ ...prev, [postId]: true }));
      try {
        const res = await api.get(`/api/community/posts/${postId}/comments`);
        if (res && res.comments) {
          setCommentsData((prev) => ({ ...prev, [postId]: res.comments }));
        }
      } catch (err) {
        console.warn('Error loading comments:', err);
      } finally {
        setLoadingComments((prev) => ({ ...prev, [postId]: false }));
      }
    }
  };

  // Submit comment
  const handleAddComment = async (postId) => {
    const text = (commentInputs[postId] || '').trim();
    if (!text) return;

    if (!user) {
      if (typeof onOpenAuth === 'function') onOpenAuth('login');
      return;
    }

    setSubmittingComment((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await api.post(`/api/community/posts/${postId}/comments`, { content: text });

      if (res && res.comment) {
        setCommentsData((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), res.comment]
        }));
        setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
        // Update comments count on post
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, comments_count: res.commentsCount || (p.comments_count || 0) + 1 } : p))
        );
      }
    } catch (err) {
      pushToast(err?.message || 'Failed to add comment', 'error');
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [postId]: false }));
    }
  };

  // Delete post
  const handleDeletePost = async (postId) => {
    if (!window.confirm(t('community.deleteConfirm'))) return;
    try {
      await api.del(`/api/community/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      pushToast(t('toast.deleted'), 'success');
    } catch (err) {
      pushToast(err?.message || 'Delete failed', 'error');
    }
  };

  // Share post
  const handleShare = (post) => {
    const url = window.location.origin + '/community#post-' + post.id;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        pushToast(t('community.linkCopied'), 'success');
      });
    } else {
      pushToast(t('community.linkCopied'), 'success');
    }
  };

  // Filter posts
  const filteredPosts = posts.filter((p) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'trending') return true; // Handled by sorting
    if (activeTab === 'announcements') return p.is_pinned || p.tag === 'announcement' || p.author_role === 'developer';
    if (activeTab === 'theories') return p.tag === 'theories';
    if (activeTab === 'reviews') return p.tag === 'reviews';
    if (activeTab === 'mine') return user && (p.uid === user.uid || p.uid === user.id || p.uid === user.email);
    return p.tag === activeTab;
  });

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (activeTab === 'trending') {
      const scoreA = (a.likes_count || 0) * 2 + (a.comments_count || 0) * 3;
      const scoreB = (b.likes_count || 0) * 2 + (b.comments_count || 0) * 3;
      return scoreB - scoreA;
    }
    // Default pinned first, then newest
    if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
      return (b.is_pinned || 0) - (a.is_pinned || 0);
    }
    return new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0);
  });

  return (
    <div className="community-page">
      {/* ================= Clean Responsive Header ================= */}
      <div className="community-header">
        <div className="community-header__top-row">
          <div className="community-header__title-group">
            <h1 className="community-header__title">
              <span className="community-header__icon">💬</span> {t('community.title')}
            </h1>
            <p className="community-header__desc">{t('community.sub')}</p>
          </div>
          <span className="community-header__badge">
            <span className="live-dot" /> {posts.length} {lang === 'ar' ? 'منشور' : 'posts'}
          </span>
        </div>
      </div>

      <div className="community-layout">
        {/* ================= Main Feed ================= */}
        <div className="community-feed">
          {/* ================= Facebook-style Post Composer Card ================= */}
          <div className="fb-composer glass glass--strong">
            <div className="fb-composer__top">
              <OrnamentAvatar
                src={user?.photoURL || user?.photoUrl || ''}
                fallbackLabel={user?.displayName?.[0] || '👤'}
                avatarColor={user?.avatarColor || '#22d3ee'}
                frameStyle={myFrame}
                size={44}
                className="fb-composer__avatar-wrap"
              >
                <div className="avatar fb-composer__avatar" style={{ background: user?.avatarColor || '#22d3ee', width: '100%', height: '100%' }}>
                  {(user?.photoURL || user?.photoUrl) ? (
                    <img onError={imgFallback} src={user.photoURL || user.photoUrl} alt="Avatar" />
                  ) : (
                    user?.displayName?.[0]?.toUpperCase() || '👤'
                  )}
                </div>
              </OrnamentAvatar>
              <div className="fb-composer__input-wrap">
                <textarea
                  className="fb-composer__textarea"
                  rows={content.length > 70 ? 3 : 2}
                  placeholder={
                    user
                      ? t('community.whatsOnYourMind')
                      : t('community.loginPrompt')
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onClick={() => !user && onOpenAuth && onOpenAuth('login')}
                />
              </div>
            </div>

            {/* Attached Image Preview if entered */}
            {imageUrl && (
              <div className="fb-composer__img-preview">
                <img src={imageUrl} alt="Upload preview" onError={() => setImageUrl('')} />
                <button
                  type="button"
                  className="fb-composer__img-remove"
                  onClick={() => setImageUrl('')}
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Attached Real Voice Note Preview */}
            {attachedVoiceUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem', padding: '0.45rem 0.75rem', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px' }}>
                <VoiceNoteWavePlayer audioUrl={attachedVoiceUrl} duration={attachedVoiceDuration} />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setAttachedVoiceUrl(null);
                    setAttachedVoiceDuration(0);
                    voiceRecorder.cancelRecording();
                  }}
                  style={{ color: 'var(--red)', padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}
                >
                  ✕ {lang === 'ar' ? 'إزالة' : 'Remove'}
                </button>
              </div>
            )}

            {showImageInput && (
              <div className="fb-composer__extra-row">
                <input
                  type="url"
                  className="input input--sm"
                  placeholder={t('community.imageUrl')}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
            )}

            {showMemePicker && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  padding: '0.75rem',
                  marginBottom: '0.65rem',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                {ANIME_MEME_STICKERS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setContent((prev) => `${prev ? prev + '\n' : ''}[MEME:${m.id}] `);
                      setShowMemePicker(false);
                    }}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '99px',
                      background: m.bg,
                      border: 'none',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.76rem',
                      cursor: 'pointer'
                    }}
                  >
                    {m.emoji} {lang === 'ar' ? m.labelAr : m.labelEn}
                  </button>
                ))}
              </div>
            )}

            {/* Composer Footer Actions */}
            <div className="fb-composer__bottom">
              <div className="fb-composer__tools">
                {/* Topic selector */}
                <select
                  className="fb-composer__select"
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  aria-label={t('community.topic')}
                >
                  {TOPICS.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.icon} {lang === 'ar' ? tp.nameAr : tp.nameEn}
                    </option>
                  ))}
                </select>

                {/* Add Photo Button */}
                <button
                  type="button"
                  className={`fb-composer__tool-btn ${showImageInput ? 'active' : ''}`}
                  onClick={() => setShowImageInput((v) => !v)}
                  title={lang === 'ar' ? 'إرفاق صورة' : 'Attach Photo'}
                >
                  <span>🖼️</span>
                  <span>{lang === 'ar' ? 'صورة' : 'Photo'}</span>
                </button>

                {/* Add Anime Meme Sticker Button */}
                <button
                  type="button"
                  className={`fb-composer__tool-btn ${showMemePicker ? 'active' : ''}`}
                  onClick={() => setShowMemePicker((v) => !v)}
                  title={lang === 'ar' ? 'إرفاق ميمز أنمي' : 'Attach Anime Meme'}
                >
                  <span>🎭</span>
                  <span>{lang === 'ar' ? 'ميمز' : 'Memes'}</span>
                </button>

                {/* Real Microphone Voice Note Button */}
                <button
                  type="button"
                  className={`fb-composer__tool-btn ${voiceRecorder.isRecording ? 'active' : ''}`}
                  onClick={async () => {
                    if (voiceRecorder.isRecording) {
                      voiceRecorder.stopRecording();
                    } else {
                      // startRecording never fakes a clip: when the microphone is refused it says why.
                      const started = await voiceRecorder.startRecording();
                      if (started?.ok) {
                        pushToast(lang === 'ar' ? '🎙️ بدأ تسجيل صوتك من المايكروفون...' : '🎙️ Recording voice note from mic...', 'info');
                      } else {
                        pushToast(started?.error || (lang === 'ar' ? 'يرجى السماح بالوصول إلى المايكروفون لتسجيل الصوت' : 'Please allow microphone access to record voice'), 'error');
                      }
                    }
                  }}
                  style={voiceRecorder.isRecording ? { color: '#ef4444', borderColor: '#ef4444', background: 'rgba(239,68,68,0.2)' } : {}}
                >
                  <span style={{ animation: voiceRecorder.isRecording ? 'pulse 1s infinite' : 'none' }}>
                    {voiceRecorder.isRecording ? '⏹️' : '🎙️'}
                  </span>
                  <span>
                    {voiceRecorder.isRecording
                      ? (lang === 'ar' ? `إيقاف (${voiceRecorder.recordSec}ث)` : `Stop (${voiceRecorder.recordSec}s)`)
                      : (lang === 'ar' ? 'صوتي' : 'Voice')}
                  </span>
                </button>

                {/* Developer pin toggle */}
                {isDev && (
                  <label className="fb-composer__pin-toggle" title="تثبيت كإعلان رسمي">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                    />
                    <span>📌 {lang === 'ar' ? 'تثبيت' : 'Pin'}</span>
                  </label>
                )}
              </div>

              <div className="fb-composer__submit-wrap">
                <button
                  type="button"
                  className="btn btn--primary fb-composer__submit"
                  onClick={handleCreatePost}
                  disabled={submitting || !content.trim()}
                >
                  <span className="btn__shine" />
                  {submitting ? t('community.posting') : `➤ ${t('community.post')}`}
                </button>
              </div>
            </div>
          </div>

          {/* ================= Filter Tabs (Facebook style) ================= */}
          <div className="fb-tabs-bar" role="tablist">
            <button
              type="button"
              className={`fb-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              🌐 {t('community.filterAll')}
            </button>
            <button
              type="button"
              className={`fb-tab ${activeTab === 'trending' ? 'active' : ''}`}
              onClick={() => setActiveTab('trending')}
            >
              {t('community.filterTrending')}
            </button>
            <button
              type="button"
              className={`fb-tab ${activeTab === 'announcements' ? 'active' : ''}`}
              onClick={() => setActiveTab('announcements')}
            >
              {t('community.filterAnnouncements')}
            </button>
            <button
              type="button"
              className={`fb-tab ${activeTab === 'theories' ? 'active' : ''}`}
              onClick={() => setActiveTab('theories')}
            >
              {t('community.filterDiscussions')}
            </button>
            <button
              type="button"
              className={`fb-tab ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              {t('community.filterReviews')}
            </button>
            {user && (
              <button
                type="button"
                className={`fb-tab ${activeTab === 'mine' ? 'active' : ''}`}
                onClick={() => setActiveTab('mine')}
              >
                {t('community.filterMine')}
              </button>
            )}
          </div>

          {/* ================= Posts Stream ================= */}
          {loading ? (
            <div className="community-loading">
              <div className="spinner" />
              <span>{t('common.loading')}</span>
            </div>
          ) : sortedPosts.length === 0 ? (
            <div className="community-empty glass">
              <span style={{ fontSize: '3rem' }}>💬</span>
              <h3>{t('community.empty')}</h3>
              <p>{t('community.sub')}</p>
            </div>
          ) : (
            <div className="fb-posts-stream">
              {sortedPosts.map((post) => {
                const isAuthor = user && (post.uid === user.uid || post.uid === user.id || post.uid === user.email);
                const canDelete = isAuthor || isDev;
                const isPostDev = post.author_role === 'developer' || post.uid === 'mz0970mmz@gmail.com' || post.uid === 'dev-mz';
                const userReaction = post.userReaction;
                const currentReactionObj = REACTIONS.find((r) => r.type === userReaction);

                return (
                  <article key={post.id} id={`post-${post.id}`} className={`fb-post-card glass ${post.is_pinned ? 'fb-post-card--pinned' : ''}`}>
                    {/* Pinned banner if pinned */}
                    {post.is_pinned ? (
                      <div className="fb-post-card__pinned-badge">
                        <span>📌</span> {t('community.pinned')}
                      </div>
                    ) : null}

                    {/* Post Header */}
                    <div className="fb-post-card__head">
                      <div className="fb-post-card__author">
                        <OrnamentAvatar
                          src={post.author_avatar || (isAuthor ? (user?.photoURL || user?.photoUrl || '') : '')}
                          fallbackLabel={post.author_name?.[0] || '👤'}
                          avatarColor={isPostDev ? '#ec4899' : (isAuthor ? (user?.avatarColor || '#22d3ee') : '#22d3ee')}
                          frameStyle={isAuthor ? myFrame : (post.author_frame || 'royal-flame')}
                          size={44}
                        >
                          <div className="avatar fb-post-card__avatar" style={{ background: isPostDev ? '#ec4899' : '#22d3ee', width: '100%', height: '100%' }}>
                            {(post.author_avatar || (isAuthor && (user?.photoURL || user?.photoUrl))) ? (
                              <img onError={imgFallback} src={post.author_avatar || user?.photoURL || user?.photoUrl} alt={post.author_name} />
                            ) : (
                              post.author_name?.[0]?.toUpperCase() || '👤'
                            )}
                          </div>
                        </OrnamentAvatar>

                        <div className="fb-post-card__meta">
                          <div className="fb-post-card__author-row" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <UserHoverCard
                              authorName={post.author_name}
                              authorAvatar={post.author_avatar || (isAuthor ? (user?.photoURL || user?.photoUrl || '') : '')}
                              authorFrame={isAuthor ? myFrame : (post.author_frame || 'royal-flame')}
                              isDev={isPostDev}
                              isFollowing={followingSet.has(post.author_name)}
                              onToggleFollow={handleToggleFollow}
                              canFollow={Boolean(user && post.author_name && post.author_name !== user.username)}
                            >
                              <span className="fb-post-card__author-name" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                                {post.author_name}
                                <VerifiedBadge isDev={isPostDev} size={17} />
                              </span>
                            </UserHoverCard>
                            {isPostDev && (
                              <span className="fb-dev-badge" title="Verified Developer">
                                👑 {lang === 'ar' ? 'مطور BLACK X' : 'Developer'}
                              </span>
                            )}
                            <UserBadges badges={isAuthor ? (user?.badges || ['blue_verified']) : (post.author_role === 'developer' ? ['gold_vip', 'blue_verified'] : ['blue_verified'])} size="sm" />
                            {user && post.author_name && post.author_name !== user.username && (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => handleToggleFollow(post.author_name)}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '0.15rem 0.6rem',
                                  borderRadius: '99px',
                                  color: followingSet.has(post.author_name) ? '#34d399' : 'var(--cyan)',
                                  borderColor: followingSet.has(post.author_name) ? 'rgba(52, 211, 153, 0.4)' : 'rgba(34, 211, 238, 0.4)',
                                  background: followingSet.has(post.author_name) ? 'rgba(52, 211, 153, 0.12)' : 'rgba(34, 211, 238, 0.08)',
                                  cursor: 'pointer',
                                  fontWeight: 700
                                }}
                              >
                                {followingSet.has(post.author_name)
                                  ? (lang === 'ar' ? '✓ تتابعه' : 'Following')
                                  : (lang === 'ar' ? '+ متابعة' : '+ Follow')}
                              </button>
                            )}
                          </div>

                          <div className="fb-post-card__sub-meta">
                            <span className="fb-post-card__time">
                              {formatTimeAgo(post.created_at || post.createdAt, lang)}
                            </span>
                            {post.tag_name && (
                              <span className="fb-post-card__tag-pill">
                                {post.tag_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Header menu (delete, share) */}
                      <div className="fb-post-card__actions-top">
                        <button
                          type="button"
                          className="fb-post-card__icon-btn"
                          onClick={() => handleShare(post)}
                          title={t('community.share')}
                        >
                          ↗️
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="fb-post-card__icon-btn fb-post-card__icon-btn--danger"
                            onClick={() => handleDeletePost(post.id)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Post Content */}
                    <div className="fb-post-card__body">
                      <p className="fb-post-card__text">
                        {String(post.content || '')
                          .replace(/\[VOICE_NOTE:\d+s\]/g, '')
                          .replace(/\[MEME:[a-z0-9_-]+\]/gi, '')
                          .trim()}
                      </p>

                      {/* Render attached Anime Meme Stickers */}
                      {ANIME_MEME_STICKERS.filter((m) => String(post.content || '').includes(`[MEME:${m.id}]`)).map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1.05rem',
                            borderRadius: '16px',
                            background: m.bg,
                            color: '#fff',
                            fontWeight: 900,
                            fontSize: '0.88rem',
                            marginTop: '0.45rem',
                            marginInlineEnd: '0.5rem',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                          }}
                        >
                          <span style={{ fontSize: '1.25rem' }}>{m.emoji}</span>
                          <span>{lang === 'ar' ? m.labelAr : m.labelEn}</span>
                        </div>
                      ))}

                      {/* Render attached Voice Note Waveform Player */}
                      {(post.voice_url || post.voiceUrl || String(post.content || '').includes('[VOICE_NOTE:')) && (
                        <div style={{ marginTop: '0.45rem', marginBottom: '0.45rem' }}>
                          <VoiceNoteWavePlayer
                            audioUrl={post.voice_url || post.voiceUrl}
                            duration={post.voice_duration || post.voiceDuration || 5}
                          />
                        </div>
                      )}

                      {post.image_url && (
                        <div className="fb-post-card__media">
                          <img onError={imgFallback} src={post.image_url} alt="Attached media" loading="lazy" />
                        </div>
                      )}
                    </div>

                    {/* Reactions & Comments summary count */}
                    <div className="fb-post-card__counts-bar">
                      <div className="fb-post-card__reactions-summary">
                        {(post.likes_count > 0 || Object.values(post.reactions || {}).some((v) => v > 0)) && (
                          <>
                            <span className="fb-reaction-icons-stack">
                              {post.reactions?.love > 0 && <span>❤️</span>}
                              {post.reactions?.like > 0 && <span>👍</span>}
                              {post.reactions?.haha > 0 && <span>😂</span>}
                              {post.reactions?.wow > 0 && <span>🤩</span>}
                              {post.reactions?.sad > 0 && <span>😢</span>}
                              {!Object.values(post.reactions || {}).some((v) => v > 0) && <span>👍</span>}
                            </span>
                            <span className="fb-counts-num">{post.likes_count || 1}</span>
                          </>
                        )}
                      </div>

                      <div className="fb-post-card__comments-summary">
                        {(post.comments_count || 0) > 0 && (
                          <button
                            type="button"
                            className="fb-link-btn"
                            onClick={() => toggleComments(post.id)}
                          >
                            {post.comments_count} {t('community.comments')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Main Interaction Buttons Bar (Like, Comment, Share) */}
                    <div className="fb-post-card__interactions">
                      {/* React Button & Floating Picker */}
                      <div
                        className="fb-react-wrap"
                        onMouseEnter={() => setReactionPickerPostId(post.id)}
                        onMouseLeave={() => setReactionPickerPostId(null)}
                      >
                        {/* Reaction Picker Popup on hover/tap */}
                        {reactionPickerPostId === post.id && (
                          <div className="fb-reaction-picker">
                            {REACTIONS.map((r) => (
                              <button
                                key={r.type}
                                type="button"
                                className="fb-reaction-picker__btn"
                                onClick={() => handleReact(post.id, r.type)}
                                title={lang === 'ar' ? r.labelAr : r.labelEn}
                              >
                                <span className="fb-reaction-picker__emoji">{r.emoji}</span>
                                <span className="fb-reaction-picker__label">
                                  {lang === 'ar' ? r.labelAr : r.labelEn}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          className={`fb-action-btn ${userReaction ? 'active' : ''}`}
                          style={{ color: currentReactionObj ? currentReactionObj.color : undefined }}
                          onClick={() => handleReact(post.id, userReaction || 'like')}
                        >
                          <span className="fb-action-btn__icon">
                            {currentReactionObj ? currentReactionObj.emoji : '👍'}
                          </span>
                          <span>
                            {currentReactionObj
                              ? (lang === 'ar' ? currentReactionObj.labelAr : currentReactionObj.labelEn)
                              : t('community.like')}
                          </span>
                        </button>
                      </div>

                      {/* Comment Button */}
                      <button
                        type="button"
                        className={`fb-action-btn ${openComments[post.id] ? 'active' : ''}`}
                        onClick={() => toggleComments(post.id)}
                      >
                        <span className="fb-action-btn__icon">💬</span>
                        <span>{t('community.comment')}</span>
                      </button>

                      {/* Share Button */}
                      <button
                        type="button"
                        className="fb-action-btn"
                        onClick={() => handleShare(post)}
                      >
                        <span className="fb-action-btn__icon">↗️</span>
                        <span>{t('community.share')}</span>
                      </button>
                    </div>

                    {/* Expandable Comments Section */}
                    {openComments[post.id] && (
                      <div className="fb-comments-section">
                        {/* New Comment Input */}
                        <div className="fb-comments-composer">
                          <div className="avatar fb-comments-composer__avatar" style={{ background: user?.avatarColor || '#22d3ee' }}>
                            {(user?.photoURL || user?.photoUrl) ? (
                              <img onError={imgFallback} src={user.photoURL || user.photoUrl} alt="Me" />
                            ) : (
                              user?.displayName?.[0]?.toUpperCase() || '👤'
                            )}
                          </div>
                          <div className="fb-comments-composer__box">
                            <input
                              type="text"
                              className="fb-comments-composer__input"
                              placeholder={t('community.writeComment')}
                              value={commentInputs[post.id] || ''}
                              onChange={(e) =>
                                setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleAddComment(post.id);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="fb-comments-composer__send"
                              onClick={() => handleAddComment(post.id)}
                              disabled={submittingComment[post.id] || !(commentInputs[post.id] || '').trim()}
                              aria-label="Send comment"
                            >
                              ➤
                            </button>
                          </div>
                        </div>

                        {/* Comments List */}
                        {loadingComments[post.id] ? (
                          <div className="fb-comments-loading">
                            <div className="spinner spinner--sm" />
                            <span>{t('common.loading')}</span>
                          </div>
                        ) : (commentsData[post.id] || []).length === 0 ? (
                          <div className="fb-comments-empty">
                            {lang === 'ar' ? 'كن أول من يعلق على هذا المنشور!' : 'Be the first to comment on this post!'}
                          </div>
                        ) : (
                          <div className="fb-comments-list">
                            {(commentsData[post.id] || []).map((c) => {
                              const isCommDev = c.author_role === 'developer' || c.user_id === 'mz0970mmz@gmail.com';
                              return (
                                <div key={c.id} className="fb-comment-item">
                                  <div className="avatar fb-comment-item__avatar" style={{ background: isCommDev ? '#ec4899' : '#22d3ee' }}>
                                    {c.author_avatar ? (
                                      <img onError={imgFallback} src={c.author_avatar} alt={c.author_name} />
                                    ) : (
                                      c.author_name?.[0]?.toUpperCase() || '👤'
                                    )}
                                  </div>

                                  <div className="fb-comment-item__content">
                                    <div className="fb-comment-bubble">
                                      <div className="fb-comment-bubble__head" style={{ display: 'flex', alignItems: 'center', gap: '0.28rem' }}>
                                        <span className="fb-comment-bubble__author" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                          {c.author_name}
                                          <VerifiedBadge isDev={isCommDev} size={14} />
                                        </span>
                                        {isCommDev && (
                                          <span className="fb-dev-badge fb-dev-badge--xs">👑 dev</span>
                                        )}
                                      </div>
                                      <div className="fb-comment-bubble__text">{c.content}</div>
                                    </div>
                                    <div className="fb-comment-item__meta">
                                      <span>{formatTimeAgo(c.created_at, lang)}</span>
                                      <button
                                        type="button"
                                        className="fb-link-btn"
                                        onClick={() => pushToast('❤️', 'info')}
                                      >
                                        {t('community.like')}
                                      </button>
                                      <button
                                        type="button"
                                        className="fb-link-btn"
                                        onClick={() => {
                                          setCommentInputs((prev) => ({
                                            ...prev,
                                            [post.id]: `@${c.author_name} `
                                          }));
                                        }}
                                      >
                                        {t('community.reply')}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
