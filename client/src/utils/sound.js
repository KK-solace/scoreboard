const SOUND_FILES = {
  countdown: '/sounds/countdown.wav',
  go: '/sounds/go.wav',
  positive: '/sounds/positive.wav',
  negative: '/sounds/negative.wav',
  tick: '/sounds/tick.wav',
  timeUp: '/sounds/time-up.wav',
  roundComplete: '/sounds/round-complete.wav',
  winner: '/sounds/winner.wav',
};

const audioCache = new Map();

export function preloadSounds() {
  for (const [key, src] of Object.entries(SOUND_FILES)) {
    if (!audioCache.has(key)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audioCache.set(key, audio);
    }
  }
}

export function playSound(category, settings) {
  if (!settings?.soundEnabled) return;
  if (settings?.soundCategories && settings.soundCategories[category] === false) return;

  const src = SOUND_FILES[category];
  if (!src) return;

  try {
    const base = audioCache.get(category) || new Audio(src);
    const instance = base.cloneNode(true);
    instance.volume = Math.max(0, Math.min(1, Number(settings.soundVolume ?? 0.8)));
    instance.play().catch(() => {
      // Ignore autoplay blocks before first user gesture
    });
  } catch {
    // Ignore audio errors on headless/restricted environments
  }
}
