// src/lib/utils/speechSynthesis.ts
// Cross-browser Web Speech API wrapper for DTL safety prompts.
// Handles iOS Safari quirks, mobile gesture unlocking, and voice selection.

/**
 * Internal state for the speech synthesis module.
 * Tracks whether the browser has been "unlocked" for speech via a user gesture.
 */
let isUnlocked = false;
let preferredVoice: SpeechSynthesisVoice | null = null;

/**
 * Selects the best available voice for safety prompts.
 * Prefers female English voices for clarity in high-stress situations.
 * Falls back to any available English voice, then system default.
 */
function selectVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Priority 1: Female English voices (common high-quality names)
  const femaleNames = ['samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'google us english', 'google uk english female', 'microsoft zira'];
  const femaleVoice = voices.find(v =>
    v.lang.startsWith('en') &&
    femaleNames.some(name => v.name.toLowerCase().includes(name))
  );
  if (femaleVoice) return femaleVoice;

  // Priority 2: Any English voice
  const englishVoice = voices.find(v => v.lang.startsWith('en'));
  if (englishVoice) return englishVoice;

  // Priority 3: System default
  return voices[0] || null;
}

/**
 * Unlocks the speech synthesis engine on iOS Safari.
 * Must be called from a user gesture (touchstart/click) context.
 * Safe to call multiple times — only runs once.
 */
export function unlockSpeech(): void {
  if (isUnlocked) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Speak an empty utterance to satisfy iOS Safari's autoplay policy
  const unlockUtterance = new SpeechSynthesisUtterance('');
  unlockUtterance.volume = 0;
  window.speechSynthesis.speak(unlockUtterance);
  isUnlocked = true;

  // Refresh voice list (some browsers load voices asynchronously)
  preferredVoice = selectVoice();
}

/**
 * Speaks the given text using the Web Speech API.
 * 
 * Features:
 * - Cancel-before-speak pattern (prevents iOS queue buildup)
 * - Automatic voice selection (prefers female English)
 * - Configurable rate, pitch, and volume
 * 
 * @param text - The text to speak
 * @param options - Optional configuration
 * @returns Promise that resolves when speech completes, rejects on error
 */
export function speak(
  text: string,
  options?: {
    rate?: number;    // 0.1 to 10, default 1.0
    pitch?: number;   // 0 to 2, default 1.0
    volume?: number;  // 0 to 1, default 1.0
    urgent?: boolean; // If true, interrupts any current speech immediately
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      reject(new Error('Speech synthesis not available'));
      return;
    }

    const synth = window.speechSynthesis;

    // Cancel-before-speak: prevents iOS Safari from queuing utterances
    // and playing them all at once after a delay
    if (options?.urgent !== false) {
      synth.cancel();
    }

    // Ensure voice is selected (handles async voice loading)
    if (!preferredVoice) {
      preferredVoice = selectVoice();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = preferredVoice;
    utterance.rate = options?.rate ?? 0.95;   // Slightly slower for clarity
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.volume = options?.volume ?? 1.0;
    utterance.lang = 'en-US';

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      // 'interrupted' and 'canceled' are normal when cancel-before-speak fires
      if (event.error === 'interrupted' || event.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    synth.speak(utterance);

    // Chrome bug workaround: speech can pause indefinitely on long text.
    // Resume every 10 seconds to keep it alive.
    const resumeInterval = setInterval(() => {
      if (synth.speaking) {
        synth.resume();
      } else {
        clearInterval(resumeInterval);
      }
    }, 10000);

    utterance.onend = () => {
      clearInterval(resumeInterval);
      resolve();
    };
  });
}

/**
 * Checks if Web Speech API is available in the current browser.
 */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Stops any currently playing speech immediately.
 */
export function stopSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Pre-built safety prompt sequences for the DTL Safety Dashboard.
 * Each prompt has a text and optional delay before speaking.
 */
export const SAFETY_PROMPTS = {
  alarmSet: 'Your alarm has been set. Stay safe.',
  alarmCheck: 'Can you hear me clearly? If you need help, press the emergency button.',
  alarmConfirm: 'Are you sure you want to cancel the alarm?',
  panicActivated: 'Emergency alert activated. Help is on the way. Stay where you are.',
  safeWalkStart: 'Safe walk mode activated. Your route is being monitored.',
  safeWalkEnd: 'You have arrived at your destination safely. Safe walk ended.',
  geofenceAlert: (venueName: string, deal: string) =>
    `You are near ${venueName}. ${deal}`,
} as const;

// Auto-initialize voice list when the module loads
if (typeof window !== 'undefined' && window.speechSynthesis) {
  // Voices may load asynchronously in some browsers
  window.speechSynthesis.onvoiceschanged = () => {
    preferredVoice = selectVoice();
  };
  // Try immediate selection too
  preferredVoice = selectVoice();
}
