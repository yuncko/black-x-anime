import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { LiveCreatureOverlay } from './LiveAvatarOrnament.jsx';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';

const SHOP_ITEMS = [
  {
    id: 'royal-flame',
    category: 'frame',
    nameAr: 'تنين اللهب الإمبراطوري الحي 🔥',
    nameEn: 'Imperial Fire Dragon (Live) 🔥',
    descAr: 'تنين مفصلي يسبح حول صورتك ويفتح فكيه لينفث سيلاً من اللهب الحجمي المتدرج',
    descEn: 'Articulated dragon that orbits your avatar and breathes volumetric fire',
    price: 400,
    rarity: 'MYTHIC',
    color: '#ff5500'
  },
  {
    id: 'shadow-monarch',
    category: 'frame',
    nameAr: 'عاهل الظلال — سولو ليفلينج 👑',
    nameEn: 'Shadow Monarch Arise (Live) 👑',
    descAr: 'فارس ظلال مدرّع يرتفع خلف صورتك ويمزق المحيط بنصلي الظلال الأرجوانيين',
    descEn: 'Armored shadow knight with glowing eyes and dual shadow dagger slashes',
    price: 500,
    rarity: 'MONARCH',
    color: '#a855f7'
  },
  {
    id: 'cyber-neon',
    category: 'frame',
    nameAr: 'حارس السايبربانك الآلي ⚡',
    nameEn: 'Cyberpunk Mecha-Drone (Live) ⚡',
    descAr: 'درون ميكا بأجنحة متحركة يطوف حول الحساب ويمسحه بشعاع ليزر وبلازما',
    descEn: 'Winged mecha sentinel drone with laser scan and plasma cannons',
    price: 450,
    rarity: 'LEGENDARY',
    color: '#00f2fe'
  },
  {
    id: 'dragon-ascension',
    category: 'frame',
    nameAr: 'التنين السماوي الزمردي 🐉',
    nameEn: 'Emerald Shenlong Dragon 🐉',
    descAr: 'تنين سماوي زمردي يلتف حول الحساب وينفث لهباً أخضر زمردياً مضيئاً',
    descEn: 'Celestial emerald dragon that breathes jade dragonfire around your avatar',
    price: 550,
    rarity: 'MYTHIC',
    color: '#10b981'
  },
  {
    id: 'imperial-gold',
    category: 'frame',
    nameAr: 'العنقاء والتنين الإمبراطوري الذهبي ⚜️',
    nameEn: 'Golden Imperial Sovereign ⚜️',
    descAr: 'زخرفة ملكية ذهبية حية تطلق لهباً شمسياً ذهبياً حول إطار صورتك',
    descEn: 'Sovereign golden dragon ornament breathing molten solar gold flames',
    price: 600,
    rarity: 'SOVEREIGN',
    color: '#eab308'
  },
  {
    id: 'sakura-blossom',
    category: 'frame',
    nameAr: 'ثعلب الكيتسوني وأزهار الساكورا 🌸',
    nameEn: 'Sakura Kitsune Spirit 🌸',
    descAr: 'روح الكيتسوني الوردية تطوف حول الحساب وتنفث نيران الساكورا المتوهجة',
    descEn: 'Spirit foxfire swirling with glowing pink sakura petals',
    price: 380,
    rarity: 'EPIC',
    color: '#f472b6'
  },
  {
    id: 'celestial-void',
    category: 'frame',
    nameAr: 'أفعى الرعد والفضاء الكوني 🌌',
    nameEn: 'Celestial Thunder Serpent 🌌',
    descAr: 'ثعبان برق كوني يلتف بسرعة خاطفة ويضرب حواف الحساب بصواعق متفرعة',
    descEn: 'Astral lightning serpent striking branching cosmic thunderbolts',
    price: 520,
    rarity: 'MYTHIC',
    color: '#38bdf8'
  },
  // Exclusive Titles
  {
    id: 'title:Monarch of Shadows 👑',
    category: 'title',
    titleTextAr: 'عاهل الظلال المطلق 👑',
    titleTextEn: 'Monarch of Shadows 👑',
    nameAr: 'لقب: عاهل الظلال المطلق 👑',
    nameEn: 'Title: Monarch of Shadows 👑',
    descAr: 'لقب ملكي متوهج يظهر بجانب اسمك في الملف الشخصي وبطاقة المجتمع',
    descEn: 'Glowing sovereign badge displayed on your profile header and hover card',
    price: 300,
    rarity: 'TITLE',
    color: '#a855f7'
  },
  {
    id: 'title:Dragon Emperor 🔥',
    category: 'title',
    titleTextAr: 'إمبراطور لهب التنين 🔥',
    titleTextEn: 'Dragon Flame Emperor 🔥',
    nameAr: 'لقب: إمبراطور لهب التنين 🔥',
    nameEn: 'Title: Dragon Flame Emperor 🔥',
    descAr: 'لقب ناري أسطوري يميز حسابك في المنصة والمجتمع',
    descEn: 'Fiery mythic title badge for your profile and community posts',
    price: 300,
    rarity: 'TITLE',
    color: '#ff5500'
  },
  {
    id: 'title:S-Rank Hunter ⚡',
    category: 'title',
    titleTextAr: 'صائد الرتبة S العالمي ⚡',
    titleTextEn: 'S-Rank Global Hunter ⚡',
    nameAr: 'لقب: صائد الرتبة S العالمي ⚡',
    nameEn: 'Title: S-Rank Global Hunter ⚡',
    descAr: 'لقب خاص بنخبة مشاهدي الأنمي وقراء المانجا في Hearbor',
    descEn: 'Elite S-Rank Hunter badge for top anime & manga enthusiasts',
    price: 250,
    rarity: 'TITLE',
    color: '#22d3ee'
  }
];

export function OrnamentShop({
  user,
  gamificationStats,
  frameStyle,
  onSelectFrame,
  bannerStyle,
  onSelectBanner,
  customTitle,
  onSelectTitle
}) {
  const { lang, formatNumber } = useI18n();
  const [filterCat, setFilterCat] = useState('all');

  const baseShards = (gamificationStats?.points || (gamificationStats?.totalWatchTimeMin || 0) * 5 || (user?.watchTimeMinutes || 0) * 5 || 0);
  const [spentShards, setSpentShards] = useState(() => {
    try { return Number(localStorage.getItem('blackx.spentShards') || 0); } catch { return 0; }
  });
  const [bonusShards, setBonusShards] = useState(() => {
    try { return Number(localStorage.getItem('blackx.bonusShards') || 0); } catch { return 0; }
  });
  const [ownedIds, setOwnedIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('blackx.ownedShopItems') || '[]');
      return Array.from(new Set(['royal-flame', 'shadow-monarch', ...saved]));
    } catch {
      return ['royal-flame', 'shadow-monarch'];
    }
  });
  const [claimedToday, setClaimedToday] = useState(() => {
    try {
      return localStorage.getItem('blackx.dailyShardDate') === new Date().toISOString().slice(0, 10);
    } catch {
      return false;
    }
  });

  const currentShards = Math.max(0, baseShards + bonusShards - spentShards);

  const handleClaimDaily = () => {
    if (claimedToday) return;
    const nextBonus = bonusShards + 350;
    setBonusShards(nextBonus);
    setClaimedToday(true);
    try {
      localStorage.setItem('blackx.bonusShards', String(nextBonus));
      localStorage.setItem('blackx.dailyShardDate', new Date().toISOString().slice(0, 10));
    } catch {}
    pushToast(
      lang === 'ar'
        ? '💎 تم استلام +350 شظية سوداء (Black Shards) مكافأة التفاعل اليومية!'
        : '💎 Claimed +350 Black Shards daily interaction bonus!',
      'success'
    );
  };

  const handleBuyOrEquip = (item) => {
    const isOwned = ownedIds.includes(item.id);
    if (!isOwned) {
      if (currentShards < item.price) {
        pushToast(
          lang === 'ar'
            ? '⚠️ رصيدك من الشظايا السوداء غير كافٍ! استلم المكافأة اليومية أو شاهد المزيد من الحلقات.'
            : '⚠️ Not enough Black Shards! Claim your daily bonus or watch more episodes.',
          'error'
        );
        return;
      }
      const nextSpent = spentShards + item.price;
      const nextOwned = [...ownedIds, item.id];
      setSpentShards(nextSpent);
      setOwnedIds(nextOwned);
      try {
        localStorage.setItem('blackx.spentShards', String(nextSpent));
        localStorage.setItem('blackx.ownedShopItems', JSON.stringify(nextOwned));
      } catch {}
    }

    if (item.category === 'frame') {
      onSelectFrame?.(item.id);
      api.put('/api/profile/customize', { frameStyle: item.id }).catch(() => {});
      pushToast(
        lang === 'ar'
          ? `🐉 تم تجهيز «${item.nameAr}» على صورة حسابك بنجاح!`
          : `🐉 Equipped "${item.nameEn}" on your profile avatar!`,
        'success'
      );
    } else if (item.category === 'title') {
      const titleVal = lang === 'ar' ? item.titleTextAr : item.titleTextEn;
      onSelectTitle?.(titleVal);
      try { localStorage.setItem('blackx.customTitle', titleVal); } catch {}
      pushToast(
        lang === 'ar'
          ? `👑 تم تجهيز اللقب الحصري «${titleVal}» على حسابك!`
          : `👑 Equipped exclusive title "${titleVal}"!`,
        'success'
      );
    }
  };

  const visibleItems = SHOP_ITEMS.filter((it) => filterCat === 'all' || it.category === filterCat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Wallet & Daily Bonus Banner */}
      <div
        className="glass"
        style={{
          padding: '1.6rem 2rem',
          borderRadius: '22px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(46, 16, 101, 0.78))',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.25rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.8rem' }}>💎</span>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>
              {lang === 'ar' ? 'متجر الزخارف الحية والألقاب (Black Shards Shop)' : 'Black Shards Ornament & Title Shop'}
            </h2>
          </div>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--ink-dim)', fontSize: '0.9rem' }}>
            {lang === 'ar'
              ? 'استبدل نقاط تفاعلك ومشاهدتك للحلقات والمانجا بكائنات ثلاثية الأبعاد حية وألقاب ملكية حصرية مجاناً!'
              : 'Redeem your watch & reading XP for living 3D avatar creatures and exclusive sovereign titles!'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '16px',
              background: 'rgba(0, 0, 0, 0.48)',
              border: '1px solid rgba(34, 211, 238, 0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem'
            }}
          >
            <span style={{ fontSize: '1.35rem' }}>💎</span>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--ink-dim)' }}>
                {lang === 'ar' ? 'رصيد الشظايا السوداء' : 'Your Black Shards'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--cyan)' }}>
                {formatNumber(currentShards)} <span style={{ fontSize: '0.78rem' }}>SHARDS</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            disabled={claimedToday}
            onClick={handleClaimDaily}
            style={{
              background: claimedToday
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: '#fff',
              fontWeight: 800,
              borderRadius: '14px',
              padding: '0.75rem 1.25rem'
            }}
          >
            🎁 {claimedToday
              ? (lang === 'ar' ? '✓ تم استلام مكافأة اليوم' : '✓ Daily Bonus Claimed')
              : (lang === 'ar' ? 'استلام +350 💎 هدية اليوم' : 'Claim +350 💎 Daily Bonus')}
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {[
          { id: 'all', labelAr: '🌟 كل المعروضات', labelEn: '🌟 All Items' },
          { id: 'frame', labelAr: '🐉 الكائنات والإطارات الحية', labelEn: '🐉 Living 3D Creatures' },
          { id: 'title', labelAr: '👑 الألقاب الملكية الحصرية', labelEn: '👑 Exclusive Titles' }
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${filterCat === c.id ? 'active' : ''}`}
            onClick={() => setFilterCat(c.id)}
            style={{ fontWeight: 800, padding: '0.5rem 1.1rem' }}
          >
            {lang === 'ar' ? c.labelAr : c.labelEn}
          </button>
        ))}
      </div>

      {/* Shop Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))',
          gap: '1.25rem'
        }}
      >
        {visibleItems.map((item) => {
          const isOwned = ownedIds.includes(item.id);
          const isEquipped =
            (item.category === 'frame' && frameStyle === item.id) ||
            (item.category === 'title' && (customTitle === item.titleTextAr || customTitle === item.titleTextEn));

          return (
            <div
              key={item.id}
              className="glass"
              style={{
                padding: '1.35rem',
                borderRadius: '20px',
                border: isEquipped ? `2px solid ${item.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: isEquipped ? `0 0 28px ${item.color}44` : 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 900,
                      padding: '0.18rem 0.6rem',
                      borderRadius: '99px',
                      background: `${item.color}22`,
                      border: `1px solid ${item.color}66`,
                      color: item.color
                    }}
                  >
                    {item.rarity}
                  </span>
                  <span style={{ fontWeight: 900, color: '#fde047', fontSize: '0.88rem' }}>
                    {isOwned ? (lang === 'ar' ? '✓ مملوك' : '✓ OWNED') : `💎 ${item.price}`}
                  </span>
                </div>

                {/* Live Creature Preview Stage inside Card */}
                {item.category === 'frame' ? (
                  <div
                    style={{
                      position: 'relative',
                      width: '124px',
                      height: '124px',
                      margin: '0.5rem auto 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <div
                      style={{
                        width: '84px',
                        height: '84px',
                        borderRadius: '50%',
                        background: '#0f172a',
                        border: `2px solid ${item.color}`,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 900,
                        fontSize: '1.45rem',
                        color: '#fff',
                        overflow: 'hidden'
                      }}
                    >
                      {(user?.photoUrl || user?.photoURL) ? (
                        <img src={user.photoUrl || user.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        (user?.displayName?.[0] || 'Z').toUpperCase()
                      )}
                    </div>
                    <LiveCreatureOverlay ornament={item.id} mode="frame" size={88} />
                  </div>
                ) : (
                  <div
                    style={{
                      height: '92px',
                      display: 'grid',
                      placeItems: 'center',
                      margin: '0.5rem 0 1rem',
                      borderRadius: '14px',
                      background: 'rgba(0,0,0,0.45)',
                      border: `1px dashed ${item.color}66`
                    }}
                  >
                    <span
                      style={{
                        padding: '0.4rem 1rem',
                        borderRadius: '99px',
                        background: `${item.color}28`,
                        border: `1px solid ${item.color}`,
                        color: '#fff',
                        fontWeight: 900,
                        fontSize: '0.92rem',
                        boxShadow: `0 0 18px ${item.color}55`
                      }}
                    >
                      {lang === 'ar' ? item.titleTextAr : item.titleTextEn}
                    </span>
                  </div>
                )}

                <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 800 }}>
                  {lang === 'ar' ? item.nameAr : item.nameEn}
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-dim)', lineHeight: 1.5 }}>
                  {lang === 'ar' ? item.descAr : item.descEn}
                </p>
              </div>

              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => handleBuyOrEquip(item)}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  background: isEquipped
                    ? 'rgba(16, 185, 129, 0.22)'
                    : isOwned
                    ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                    : `linear-gradient(135deg, ${item.color}, #ec4899)`,
                  border: isEquipped ? '1px solid #10b981' : 'none',
                  color: '#fff',
                  fontWeight: 800,
                  padding: '0.6rem'
                }}
              >
                {isEquipped
                  ? (lang === 'ar' ? '✓ مُجهّز حالياً على حسابك' : '✓ Currently Equipped')
                  : isOwned
                  ? (lang === 'ar' ? '⚡ تجهيز الآن' : '⚡ Equip Now')
                  : (lang === 'ar' ? `🔓 شراء وتجهيز (${item.price} 💎)` : `🔓 Unlock & Equip (${item.price} 💎)`)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hearbor Wrapped 2026 — Shareable & Downloadable Annual/Monthly Anime & Manga Summary Card
 */
/**
 * «ملخص 2026» of the classic profile, 2026-10-17.
 *
 * Until then the card invented its numbers: at least 12 hours, 48 episodes and 28 chapters for
 * everybody (plus 34 chapters added to every count), level 75 and «TOP 1%» worldwide when
 * nothing was known, a fixed «Dark Fantasy & Action» favourite genre and a stranger's name as
 * the fallback. The yearly summary now lives in the app interface of the website
 * («ملخصك», client/src/mobile/WrappedPage.jsx) with only what was really recorded, so this
 * card sends the visitor there (`?ui=app` also remembers the choice, client/src/webUi.js).
 */
export function WrappedCardPanel() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  return (
    <div className="glass" style={{ padding: '2rem', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.18)' }}>
      <h3 style={{ margin: '0 0 0.65rem', fontSize: '1.35rem', fontWeight: 900 }}>{ar ? '✨ ملخصك السنوي' : '✨ Your year on Hearbor'}</h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: '0.94rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
        {ar
          ? 'ملخص سنتك بقى في واجهة Hearbor الجديدة: وقت المشاهدة، الحلقات اللي كمّلتها، أكتر أعمال وتصنيفات اتفرجت عليها — بأرقامك الحقيقية بس، وتقدر تنزّله صورة أو تشاركه.'
          : 'Your yearly summary is now in the new Hearbor interface: time watched, episodes finished, your top titles and genres — only your real numbers, as an image to download or share.'}
      </p>
      <button type="button" className="btn btn--primary" onClick={() => window.location.assign('/profile/wrapped?ui=app')}>
        {ar ? 'افتح ملخصك' : 'Open your year'}
      </button>
    </div>
  );
}
