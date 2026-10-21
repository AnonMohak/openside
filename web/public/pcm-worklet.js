/**
 * AudioWorkletProcessor that forwards raw mic PCM to the main thread.
 *
 * Each render quantum hands us 128 Float32 samples in [-1, 1]. We post a COPY
 * of the channel data (the underlying buffer is recycled by the audio engine
 * after process() returns, so a plain reference would be clobbered). The main
 * thread accumulates these and packs them into 24-bit chunks - see usePcmCapture.
 *
 * With no input connected (mid device switch) we still post a quantum of
 * silence, so the captured sample count - the WAV's clock - keeps advancing in
 * step with real time instead of the audio after the switch landing early.
 */
class PCMWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    this.port.postMessage(ch ? ch.slice() : new Float32Array(128));
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorklet);
