import 'dotenv/config';
import WebSocket from 'ws';
import fs from 'node:fs';
import { exec } from 'node:child_process';

// salva PCM16 mono como WAV
function savePcm16MonoWav(
  pcms: Buffer[],
  sampleRate = 24000,
  path = './out.wav'
) {
  const pcm = Buffer.concat(pcms);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path, Buffer.concat([h, pcm]));
  console.log('💾 Áudio salvo em', path);
}

async function main() {
  const KEY = process.env.OPENAI_API_KEY || '';
  const MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
  const VOICE = process.env.VOICE || 'verse'; // <- opcional (verse/alloy/echo/sage/shimmer/ash/ballad/coral)
  if (!KEY) throw new Error('OPENAI_API_KEY ausente no .env');

  const ws = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`,
    'realtime',
    {
      headers: { Authorization: `Bearer ${KEY}`, 'OpenAI-Beta': 'realtime=v1' },
    }
  );

  const audioChunks: Buffer[] = [];
  let negotiatedHz = 24000; // default desejado

  ws.on('open', () => {
    console.log('✅ WS conectado');

    // CORRETO: configurar sessão
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          voice: VOICE,
          output_audio_format: 'pcm16',
        },
      })
    );

    // pedir resposta (texto + áudio)
    ws.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: 'Olá consegue me falar sobre o minha casa minha vida?',
        },
      })
    );
  });

  ws.on('message', (data) => {
    const s = data.toString();
    try {
      const msg = JSON.parse(s);

      if (msg.type === 'session.updated') {
        const hz = msg.session?.output_audio_format?.sample_rate_hz;
        if (typeof hz === 'number') {
          negotiatedHz = hz;
          console.log('🎚️ sample rate negociado =', hz, 'Hz');
        }
      }

      if (msg.type === 'response.text.delta') process.stdout.write(msg.delta);
      if (msg.type === 'response.text.done') process.stdout.write('\n');

      if (msg.type === 'response.audio.delta') {
        audioChunks.push(Buffer.from(msg.delta, 'base64'));
      }

      if (msg.type === 'response.done') {
        if (audioChunks.length) {
          savePcm16MonoWav(audioChunks, negotiatedHz, './out.wav');
          // tocar (comente se não quiser):
          exec(
            process.platform === 'darwin'
              ? 'afplay ./out.wav'
              : 'aplay ./out.wav'
          );
        }
        ws.close();
      }

      if (msg.type === 'error' || msg.error) {
        console.error('❌ Realtime error:', msg);
      }
    } catch {
      // frames não-JSON (pings) — ignore
    }
  });

  ws.on('close', (code, reason) => {
    console.log('👋 WS fechado', code, reason?.toString() || '');
  });

  ws.on('error', (e) => console.error('WS error:', e));
}

main().catch(console.error);
