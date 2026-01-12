const WebSocket = require('ws');

console.log('Testing WhisperLive transcription...');

const ws = new WebSocket('ws://127.0.0.1:9090');

let transcriptReceived = false;
let audioSent = false;

ws.on('open', () => {
  console.log('Connected to WhisperLive');
  
  const initMsg = {
    uid: `test-transcript-${Date.now()}`,
    model: 'faster-whisper-small',
    language: 'en',
    task: 'transcribe',
    use_vad: false,
    initial_prompt: 'Test transcription.'
  };
  
  ws.send(JSON.stringify(initMsg));
  console.log('Sent init message');
});

ws.on('message', (data) => {
  const text = data.toString();
  console.log('Received:', text.substring(0, 200));
  
  if (text.includes('SERVER_READY')) {
    console.log('WhisperLive is ready! Sending audio...');
    
    // Send 2 seconds of audio with some speech-like content
    const sampleRate = 16000;
    const duration = 2.0; // seconds
    const samples = sampleRate * duration;
    const floatArray = new Float32Array(samples);
    
    // Create a tone that varies to simulate some speech-like content
    for (let i = 0; i < samples; i++) {
      // Create a varying frequency tone
      const baseFreq = 200 + Math.sin(i / 500) * 100;
      floatArray[i] = 0.2 * Math.sin(2 * Math.PI * baseFreq * i / sampleRate);
      
      // Add some amplitude variation
      if (i > samples/3 && i < 2*samples/3) {
        floatArray[i] *= 0.5; // Quieter middle section
      }
    }
    
    const buffer = Buffer.from(floatArray.buffer);
    ws.send(buffer);
    audioSent = true;
    console.log(`Sent ${samples} samples of audio`);
    
    // Send more audio after a delay
    setTimeout(() => {
      // Send another 1 second
      const moreSamples = sampleRate * 1.0;
      const moreArray = new Float32Array(moreSamples);
      for (let i = 0; i < moreSamples; i++) {
        moreArray[i] = 0.1 * Math.sin(2 * Math.PI * 300 * i / sampleRate);
      }
      ws.send(Buffer.from(moreArray.buffer));
      console.log(`Sent ${moreSamples} more samples`);
      
      // Send END_OF_AUDIO
      setTimeout(() => {
        ws.send(Buffer.from('END_OF_AUDIO'));
        console.log('Sent END_OF_AUDIO');
      }, 100);
    }, 500);
  }
  
  // Check for transcript
  if (!transcriptReceived && (text.includes('transcript') || text.includes('text') || text.includes('segments'))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.text || parsed.transcript || (parsed.segments && parsed.segments.length > 0)) {
        transcriptReceived = true;
        console.log('🎉 SUCCESS! WhisperLive returned a transcript!');
        console.log('Full response:', text);
        ws.close();
        setTimeout(() => process.exit(0), 100);
      }
    } catch (e) {
      // Not JSON, but might still contain text
      if (text.trim().length > 10 && !text.includes('SERVER_READY')) {
        transcriptReceived = true;
        console.log('🎉 SUCCESS! WhisperLive returned text!');
        console.log('Response:', text);
        ws.close();
        setTimeout(() => process.exit(0), 100);
      }
    }
  }
});

ws.on('error', (err) => {
  console.error('Connection error:', err);
  process.exit(1);
});

ws.on('close', () => {
  console.log('Connection closed');
  if (!transcriptReceived) {
    console.log('❌ No transcript received');
  }
  process.exit(transcriptReceived ? 0 : 1);
});

// Timeout after 15 seconds
setTimeout(() => {
  console.log('❌ Timeout: No transcript received');
  ws.close();
  process.exit(1);
}, 15000);
