# Original WAV format survey

Surveyed the 835 `.WAV` resources under `agent-original/game-resources` (read-only). Headers were parsed as RIFF/WAVE chunks; all 835 had a valid RIFF/WAVE container and a `fmt ` chunk. No original files were modified.

## Summary

| Codec / format tag | Count | Channels | Declared bits | Assessment |
| --- | ---: | --- | ---: | --- |
| Microsoft ADPCM (`WAVE_FORMAT_ADPCM`, tag `0x0002`) | 803 | 1 or 2 | 4 | Not guaranteed by Web Audio `decodeAudioData`; convert for portable browser playback. |
| PCM (`WAVE_FORMAT_PCM`, tag `0x0001`) | 31 | 1 or 2 | 16 | Standard uncompressed WAV; suitable for browser decoding. |
| IMA/DVI ADPCM (`WAVE_FORMAT_DVI_ADPCM`, tag `0x0011`) | 1 | 2 | 4 | Not guaranteed by Web Audio `decodeAudioData`; convert for portable browser playback. |

Sample rates: 22,050 Hz (818 files), 44,100 Hz (11), and 11,025 Hz (6). Channel counts: mono (678) and stereo (157). The 4-bit declaration describes compressed ADPCM samples, not PCM output precision. All sampled profiles are integer PCM or ADPCM; there were no IEEE-float or other codec tags.

## Headers and browser behavior

The files use conventional little-endian RIFF/WAVE containers, not a proprietary outer header. The chunk scan found common optional `fact`, `LIST`, and occasional `cue ` chunks. `fmt ` chunk lengths were 16, 18, 20, or 50 bytes; 50-byte extension chunks carry the ADPCM-specific format extension and coefficient table. Chunk order varies, as permitted by RIFF, and every scanned file ended on a valid chunk boundary. These are valid WAV structures, but the compressed codecs are the interoperability issue: Web Audio leaves accepted encoded formats to the browser implementation, and ADPCM support is not portable across browsers. Normalize to PCM before publishing assets.

## Preparation recommendation

Use FFmpeg to create a separate 16-bit PCM output tree while preserving the original files:

```sh
node scripts/convert-wav-for-browser.mjs <original-sound-directory> <prepared-sound-directory>
```

The converter preserves source sample rate and channel count, changes only the output codec to `pcm_s16le`, and exits on an unreadable/unsupported source instead of silently skipping it. Serve the prepared tree by URL; do not preload the full 835-file corpus. The backend's default decoded-buffer LRU ceiling is 32 MiB, and scene scopes cancel outstanding fetches and stop scene-owned playback on disposal.
