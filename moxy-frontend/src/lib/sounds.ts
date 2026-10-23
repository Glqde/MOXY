// src/lib/sounds.ts
// Notification sounds, synthesized with the Web Audio API — no audio files to
// load. Respects the "Sound alerts" setting.

import { useUIStore } from "@/store";

export type SoundName = "complete" | "undo" | "create" | "delete";

// [frequency Hz, start offset s] — rising chime for completions, softer
// falling pair for undos, quick bright pop for creating, low drop for deleting
const TONES: Record<SoundName, { notes: [number, number][]; gain: number }> = {
  complete: { notes: [[784, 0], [988, 0.09], [1319, 0.18]], gain: 0.18 },
  undo: { notes: [[659, 0], [494, 0.11]], gain: 0.12 },
  create: { notes: [[880, 0], [1175, 0.06]], gain: 0.15 },
  delete: { notes: [[392, 0], [262, 0.1]], gain: 0.14 },
};

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

// Browsers keep audio suspended until the user interacts with the page, so
// sounds triggered by realtime events would otherwise be silent
export function unlockAudioOnFirstGesture(): void {
  const unlock = () => {
    audioContext()?.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function playSound(name: SoundName): void {
  if (!useUIStore.getState().soundEnabled) return;
  const ac = audioContext();
  if (!ac || ac.state !== "running") return;

  const { notes, gain } = TONES[name];
  const now = ac.currentTime;
  for (const [freq, offset] of notes) {
    const osc = ac.createOscillator();
    const env = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Fast attack, exponential decay — a soft bell rather than a beep
    env.gain.setValueAtTime(0.0001, now + offset);
    env.gain.exponentialRampToValueAtTime(gain, now + offset + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
    osc.connect(env).connect(ac.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.4);
  }
}
