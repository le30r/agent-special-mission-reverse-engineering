import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { AnimationPlayer, parseAnimationDeclarations } from '../src/animation/player';

describe('MULT animation clock', () => {
  it('loads Anim and Animc rates/loop semantics from original SCC declarations', async () => {
    const [level, hero] = await Promise.all([
      readFile('public/resources/Level1.scc', 'utf8'),
      readFile('public/resources/Mainhero.scc', 'utf8'),
    ]);
    const declarations = parseAnimationDeclarations(level, hero);
    expect(declarations.get('Takedr1')).toEqual({ rate: 12, loop: false });
    expect(declarations.get('Walk0')).toEqual({ rate: 32, loop: true });
    expect(declarations.get('Walk1')).toEqual({ rate: 36, loop: true });
    expect(declarations.get('Stop6')).toEqual({ rate: 1, loop: false });
  });

  it('starts at 1-based frame 1 and cycles sequentially without a ping-pong reset', () => {
    const player = new AnimationPlayer([{ name: 'Walk0', rate: 32, frameCount: 3, loop: true, locomotion: true }]);
    expect(player.start('Walk0')).toBe(true);
    expect(player.state('Walk0')).toEqual({ frame: 1, elapsed: 0, active: true });
    expect(player.advance(31).map(event => event.frame)).toEqual([2]);
    expect(player.advance(31).map(event => event.frame)).toEqual([3]);
    expect(player.advance(31).map(event => event.frame)).toEqual([1]);
    expect(player.isActive('Walk0')).toBe(true);
  });

  it('single-shot Anim finishes after its declared interval and stays on its last image', () => {
    const player = new AnimationPlayer([{ name: 'Stop6', rate: 1, frameCount: 1, loop: false }]);
    player.start('Stop6');
    expect(player.advance(999)).toEqual([]);
    expect(player.isActive('Stop6')).toBe(true);
    expect(player.advance(1)).toEqual([{ name: 'Stop6', previousFrame: 1, frame: 1, active: false, frameChanged: false }]);
    expect(player.isActive('Stop6')).toBe(false);
    expect(player.state('Stop6')?.frame).toBe(1);
  });

  it('keeps the internal cursor at frameCount+1 after a completed final-frame sound range', () => {
    const player = new AnimationPlayer([{ name: 'LastSound', rate: 10, frameCount: 17, loop: false }]);
    player.start('LastSound');
    player.setCursor('LastSound', 18);
    expect(player.state('LastSound')?.frame).toBe(18);
    expect(player.advance(100)).toEqual([{ name: 'LastSound', previousFrame: 18, frame: 18, active: false, frameChanged: false }]);
    expect(player.isActive('LastSound')).toBe(false);
  });

  it('SCC Stop deactivates and resets the frame to 1 without rewriting the image', () => {
    const player = new AnimationPlayer([{ name: 'Slip', rate: 4, frameCount: 9, loop: true }]);
    player.start('Slip');
    player.advance(500);
    expect(player.state('Slip')?.frame).toBe(3);
    player.stop('Slip', true);
    expect(player.state('Slip')).toEqual({ frame: 1, elapsed: 0, active: false });
    expect(player.advance(1000)).toEqual([]);
  });

  it('direction changes stop the previous Walk track; stop pose cannot be overwritten by a stale loop', () => {
    const player = new AnimationPlayer([
      { name: 'Walk6', rate: 32, frameCount: 3, loop: true, locomotion: true },
      { name: 'Walk0', rate: 32, frameCount: 3, loop: true, locomotion: true },
      { name: 'Stop0', rate: 1, frameCount: 1, loop: false },
      { name: 'Takedr1', rate: 12, frameCount: 4, loop: false },
    ]);
    player.selectLocomotion('Walk6');
    player.advance(62);
    expect(player.state('Walk6')?.frame).toBe(3);
    player.selectLocomotion('Walk0');
    expect(player.isActive('Walk6')).toBe(false);
    expect(player.state('Walk0')).toEqual({ frame: 1, elapsed: 0, active: true });
    player.stopLocomotion();
    player.start('Stop0');
    expect(player.isActive('Walk0')).toBe(false);
    player.advance(1000);
    expect(player.isActive('Stop0')).toBe(false);
    player.start('Takedr1');
    expect([...player.states].filter(([, state]) => state.active).map(([name]) => name)).toEqual(['Takedr1']);
  });
});
