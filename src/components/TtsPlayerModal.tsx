import React, { useState, useEffect, useRef } from "react";
import { X, Play, Pause, Square, Volume2, VolumeX, Flame, ChevronRight, ChevronLeft, Sliders, Volume1, HelpCircle } from "lucide-react";
import { Devotional } from "../types";

interface TtsPlayerModalProps {
  devotional: Devotional;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function TtsPlayerModal({
  devotional,
  isOpen,
  onClose,
  isDarkMode,
}: TtsPlayerModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");
  const [rate, setRate] = useState<number>(() => {
    // Restore the reader's last chosen speed (0.5x–2.0x) if available.
    try {
      const saved = parseFloat(localStorage.getItem("did_tts_rate") || "1");
      return saved >= 0.5 && saved <= 2 ? saved : 1.0;
    } catch { return 1.0; }
  }); // Speed: 0.5 to 2.0
  const [volume, setVolume] = useState<number>(0.8); // Volume: 0 to 1
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number>(-1);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  // True once the reader manually picks a voice — stops the onvoiceschanged
  // listener from overriding their choice on browsers that fire it repeatedly.
  const userPickedVoiceRef = useRef(false);

  // ── Live visualization + seek ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const barLevelsRef = useRef<number[]>([]);
  const partStartTsRef = useRef(0);
  // 0..1 overall progress across the whole devotional (drives the seek bar).
  const [overallPos, setOverallPos] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [totalEstSec, setTotalEstSec] = useState(0);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);

  // Refs mirroring state so the animation loop & tick never read stale values.
  const isPlayingRef = useRef(isPlaying);
  const isPausedRef = useRef(isPaused);
  const curIdxRef = useRef(currentParagraphIndex);
  const rateRef = useRef(rate);
  isPlayingRef.current = isPlaying;
  isPausedRef.current = isPaused;
  curIdxRef.current = currentParagraphIndex;
  rateRef.current = rate;

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      
      const updateVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        if (userPickedVoiceRef.current) return; // never override a manual choice

        // Restore the reader's saved voice if still installed, else fall back
        // to a default English voice (preferably premium/natural if available).
        let savedVoice = "";
        try { savedVoice = localStorage.getItem("did_tts_voice") || ""; } catch { /* ignore */ }
        const englishVoice =
          availableVoices.find((v) => v.name === savedVoice)
          || availableVoices.find(
              (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
            )
          || availableVoices.find((v) => v.lang.startsWith("en"))
          || availableVoices[0];

        if (englishVoice) {
          setSelectedVoiceName(englishVoice.name);
        }
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      // Clean up voice synthesis if component unmounts
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Stop playing if devotional changes or modal closes
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraphIndex(-1);
    setErrorMessage("");
    setOverallPos(0);
    setElapsedSec(0);
    setTotalEstSec(0);
  }, [devotional.id, isOpen]);

  const speakText = (text: string, onEndCallback: () => void) => {
    if (!synthRef.current) return;

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Set user settings
    const selectedVoice = voices.find((v) => v.name === selectedVoiceName);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.rate = rate;
    utterance.volume = volume;

    utterance.onend = () => {
      onEndCallback();
    };

    utterance.onerror = (e) => {
      // Ignore normal 'interrupted' or 'canceled' events caused by canceling/skipping previous speech segments
      if (e.error === "interrupted" || e.error === "canceled") {
        return;
      }
      console.error("SpeechSynthesisUtterance error:", e.error || e, e);
      
      let msg = "";
      if (e.error === "not-allowed") {
        msg = "Playback blocked by your browser. If you are viewing the preview iframe, please click the 'Open in New Tab' button at the top-right corner to allow speech synthesis.";
      } else if (e.error) {
        msg = `Speech synthesis failed: ${e.error}. Try opening the app in a new tab if this continues.`;
      } else {
        msg = "An unexpected speech synthesis error occurred. Please try opening the app in a new tab.";
      }
      
      setErrorMessage(msg);
      setIsPlaying(false);
      setIsPaused(false);
    };

    partStartTsRef.current = performance.now();
    synthRef.current.speak(utterance);
  };

  // Compile all readable elements of the devotional
  const readableParts = [
    `Title. ${devotional.title}.`,
    `Scripture reference. ${devotional.scriptureRef}.`,
    `Scripture verse. ${devotional.scriptureText}`,
    ...devotional.paragraphs,
    `Prayer and Confession. ${devotional.prayerConfession}`,
    `One Year Bible Reading. ${devotional.bibleReading}`
  ];
  const partsRef = useRef(readableParts);
  partsRef.current = readableParts;

  // Estimated duration (seconds) of one spoken segment: ~15 characters per
  // second at 1.0x reading speed, scaled by the chosen rate.
  const estPartSeconds = (text: string): number =>
    Math.max(2, Math.round(text.length / (15 * (rateRef.current || 1))));
  const estPartSecondsRef = useRef(estPartSeconds);
  estPartSecondsRef.current = estPartSeconds;

  const fmtClock = (sec: number): string => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  // ── Live canvas visualizer + progress ticks ────────────────────────────────
  // The bars react in real time while speaking (smooth random-walk driven by a
  // requestAnimationFrame loop), settle to a low idle state when paused/stopped.
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 520;
    const H = 96;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = "100%";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const BAR_COUNT = 56;
    const gap = 3;
    const bw = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const levels = barLevelsRef.current;
    if (levels.length !== BAR_COUNT) {
      barLevelsRef.current = Array.from({ length: BAR_COUNT }, () => 4);
    }

    const draw = () => {
      const active = isPlayingRef.current && !isPausedRef.current;
      const amp = active ? 1 : 0.08;
      const arr = barLevelsRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        // Random-walk target; bars chase it for an organic "live speech" look.
        const target = (0.2 + Math.random() * 0.8) * H * 0.9 * amp;
        arr[i] += (target - arr[i]) * (active ? 0.32 : 0.1);
      }
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < BAR_COUNT; i++) {
        const h = Math.max(2, arr[i]);
        const x = i * (bw + gap);
        const y = H - h;
        const grad = ctx.createLinearGradient(0, y, 0, H);
        grad.addColorStop(0, active ? "#5eead4" : "#cbd5e1");
        grad.addColorStop(1, active ? "#0d9488" : "#94a3b8");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, h, bw / 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    // Progress tick: elapsed / total estimates across every segment.
    const tick = window.setInterval(() => {
      if (!isPlayingRef.current || isPausedRef.current) return;
      const idx = curIdxRef.current;
      const parts = partsRef.current;
      if (idx < 0 || idx >= parts.length) return;
      let cum = 0;
      for (let i = 0; i < idx; i++) cum += estPartSecondsRef.current(parts[i]);
      const partDur = estPartSecondsRef.current(parts[idx]);
      const elapsedInPart = Math.min(partDur, (performance.now() - partStartTsRef.current) / 1000);
      const total = parts.reduce((s, p) => s + estPartSecondsRef.current(p), 0);
      const pos = total > 0 ? Math.min(1, (cum + elapsedInPart) / total) : 0;
      setTotalEstSec(total);
      setElapsedSec(Math.round(pos * total));
      if (!isDraggingSeek) setOverallPos(pos);
    }, 250);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearInterval(tick);
    };
  }, [isOpen, isDraggingSeek]);

  // Seek across the whole devotional: maps the clicked position to the
  // nearest segment and restarts playback from there (SpeechSynthesis has no
  // intra-utterance seek, so segment-level seeking is the accurate approach).
  const handleSeek = (value: number) => {
    const frac = value / 1000;
    setOverallPos(frac);
    const parts = readableParts;
    const total = parts.reduce((s, p) => s + estPartSeconds(p), 0);
    const targetSec = frac * total;
    let idx = 0;
    let acc = 0;
    for (let i = 0; i < parts.length; i++) {
      const d = estPartSeconds(parts[i]);
      if (acc + d >= targetSec) { idx = i; break; }
      acc += d;
      idx = i + 1;
    }
    idx = Math.min(Math.max(idx, 0), parts.length - 1);
    if (isPlaying || currentParagraphIndex !== -1) {
      playPart(idx);
    } else {
      setCurrentParagraphIndex(idx);
    }
  };

  // Shared handlers for the compact controls (next to the visualizer) and the
  // full settings panel — one behavior, two places.
  const handleVoiceChange = (name: string) => {
    userPickedVoiceRef.current = true;
    setSelectedVoiceName(name);
    try { localStorage.setItem("did_tts_voice", name); } catch { /* ignore */ }
    if (isPlaying && !isPaused) {
      // Restart current paragraph with the new voice immediately.
      setTimeout(() => playPart(currentParagraphIndex), 100);
    }
  };

  const handleRateChange = (val: number) => {
    setRate(val);
    try { localStorage.setItem("did_tts_rate", String(val)); } catch { /* ignore */ }
    if (isPlaying && synthRef.current) {
      // Restart current paragraph to apply the new speed immediately.
      const curIdx = currentParagraphIndex;
      synthRef.current.cancel();
      playPart(curIdx);
    }
  };

  const handlePlayPause = () => {
    if (!synthRef.current) return;
    setErrorMessage(""); // Clear error on interaction

    if (isPlaying) {
      if (isPaused) {
        // Resume
        synthRef.current.resume();
        setIsPaused(false);
      } else {
        // Pause
        synthRef.current.pause();
        setIsPaused(true);
      }
    } else {
      // Start fresh or from last paragraph
      setIsPlaying(true);
      setIsPaused(false);
      
      const startIndex = currentParagraphIndex === -1 ? 0 : currentParagraphIndex;
      playPart(startIndex);
    }
  };

  const playPart = (index: number) => {
    if (index >= readableParts.length) {
      // Finished speaking everything
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentParagraphIndex(-1);
      setOverallPos(1);
      setElapsedSec(totalEstSec || 0);
      return;
    }

    setCurrentParagraphIndex(index);
    speakText(readableParts[index], () => {
      // Speak next part recursively
      playPart(index + 1);
    });
  };

  const handleStop = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraphIndex(-1);
    setOverallPos(0);
    setElapsedSec(0);
    setTotalEstSec(0);
  };

  const handleNextPart = () => {
    if (currentParagraphIndex < readableParts.length - 1) {
      const nextIdx = currentParagraphIndex + 1;
      setIsPlaying(true);
      setIsPaused(false);
      playPart(nextIdx);
    }
  };

  const handlePrevPart = () => {
    if (currentParagraphIndex > 0) {
      const prevIdx = currentParagraphIndex - 1;
      setIsPlaying(true);
      setIsPaused(false);
      playPart(prevIdx);
    }
  };

  // Dynamic label for parts
  const getPartLabel = (idx: number) => {
    if (idx === 0) return "Title";
    if (idx === 1) return "Scripture Reference";
    if (idx === 2) return "Scripture Verse";
    if (idx >= 3 && idx < 3 + devotional.paragraphs.length) {
      return `Body Paragraph ${idx - 2}`;
    }
    if (idx === 3 + devotional.paragraphs.length) return "Prayer & Confession";
    return "One Year Bible Reading";
  };

  if (!isOpen) return null;

  return (
    <div
      id="tts-player-overlay"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        id="tts-player-modal"
        className={`w-full max-w-xl rounded-3xl border shadow-2xl p-6 md:p-8 overflow-hidden transition-all duration-300 transform scale-100 ${
          isDarkMode
            ? "bg-slate-900/90 border-slate-800 text-slate-100 shadow-slate-950/80"
            : "bg-white/90 border-slate-100 text-slate-900 shadow-slate-200/80"
        } backdrop-blur-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="text-left">
            <span className="text-[10px] font-black tracking-widest text-teal-brand dark:text-teal-400 uppercase">
              Audio Broadcast Player
            </span>
            <h3 className="font-serif text-lg md:text-xl font-bold leading-tight mt-1 break-words">
              {devotional.title}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {devotional.date}, {devotional.year} • {devotional.author}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Audio Visualizer — real-time canvas waveform while speaking */}
        <div
          className={`flex flex-col items-center justify-center pt-6 pb-4 px-4 rounded-2xl mb-4 border ${
            isDarkMode ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-100"
          }`}
        >
          <canvas
            ref={canvasRef}
            className="w-full max-w-[520px] select-none"
            aria-label="Live audio visualization"
          />

          <div className="flex items-center gap-2 mt-2">
            <span className={`w-2 h-2 rounded-full transition-colors ${isPlaying && !isPaused ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600"}`} />
            <p className="text-xs font-bold tracking-widest text-slate-400 uppercase select-none">
              {isPlaying
                ? isPaused
                  ? "BROADCAST PAUSED"
                  : "BROADCAST ACTIVE (TTS)"
                : "READY TO BROADCAST"}
            </p>
          </div>

          {/* Quick voice + speed controls — right next to the visualizer */}
          <div className="w-full max-w-[520px] mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
            <div className="min-w-0">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Reader Voice
              </label>
              <select
                value={selectedVoiceName}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className={`w-full text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border truncate focus:outline-none focus:ring-1 focus:ring-teal-brand transition-all ${
                  isDarkMode
                    ? "bg-slate-950/60 border-slate-700 text-slate-200 focus:border-slate-600"
                    : "bg-white border-slate-200 text-slate-800 focus:border-slate-300"
                }`}
                aria-label="Select reader voice"
                title="Choose the voice used to read the devotional"
              >
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
                {voices.length === 0 && (
                  <option>Standard System Voice</option>
                )}
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Speed
                </label>
                <span className="text-[11px] font-bold font-mono text-teal-brand dark:text-teal-400">
                  {rate}x
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-400">0.5</span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={rate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full accent-teal-brand cursor-pointer"
                  aria-label="Reading speed"
                  title="Adjust reading speed from 0.5x to 2.0x"
                />
                <span className="text-[9px] font-mono text-slate-400">2.0</span>
              </div>
            </div>
          </div>

          {currentParagraphIndex !== -1 && (
            <div className="mt-2.5 px-4 text-center">
              <span className="text-[10px] font-bold bg-teal-brand/10 text-teal-brand dark:text-teal-400 px-2 py-0.5 rounded-full">
                {getPartLabel(currentParagraphIndex)}
              </span>
            </div>
          )}
        </div>

        {/* Seek bar — drag to jump to any point of the devotional */}
        <div className="mb-6 px-1">
          <input
            type="range"
            min="0"
            max="1000"
            step="1"
            value={Math.round(overallPos * 1000)}
            onPointerDown={() => setIsDraggingSeek(true)}
            onChange={(e) => handleSeek(parseInt(e.target.value, 10))}
            onPointerUp={() => setIsDraggingSeek(false)}
            onPointerLeave={() => setIsDraggingSeek(false)}
            className="w-full accent-teal-brand cursor-pointer"
            aria-label="Seek through devotional"
          />
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 mt-1">
            <span className="text-teal-brand dark:text-teal-400">{fmtClock(elapsedSec)}</span>
            <span className="text-slate-300 dark:text-slate-600">| {getPartLabel(currentParagraphIndex === -1 ? 0 : currentParagraphIndex)} |</span>
            <span>{fmtClock(totalEstSec)}</span>
          </div>
        </div>

        {/* Dynamic error or permission block troubleshooting alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs text-left leading-normal flex items-start gap-2.5 animate-in fade-in duration-300">
            <svg
              className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Spoken Text Highlight Box */}
        <div
          className={`p-4 rounded-xl mb-6 border h-28 overflow-y-auto text-sm italic font-medium leading-relaxed ${
            isDarkMode
              ? "bg-slate-950/20 border-slate-800/80 text-slate-300"
              : "bg-slate-100/50 border-slate-200/60 text-slate-600"
          }`}
        >
          {currentParagraphIndex !== -1 ? (
            <span className="animate-in fade-in duration-300">
              {readableParts[currentParagraphIndex]}
            </span>
          ) : (
            <span className="text-slate-400 text-center block mt-6">
              Press Play to start the high-fidelity devotional reading.
            </span>
          )}
        </div>

        {/* Audio Controllers / Buttons */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={handlePrevPart}
            disabled={currentParagraphIndex <= 0}
            className={`p-2.5 rounded-full border transition-all ${
              currentParagraphIndex > 0
                ? "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 active:scale-95"
                : "opacity-30 cursor-not-allowed border-slate-200 dark:border-slate-900 text-slate-400"
            }`}
            title="Previous segment"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            onClick={handlePlayPause}
            className="w-14 h-14 rounded-full bg-teal-brand hover:bg-teal-brand/90 active:scale-95 text-white flex items-center justify-center transition-all shadow-lg shadow-teal-500/20 shrink-0"
            title={isPlaying && !isPaused ? "Pause" : "Play"}
          >
            {isPlaying && !isPaused ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={handleStop}
            disabled={!isPlaying && currentParagraphIndex === -1}
            className={`p-3 rounded-full border transition-all ${
              isPlaying || currentParagraphIndex !== -1
                ? "hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 border-red-200 dark:border-red-900/50 active:scale-95"
                : "opacity-30 cursor-not-allowed border-slate-200 dark:border-slate-900 text-slate-400"
            }`}
            title="Stop broadcast"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={handleNextPart}
            disabled={currentParagraphIndex === -1 || currentParagraphIndex >= readableParts.length - 1}
            className={`p-2.5 rounded-full border transition-all ${
              currentParagraphIndex !== -1 && currentParagraphIndex < readableParts.length - 1
                ? "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 active:scale-95"
                : "opacity-30 cursor-not-allowed border-slate-200 dark:border-slate-900 text-slate-400"
            }`}
            title="Next segment"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Voice & Settings Toggle */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl transition-all ${
              showSettings
                ? "bg-slate-100 dark:bg-slate-800 text-teal-brand dark:text-teal-400"
                : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Broadcast Controls & Voice Settings
              </span>
            </div>
            <span className="text-xs font-bold">
              {showSettings ? "Hide" : "Show"}
            </span>
          </button>

          {showSettings && (
            <div className="space-y-4 mt-4 px-2 py-1 animate-in fade-in duration-200 text-left">
              {/* Voice Selection */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Select Reader Voice
                </label>
                <select
                  value={selectedVoiceName}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-teal-brand ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-200 focus:border-slate-600"
                      : "bg-slate-50 border-slate-200 text-slate-800 focus:border-slate-300"
                  }`}
                >
                  {voices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                  {voices.length === 0 && (
                    <option>Standard System Voice</option>
                  )}
                </select>
              </div>

              {/* Volume & Speed Sliders in Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Speed Rate slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Reading Speed (Rate)
                    </label>
                    <span className="text-xs font-bold font-mono text-teal-brand dark:text-teal-400">
                      {rate}x
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">0.5x</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={rate}
                      onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                      className="w-full accent-teal-brand"
                    />
                    <span className="text-xs font-mono text-slate-400">2.0x</span>
                  </div>
                </div>

                {/* Volume slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Volume Level
                    </label>
                    <span className="text-xs font-bold font-mono text-teal-brand dark:text-teal-400">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume1 className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.1"
                      value={volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        if (isPlaying && synthRef.current) {
                          // Restart to apply volume change immediately
                          const curIdx = currentParagraphIndex;
                          synthRef.current.cancel();
                          playPart(curIdx);
                        }
                      }}
                      className="w-full accent-teal-brand"
                    />
                    <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
