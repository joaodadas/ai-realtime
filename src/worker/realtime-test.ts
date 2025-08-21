import WebSocket from 'ws';
// opcional: junte o audio e salve .wav
function savePcm16MonoWav(pcms: Buffer[], sampleRate = 16000) {
  const pcm = Buffer.concat(pcms);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (PCM)
  header.writeUInt16LE(1, 22); // NumChannels (mono)
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate (16-bit mono)
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  const out = Buffer.concat([header, pcm]);
  const fs = require('fs');
  fs.writeFileSync('./out.wav', out);
  console.log('💾 Áudio salvo em out.wav');
}

async function main() {
  const OPENAI_REALTIME_MODEL =
    process.env.OPENAI_REALTIME_MODEL || 'your-default-model';
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
    OPENAI_REALTIME_MODEL
  )}`;
  const ws = new WebSocket(url, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
  });

  const audioChunks: Buffer[] = [];

  ws.on('open', () => {
    console.log('✅ WS conectado');

    // peça texto + áudio curto
    ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: 'Diga "olá do realtime" em 3 palavras.',
          audio: { format: 'pcm16', sample_rate_hz: 16000 }, // muitos modelos aceitam assim
        },
      })
    );
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'output_text.delta') {
        process.stdout.write(msg.delta);
      }
      if (msg.type === 'output_text.done') {
        process.stdout.write('\n');
      }
      if (msg.type === 'output_audio.delta') {
        // delta vem base64 PCM16LE 16k
        audioChunks.push(Buffer.from(msg.delta, 'base64'));
      }
      if (msg.type === 'response.completed') {
        if (audioChunks.length) savePcm16MonoWav(audioChunks, 16000);
        ws.close();
      }
    } catch {
      // alguns servidores mandam pings/frames binários; ignore
    }
  });

  ws.on('close', () => console.log('\n👋 WS fechado'));
  ws.on('error', (e) => console.error('WS error:', e));
}

main().catch(console.error);
