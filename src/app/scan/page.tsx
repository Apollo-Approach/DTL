// src/app/scan/page.tsx
'use client';

import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function ScanPage() {
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: 'Awaiting Scan...' });
  const [isScanning, setIsScanning] = useState(true);

  const handleScan = async (text: string) => {
    if (!text || !isScanning) return;
    setIsScanning(false);
    setStatus({ type: 'idle', message: 'Verifying Signature...' });

    try {
      const { verifySignedQrPayload } = await import('@/app/actions/qr');
      const result = await verifySignedQrPayload(text);

      if (result.success) {
        setStatus({ type: 'success', message: 'Valid Promotion QR Code' });
      } else {
        setStatus({ type: 'error', message: result.error || 'Invalid QR Code' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Verification failed.' });
    }

    // Reset scanner after 3.5 seconds
    setTimeout(() => {
      setStatus({ type: 'idle', message: 'Awaiting Scan...' });
      setIsScanning(true);
    }, 3500);
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400 mb-6 text-center">
          Venue Scanner
        </h1>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden p-4 relative shadow-2xl">
          {isScanning ? (
            <div className="rounded-xl overflow-hidden border-2 border-purple-500/50 aspect-square">
              <Scanner 
                onScan={(detectedCodes) => {
                  if (detectedCodes.length > 0) {
                    handleScan(detectedCodes[0].rawValue);
                  }
                }}
                onError={(error: unknown) => console.error(error)} 
              />
            </div>
          ) : (
             <div className="aspect-square flex items-center justify-center bg-black rounded-xl">
              <div className="animate-pulse w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
            </div>
          )}
          
          <div className={`mt-6 p-4 rounded-xl text-center font-bold transition-colors ${
            status.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
            status.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
            'bg-neutral-800 text-neutral-300'
          }`}>
            {status.message}
          </div>
        </div>
        
        <p className="text-neutral-500 text-xs text-center mt-6 uppercase tracking-widest font-bold">
          DTL Nightly Security
        </p>
      </div>
    </main>
  );
}
