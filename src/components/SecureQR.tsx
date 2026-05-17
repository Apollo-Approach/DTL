// src/components/SecureQR.tsx
'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface SecureQRProps {
  promotionId: string;
  venueName: string;
  discountValue: string;
  title: string;
}

export default function SecureQR({ promotionId, venueName, discountValue, title }: SecureQRProps) {
  const [qrPayload, setQrPayload] = React.useState<string | null>(null);

  React.useEffect(() => {
    // In production, this JSON payload would be cryptographically signed
    const timer = setTimeout(() => {
      setQrPayload(JSON.stringify({
        promo: promotionId,
        timestamp: Date.now()
      }));
    }, 0);
    return () => clearTimeout(timer);
  }, [promotionId]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-w-sm w-full relative mx-auto my-4">
      {/* Ticket Header */}
      <div className="bg-gradient-to-r from-purple-600 to-cyan-500 p-4 text-center">
        <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">{venueName}</p>
        <h3 className="text-2xl font-extrabold text-white">{discountValue}</h3>
      </div>
      
      {/* Ticket Body */}
      <div className="p-6 flex flex-col items-center bg-black">
        <p className="text-neutral-300 text-sm text-center mb-6 font-medium">{title}</p>
        
        <div className="bg-white p-3 rounded-xl shadow-[0_0_20px_rgba(176,38,255,0.3)] w-[204px] h-[204px] flex items-center justify-center">
          {qrPayload ? (
            <QRCodeSVG 
              value={qrPayload} 
              size={180}
              level="H"
              includeMargin={false}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          ) : (
            <div className="w-[180px] h-[180px] bg-neutral-200 animate-pulse"></div>
          )}
        </div>
        
        <p className="text-neutral-600 text-[10px] mt-6 text-center tracking-wide font-mono">
          SECURE TOKEN: {promotionId.split('-')[0].toUpperCase()}
        </p>
      </div>

      {/* Ticket Cutout Effects */}
      <div className="absolute top-[88px] -left-3 w-6 h-6 bg-black rounded-full border-r border-neutral-800"></div>
      <div className="absolute top-[88px] -right-3 w-6 h-6 bg-black rounded-full border-l border-neutral-800"></div>
    </div>
  );
}
