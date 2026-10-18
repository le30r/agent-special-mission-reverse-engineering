import type { Container, Texture } from 'pixi.js';
import { SceneLoader, type SceneState } from './scene-loader';
import type { SceneDefinition } from './scene-definition';
import { computeEntry, type SceneEntry } from './scene-entry';
import { SceneView, type SceneViewHooks } from './scene-view';

export type SceneSessionOptions = {
  /** Called when an SCC `Level` names a scene that has no prepared definition. */
  onUnsupported?: (scene: number) => void;
};

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

/**
 * Binds the long-lived SceneLoader to disposable Pixi views. Transitions are only
 * scheduled here (`Level` or the debug controls) and are applied by `flush()` at the
 * game-loop scene boundary, which mirrors the original deferred switch.
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
  private pendingSource = 'SCC';
  constructor(
    private readonly stage: Container,
    private readonly definitions: ReadonlyMap<number, SceneDefinition>,
    private readonly backgrounds: ReadonlyMap<number, Texture>,
    private readonly options: SceneSessionOptions = {},
  ) {
    this.loader = new SceneLoader(() => this.view?.scc.cancelActive());
  }

  get supportedScenes(): number[] { return [...this.definitions.keys()]; }

  /** SCC `Level <scene> <portal>` and the temporary debug controls share this entry point. */
  request(scene: number, portal: number, source = 'SCC'): void {
    this.pendingSource = source;
    this.loader.schedule(scene, portal);
  }

  flush(): boolean {
    const pending = this.loader.pending;
    if (!pending) return false;
    const definition = this.definitions.get(pending.scene);
    if (!definition) {
      this.loader.pending = undefined;
      this.options.onUnsupported?.(pending.scene);
      return false;
    }
    // The background is preloaded, so building the view needs no asynchronous work.
    const background = this.backgrounds.get(pending.scene)!;
    const from = this.view?.definition.id;
    const source = this.pendingSource;
    this.lastTransition = { scene: pending.scene, portal: pending.portal };
    let entering: SceneView | undefined;
    const hooks: SceneViewHooks = {
      level: (scene, portal) => this.request(scene, portal),
      lstate: (scene, name, value) => this.loader.lstate(scene, name, value),
      setZone: (zone) => { this.loader.game.zone = zone; },
    };
    const switched = this.loader.enterPending(
      (state: SceneState, runtime, _firstEntry) => {
        state.portals = definition.portals;
        state.focus = [definition.focus[0], definition.focus[1], definition.focus[2]];
        // Declarations keep Object and Active identities; declareObject merges the
        // long-lived State/depth/MULT reference/visibility of an already visited scene.
        declareSceneObjects(this.loader, state, definition);
        const view = new SceneView(definition, state, background, hooks, this.loader.inventory);
        entering = view;
        runtime.resources.add({ destroy: () => view.dispose() });
      },
      (state, portal) => {
        this.entry = computeEntry(this.definitions.get(state.id)!, state, portal);
        entering!.placeHero(this.entry);
        entering!.startPose();
      },
      () => entering!.dispatchStart(),
      () => {
        this.initRuns.set(pending.scene, (this.initRuns.get(pending.scene) ?? 0) + 1);
        entering!.dispatchInit();
      },
    );
    if (!switched || !entering) return false;
    this.stage.addChild(entering.root);
    this.view = entering;
    this.transitionLog.push(`${from ?? 'boot'}->${pending.scene}:${pending.portal}[${source}]`);
    this.pendingSource = 'SCC';
    return true;
  }
}
