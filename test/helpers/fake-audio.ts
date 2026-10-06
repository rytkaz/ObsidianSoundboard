/** A stand-in for HTMLAudioElement: jsdom cannot play media. */
export class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  static clear() {
    FakeAudio.instances = [];
  }
  /** The element that was created for a vault path. */
  static forPath(path: string) {
    return FakeAudio.instances.find((a) => a.dataset.path === path);
  }

  paused = true;
  loop = false;
  volume = 1;
  currentTime = 0;
  preload = "";
  playCalls = 0;
  dataset: Record<string, string> = {};
  private url = "";

  constructor(src = "") {
    super();
    this.url = src;
    FakeAudio.instances.push(this);
  }

  get src() {
    return this.url;
  }
  /** Like a browser: loading a new source stops playback and rewinds, then reports when it is ready. */
  set src(value: string) {
    this.url = value;
    this.paused = true;
    this.currentTime = 0;
    queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  }

  play() {
    this.paused = false;
    this.playCalls++;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  /** Simulates a non-looping sound reaching its end. */
  end() {
    this.paused = true;
    this.dispatchEvent(new Event("ended"));
  }
  load() {}
  removeAttribute(name: string) {
    if (name === "src") this.url = "";
  }
}
