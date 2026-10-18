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


## SCC Voice contract (D/E/F/G)

Ownership is `scene visit → stable Event Voice → play generation → handle/source`.
Event latch and animation barrier are scheduler state, not playback completion.

| State | Ready for a Web Audio sync range | Exit |
|---|---|---|
| `pending` prepare / needs gesture | No | load/start, explicit failure, Stop/dispose |
| `waiting-context` scheduled source | No | context resumes (same source), Stop/dispose |
| `playing` (ordinary mute included) | No | actual EOF, Stop/replacement/dispose |
| `ended/stopped/replaced/failed/disposed` | Yes | terminal; finished settles once |

Only explicit silent/no-device mode polls the original encoded-duration clock,
strictly `elapsed > duration`, including Repeat. Before its first play ready=true
is browser policy; native initialization was not established. Native raw Stop
leaves the clock untouched; SCC Stop cancels its animation/latch separately.

Preparation failure is explicit skip policy. The backend's `prepareTimeoutMs`
(default 30000) fails and aborts preparation, never declares successful EOF;
there is no duration-based playback or StartW watchdog. Autoplay restrictions
retain pending identity until a real gesture calls unlock. Scheduled sources in
a suspended context resume without creating another source.

A non-repeat replay replaces the current run of that same Voice, aborting old
preparation and stopping old playback. Callback guards include both scene and
run identity. Original format metadata (not the converted browser format) selects
`sharedPcm` resource playback aliases versus independent `privateDecoded` Voices.
Stopping a PCM alias stops the resource's current playback. Decoded AudioBuffer
cache sharing alone never defines Voice identity.

SceneView polls declarations synchronously on each AnimationPlayer step, before
the next catch-up step can consume the modified cursor. Adjacent ranges hand off
in append order in the same pass. Effects use Voice readiness, not a frame-edge
flag; inline Repeat is parsed and retains its native latch for narrow SCC Stop.
Scene disposal cancels all owned work, unlike Stop (first latched declaration).

Regression commands: `pnpm test`, `pnpm build`, `pnpm e2e:browser:wav`, plus the
existing Chromium scene/interaction suites. The WAV fixture uses a disposable,
unmuted page, real corpus WAV decoding, suspended AudioContext, actual EOF and
OfflineAudioContext PCM output; it does not test physical speaker output.
