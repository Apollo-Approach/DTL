// src/app/redeem/error/page.tsx
// NFC Redemption Error Page — Sprint 5
//
// User-friendly error page for failed NFC verifications.
// Each error code maps to a specific message with actionable guidance.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Tap Error — DTL Nightly',
  description: 'Something went wrong with your NFC tap.',
  robots: 'noindex, nofollow',
};

interface Props {
  searchParams: Promise<{ reason?: string }>;
}

const ERROR_MAP: Record<string, { icon: string; title: string; message: string; action: string }> = {
  missing_params: {
    icon: '📡',
    title: "Tap didn't register",
    message: "Your phone didn't capture all the data from the tag. Make sure you're holding your phone directly on the NFC coaster, not just near it.",
    action: 'Try tapping again — slow and steady on the tag.',
  },
  unknown_tag: {
    icon: '🏷️',
    title: 'Unrecognized tag',
    message: "This NFC tag isn't registered in our system. It might be an old tag or from a different venue.",
    action: 'Ask your server for help or check if the tag has a QR code.',
  },
  invalid_signature: {
    icon: '🔐',
    title: 'Security check failed',
    message: 'The cryptographic signature on this tap could not be verified. This can happen with a weak NFC connection.',
    action: 'Try tapping again. Hold your phone steady for 2 seconds.',
  },
  already_used: {
    icon: '♻️',
    title: 'Already claimed',
    message: "This particular tap has already been used to generate a coupon. Each tap creates a unique, single-use offer.",
    action: 'Tap the tag again for a fresh offer!',
  },
  tag_inactive: {
    icon: '⏸️',
    title: 'Tag is paused',
    message: "This NFC tag has been temporarily deactivated by the venue. The promotion might be between sessions.",
    action: 'Check back later or ask your server about current deals.',
  },
  no_promotion: {
    icon: '📋',
    title: 'No active offer',
    message: "The tag was read successfully, but there's no promotion currently linked to it.",
    action: 'Ask your server about today\'s specials.',
  },
  internal_error: {
    icon: '⚡',
    title: 'Something went wrong',
    message: "We hit a technical snag processing your tap. This is on our end, not yours.",
    action: 'Try again in a moment. If it keeps happening, ask your server.',
  },
};

const DEFAULT_ERROR = {
  icon: '❓',
  title: 'Unknown error',
  message: 'Something unexpected happened.',
  action: 'Try tapping the NFC tag again.',
};

export default async function RedeemErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const error = ERROR_MAP[reason ?? ''] ?? DEFAULT_ERROR;

  return (
    <>
      <style>{`
        .error-container {
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

        .error-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 30%, rgba(239, 68, 68, 0.08) 0%, transparent 60%);
          pointer-events: none;
        }

        .error-card {
          position: relative;
          z-index: 1;
          max-width: 420px;
          width: 100%;
          background: linear-gradient(135deg, rgba(24, 24, 27, 0.95), rgba(39, 39, 42, 0.85));
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 1.5rem;
          padding: 2.5rem 2rem;
          backdrop-filter: blur(20px);
          box-shadow:
            0 0 40px rgba(239, 68, 68, 0.06),
            0 20px 40px rgba(0, 0, 0, 0.4);
          text-align: center;
          animation: fadeSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .error-icon {
          font-size: 4rem;
          margin-bottom: 1.25rem;
          animation: shake 0.5s ease-in-out;
          animation-delay: 0.3s;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }

        .error-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #fafafa;
          margin-bottom: 0.75rem;
        }

        .error-message {
          font-size: 0.9rem;
          color: #a1a1aa;
          line-height: 1.7;
          margin-bottom: 1.5rem;
        }

        .error-action {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.85rem 1.25rem;
          background: rgba(176, 38, 255, 0.08);
          border: 1px solid rgba(176, 38, 255, 0.2);
          border-radius: 0.75rem;
          font-size: 0.85rem;
          color: #c084fc;
          margin-bottom: 2rem;
        }

        .error-action::before {
          content: '💡';
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, rgba(176, 38, 255, 0.15), rgba(6, 182, 212, 0.15));
          border: 1px solid rgba(176, 38, 255, 0.25);
          border-radius: 9999px;
          color: #e4e4e7;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .back-link:hover {
          background: linear-gradient(135deg, rgba(176, 38, 255, 0.25), rgba(6, 182, 212, 0.25));
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(176, 38, 255, 0.2);
        }

        .error-code {
          margin-top: 2rem;
          font-size: 0.65rem;
          color: #3f3f46;
          font-family: var(--font-geist-mono, monospace);
        }
      `}</style>

      <div className="error-container">
        <div className="error-card">
          <div className="error-icon">{error.icon}</div>
          <h1 className="error-title">{error.title}</h1>
          <p className="error-message">{error.message}</p>
          <div className="error-action">{error.action}</div>

          <Link href="/" className="back-link">
            ← Back to DTL Nightly
          </Link>

          <div className="error-code">
            Error: {reason ?? 'unknown'}
          </div>
        </div>
      </div>
    </>
  );
}
