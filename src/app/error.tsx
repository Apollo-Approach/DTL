'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-4">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <div className="bg-red-500/10 text-red-500 p-4 rounded mb-4 max-w-2xl overflow-auto w-full">
        <pre className="whitespace-pre-wrap">{error.message}</pre>
        {error.stack && (
          <pre className="whitespace-pre-wrap mt-4 text-xs opacity-75">{error.stack}</pre>
        )}
      </div>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
