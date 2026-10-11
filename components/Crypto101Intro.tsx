"use client";

import { useEffect, useRef, useState } from "react";

type Slide = { title: string; durationMs: number; lines: string[] };

const SLIDES: Slide[] = [
  {
    title: "What Is Crypto?",
    durationMs: 17_000,
    lines: [
      "Cryptocurrency is digital money that runs on a blockchain — a public record of transactions kept in sync by thousands of computers, not one bank.",
      "No single company or government controls coins like Bitcoin or Ethereum.",
      "Crypto trades 24/7, which is a big reason prices can move so fast.",
    ],
  },
  {
    title: "How To Trade",
    durationMs: 22_000,
    lines: [
      "Trading means buying a coin when you expect its price to rise, then selling later — hopefully for more than you paid.",
      "On NovaX, sign up, get a starting balance of pretend cash, pick a coin, and buy or sell at real live prices.",
      "Your \"gain/loss\" number is the whole game: did your picks go up or down since you bought them?",
    ],
  },
  {
    title: "Tips For Beginners",
    durationMs: 28_000,
    lines: [
      "Never risk more than you can afford to lose — crypto can swing a lot in one day.",
      "Don't buy just because a coin is spiking. Fast pumps often fall just as fast.",
      "Spread your money across a few coins instead of putting it all into one.",
      "Practice first — that's what NovaX's paper trading is for. Real prices, zero real risk.",
      "This is general education, not financial advice.",
    ],
  },
];

const TICK_MS = 100;
const WATCHED_KEY = "novax_crypto101_watched";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    window.speechSynthesis.speak(utterance);
  } catch {
    // speech synthesis unsupported; captions still carry the content
  }
}

function pauseSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.pause();
    } catch {
      // ignore
    }
  }
}

function resumeSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
  }
}

function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function readWatched(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WATCHED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Crypto101Intro() {
  const [open, setOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [watched, setWatched] = useState(readWatched);
  const slideIndexRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    slideIndexRef.current = slideIndex;
  }, [slideIndex]);

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    return () => stopSpeech();
  }, []);

  function playSlide(index: number) {
    stopSpeech();
    setSlideIndex(index);
    setElapsedMs(0);
    setPlaying(true);
    speak(SLIDES[index].lines.join(" "));
  }

  function finish() {
    setPlaying(false);
    stopSpeech();
    try {
      localStorage.setItem(WATCHED_KEY, "1");
    } catch {
      // ignore
    }
    setWatched(true);
  }

  // Advances elapsed time while playing, and auto-advances to the next
  // slide (or finishes) once a slide's narration duration is up.
  useEffect(() => {
    if (!open || !playing) return;
    const id = setInterval(() => {
      const duration = SLIDES[slideIndexRef.current].durationMs;
      const next = elapsedRef.current + TICK_MS;
      if (next >= duration) {
        if (slideIndexRef.current < SLIDES.length - 1) {
          playSlide(slideIndexRef.current + 1);
        } else {
          finish();
        }
      } else {
        setElapsedMs(next);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [open, playing, slideIndex]);

  function handlePlay() {
    setOpen(true);
    playSlide(0);
  }

  function handleClose() {
    stopSpeech();
    setOpen(false);
    setPlaying(false);
    setSlideIndex(0);
    setElapsedMs(0);
  }

  function handlePrev() {
    if (slideIndex === 0) return;
    playSlide(slideIndex - 1);
  }

  function handleNext() {
    if (slideIndex === SLIDES.length - 1) return;
    playSlide(slideIndex + 1);
  }

  function handleReplay() {
    playSlide(0);
  }

  function handlePause() {
    setPlaying(false);
    pauseSpeech();
  }

  function handleResume() {
    setPlaying(true);
    resumeSpeech();
  }

  const isFinished = slideIndex === SLIDES.length - 1 && elapsedMs >= SLIDES[slideIndex].durationMs;

  if (!open) {
    return (
      <button
        type="button"
        onClick={handlePlay}
        className="w-full flex items-center gap-4 rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/40 p-5 text-left cursor-pointer hover:border-zinc-700"
      >
        <div className="h-12 w-12 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="black">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-100">New to crypto? Watch: Crypto 101</div>
          <div className="text-xs text-zinc-400 mt-0.5">
            What crypto is, how to trade, and beginner tips — about a minute
            {watched && " · ✓ watched"}
          </div>
        </div>
      </button>
    );
  }

  const slide = SLIDES[slideIndex];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          Crypto 101 · {slideIndex + 1}/{SLIDES.length}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="text-zinc-500 hover:text-zinc-200 cursor-pointer text-sm"
        >
          ✕
        </button>
      </div>

      <div className="min-h-[120px] flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">{slide.title}</h2>
        <ul className="flex flex-col gap-1.5 text-sm text-zinc-300">
          {slide.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex gap-1">
        {SLIDES.map((s, i) => (
          <div key={s.title} className="h-1 flex-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{
                width:
                  i < slideIndex
                    ? "100%"
                    : i === slideIndex
                      ? `${Math.min(100, (elapsedMs / s.durationMs) * 100)}%`
                      : "0%",
                transition: "width 100ms linear",
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handlePrev}
            disabled={slideIndex === 0}
            className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            ⏮ Back
          </button>
          {isFinished ? (
            <button
              type="button"
              onClick={handleReplay}
              className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 cursor-pointer"
            >
              ↻ Replay
            </button>
          ) : playing ? (
            <button
              type="button"
              onClick={handlePause}
              className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 cursor-pointer"
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResume}
              className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 cursor-pointer"
            >
              ▶ Resume
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={slideIndex === SLIDES.length - 1}
            className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            Next ⏭
          </button>
        </div>
        <span className="text-xs text-zinc-600">Not financial advice — for learning only.</span>
      </div>
    </div>
  );
}
