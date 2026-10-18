import type { Container, Texture } from 'pixi.js';
import { SceneLoader, type SceneState } from './scene-loader';
import type { SceneDefinition } from './scene-definition';
import { computeEntry, type SceneEntry } from './scene-entry';
import { SceneView, type SceneViewHooks } from './scene-view';
import type { BrowserAudioBackend } from '../audio/backend';

/** Resources prepared for one scene visit; released when the scene is left. */
export type LoadedScene = { definition: SceneDefinition; background: Texture };

/**
 * Source of scene data. `load` may be synchronous (tests with a pre-built map) or
 * asynchronous (the lazy browser manifest provider).
 */
export type SceneProvider = {
  readonly ids: readonly number[];
  has(id: number): boolean;
  load(id: number): LoadedScene | Promise<LoadedScene>;
  release?(id: number, scene: LoadedScene): void;
};

export type SceneSessionOptions = {
  audioBackend?: BrowserAudioBackend;
  /** Called when the SCC names a scene that is not in the prepared manifest. */
  onUnsupported?: (scene: number) => void;
  /** Called when a known scene fails to load; the current scene stays active. */
  onLoadError?: (scene: number, error: Error) => void;
  /** Test seam; production uses the real Pixi SceneView. */
  createView?: (
    definition: SceneDefinition,
    state: SceneState,
    background: Texture,
    hooks: SceneViewHooks,
    inventory: number[],
  ) => SceneView;
};

/** Synchronous provider used by tests and by pre-built in-memory catalogs. */
class MapSceneProvider implements SceneProvider {
  readonly ids: number[];
  constructor(
    private readonly definitions: ReadonlyMap<number, SceneDefinition>,
    private readonly backgrounds: ReadonlyMap<number, Texture>,
  ) {
    this.ids = [...definitions.keys()].sort((a, b) => a - b);
  }
  has(id: number): boolean { return this.definitions.has(id) && this.backgrounds.has(id); }
  load(id: number): LoadedScene {
    const definition = this.definitions.get(id);
    const background = this.backgrounds.get(id);
    if (!definition || !background) throw new Error(`Scene ${id} has no prepared definition/background`);
    return { definition, background };
  }
}

/** Copies a scene's Object, Active and Light declarations into its long-lived state. */
export function declareSceneObjects(loader: SceneLoader, state: SceneState, definition: SceneDefinition): void {
  for (const declaration of definition.objects.values()) {
    loader.declareObject(state, {
      name: declaration.name, state: 0, depth: declaration.depth, kind: 'Object',
      depthProvenance: { kind: 'declaration', detail: `Level${definition.id}.scc Object` },
    });
  }
  for (const declaration of definition.active.values()) {
    loader.declareObject(state, {
      name: declaration.name, state: 0, depth: declaration.depth,
      rect: declaration.rect, kind: 'Active', visible: false,
      depthProvenance: { kind: 'declaration', detail: `Level${definition.id}.scc Active` },
    });
  }
  for (const declaration of definition.lights.values()) {
    loader.declareObject(state, {
      name: declaration.name, state: 0, depth: declaration.depth, kind: 'Light', visible: false,
      depthProvenance: { kind: 'declaration', detail: `Level${definition.id}.scc Light` },
    });
  }
}

type PendingLoad = {
  id: number;
  token: number;
  settled: boolean;
  scene?: LoadedScene;
  error?: Error;
};

/**
 * Binds the long-lived SceneLoader to disposable Pixi views. Transitions are only
 * scheduled here (`Level` or the debug controls) and are applied by `flush()` at
 * the game-loop scene boundary, which mirrors the original deferred switch.
 *
 * A scene's resources are loaded on demand. While an asynchronous load is in
 * flight the old scene remains active; when it completes the old view and its
 * textures are released and the new definition is entered exactly once.
 */
export class SceneSession {
  readonly loader: SceneLoader;
  view?: SceneView;
  entry?: SceneEntry;
  /** Portal arguments of the last applied transition, for the debug readout. */
  lastTransition?: { scene: number; portal: number };
  /** Number of real SCC `Init` dispatches per scene (must stay 1 on re-entry). */
  readonly initRuns = new Map<number, number>();
  /** Ordered transition log; the source distinguishes SCC `Level` from debug controls. */
  readonly transitionLog: string[] = [];
  /** Last asynchronous load failure, retained for the debug panel. */
  loadError?: { scene: number; message: string };
  private readonly provider: SceneProvider;
  private readonly options: SceneSessionOptions;
  private pendingSource = 'SCC';
  private loaded?: { id: number; scene: LoadedScene };
  private pendingLoad?: PendingLoad;
  private loadToken = 0;

  constructor(
    stage: Container,
    definitions: ReadonlyMap<number, SceneDefinition>,
    backgrounds: ReadonlyMap<number, Texture>,
    options?: SceneSessionOptions,
  );
  constructor(stage: Container, provider: SceneProvider, options?: SceneSessionOptions);
  constructor(
    private readonly stage: Container,
    definitionsOrProvider: ReadonlyMap<number, SceneDefinition> | SceneProvider,
    backgroundsOrOptions?: ReadonlyMap<number, Texture> | SceneSessionOptions,
    maybeOptions: SceneSessionOptions = {},
  ) {
    if ('load' in definitionsOrProvider && 'has' in definitionsOrProvider) {
      this.provider = definitionsOrProvider;
      this.options = (backgroundsOrOptions as SceneSessionOptions | undefined) ?? {};
    } else {
      this.provider = new MapSceneProvider(
        definitionsOrProvider as ReadonlyMap<number, SceneDefinition>,
        (backgroundsOrOptions as ReadonlyMap<number, Texture> | undefined) ?? new Map(),
      );
      this.options = maybeOptions;
    }
    this.loader = new SceneLoader(() => this.view?.scc.cancelActive());
  }

  get supportedScenes(): number[] { return [...this.provider.ids].sort((a, b) => a - b); }
  /** Scene currently being fetched, if any (debug/loading indicator). */
  get loading(): number | undefined {
    return this.pendingLoad && !this.pendingLoad.settled ? this.pendingLoad.id : undefined;
  }

  /** SCC `Level <scene> <portal>` and the temporary debug controls share this entry point. */
  request(scene: number, portal: number, source = 'SCC'): void {
    // A debug jump is an explicit override: stop running cutscene Programs so a
    // later `Level` from the old scene cannot overwrite the requested scene.
    // Ordinary SCC transitions keep the original last-writer-wins behavior.
    if (source === 'debug') this.view?.scc.cancelActive();
    this.pendingSource = source;
    this.loader.schedule(scene, portal);
  }

  flush(): boolean {
    const pending = this.loader.pending;
    if (!pending) return false;
    const { scene: id, portal } = pending;
    if (!this.provider.has(id)) {
      this.loader.pending = undefined;
      this.options.onUnsupported?.(id);
      return false;
    }
    if (this.pendingLoad?.id === id) {
      if (!this.pendingLoad.settled) return false;
      const load = this.pendingLoad;
      this.pendingLoad = undefined;
      if (load.error) {
        this.loader.pending = undefined;
        this.loadError = { scene: id, message: load.error.message };
        this.options.onLoadError?.(id, load.error);
        return false;
      }
      return this.enter(id, portal, load.scene!);
    }
    if (this.loaded?.id === id) {
      // The original engine does not reload or re-Init a scene whose pointer is
      // already active; a same-scene Level request is a no-op. A load for another
      // scene that is still in flight becomes stale and is released on arrival.
      this.loader.pending = undefined;
      if (this.pendingLoad && this.pendingLoad.id !== id) {
        this.pendingLoad = undefined;
        this.loadToken++;
      }
      return false;
    }
    this.startLoad(id);
    return false;
  }

  private startLoad(id: number): void {
    const token = ++this.loadToken;
    const record: PendingLoad = { id, token, settled: false };
    this.pendingLoad = record;
    try {
      const result = this.provider.load(id);
      if (result instanceof Promise) {
        result.then(
          (scene) => {
            if (this.pendingLoad === record && record.token === this.loadToken) {
              record.scene = scene;
              record.settled = true;
            } else {
              // The request was superseded before the resources arrived.
              this.provider.release?.(id, scene);
            }
          },
          (error: unknown) => {
            if (this.pendingLoad === record && record.token === this.loadToken) {
              record.error = error instanceof Error ? error : new Error(String(error));
              record.settled = true;
            }
          },
        );
      } else {
        record.scene = result;
        record.settled = true;
      }
    } catch (error) {
      record.error = error instanceof Error ? error : new Error(String(error));
      record.settled = true;
    }
  }

  private enter(id: number, portal: number, scene: LoadedScene): boolean {
    const from = this.view?.definition.id;
    const source = this.pendingSource;
    this.lastTransition = { scene: id, portal };
    let entering: SceneView | undefined;
    const hooks: SceneViewHooks = {
      level: (nextScene, nextPortal) => this.request(nextScene, nextPortal),
      lstate: (targetScene, name, value) => this.loader.lstate(targetScene, name, value),
      setZone: (zone) => { this.loader.game.zone = zone; },
    };
    const switched = this.loader.enterPending(
      (state: SceneState, runtime) => {
        state.portals = scene.definition.portals;
        state.focus = [scene.definition.focus[0], scene.definition.focus[1], scene.definition.focus[2]];
        // Declarations keep Object and Active identities; declareObject merges the
        // long-lived State/depth/MULT reference/visibility of an already visited scene.
        declareSceneObjects(this.loader, state, scene.definition);
        const view = this.options.createView?.(scene.definition, state, scene.background, hooks, this.loader.inventory)
          ?? new SceneView(scene.definition, state, scene.background, hooks, this.loader.inventory, this.options.audioBackend);
        entering = view;
        runtime.resources.add({ destroy: () => view.dispose() });
      },
      (state, resolvedPortal) => {
        this.entry = computeEntry(scene.definition, state, resolvedPortal);
        entering!.placeHero(this.entry);
        entering!.startPose();
      },
      () => entering!.dispatchStart(),
      () => {
        this.initRuns.set(id, (this.initRuns.get(id) ?? 0) + 1);
        entering!.dispatchInit();
      },
    );
    if (!switched || !entering) {
      this.provider.release?.(id, scene);
      return false;
    }
    this.stage.addChild(entering.root);
    this.view = entering;
    const previous = this.loaded;
    this.loaded = { id, scene };
    // The old view was disposed inside enterPending; release its textures only now.
    if (previous && previous.id !== id) this.provider.release?.(previous.id, previous.scene);
    this.transitionLog.push(`${from ?? 'boot'}->${id}:${portal}[${source}]`);
    this.pendingSource = 'SCC';
    this.loadError = undefined;
    return true;
  }
}
