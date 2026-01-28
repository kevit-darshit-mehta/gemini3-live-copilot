/**
 * Audio Manager for handling real-time audio I/O
 * capturing 16kHz PCM for Gemini and playing back 24kHz PCM
 */

export class AudioManager {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.mediaStream = null;
    this.isRecording = false;
    this.streamCallback = null;

    // Playback state
    this.nextStartTime = 0;
    this.isPlaying = false;
  }

  async initialize() {
    if (!this.audioContext) {
      this.audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )({
        sampleRate: 48000, // Prefer 48k if possible, matching common HW
        latencyHint: "interactive",
      });

      await this.audioContext.audioWorklet.addModule("/js/audio-processor.js");
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Start recording audio
   * @param {Function} onAudioData Callback(int16Array) - receives 16kHz PCM chunks
   */
  async startRecording(onAudioData) {
    if (this.isRecording) return;

    await this.initialize();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "audio-recorder-processor",
      );

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio_data") {
          const { audio, sampleRate } = event.data;
          const pcm16 = this.downsampleAndConvertToInt16(
            audio,
            sampleRate,
            16000,
          );
          if (pcm16.length > 0) {
            onAudioData(pcm16);
          }
        }
      };

      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination); // Keep graph alive
      this.isRecording = true;
      this.streamCallback = onAudioData;
    } catch (error) {
      console.error("Error starting recording:", error);
      throw error;
    }
  }

  stopRecording() {
    if (!this.isRecording) return;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    this.isRecording = false;
    this.streamCallback = null;
  }

  /**
   * Play PCM Audio Data
   * @param {ArrayBuffer|Int16Array} pcmData 24kHz Int16 PCM
   */
  playAudio(pcmData) {
    if (!this.audioContext) return;

    // Convert Int16 to Float32
    const int16Array =
      pcmData instanceof Int16Array ? pcmData : new Int16Array(pcmData);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    // Create AudioBuffer
    // Gemini output is 24kHz
    const sourceSampleRate = 24000;
    const buffer = this.audioContext.createBuffer(
      1,
      float32Array.length,
      sourceSampleRate,
    );
    buffer.copyToChannel(float32Array, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    // Schedule seamlessly
    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  /**
   * Convert Float32 (Browser) to Int16 (Gemini) with downsampling
   */
  downsampleAndConvertToInt16(inputBuffer, inputSampleRate, targetSampleRate) {
    if (inputSampleRate === targetSampleRate) {
      return this.floatTo16BitPCM(inputBuffer);
    }

    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.ceil(inputBuffer.length / ratio);
    const result = new Int16Array(newLength);

    let offsetResult = 0;
    let offsetInput = 0;

    while (offsetResult < newLength) {
      const nextOffsetInput = Math.round((offsetResult + 1) * ratio);

      // Accumulate values for averaging (simple low-pass filter)
      let accum = 0;
      let count = 0;

      for (
        let i = offsetInput;
        i < nextOffsetInput && i < inputBuffer.length;
        i++
      ) {
        accum += inputBuffer[i];
        count++;
      }

      // Avoid division by zero
      if (count === 0) {
        // Just take the previous sample or 0 if start
        result[offsetResult] = result[offsetResult - 1] || 0;
      } else {
        // Normalize average
        const avg = accum / count;
        // Clamp and convert
        const s = Math.max(-1, Math.min(1, avg));
        result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      offsetResult++;
      offsetInput = nextOffsetInput;
    }

    return result;
  }

  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }
}
