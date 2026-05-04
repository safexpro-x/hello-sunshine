// Browser Web Speech API helpers — production-grade.
// 100% free, no API keys. Best in Chrome / Edge / Android Chrome / desktop Safari (partial).

export type RecognitionHandle = {
  stop: () => void;
  abort: () => void;
};

// ──────────────────────────────────────────────────────────────────────────────
// SpeechRecognition (STT)
// ──────────────────────────────────────────────────────────────────────────────

function getSR(): any {
  if (typeof window === "undefined") return null;
  // @ts-expect-error vendor prefixed
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const isSpeechSupported = () => {
  if (typeof window === "undefined") return false;
  return Boolean(getSR()) && "speechSynthesis" in window;
};

export function startListening(opts: {
  lang?: string;
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}): RecognitionHandle | null {
  const SR = getSR();
  if (!SR) {
    opts.onError?.("speech-not-supported");
    return null;
  }
  const rec = new SR();
  rec.lang = opts.lang ?? "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let stopped = false;

  rec.onstart = () => opts.onStart?.();

  rec.onresult = (e: any) => {
    let interim = "";
    let finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalText.trim()) opts.onResult(finalText.trim(), true);
    else if (interim.trim()) opts.onResult(interim.trim(), false);
  };

  rec.onerror = (e: any) => {
    opts.onError?.(e?.error || "unknown");
  };

  rec.onend = () => {
    if (!stopped) opts.onEnd?.();
    else opts.onEnd?.();
  };

  try {
    rec.start();
  } catch (e) {
    // Already started or not allowed
    opts.onError?.(String((e as Error)?.message || e));
    return null;
  }

  return {
    stop: () => { stopped = true; try { rec.stop(); } catch { /* noop */ } },
    abort: () => { stopped = true; try { rec.abort(); } catch { /* noop */ } },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// SpeechSynthesis (TTS) — robust voice loading + warmup
// ──────────────────────────────────────────────────────────────────────────────

let voicesCache: SpeechSynthesisVoice[] = [];
let voicesReady = false;
let warmedUp = false;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]); return;
    }
    const synth = window.speechSynthesis;
    const v = synth.getVoices();
    if (v && v.length > 0) {
      voicesCache = v; voicesReady = true; resolve(v); return;
    }
    let resolved = false;
    const handler = () => {
      if (resolved) return;
      const list = synth.getVoices();
      if (list && list.length > 0) {
        voicesCache = list; voicesReady = true;
        resolved = true; resolve(list);
      }
    };
    synth.addEventListener?.("voiceschanged", handler);
    // Fallback poll (Safari/iOS sometimes never fires the event)
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const list = synth.getVoices();
      if ((list && list.length > 0) || tries > 20) {
        clearInterval(iv);
        if (!resolved) {
          voicesCache = list || []; voicesReady = true;
          resolved = true; resolve(voicesCache);
        }
      }
    }, 150);
  });
}

// Call once on user gesture to unlock TTS on Safari / iOS / strict autoplay policies.
export function warmupTTS() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (warmedUp) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0; u.rate = 1; u.pitch = 1;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
    warmedUp = true;
  } catch { /* noop */ }
  // Kick voice loading async
  loadVoices();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const list = voicesCache.length ? voicesCache : (typeof window !== "undefined" ? window.speechSynthesis.getVoices() : []);
  if (!list || list.length === 0) return undefined;
  const lc = lang.toLowerCase();
  const base = lc.split("-")[0];
  // Preference: exact lang + female/natural > exact lang > base lang + female/natural > base lang > any
  const niceRe = /female|natural|google|samantha|aria|neural|wavenet|priya|veena|raveena|kalpana/i;
  return (
    list.find((v) => v.lang.toLowerCase() === lc && niceRe.test(v.name)) ||
    list.find((v) => v.lang.toLowerCase() === lc) ||
    list.find((v) => v.lang.toLowerCase().startsWith(base) && niceRe.test(v.name)) ||
    list.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    list[0]
  );
}

export function speak(
  text: string,
  opts?: { lang?: string; onEnd?: () => void; onStart?: () => void; onError?: (e: string) => void }
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    opts?.onEnd?.(); return;
  }
  if (!text || !text.trim()) { opts?.onEnd?.(); return; }

  const lang = opts?.lang ?? "en-US";
  const synth = window.speechSynthesis;

  const doSpeak = () => {
    try { synth.cancel(); } catch { /* noop */ }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.0;
    u.pitch = 1.05;
    u.volume = 1.0;
    const v = pickVoice(lang);
    if (v) u.voice = v;

    let started = false;
    let ended = false;
    u.onstart = () => { started = true; opts?.onStart?.(); };
    u.onend = () => {
      if (ended) return; ended = true;
      opts?.onEnd?.();
    };
    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (ended) return; ended = true;
      opts?.onError?.(e.error || "tts-error");
      opts?.onEnd?.();
    };

    // Chrome quirk: speechSynthesis pauses after ~15s. Keep it alive.
    const keepAlive = setInterval(() => {
      if (ended) { clearInterval(keepAlive); return; }
      if (synth.speaking) {
        try { synth.pause(); synth.resume(); } catch { /* noop */ }
      }
    }, 10000);
    const origEnd = u.onend;
    u.onend = (ev) => { clearInterval(keepAlive); origEnd?.call(u, ev as Event); };

    try {
      synth.speak(u);
    } catch (e) {
      opts?.onError?.(String((e as Error)?.message || e));
      opts?.onEnd?.();
    }

    // Safety: if onstart never fires within 1.2s, force-restart once.
    setTimeout(() => {
      if (!started && !ended) {
        try { synth.cancel(); synth.speak(u); } catch { /* noop */ }
      }
    }, 1200);
  };

  if (voicesReady || (synth.getVoices?.() || []).length > 0) {
    doSpeak();
  } else {
    loadVoices().then(doSpeak);
  }
}

export function cancelSpeak() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}

export function isSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking;
}

// Eager voice load on import (fires once browser is idle)
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadVoices();
}
