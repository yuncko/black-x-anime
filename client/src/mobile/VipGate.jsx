import React from 'react';
import BxIcon from './BxIcon.jsx';
import { signOut as apkSignOut } from './apkApi.js';

/**
 * VipGate: moved out of MobileApkApp.jsx unchanged (2026-10-17 split). It only renders —
 * the state and the actions stay in MobileApkApp and come in as props.
 */
export default function VipGate({
  authBusy,
  authPassword,
  authUsername,
  handleAuthSubmit,
  handleRealGoogleOAuthLogin,
  handleRedeemVipCode,
  isRtl,
  setAuthPassword,
  setAuthUsername,
  setSessionToken,
  setUser,
  setVipRedeemCode,
  showToast,
  user,
  vipRedeemBusy,
  vipRedeemCode
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9950,
        background: '#000000',
        color: '#ffffff',
        overflowY: 'auto',
        padding: '1.2rem 1rem 3rem'
      }}
    >
      <div style={{ maxWidth: '540px', margin: '0 auto' }}>
        {/* Header Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
          <img
            src="/blackx-logo.png"
            alt="Hearbor"
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 0.65rem',
              borderRadius: '18px',
              background: '#000000',
              objectFit: 'cover',
              display: 'block',
              border: '1px solid rgba(255,255,255,0.24)',
              boxShadow: '0 0 28px rgba(255,0,0,0.4)'
            }}
          />
          <span
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.85rem',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.25)',
              fontSize: '0.75rem',
              fontWeight: 700,
              marginBottom: '0.45rem'
            }}
          >
            <BxIcon name="crown" className="bx-ico-lead" />Hearbor VIP PREMIERE ACCESS
          </span>
          <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.375rem', fontWeight: 800 }}>
            {isRtl ? 'اشترك في باقات Hearbor VIP للمتابعة' : 'Hearbor VIP Subscription Required'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.68)', lineHeight: 1.55 }}>
            {isRtl
              ? 'التطبيق يعمل حالياً بنظام العضوية المدفوعة الموحد مع الموقع الرسمي. اختر باقتك أو أدخل كود التفعيل الفوري، أو سجّل دخولك إذا كنت مشتركاً بالفعل.'
              : 'VIP membership is currently enforced across all platforms. Redeem your VIP code or sign in to continue.'}
          </p>
        </div>

        {/* Instant VIP Code Activation Box */}
        <form
          onSubmit={handleRedeemVipCode}
          style={{
            padding: '1rem',
            borderRadius: '18px',
            background: '#0b0b0f',
            border: '1.5px solid #ffffff',
            marginBottom: '1rem',
            boxShadow: '0 10px 30px rgba(255,255,255,0.08)'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.8125rem', marginBottom: '0.45rem' }}>
            <BxIcon name="key" className="bx-ico-lead" />{isRtl ? 'لديك كود تفعيل VIP؟ أدخله هنا للفتح الفوري:' : 'Have a VIP Activation Code? Redeem Instantly:'}
          </div>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            <input
              type="text"
              value={vipRedeemCode}
              onChange={(e) => setVipRedeemCode(e.target.value)}
              placeholder="BX-XXXX-XXXX-XXXX"
              style={{
                flex: 1,
                padding: '0.7rem 0.85rem',
                borderRadius: '12px',
                background: '#000000',
                border: '1px solid rgba(255,255,255,0.28)',
                color: '#ffffff',
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.8125rem'
              }}
            />
            <button
              type="submit"
              disabled={vipRedeemBusy}
              style={{
                padding: '0 1.15rem',
                borderRadius: '12px',
                border: 'none',
                background: '#ffffff',
                color: '#000000',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer'
              }}
            >
              {vipRedeemBusy ? <BxIcon name="loader" /> : isRtl ? 'تفعيل الآن' : 'Activate'}
            </button>
          </div>
        </form>

        {/* The 2 Official Hearbor VIP Plans (Matches Website 100%) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem', marginBottom: '1rem' }}>
          {/* Plan 1: Monarch VIP 199 EGP */}
          <div
            style={{
              padding: '1.05rem',
              borderRadius: '18px',
              background: 'linear-gradient(145deg, #121218 0%, #07070a 100%)',
              border: '1.5px solid #ffffff',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                <BxIcon name="crown" className="bx-ico-lead" />{isRtl ? 'باقة الملك' : 'Monarch VIP Plan'}
              </span>
              <span
                style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: '0.8125rem'
                }}
              >
                199 {isRtl ? 'ج.م / شهرياً' : 'EGP / mo'}
              </span>
            </div>
            <ul style={{ margin: '0 0 0.75rem', paddingInlineStart: '1.1rem', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.6 }}>
              <li>{isRtl ? 'فتح جميع سيرفرات Hearbor المتاحة على الموقع' : 'Every Hearbor server available on the website'}</li>
              <li>{isRtl ? 'فتح مكتبة المانجا والمانهوا كاملة بشاشة كاملة وتحميل مباشر' : 'Full Manga & Manhwa library + Direct Download'}</li>
              <li>{isRtl ? 'تعمل على الموقع الرسمي وتطبيق الهاتف بنفس الحساب' : 'Works on both Website and Mobile APK'}</li>
            </ul>

            <div
              style={{
                padding: '0.65rem 0.8rem',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.18)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.55rem'
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                  <BxIcon name="smartphone" className="bx-ico-lead" />{isRtl ? 'رقم محفظة فودافون كاش للتحويل:' : 'Vodafone Cash Wallet:'}
                </div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9375rem', letterSpacing: '0.05em' }}>
                  01094965378
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText('01094965378');
                  showToast('اتنسخ رقم فودافون كاش: 01094965378', 'check');
                }}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <BxIcon name="copy" className="bx-ico-lead" />{isRtl ? 'نسخ الرقم' : 'Copy'}
              </button>
            </div>

            <a
              href={`https://wa.me/201094965378?text=${encodeURIComponent(
                'مرحباً إدارة Hearbor، قمت بتحويل 199 ج.م على فودافون كاش 01094965378 للاشتراك في باقة الملك MONARCH VIP وأريد استلام كود التفعيل الفوري.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '0.68rem',
                borderRadius: '12px',
                background: '#ffffff',
                color: '#000000',
                fontWeight: 700,
                fontSize: '0.8125rem',
                textDecoration: 'none'
              }}
            >
              <BxIcon name="message" className="bx-ico-lead" />{isRtl ? 'إرسال إيصال التحويل واستلام كود VIP فوراً' : 'Send Transfer Receipt & Get VIP Code'}
            </a>
          </div>

          {/* Plan 2: Basic VIP 99 EGP */}
          <div
            style={{
              padding: '0.95rem',
              borderRadius: '18px',
              background: '#0a0a0e',
              border: '1px solid rgba(255,255,255,0.22)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                <BxIcon name="zap" className="bx-ico-lead" />{isRtl ? 'الباقة الأساسية' : 'Basic VIP Plan'}
              </span>
              <span
                style={{
                  padding: '0.18rem 0.55rem',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.14)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              >
                99 {isRtl ? 'ج.م / شهرياً' : 'EGP / mo'}
              </span>
            </div>
            <p style={{ margin: '0 0 0.55rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.72)' }}>
              {isRtl
                ? 'مشاهدة جميع الأنميات والمانهوا بجودة 1080p بدون إعلانات عبر سيرفرات Hearbor.'
                : 'Full 1080p Anime & Manhwa streaming across Hearbor servers.'}
            </p>
            <a
              href={`https://wa.me/201094965378?text=${encodeURIComponent(
                'مرحباً إدارة Hearbor، قمت بتحويل 99 ج.م على فودافون كاش 01094965378 للاشتراك في الباقة الأساسية BASIC VIP وأريد استلام كود التفعيل.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '0.58rem',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.75rem',
                textDecoration: 'none'
              }}
            >
              <BxIcon name="message" className="bx-ico-lead" />{isRtl ? 'طلب كود الباقة الأساسية (99 ج.م)' : 'Request Basic VIP Code (99 EGP)'}
            </a>
          </div>
        </div>

        {/* Sign-In Section for Existing Subscribers or Developer Account */}
        <div
          style={{
            padding: '1rem',
            borderRadius: '18px',
            background: '#0a0a0e',
            border: '1px solid rgba(255,255,255,0.18)'
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
            <BxIcon name="lock" className="bx-ico-lead" />{isRtl ? 'مشترك بالفعل أو صاحب حساب المطور؟ سجّل دخولك:' : 'Already VIP or Developer? Sign In:'}
          </div>

          {user ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem' }}>
                {isRtl ? 'داخل باسم:' : 'Signed in as:'} <strong>{user.displayName || user.email}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  apkSignOut();
                  setSessionToken(null);
                  setUser(null);
                  localStorage.removeItem('bx_mob_user');
                }}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.24)',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {isRtl ? 'تبديل الحساب' : 'Switch Account'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <button
                type="button"
                disabled={authBusy}
                onClick={handleRealGoogleOAuthLogin}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: 'pointer'
                }}
              >
                G {isRtl ? 'الدخول بحساب Google' : 'Sign in with Google'}
              </button>

              <form onSubmit={handleAuthSubmit} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder={isRtl ? 'البريد أو اسم المستخدم' : 'Email / Username'}
                  style={{
                    flex: 1,
                    minWidth: '130px',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '12px',
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    fontSize: '0.75rem'
                  }}
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={isRtl ? 'كلمة المرور' : 'Password'}
                  style={{
                    flex: 1,
                    minWidth: '110px',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '12px',
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    fontSize: '0.75rem'
                  }}
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  style={{
                    padding: '0.6rem 0.95rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'rgba(255,255,255,0.18)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {isRtl ? 'دخول' : 'Login'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
