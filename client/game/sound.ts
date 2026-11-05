import type { Game } from "../types/domain.ts";

/** Volume groups, each with its own slider: stones (place/capture/pass) and countdown voice. */
export type SoundGroup = "stone" | "voice";
export type MoveSound = "stone" | "capture" | "pass";

type MoveSnapshot = Pick<Game, "id" | "history" | "captureCount" | "playMoves">;

/** Which move sound (if any) a new snapshot of the same game should play. */
export function moveSoundFor(
  previous: MoveSnapshot | undefined,
  next: MoveSnapshot,
): MoveSound | undefined {
  if (!previous || previous.id !== next.id) return undefined;
  const previousLength = previous.history?.length ?? 0;
  const nextLength = next.history?.length ?? 0;
  if (nextLength > previousLength && next.history?.at(-1)?.action === "pass") return "pass";
  if ((next.captureCount ?? 0) > (previous.captureCount ?? 0)) return "capture";
  if ((next.playMoves ?? 0) > (previous.playMoves ?? 0)) return "stone";
  return undefined;
}

export function clampVolume(value: number, fallback = 0.5): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

type AudioContextLike = Pick<
  AudioContext,
  "state" | "resume" | "createGain" | "createBufferSource" | "decodeAudioData" | "destination"
>;

export type SoundPlayerOptions = {
  /** Returns undefined when Web Audio is unavailable; the player then falls back to <audio>. */
  createContext?: () => AudioContextLike | undefined;
  fetchAudio?: (src: string) => Promise<ArrayBuffer>;
  createElement?: (src: string) => HTMLAudioElement;
};

/**
 * Plays short sounds through Web Audio: each file is fetched and decoded once, and every play
 * starts a fresh source node. That avoids the dropped or late sounds you get from rewinding one
 * shared <audio> element, and works on mobile once the context is unlocked by a user gesture.
 */
export class SoundPlayer {
  private context: AudioContextLike | undefined;
  private contextCreated = false;
  private readonly gains = new Map<SoundGroup, GainNode>();
  private readonly volumes = new Map<SoundGroup, number>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private readonly active = new Map<SoundGroup, Set<AudioBufferSourceNode>>();
  private readonly elements = new Map<string, HTMLAudioElement>();
  private readonly createContext: () => AudioContextLike | undefined;
  private readonly fetchAudio: (src: string) => Promise<ArrayBuffer>;
  private readonly createElement: (src: string) => HTMLAudioElement;

  constructor(options: SoundPlayerOptions = {}) {
    this.createContext = options.createContext ?? defaultContext;
    this.fetchAudio = options.fetchAudio ?? defaultFetchAudio;
    this.createElement = options.createElement ?? ((src) => new Audio(src));
  }

  setVolume(group: SoundGroup, volume: number): void {
    const safe = clampVolume(volume);
    this.volumes.set(group, safe);
    const gain = this.gains.get(group);
    if (gain) gain.gain.value = safe;
  }

  volume(group: SoundGroup): number {
    return this.volumes.get(group) ?? 0.5;
  }

  /** Starts loading files ahead of time so the first play isn't delayed. */
  preload(sources: readonly string[]): void {
    for (const src of sources) void this.buffer(src);
  }

  play(src: string, group: SoundGroup): void {
    const context = this.audioContext();
    if (!context) {
      this.playElement(src, group);
      return;
    }
    void this.buffer(src).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain(context, group));
      const playing = this.activeSources(group);
      playing.add(source);
      source.addEventListener("ended", () => playing.delete(source));
      source.start();
    });
  }

  stop(group: SoundGroup): void {
    for (const source of this.activeSources(group)) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.activeSources(group).clear();
    for (const [key, element] of this.elements) {
      if (!key.startsWith(`${group}:`)) continue;
      element.pause();
      element.currentTime = 0;
    }
  }

  /**
   * Browsers keep audio suspended until the user interacts with the page; resume on the first
   * gesture and stop listening once audio is running.
   */
  unlockOn(target: EventTarget): void {
    const events = ["pointerdown", "keydown", "touchend"];
    const unlock = () => {
      const context = this.audioContext();
      if (!context) return remove();
      if (context.state === "running") return remove();
      void context.resume().then(() => {
        if (context.state === "running") remove();
      }).catch(() => {});
    };
    const remove = () => {
      for (const type of events) target.removeEventListener(type, unlock);
    };
    for (const type of events) target.addEventListener(type, unlock);
  }

  private audioContext(): AudioContextLike | undefined {
    if (!this.contextCreated) {
      this.contextCreated = true;
      try {
        this.context = this.createContext();
      } catch {
        this.context = undefined;
      }
    }
    return this.context;
  }

  private gain(context: AudioContextLike, group: SoundGroup): GainNode {
    let gain = this.gains.get(group);
    if (!gain) {
      gain = context.createGain();
      gain.gain.value = this.volume(group);
      gain.connect(context.destination);
      this.gains.set(group, gain);
    }
    return gain;
  }

  private buffer(src: string): Promise<AudioBuffer | undefined> {
    let buffer = this.buffers.get(src);
    if (!buffer) {
      const context = this.audioContext();
      buffer = context
        ? this.fetchAudio(src)
          .then((data) => context.decodeAudioData(data))
          .catch(() => {
            // Allow a retry later (e.g. the network dropped).
            this.buffers.delete(src);
            return undefined;
          })
        : Promise.resolve(undefined);
      this.buffers.set(src, buffer);
    }
    return buffer;
  }

  private activeSources(group: SoundGroup): Set<AudioBufferSourceNode> {
    let sources = this.active.get(group);
    if (!sources) {
      sources = new Set();
      this.active.set(group, sources);
    }
    return sources;
  }

  /** Fallback for browsers without Web Audio: the previous <audio> element behaviour. */
  private playElement(src: string, group: SoundGroup): void {
    const key = `${group}:${src}`;
    let element = this.elements.get(key);
    if (!element) {
      element = this.createElement(src);
      element.preload = "auto";
      this.elements.set(key, element);
    }
    element.volume = this.volume(group);
    element.currentTime = 0;
    void element.play().catch(() => {});
  }
}

function defaultContext(): AudioContextLike | undefined {
  const Context = globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context() : undefined;
}

async function defaultFetchAudio(src: string): Promise<ArrayBuffer> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`audio ${src}: ${response.status}`);
  return await response.arrayBuffer();
}
