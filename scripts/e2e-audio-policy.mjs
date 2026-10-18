/**
 * Keep Web Audio fully live in Chromium E2E while silencing physical output.
 * Set E2E_MUTE_AUDIO=0 to leave the destination graph untouched.
 */
export async function installE2EAudioPolicy(send) {
  if (process.env.E2E_MUTE_AUDIO === '0') return;
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const connect = AudioBufferSourceNode.prototype.connect;
      AudioBufferSourceNode.prototype.connect = function(destination, ...args) {
        if (destination === this.context.destination) {
          const mute = this.context.createGain();
          mute.gain.value = 0;
          window.__e2eAudioMuteCount = (window.__e2eAudioMuteCount ?? 0) + 1;
          const result = connect.call(this, mute, ...args);
          mute.connect(destination);
          return result;
        }
        return connect.call(this, destination, ...args);
      };
      window.__e2eAudioMuted = true;
    })();`,
  });
}
