export type ClipResult = 'ended' | 'skipped' | 'error';
export type ClipPhase = 'idle' | 'loading' | 'playing' | 'finishing';
export type ClipRequest = { originalName: string; ignoredSccArg: number };
export type PreparedClip = { url: string; duration: number; width: number; height: number; sourceSha256: string };
export type VideoManifest = { clips: Record<string, PreparedClip> };

/** Owns the single session-wide video element and its modal playback lifecycle. */
export class VideoPlaybackController {
  private phaseValue: ClipPhase = 'idle';
  private generation = 0;
  private video?: HTMLVideoElement;
  private panel?: HTMLDivElement;
  private presentationRect?: DOMRect;
  private playButton?: HTMLButtonElement;
  private skipButton?: HTMLButtonElement;
  private listeners: Array<() => void> = [];
  private resultValue?: { originalName: string; result: ClipResult; error?: string };
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly loadManifest: () => Promise<VideoManifest> = async () => {
      const response = await fetch('/generated/video/manifest.json');
      if (!response.ok) throw new Error(`video manifest HTTP ${response.status}`);
      return response.json() as Promise<VideoManifest>;
    },
  ) {}

  get phase(): ClipPhase { return this.phaseValue; }
  get active(): boolean { return this.phaseValue === 'loading' || this.phaseValue === 'playing'; }
  get result(): Readonly<{ originalName: string; result: ClipResult; error?: string }> | undefined { return this.resultValue; }
  get element(): HTMLVideoElement | undefined { return this.video; }

  begin(request: ClipRequest): boolean {
    if (this.disposed) return false;
    if (this.active) {
      console.warn(`Concurrent SclipW ${request.originalName} while ${this.resultValue?.originalName ?? 'another clip'} is active; request not queued`);
      return false;
    }
    const generation = ++this.generation;
    this.phaseValue = 'loading';
    this.resultValue = undefined;
    const video = document.createElement('video');
    video.className = 'original-video-surface';
    video.playsInline = true;
    video.preload = 'auto';
    video.controls = false;
    video.setAttribute('aria-label', `Оригинальный ролик ${request.originalName}`);
    this.video = video;
    this.createPanel(request.originalName, generation);
    this.panel!.prepend(video);
    const on = (name: string, callback: EventListener) => {
      video.addEventListener(name, callback);
      this.listeners.push(() => video.removeEventListener(name, callback));
    };
    on('loadedmetadata', () => {
      if (!this.isCurrent(generation)) return;
      this.phaseValue = 'playing';
      void this.play(generation);
    });
    on('playing', () => { if (this.isCurrent(generation)) this.phaseValue = 'playing'; });
    on('ended', () => this.finish('ended', generation));
    on('error', () => {
      const mediaError = video.error;
      this.finish('error', generation, `media error ${mediaError?.code ?? 'unknown'} for ${request.originalName}`);
    });
    void this.resolveAndLoad(request, generation);
    return true;
  }

  /** Native any-key and left-button skip. The initiating input must be consumed by the caller. */
  skip(): void { if (this.active) this.finish('skipped', this.generation); }

  position(rect: DOMRect): void {
    this.presentationRect = rect;
    if (!this.panel) return;
    Object.assign(this.panel.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.releaseMedia();
    this.phaseValue = 'idle';
  }

  /** Cancel ownership during a committed scene/load transition; does not resume the old SCC. */
  cancel(): void {
    if (this.active) this.finish('skipped', this.generation);
  }

  private async resolveAndLoad(request: ClipRequest, generation: number): Promise<void> {
    try {
      const manifest = await this.loadManifest();
      if (!this.isCurrent(generation)) return;
      const entry = Object.entries(manifest.clips).find(([name]) => name.toLowerCase() === request.originalName.toLowerCase())?.[1];
      if (!entry?.url) throw new Error(`missing prepared video for ${request.originalName}`);
      this.video!.src = entry.url;
      this.video!.load();
    } catch (error) {
      this.finish('error', generation, error instanceof Error ? error.message : String(error));
    }
  }

  private async play(generation: number): Promise<void> {
    const video = this.video;
    if (!video || !this.isCurrent(generation)) return;
    try {
      await video.play();
      if (this.isCurrent(generation)) this.hideRecoveryControls();
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      const message = error instanceof Error ? error.message : String(error);
      if ((error as DOMException)?.name === 'NotAllowedError') {
        // Browser policy: do not mistake autoplay refusal for EOF; explicit recovery/skip remains available.
        this.showRecoveryControls();
      } else this.finish('error', generation, `cannot play ${this.resultValue?.originalName ?? 'clip'}: ${message}`);
    }
  }

  private finish(result: ClipResult, generation: number, error?: string): void {
    if (!this.isCurrent(generation) || this.phaseValue === 'finishing') return;
    this.phaseValue = 'finishing';
    const originalName = this.panel?.dataset.originalName ?? 'unknown';
    this.resultValue = { originalName, result, ...(error ? { error } : {}) };
    if (error) console.error(`SclipW ${originalName} completed with error: ${error}`);
    this.releaseMedia();
    this.panel?.remove();
    this.panel = undefined;
    this.phaseValue = 'idle';
  }

  private releaseMedia(): void {
    for (const remove of this.listeners.splice(0)) remove();
    const video = this.video;
    this.video = undefined;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
    this.panel?.remove();
    this.panel = undefined;
  }

  private createPanel(originalName: string, generation: number): void {
    const panel = document.createElement('div');
    panel.className = 'original-video-panel';
    panel.dataset.originalName = originalName;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const actions = document.createElement('div');
    actions.className = 'original-video-actions';
    const play = document.createElement('button');
    play.type = 'button'; play.textContent = 'Воспроизвести'; play.hidden = true; play.className = 'original-video-play';
    play.onclick = () => { if (this.isCurrent(generation)) void this.play(generation); };
    const skip = document.createElement('button');
    skip.type = 'button'; skip.textContent = 'Пропустить'; skip.className = 'original-video-skip';
    skip.onclick = () => this.skip();
    actions.append(play, skip);
    panel.append(actions);
    this.host.append(panel);
    this.panel = panel; this.playButton = play; this.skipButton = skip;
    // A new panel must inherit the canvas bounds even without a window resize.
    if (this.presentationRect) this.position(this.presentationRect);
  }

  private showRecoveryControls(): void {
    if (this.playButton) this.playButton.hidden = false;
    if (this.skipButton) this.skipButton.hidden = false;
  }
  private hideRecoveryControls(): void {
    if (this.playButton) this.playButton.hidden = true;
    if (this.skipButton) this.skipButton.hidden = true;
  }
  private isCurrent(generation: number): boolean { return !this.disposed && this.generation === generation && this.active; }
}
