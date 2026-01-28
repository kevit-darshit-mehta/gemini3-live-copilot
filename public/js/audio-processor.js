/**
 * AudioWorklet Processor for real-time audio processing
 * Handles:
 * 1. Input: Downsampling to 16kHz and conversion to Int16 PCM (for Gemini)
 * 2. Output: Buffering 24kHz PCM for playback (from Gemini)
 */

class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.targetSampleRate = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];

    // Downsample and buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      // When buffer is full, process and send
      if (this.bufferIndex >= this.bufferSize) {
        this.flush();
      }
    }

    return true;
  }

  flush() {
    if (this.bufferIndex === 0) return;

    // Create a copy of the buffer up to current index
    const data = this.buffer.slice(0, this.bufferIndex);

    // Send to main thread for resampling and encoding
    this.port.postMessage({
      type: "audio_data",
      audio: data,
      sampleRate: sampleRate, // The current AudioContext sample rate
    });

    this.bufferIndex = 0;
  }
}

registerProcessor("audio-recorder-processor", AudioRecorderProcessor);
