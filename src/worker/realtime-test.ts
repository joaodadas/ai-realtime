import 'dotenv/config';
import WebSocket from 'ws';
import fs from 'node:fs';
import { exec } from 'node:child_process';

// Junta chunks PCM16 mono 16k e salva .wav
function savePcm16MonoWav(
  pcms: Buffer[],
  sampleRate = 16000,
  path = './out.wav'
) {
  const pcm = Buffer.concat(pcms);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  h.writeUInt16LE(1, 20); // AudioFormat (PCM)
  h.writeUInt16LE(1, 22); // NumChannels (mono)
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28); // ByteRate (16-bit mono)
  h.writeUInt16LE(2, 32); // BlockAlign
  h.writeUInt16LE(16, 34); // BitsPerSample
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path, Buffer.concat([h, pcm]));
  console.log('💾 Áudio salvo em', path);
}

async function main() {
  const KEY = process.env.OPENAI_API_KEY || '';
  const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
  if (!KEY) throw new Error('OPENAI_API_KEY ausente no .env');

  const ws = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`,
    'realtime',
    {
      headers: { Authorization: `Bearer ${KEY}`, 'OpenAI-Beta': 'realtime=v1' },
    }
  );

  const audioChunks: Buffer[] = [];

  ws.on('open', () => {
    console.log('✅ WS conectado');

    // 1) Configura voz e formato de áudio da sessão
    ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        session: {
          voice: 'verse',
          output_audio_format: { type: 'pcm16', sample_rate_hz: 16000 },
        },
      })
    );

    // 2) Pede resposta (texto + áudio)
    ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: 'Fale Olá com uma voz masculina.',
        },
      })
    );
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Texto (stream)
      if (msg.type === 'response.text.delta') process.stdout.write(msg.delta);
      if (msg.type === 'response.text.done') process.stdout.write('\n');

      // Áudio (PCM16 base64)
      if (msg.type === 'response.audio.delta') {
        audioChunks.push(Buffer.from(msg.delta, 'base64'));
      }

      // Fim da resposta
      if (msg.type === 'response.done') {
        if (audioChunks.length) {
          savePcm16MonoWav(audioChunks, 24000, './out.wav');
          // Reproduz (macOS): comente se não quiser tocar automaticamente
          exec('afplay ./out.wav');
          // Linux (ALSA): exec('aplay ./out.wav');
        }
        ws.close();
      }

      // Erros do servidor (se houver)
      if (msg.type === 'error' || msg.error) {
        console.error('❌ Realtime error:', msg);
      }
    } catch {
      // frames não-JSON (pings etc.) podem cair aqui — ignoramos
    }
  });

  ws.on('close', (code, reason) => {
    console.log('👋 WS fechado', code, reason?.toString() || '');
  });

  ws.on('error', (e) => console.error('WS error:', e));
}

main().catch(console.error);
