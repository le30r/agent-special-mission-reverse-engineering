# Browser audio backend

`BrowserAudioBackend` is an independent Web Audio service. Resource URLs are opaque identifiers; the module does not parse or assign meaning to SCC commands.

```ts
const audio = new BrowserAudioBackend({ maxCacheBytes: 32 * 1024 * 1024 });
// Call from a click/key gesture so browsers can unlock playback.
await audio.resume();
const playback = await audio.play('/resources/sounds/clip.wav');
playback.stop(); // Or await playback.finished for natural completion.
await audio.dispose();
```

`play()` rejects with `AudioLoadError` for HTTP, fetch, decode, and start failures; a cancelled request rejects with `AudioAbortedError`. Distinct calls create distinct source nodes, so overlapping playback is supported. Decoded buffers use an approximate PCM memory size and an LRU cache (32 MiB by default); oversized buffers play but are not cached. `release(url)` drops one buffer and `clearCache()` drops all cached buffers.

For scene/request ownership, create an `AudioResourceScope` per lifetime and call `scope.dispose()` on scene change. It aborts pending fetches, stops playbacks created through that scope, and releases the decoded buffers it referenced from the LRU cache. The backend itself should be disposed when its owner is torn down.

The backend delegates codec decoding to `decodeAudioData`; codec support varies by browser. See [WAV format report](../../research/audio/WAV_FORMATS.md). Convert unsupported originals in a separate preparation output with:

```sh
node scripts/convert-wav-for-browser.mjs agent-original/game-resources/block0/Sound public/resources/sound
```

The converter preserves the directory layout, writes 16-bit PCM WAVs, and never writes into the source directory. The standalone [audio smoke page](../../audio-smoke.html) generates a small PCM tone and starts playback only in response to its button click.
