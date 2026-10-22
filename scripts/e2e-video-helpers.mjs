/** Retire the real boot Rolik1 through the original F1 skip path before unrelated E2E actions. */
export async function skipStartupVideo(send, evaluate) {
  const deadline = Date.now() + 30_000;
  let found = false;
  while (Date.now() < deadline) {
    const started = await evaluate("window.__videoDebug?.controller.active && window.__videoDebug.controller.element?.src.includes('Rolik1.mp4')");
    if (started) { found = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!found) throw new Error('Timed out waiting for the original startup Rolik1 clip');
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
  const resumedBy = Date.now() + 30_000;
  while (Date.now() < resumedBy) {
    const resumed = await evaluate("window.__videoDebug.controller.result?.result==='skipped' && window.__sccDebug.view()?.state.objects.get('Slip')?.state===1");
    if (resumed) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The original Level1 Init did not resume after F1 skipped Rolik1');
}
