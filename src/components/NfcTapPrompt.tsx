'use client';

// src/components/NfcTapPrompt.tsx
// Web NFC Progressive Enhancement — Sprint 5
//
// On supported devices (Android Chrome 89+), provides an in-app
// "Tap to Redeem" button that reads NTAG 424 DNA tags via the
// Web NFC API (NDEFReader) without leaving the app.
//
// On unsupported devices (iOS, desktop), this component renders nothing.
// Those users rely on the physical QR code printed alongside the NFC tag.

import { useState, useCallback } from 'react';

type NfcState = 'idle' | 'scanning' | 'success' | 'error';

interface NfcTapPromptProps {
  /** Optional class name for the container */
  className?: string;
}

export default function NfcTapPrompt({ className }: NfcTapPromptProps) {
  const [state, setState] = useState<NfcState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Only render on devices that support Web NFC
  if (typeof window === 'undefined' || !('NDEFReader' in window)) {
    return null;
  }

  const handleTap = useCallback(async () => {
    setState('scanning');
    setErrorMsg('');

    try {
      // @ts-expect-error — NDEFReader is not in lib.dom.d.ts yet
      const reader = new window.NDEFReader();
      await reader.scan();

      reader.onreading = (event: { message: { records: Array<{ recordType: string; data: ArrayBuffer }> } }) => {
        setState('success');

        // Extract URL from NDEF records
        for (const record of event.message.records) {
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            const url = decoder.decode(record.data);

            // Navigate to the verification endpoint
            if (url.includes('/api/nfc/verify') || url.includes('e=') || url.includes('picc_data=')) {
              window.location.href = url;
              return;
            }
          }
        }

        // If no URL record found, try to reconstruct from the raw data
        setErrorMsg('Tag read but no verification URL found. Try the QR code instead.');
        setState('error');
      };

      reader.onreadingerror = () => {
        setState('error');
        setErrorMsg('Could not read the NFC tag. Try holding your phone steady on the tag.');
      };
    } catch (err: unknown) {
      setState('error');
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMsg('NFC permission denied. Please allow NFC access in your browser settings.');
      } else {
        setErrorMsg('NFC scanning failed. Try using the QR code instead.');
      }
    }
  }, []);

  return (
    <>
      <style>{`
        .nfc-prompt {
          width: 100%;
          max-width: 380px;
          margin: 0 auto;
        }

        .nfc-tap-btn {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 1.5rem;
          background: linear-gradient(135deg, rgba(176, 38, 255, 0.12), rgba(6, 182, 212, 0.12));
          border: 2px dashed rgba(176, 38, 255, 0.3);
          border-radius: 1.25rem;
          color: #e4e4e7;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: inherit;
        }

        .nfc-tap-btn:hover {
          background: linear-gradient(135deg, rgba(176, 38, 255, 0.2), rgba(6, 182, 212, 0.2));
          border-color: rgba(176, 38, 255, 0.5);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(176, 38, 255, 0.15);
        }

        .nfc-tap-btn:active {
          transform: translateY(0);
        }

        .nfc-icon {
          font-size: 2.5rem;
        }

        .nfc-label {
          font-size: 1rem;
          font-weight: 600;
        }

        .nfc-sublabel {
          font-size: 0.75rem;
          color: #71717a;
        }

        .nfc-scanning {
          border-color: rgba(6, 182, 212, 0.5);
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(176, 38, 255, 0.1));
          animation: nfcPulse 2s ease-in-out infinite;
          cursor: default;
        }

        @keyframes nfcPulse {
          0%, 100% { 
            border-color: rgba(6, 182, 212, 0.3);
            box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.2);
          }
          50% { 
            border-color: rgba(6, 182, 212, 0.6);
            box-shadow: 0 0 20px 5px rgba(6, 182, 212, 0.1);
          }
        }

        .nfc-scanning .nfc-icon {
          animation: nfcBounce 1.5s ease-in-out infinite;
        }

        @keyframes nfcBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        .nfc-error-msg {
          margin-top: 0.75rem;
          padding: 0.6rem 1rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 0.75rem;
          font-size: 0.8rem;
          color: #fca5a5;
          text-align: center;
          line-height: 1.5;
        }
      `}</style>

      <div className={`nfc-prompt ${className ?? ''}`}>
        <button
          type="button"
          className={`nfc-tap-btn ${state === 'scanning' ? 'nfc-scanning' : ''}`}
          onClick={state === 'scanning' ? undefined : handleTap}
          disabled={state === 'scanning'}
        >
          <span className="nfc-icon">
            {state === 'idle' && '📲'}
            {state === 'scanning' && '📡'}
            {state === 'success' && '✅'}
            {state === 'error' && '⚠️'}
          </span>
          <span className="nfc-label">
            {state === 'idle' && 'Tap to Redeem'}
            {state === 'scanning' && 'Hold phone on tag...'}
            {state === 'success' && 'Tag found!'}
            {state === 'error' && 'Try again'}
          </span>
          <span className="nfc-sublabel">
            {state === 'idle' && 'Place your phone on the NFC coaster'}
            {state === 'scanning' && 'Waiting for NFC tag...'}
            {state === 'success' && 'Redirecting to your offer...'}
            {state === 'error' && 'Tap to retry'}
          </span>
        </button>

        {state === 'error' && errorMsg && (
          <div className="nfc-error-msg">{errorMsg}</div>
        )}
      </div>
    </>
  );
}
