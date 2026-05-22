'use client';

// src/app/redeem/[token]/RedemptionClient.tsx
// Interactive client component for the redemption page.
// Features: countdown timer, animated states, QR code for staff scanning.

import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface RedemptionClientProps {
  token: string;
  tap: {
    id: string;
    expiresAt: string | null;
    redeemedAt: string | null;
    createdAt: string;
  };
  venue: {
    name: string;
    address: string;
  } | null;
  promotion: {
    title: string;
    description: string | null;
    discountValue: string | null;
    imageUrl: string | null;
  } | null;
  locationLabel: string | null;
}

type RedemptionState = 'active' | 'redeemed' | 'expired';

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function RedemptionClient({
  token,
  tap,
  venue,
  promotion,
  locationLabel,
}: RedemptionClientProps) {
  const [state, setState] = useState<RedemptionState>(() => {
    if (tap.redeemedAt) return 'redeemed';
    if (tap.expiresAt && new Date(tap.expiresAt) <= new Date()) return 'expired';
    return 'active';
  });

  const [timeLeft, setTimeLeft] = useState('');
  const [progressPercent, setProgressPercent] = useState(100);
  const [pulseClass, setPulseClass] = useState('');

  // ── Countdown Timer ──
  const updateCountdown = useCallback(() => {
    if (!tap.expiresAt || state !== 'active') return;

    const now = Date.now();
    const expiry = new Date(tap.expiresAt).getTime();
    const created = new Date(tap.createdAt).getTime();
    const remaining = expiry - now;
    const total = expiry - created;

    if (remaining <= 0) {
      setState('expired');
      setTimeLeft('00:00');
      setProgressPercent(0);
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    setProgressPercent(Math.max(0, (remaining / total) * 100));

    // Pulse when under 2 minutes
    if (remaining < 120000) {
      setPulseClass('pulse-urgent');
    } else {
      setPulseClass('');
    }
  }, [tap.expiresAt, tap.createdAt, state]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [updateCountdown]);

  // ── Confetti effect on redeemed state ──
  useEffect(() => {
    if (state === 'redeemed') {
      // Simple CSS-based confetti celebration
      document.body.classList.add('celebration');
      const timeout = setTimeout(() => document.body.classList.remove('celebration'), 3000);
      return () => clearTimeout(timeout);
    }
  }, [state]);

  const discountDisplay = promotion?.discountValue || promotion?.title || 'Special Offer';

  return (
    <>
      <style>{`
        .redeem-container {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          font-family: var(--font-geist-sans, 'Inter', sans-serif);
          position: relative;
          overflow: hidden;
        }

        .redeem-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 20% 20%, rgba(176, 38, 255, 0.12) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, rgba(6, 182, 212, 0.1) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        .redeem-card {
          position: relative;
          z-index: 1;
          max-width: 420px;
          width: 100%;
          background: linear-gradient(135deg, rgba(24, 24, 27, 0.95), rgba(39, 39, 42, 0.85));
          border: 1px solid rgba(176, 38, 255, 0.25);
          border-radius: 1.5rem;
          padding: 2rem;
          backdrop-filter: blur(20px);
          box-shadow:
            0 0 60px rgba(176, 38, 255, 0.08),
            0 20px 40px rgba(0, 0, 0, 0.4);
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.9rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 1.25rem;
        }

        .status-active {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .status-redeemed {
          background: rgba(6, 182, 212, 0.15);
          color: #22d3ee;
          border: 1px solid rgba(6, 182, 212, 0.3);
        }

        .status-expired {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        .status-active .status-dot { background: #4ade80; }
        .status-redeemed .status-dot { background: #22d3ee; }
        .status-expired .status-dot { background: #f87171; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .discount-display {
          font-size: 2.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #b026ff, #06b6d4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-align: center;
          line-height: 1.1;
          margin-bottom: 0.5rem;
        }

        .promo-title {
          text-align: center;
          font-size: 1.1rem;
          color: #a1a1aa;
          margin-bottom: 0.35rem;
        }

        .promo-desc {
          text-align: center;
          font-size: 0.85rem;
          color: #71717a;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .venue-info {
          text-align: center;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 1.5rem;
        }

        .venue-name {
          font-size: 1rem;
          font-weight: 600;
          color: #e4e4e7;
          margin-bottom: 0.15rem;
        }

        .venue-address {
          font-size: 0.8rem;
          color: #71717a;
        }

        .venue-location {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          margin-top: 0.4rem;
          font-size: 0.75rem;
          color: #a78bfa;
          background: rgba(167, 139, 250, 0.1);
          padding: 0.2rem 0.6rem;
          border-radius: 9999px;
        }

        .timer-section {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .timer-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #71717a;
          margin-bottom: 0.5rem;
        }

        .timer-display {
          font-size: 2.8rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: #fafafa;
          font-family: var(--font-geist-mono, monospace);
        }

        .timer-display.pulse-urgent {
          animation: urgentPulse 1s ease-in-out infinite;
          color: #f87171;
        }

        @keyframes urgentPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.02); }
        }

        .progress-bar {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 9999px;
          overflow: hidden;
          margin-top: 0.75rem;
        }

        .progress-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 1s linear;
          background: linear-gradient(90deg, #b026ff, #06b6d4);
        }

        .progress-fill.low {
          background: linear-gradient(90deg, #ef4444, #f97316);
        }

        .qr-section {
          text-align: center;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .qr-label {
          font-size: 0.75rem;
          color: #71717a;
          margin-bottom: 0.75rem;
        }

        .qr-code {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: #ffffff;
          border-radius: 1rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .qr-code canvas {
          display: block;
        }

        .token-display {
          margin-top: 1rem;
          font-family: var(--font-geist-mono, monospace);
          font-size: 0.7rem;
          color: #52525b;
          letter-spacing: 0.05em;
          word-break: break-all;
        }

        .redeemed-overlay {
          text-align: center;
          padding: 2rem 0;
        }

        .redeemed-check {
          font-size: 4rem;
          margin-bottom: 1rem;
          animation: bounceIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }

        .redeemed-text {
          font-size: 1.3rem;
          font-weight: 700;
          color: #22d3ee;
          margin-bottom: 0.5rem;
        }

        .redeemed-subtext {
          font-size: 0.85rem;
          color: #71717a;
        }

        .expired-overlay {
          text-align: center;
          padding: 2rem 0;
        }

        .expired-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .expired-text {
          font-size: 1.2rem;
          font-weight: 600;
          color: #f87171;
          margin-bottom: 0.5rem;
        }

        .expired-subtext {
          font-size: 0.85rem;
          color: #71717a;
          line-height: 1.6;
        }

        .show-staff-hint {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 1rem;
          padding: 0.75rem;
          background: rgba(176, 38, 255, 0.08);
          border: 1px dashed rgba(176, 38, 255, 0.25);
          border-radius: 0.75rem;
          font-size: 0.8rem;
          color: #c084fc;
          animation: fadeIn 1s ease both;
          animation-delay: 0.8s;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <div className="redeem-container">
        <div className="redeem-card">
          {/* Status Badge */}
          <div style={{ textAlign: 'center' }}>
            <span className={`status-badge status-${state}`}>
              <span className="status-dot" />
              {state === 'active' && 'Ready to Redeem'}
              {state === 'redeemed' && 'Redeemed ✓'}
              {state === 'expired' && 'Expired'}
            </span>
          </div>

          {/* Discount Value */}
          <div className="discount-display">{discountDisplay}</div>

          {/* Promotion Info */}
          {promotion && (
            <>
              {promotion.discountValue && (
                <div className="promo-title">{promotion.title}</div>
              )}
              {promotion.description && (
                <div className="promo-desc">{promotion.description}</div>
              )}
            </>
          )}

          {/* Venue Info */}
          {venue && (
            <div className="venue-info">
              <div className="venue-name">{venue.name}</div>
              <div className="venue-address">{venue.address}</div>
              {locationLabel && (
                <div className="venue-location">
                  📍 {locationLabel}
                </div>
              )}
            </div>
          )}

          {/* Active State: Timer + QR */}
          {state === 'active' && (
            <>
              <div className="timer-section">
                <div className="timer-label">Expires in</div>
                <div className={`timer-display ${pulseClass}`}>{timeLeft}</div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${progressPercent < 25 ? 'low' : ''}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="show-staff-hint">
                📱 Show this screen to your server to claim
              </div>

              <div className="qr-section">
                <div className="qr-label">Or staff can scan this code</div>
                <StaffQRCode value={`dtl-verify:${token}`} />
                <div className="token-display">{token}</div>
              </div>
            </>
          )}

          {/* Redeemed State */}
          {state === 'redeemed' && (
            <div className="redeemed-overlay">
              <div className="redeemed-check">✅</div>
              <div className="redeemed-text">Offer Redeemed!</div>
              <div className="redeemed-subtext">
                Enjoy your deal. Thanks for visiting{venue ? ` ${venue.name}` : ''}!
              </div>
            </div>
          )}

          {/* Expired State */}
          {state === 'expired' && (
            <div className="expired-overlay">
              <div className="expired-icon">⏰</div>
              <div className="expired-text">This offer has expired</div>
              <div className="expired-subtext">
                Each NFC tap generates a fresh coupon.<br />
                Tap the tag again for a new one!
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// QR Code (canvas-based, using qrcode library)
// Preserves case-sensitive tokens like Brave-Golden-Orca
// ────────────────────────────────────────────────────────────

function StaffQRCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, value, {
      width: 180,
      margin: 0,
      color: {
        dark: '#09090b',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).catch((err: Error) => {
      console.error('[QR] Generation failed:', err.message);
    });
  }, [value]);

  return (
    <div className="qr-code">
      <canvas ref={canvasRef} style={{ width: 180, height: 180 }} />
    </div>
  );
}
