const WebSocket = require('ws');

console.log('Testing WhisperLive with exact backend behavior...');

const ws = new WebSocket('ws://127.0.0.1:9090');

let messagesReceived = [];

ws.on('open', () => {
  console.log('Connected to WhisperLive');
  
  const initMsg = {
    uid: `test-exact-${Date.now()}`,
    model: 'faster-whisper-small',
    language: 'en',
    task: 'transcribe',
    use_vad: false,
    initial_prompt: 'Transcribe natural conversation in Tagalog and English (Taglish).'
  };
  
  ws.send(JSON.stringify(initMsg));
  console.log('Sent init:', JSON.stringify(initMsg));
});

ws.on('message', (data) => {
  const text = data.toString();
  console.log(`Message ${messagesReceived.length + 1}:`, text.substring(0, 200));
  messagesReceived.push(text);
  
  if (text.includes('SERVER_READY')) {
    console.log('WhisperLive is ready! Streaming audio for 5 seconds...');
    
    // Simulate 5 seconds of audio like the backend does
    const sampleRate = 16000;
    const chunkSize = 2048; // samples per chunk
    const bytesPerChunk = chunkSize * 4; // float32 = 4 bytes
    
    let totalSent = 0;
    const sendInterval = setInterval(() => {
      // Create audio chunk with some content (sine wave)
      const floatArray = new Float32Array(chunkSize);
      const time = totalSent / (sampleRate * 4); // in seconds
      for (let i = 0; i < chunkSize; i++) {
        // Varying frequency to simulate speech
        const freq = 200 + Math.sin(time * 2) * 100;
        floatArray[i] = 0.5 * Math.sin(2 * Math.PI * freq * (i / sampleRate + time));
      }
      
      const buffer = Buffer.from(floatArray.buffer);
      ws.send(buffer);
      totalSent += bytesPerChunk;
      
      console.log(`Sent ${totalSent / 1024} KB of audio`);
      
      // Stop after 5 seconds worth of audio
      if (totalSent >= sampleRate * 4 * 5) { // 5 seconds * 4 bytes/sample
        clearInterval(sendInterval);
        console.log('Finished sending audio. Sending END_OF_AUDIO...');
        
        // Wait a bit then send END_OF_AUDIO
        setTimeout(() => {
          ws.send(Buffer.from('END_OF_AUDIO'));
          console.log('Sent END_OF_AUDIO');
          
          // Wait for final transcripts
          setTimeout(() => {
            console.log('\n=== SUMMARY ===');
            console.log(`Total messages received: ${messagesReceived.length}`);
            messagesReceived.forEach((msg, i) => {
              console.log(`\nMessage ${i + 1}:`);
              console.log(msg.substring(0, 300));
            });
            
            const hasTranscript = messagesReceived.some(msg => 
              msg.includes('text') || msg.includes('transcript') || 
              msg.includes('segments') || (msg.trim().length > 10 && !msg.includes('SERVER_READY'))
            );
            
            if (hasTranscript) {
              console.log('\n🎉 SUCCESS: WhisperLive returned transcripts!');
            } else {
              console.log('\n❌ FAIL: No transcripts received');
            }
            
            ws.close();
            process.exit(hasTranscript ? 0 : 1);
          }, 3000);
        }, 500);
      }
    }, 50); // Send chunk every 50ms
  }
});

ws.on('error', (err) => {
  console.error('Connection error:', err);
  process.exit(1);
});

ws.on('close', () => {
  console.log('Connection closed');
});

setTimeout(() => {
  console.log('Timeout after 15 seconds');
  ws.close();
  process.exit(1);
}, 15000);
