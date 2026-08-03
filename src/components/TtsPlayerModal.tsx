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
  const [rate, setRate] = useState<number>(1.0); // Speed: 0.5 to 2.0
  const [volume, setVolume] = useState<number>(0.8); // Volume: 0 to 1
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number>(-1);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      
      const updateVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Select a default English voice (preferably premium/natural if available)
        const englishVoice = availableVoices.find(
          (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
        ) || availableVoices.find((v) => v.lang.startsWith("en")) || availableVoices[0];

        if (englishVoice && !selectedVoiceName) {
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

        {/* Live Audio Visualizer Animation */}
        <div
          className={`flex flex-col items-center justify-center py-6 rounded-2xl mb-6 border ${
            isDarkMode ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-100"
          }`}
        >
          {/* Wave visualizer */}
          <div className="flex items-end justify-center gap-[4px] h-12 mb-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((bar) => {
              // Vary animation delay to look natural
              const delay = `${(bar * 0.15).toFixed(2)}s`;
              const height = isPlaying && !isPaused ? "animate-pulse" : "h-2";
              return (
                <div
                  key={bar}
                  className={`w-[4px] bg-gradient-to-t from-teal-brand to-teal-400 rounded-full transition-all`}
                  style={{
                    height: isPlaying && !isPaused ? "100%" : "8px",
                    animationDuration: isPlaying && !isPaused ? "1.2s" : "0s",
                    animationDelay: delay,
                    animationIterationCount: "infinite",
                    animationTimingFunction: "ease-in-out",
                    maxHeight: `${Math.sin(bar * 0.4) * 24 + 28}px`,
                  }}
                />
              );
            })}
          </div>

          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase select-none">
            {isPlaying
              ? isPaused
                ? "BROADCAST PAUSED"
                : "BROADCAST ACTIVE (TTS)"
              : "READY TO BROADCAST"}
          </p>

          {currentParagraphIndex !== -1 && (
            <div className="mt-3 px-4 text-center">
              <span className="text-[10px] font-bold bg-teal-brand/10 text-teal-brand dark:text-teal-400 px-2 py-0.5 rounded-full">
                {getPartLabel(currentParagraphIndex)}
              </span>
            </div>
          )}
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
                  onChange={(e) => {
                    setSelectedVoiceName(e.target.value);
                    if (isPlaying && !isPaused) {
                      // Restart current paragraph with new voice
                      setTimeout(() => playPart(currentParagraphIndex), 100);
                    }
                  }}
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
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setRate(val);
                        // If speech is currently running, we can dynamic change rate
                        if (isPlaying && synthRef.current) {
                          // Restart current paragraph to apply speed change immediately
                          const curIdx = currentParagraphIndex;
                          synthRef.current.cancel();
                          playPart(curIdx);
                        }
                      }}
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
