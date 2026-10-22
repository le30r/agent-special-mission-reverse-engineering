import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { MapController, MAP_TARGETS, MAP_ZONES, mapZoneAt, type MapAssets } from '../src/scene/map-controller';
import { SceneLoader } from '../src/scene/scene-loader';
import { SccRuntime } from '../src/scc/runtime';

describe('original map geometry and destinations', () => {
  it('uses strict rectangle edges and ignores locked zones', () => {
    for (let zone = 0; zone < MAP_ZONES.length; zone++) {
      const rect = MAP_ZONES[zone]!;
      const unlocked = Array(7).fill(false); unlocked[zone] = true;
      expect(mapZoneAt(rect.x + rect.width / 2, rect.y + rect.height / 2, unlocked)).toBe(zone);
      expect(mapZoneAt(rect.x, rect.y + rect.height / 2, unlocked)).toBe(-1);
      expect(mapZoneAt(rect.x + rect.width, rect.y + rect.height / 2, unlocked)).toBe(-1);
      expect(mapZoneAt(rect.x + rect.width / 2, rect.y, unlocked)).toBe(-1);
      expect(mapZoneAt(rect.x + rect.width / 2, rect.y + rect.height, unlocked)).toBe(-1);
      expect(mapZoneAt(rect.x + rect.width / 2, rect.y + rect.height / 2, Array(7).fill(false))).toBe(-1);
    }
  });

  it('preserves the exact seven targets in both native banks', () => {
    expect(MAP_TARGETS.map((bank) => bank.map(({ scene, portal }) => [scene, portal]))).toEqual([
      [[47, 0], [45, 0], [39, 0], [1, 0], [41, 0], [46, 0], [44, 0]],
      [[16, 0], [20, 0], [5, 0], [37, 0], [10, 0], [29, 0], [18, 0]],
    ]);
    expect(MAP_ZONES.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [208, 59, 100, 138], [417, 315, 130, 122], [424, 48, 242, 97],
      [269, 153, 230, 143], [0, 157, 205, 177], [570, 216, 230, 167], [128, 384, 215, 216],
    ]);
  });
});

describe('map canonical state and controller lifecycle', () => {
  it('starts fully locked; Setzon only unlocks in its active bank and switching banks retains both', () => {
    const loader = new SceneLoader();
    const state = loader.game.map;
    expect(state.model === 'banked-v1' && state.unlocked).toEqual([Array(7).fill(false), Array(7).fill(false)]);
    const runtime = new SccRuntime('Click 0 Init Interface\n{\nCase 0\nSetzon 3\nSetmap 1\nSetzon 5\nBreak\n}', {
      pathActive: () => false, animationActive: () => false, startAnimation: () => {},
      setPosition: () => {}, setDepth: () => {}, setZone: (zone) => loader.unlockMapZone(zone),
      setMap: (bank) => loader.setMapBank(bank),
    });
    runtime.dispatch('Init', 0);
    expect(loader.game.map).toEqual({ model: 'banked-v1', bank: 1, unlocked: [[false, false, false, true, false, false, false], [false, false, false, false, false, true, false]] });
  });

  it('round-trips both banks through the existing persistent snapshot without transient UI state', () => {
    const loader = new SceneLoader();
    loader.setMapBank(0); loader.unlockMapZone(1);
    loader.setMapBank(1); loader.unlockMapZone(6);
    const snapshot = loader.exportPersistentState([1], 1);
    const restored = new SceneLoader(); restored.restorePersistentState(snapshot);
    expect(restored.game.map).toEqual({ model: 'banked-v1', bank: 1, unlocked: [[false, true, false, false, false, false, false], [false, false, false, false, false, false, true]] });
    expect(snapshot.map).not.toHaveProperty('selected');
    expect(snapshot.map).not.toHaveProperty('phase');
  });

  it('requires the idle gate, opens/closes with F1 or Escape, and does not change world state', async () => {
    const loader = new SceneLoader();
    const before = loader.exportPersistentState([], null);
    let canOpen = false;
    const renderer = { root: new Container(), select: vi.fn(), moveCursor: vi.fn(), tick: vi.fn(), dispose: vi.fn() };
    const assets = { background: { destroy: vi.fn() }, highlights: {}, cursor: {} } as unknown as MapAssets;
    const controller = new MapController(new Container(), {
      map: () => loader.game.map, canOpen: () => canOpen, request: vi.fn(),
      loadAssets: async () => assets, createRenderer: () => renderer,
    });
    controller.toggle();
    expect(controller.phase).toBe('closed');
    canOpen = true;
    controller.toggle();
    await Promise.resolve();
    expect(controller.phase).toBe('open');
    controller.pointerMove(258, 128);
    expect(controller.selected).toBe(-1);
    expect(renderer.select).toHaveBeenLastCalledWith(-1);
    controller.toggle();
    expect(controller.phase).toBe('closed');
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(loader.exportPersistentState([], null)).toEqual(before);
  });

  it('commits only left-clicks on unlocked zones and uses each bank target', async () => {
    for (let bank = 0; bank < 2; bank++) for (let zone = 0; zone < 7; zone++) {
      const loader = new SceneLoader();
      loader.setMapBank(bank); loader.unlockMapZone(zone);
      const request = vi.fn();
      const renderer = { root: new Container(), select: vi.fn(), moveCursor: vi.fn(), tick: vi.fn(), dispose: vi.fn() };
      const controller = new MapController(new Container(), {
        map: () => loader.game.map, canOpen: () => true, request,
        loadAssets: async () => ({ background: { destroy: vi.fn() }, highlights: {}, cursor: {} } as unknown as MapAssets),
        createRenderer: () => renderer,
      });
      controller.toggle(); await Promise.resolve();
      const rect = MAP_ZONES[zone]!;
      controller.pointerMove(rect.x + rect.width / 2, rect.y + rect.height / 2);
      expect(controller.selected).toBe(zone);
      expect(renderer.select).toHaveBeenLastCalledWith(zone);
      controller.pointerDown(2);
      expect(request).not.toHaveBeenCalled();
      controller.pointerDown(0);
      expect(request).toHaveBeenCalledWith(MAP_TARGETS[bank]![zone]!.scene, 0);
      expect(controller.phase).toBe('closed');
      controller.dispose();
    }
  });

  it('ignores stale resource completion after close and reports an open failure without leaving a modal', async () => {
    const loader = new SceneLoader();
    let finish!: (assets: MapAssets) => void;
    const reportError = vi.fn();
    const controller = new MapController(new Container(), {
      map: () => loader.game.map, canOpen: () => true, request: vi.fn(), reportError,
      loadAssets: () => new Promise((resolve) => { finish = resolve; }),
    });
    controller.toggle(); controller.escape();
    const stale = { background: { destroy: vi.fn() }, highlights: {}, cursor: {} } as unknown as MapAssets;
    finish(stale);
    await Promise.resolve();
    expect(controller.phase).toBe('closed');
    expect(stale.background.destroy).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();

    const failing = new MapController(new Container(), {
      map: () => loader.game.map, canOpen: () => true, request: vi.fn(), reportError,
      loadAssets: async () => { throw new Error('missing original map'); },
    });
    failing.toggle(); await Promise.resolve(); await Promise.resolve();
    expect(failing.phase).toBe('closed');
    expect(failing.isOpen).toBe(false);
    expect(reportError).toHaveBeenCalledWith('missing original map');
  });
});
