import type { Container, Texture } from 'pixi.js';
import { SceneLoader, createSceneRuntime, type SceneState, type PersistentWorldSnapshot } from './scene-loader';
import type { SceneDefinition } from './scene-definition';
import { computeEntry, type SceneEntry } from './scene-entry';
import { SceneView, type SceneViewHooks } from './scene-view';
import type { BrowserAudioBackend } from '../audio/backend';
import { SaveCodec, type GameSaveV1, type Result, type SaveEligibility } from './save-codec';
import { saveContentHash } from './save-codec';

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
  /** Independent resource ownership for transactional candidate visits. */
  fork?(): SceneProvider;
  readonly contentId?: string;
};

export type SceneSessionOptions = {
  audioBackend?: BrowserAudioBackend;
  /** Called when the SCC names a scene that is not in the prepared manifest. */
  onUnsupported?: (scene: number) => void;
  /** Called when a known scene fails to load; the current scene stays active. */
  onLoadError?: (scene: number, error: Error) => void;
  saveUiBusy?: () => boolean;
  onRestoreCommit?: (inventory: readonly number[]) => void;
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
  readonly contentId: string;
  constructor(
    private readonly definitions: ReadonlyMap<number, SceneDefinition>,
    private readonly backgrounds: ReadonlyMap<number, Texture>,
  ) {
    this.ids = [...definitions.keys()].sort((a, b) => a - b);
    this.contentId = saveContentHash(this.ids.map(id => `${id}:${definitions.get(id)?.scc ?? ''}`).join('\n'));
  }
  fork(): SceneProvider { return new MapSceneProvider(this.definitions, this.backgrounds); }
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
  const order = definition.declarationOrder ?? [
    ...[...definition.objects.values()].map(({ name }) => ({ kind: 'Object' as const, name })),
    ...[...definition.active.values()].map(({ name }) => ({ kind: 'Active' as const, name })),
    ...[...definition.lights.values()].map(({ name }) => ({ kind: 'Light' as const, name })),
  ];
  const seen = new Set<string>();
  for (const identity of order) {
    const key = `${identity.kind}:${identity.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const declarations = identity.kind === 'Object' ? definition.objects : identity.kind === 'Active' ? definition.active : definition.lights;
    const declaration = declarations.get(identity.name);
    if (!declaration) continue;
    loader.declareObject(state, {
      name: declaration.name, state: 0, depth: declaration.depth, kind: identity.kind,
      cursorId: declaration.cursorId,
      ...(identity.kind === 'Active' ? { rect: declaration.rect, visible: false } : {}),
      ...(identity.kind === 'Light' ? { visible: false } : {}),
      depthProvenance: { kind: 'declaration', detail: `Level${definition.id}.scc ${identity.kind}` },
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
  private loaderValue: SceneLoader;
  get loader(): SceneLoader { return this.loaderValue; }
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
  private provider: SceneProvider;
  private readonly options: SceneSessionOptions;
  private pendingSource = 'SCC';
  private loaded?: { id: number; scene: LoadedScene };
  private pendingLoad?: PendingLoad;
  private loadToken = 0;
  private restoring = false;
  private postTick = false;

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
    this.loaderValue = new SceneLoader(() => this.view?.scc.cancelActive());
  }

  get supportedScenes(): number[] { return [...this.provider.ids].sort((a, b) => a - b); }
  get isRestoring(): boolean { return this.restoring; }
  /** Pure, detached snapshot of canonical scene state plus the active live pose. */
  capturePersistentState(): PersistentWorldSnapshot {
    const live = this.view?.capturePersistentState();
    return this.loader.exportPersistentState(
      this.supportedScenes,
      this.view?.definition.id ?? this.loader.active?.id ?? null,
      live,
    );
  }
  canSave(): SaveEligibility {
    if (this.restoring) return { ok:false, code:'Busy', reason:'session restore is in progress' };
    if (!this.view || !this.loaded || this.view.definition.id !== this.loaded.id || this.loader.active?.id !== this.view.definition.id) return { ok:false, code:'Busy', reason:'no fully active scene' };
    if (this.loader.pending || this.pendingLoad) return { ok:false, code:'TransitionInProgress', reason:'a scene transition or resource load is pending' };
    if (!this.postTick || this.view.inTick) return { ok:false, code:'Busy', reason:'save is only allowed at a post-tick boundary' };
    const reason = this.view.saveBlockReason();
    if (reason) return { ok:false, code:'Busy', reason };
    if (this.options.saveUiBusy?.()) return {ok:false,code:'Busy',reason:'inventory selection is in progress'};
    return {ok:true};
  }

  exportSave(label: string): Result<GameSaveV1> {
    const eligible = this.canSave();
    if (!eligible.ok) return {ok:false,error:{code:eligible.code,message:eligible.reason}};
    const checkAgain = this.canSave();
    if (!checkAgain.ok) return {ok:false,error:{code:checkAgain.code,message:checkAgain.reason}};
    const activeLevel = this.view!.definition.id;
    const snapshot = this.capturePersistentState();
    const save: GameSaveV1 = {
      format:'agent-revers.game-save', schemaVersion:1,
      contentId:this.provider.contentId ?? saveContentHash(this.supportedScenes.join(',')),
      createdAt:new Date().toISOString(), label,
      world:{...snapshot, activeLevel, currentSceneId:activeLevel},
    };
    return SaveCodec.validate(save,{contentId:save.contentId,sceneIds:this.supportedScenes});
  }

  /** Prepare a detached candidate; only after it is render-ready do we invalidate and swap visits. */
  async importSave(save: GameSaveV1): Promise<Result<void>> {
    if (this.restoring) return {ok:false,error:{code:'Busy',message:'another restore is already in progress'}};
    const checked=SaveCodec.validate(save,{contentId:this.provider.contentId,sceneIds:this.supportedScenes});
    if (!checked.ok) return checked;
    const candidateProvider=this.provider.fork?.();
    if (!candidateProvider) return {ok:false,error:{code:'RestoreFailed',message:'provider does not support isolated resource ownership'}};
    this.restoring=true;
    const token=++this.loadToken;
    let candidateView: SceneView | undefined;
    const candidateLoader=new SceneLoader(()=>candidateView?.scc.cancelActive());
    candidateLoader.restorePersistentState(save.world);
    let candidateScene: LoadedScene | undefined;
    let committed=false;
    try {
      candidateScene=await candidateProvider.load(save.world.activeLevel);
      if(token!==this.loadToken) throw new Error('restore superseded');
      const savedScene=save.world.scenes.find(scene=>scene.id===save.world.activeLevel)!;
      if((save.world.hero?.mode ?? 'navigation')==='navigation'&&!candidateScene.definition.animations.has('Stop0')) throw Object.assign(new Error('Active scene has no Stop0 hero pose'),{code:'IncompatibleSave'});
      const validateSceneResources=(sceneId:number, definition:SceneDefinition) => {
        const saved=save.world.scenes.find(scene=>scene.id===sceneId)!;
        for(const item of saved.objects) if(!item.placeholder) {
          const declared=item.kind==='Active'?definition.active:item.kind==='Light'?definition.lights:item.kind==='Object'?definition.objects:undefined;
          if(declared && ![...declared.keys()].some(name=>name.toUpperCase()===item.name.toUpperCase())) throw Object.assign(new Error(`Unknown ${item.kind} identity ${item.name} in scene ${sceneId}`),{code:'IncompatibleSave'});
          if(item.image.kind!=='mult') continue;
          const reference=item.image.reference;
          const animation=definition.animations.get(reference.file);
          const record=animation?.file.frames[reference.frame-1]?.find(value=>value.slot===reference.slot&&value.child===reference.child);
          if(!record || record.name.toUpperCase()!==item.name.toUpperCase()) throw Object.assign(new Error(`Invalid MULT identity ${item.name} in scene ${sceneId}`),{code:'IncompatibleSave'});
        }
      };
      // Validate every visited scene's real Animation → Frame → Slot → Child → Object chain.
      validateSceneResources(save.world.activeLevel,candidateScene.definition);
      for(const saved of save.world.scenes) if(saved.initialized && saved.id!==save.world.activeLevel) {
        const loaded=await candidateProvider.load(saved.id);
        try { validateSceneResources(saved.id,loaded.definition); }
        finally { candidateProvider.release?.(saved.id,loaded); }
        if(token!==this.loadToken) throw new Error('restore superseded');
      }
      const state=candidateLoader.state(save.world.activeLevel);
      state.portals=candidateScene.definition.portals; state.focus=[...candidateScene.definition.focus];
      declareSceneObjects(candidateLoader,state,candidateScene.definition);
      const hooks: SceneViewHooks={
        level:(scene,portal)=>{candidateLoader.schedule(scene,portal);},
        lstate:(scene,name,value)=>candidateLoader.lstate(scene,name,value),
        setZone:zone=>candidateLoader.unlockMapZone(zone), setMap:bank=>candidateLoader.setMapBank(bank),
        readState:(scene,name)=>candidateLoader.readState(scene,name),
      };
      candidateView=this.options.createView?.(candidateScene.definition,state,candidateScene.background,hooks,candidateLoader.inventory)
        ?? new SceneView(candidateScene.definition,state,candidateScene.background,hooks,candidateLoader.inventory,this.options.audioBackend);
      candidateLoader.active=state;
      const candidateRuntime=createSceneRuntime(save.world.activeLevel);
      candidateRuntime.resources.add({destroy:()=>candidateView?.dispose()});
      candidateLoader.runtime=candidateRuntime;
      const savedHeroObject=savedScene.objects.find(item=>item.name.toUpperCase()==='MAINHERO');
      const heroImage=savedHeroObject?.image.kind==='mult'?savedHeroObject.image.reference:undefined;
      candidateView.restoreHero(save.world.hero?.mode ?? 'navigation', save.world.hero?.position ?? savedScene.savedPosition, save.world.hero?.transform, heroImage);
      if(token!==this.loadToken) throw new Error('restore superseded');
      // Atomic commit starts here. The candidate is complete and has its own provider lease.
      const oldView=this.view, oldLoaded=this.loaded, oldProvider=this.provider, oldLoader=this.loaderValue, oldHadRuntime=Boolean(this.loaderValue.runtime);
      this.stage.addChild(candidateView.root);
      this.view=candidateView; this.loaded={id:save.world.activeLevel,scene:candidateScene};
      this.provider=candidateProvider;
      this.loaderValue=candidateLoader;
      this.pendingLoad=undefined;
      this.loaderValue.pending=undefined;
      committed=true;
      this.entry=undefined;
      this.lastTransition={scene:save.world.activeLevel,portal:-1};
      oldLoader.disposeRuntime();
      if(oldView && !oldHadRuntime) oldView.dispose();
      if(oldLoaded) oldProvider.release?.(oldLoaded.id,oldLoaded.scene);
      candidateView.dispatchStart();
      this.options.onRestoreCommit?.(candidateLoader.inventory);
      this.transitionLog.push(`restore->${save.world.activeLevel}`);
      this.loadError=undefined;
      this.postTick=false;
      return {ok:true,value:undefined};
    } catch(error) {
      if(!committed) {
        candidateView?.dispose();
        if(candidateScene) candidateProvider.release?.(save.world.activeLevel,candidateScene);
      }
      const code=(error as {code?:string})?.code;
      return {ok:false,error:{code:committed?'RestoreFailed':code==='IncompatibleSave'?'IncompatibleSave':'ResourceLoadFailed',message:error instanceof Error?error.message:String(error),cause:error}};
    } finally { this.restoring=false; }
  }
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
    this.postTick=false;
    if (this.restoring) return false;
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

  /** Called by the application immediately after the completed view tick. */
  markPostTick(): void { this.postTick=true; }

  private startLoad(id: number): void {
    const provider=this.provider;
    const token = ++this.loadToken;
    const record: PendingLoad = { id, token, settled: false };
    this.pendingLoad = record;
    try {
      const result = provider.load(id);
      if (result instanceof Promise) {
        result.then(
          (scene) => {
            if (this.pendingLoad === record && record.token === this.loadToken) {
              record.scene = scene;
              record.settled = true;
            } else {
              // The request was superseded before the resources arrived.
              provider.release?.(id, scene);
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
      setZone: (zone) => this.loader.unlockMapZone(zone),
      setMap: (bank) => this.loader.setMapBank(bank),
      readState: (targetScene, name) => this.loader.readState(targetScene, name),
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
