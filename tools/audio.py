# Builds media/<id>/audio.wav for a motion reel: Kokoro voiceover per scene ("vo" field) + original synthesized music bed.
# Usage: python3 tools/audio.py <post-id> [--model PATH] [--voices PATH] [--voice af_heart]
import json, sys, os, re, argparse, subprocess
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ap = argparse.ArgumentParser()
ap.add_argument('id')
ap.add_argument('--model', default=os.environ.get('KOKORO_MODEL', 'kokoro.onnx'))
ap.add_argument('--voices', default=os.environ.get('KOKORO_VOICES', 'voices.bin'))
ap.add_argument('--voice', default='af_heart')
ap.add_argument('--speed', type=float, default=1.05)
a = ap.parse_args()
rng = np.random.RandomState(7)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
post = json.load(open(os.path.join(ROOT, 'posts', a.id + '.json')))
out = os.path.join(ROOT, 'media', a.id); os.makedirs(out, exist_ok=True)
SR = 44100
total = sum(s['seconds'] for s in post['scenes'])
n = int(total * SR)

k = Kokoro(a.model, a.voices)
voice = np.zeros(n, dtype=np.float32)
t0 = 0.0
for i, s in enumerate(post['scenes']):
    line = s.get('vo')
    if line:
        parts = []
        for sent in re.split(r'(?<=[.?!])\s+', line):
            if not sent.strip(): continue
            samples, sr = k.create(sent, voice=a.voice, speed=a.speed * rng.uniform(.96, 1.05), lang='en-us')
            parts.append(samples); parts.append(np.zeros(int(sr * rng.uniform(.12, .24))))
        samples = np.concatenate(parts)
        if sr != SR:
            samples = np.interp(np.linspace(0, len(samples) - 1, int(len(samples) * SR / sr)), np.arange(len(samples)), samples)
        start = int((t0 + 0.35) * SR)
        dur = len(samples) / SR
        print(f'scene {i}: voice {dur:.1f}s of {s["seconds"]}s')
        if start + len(samples) > int((t0 + s['seconds']) * SR):
            sys.exit(f'scene {i} voiceover ({dur:.1f}s) too long for {s["seconds"]}s; raise seconds or shorten vo')
        voice[start:start + len(samples)] += samples.astype(np.float32)
    t0 += s['seconds']

# original music bed: soft Am-F-C-G pad with a gentle pulse, sine/triangle only
t = np.arange(n) / SR
bpm = 96; beat = 60 / bpm
chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 164.81, 196.0], [196.0, 246.94, 293.66]]
music = np.zeros(n)
bar = beat * 4
for i, f_list in enumerate(chords * int(total / (bar * 4) + 2)):
    s0 = int(i * bar * SR)
    if s0 >= n: break
    e0 = min(n, int((i + 1) * bar * SR))
    tt = t[s0:e0] - t[s0]
    env = np.minimum(1, tt / 0.6) * np.minimum(1, (bar - tt) / 0.6)
    for f in f_list:
        music[s0:e0] += np.sin(2 * np.pi * f * tt) * env * 0.12 + np.sin(2 * np.pi * f * 2.003 * tt) * env * 0.03
    music[s0:e0] += np.sin(2 * np.pi * (f_list[0] / 2) * tt) * env * 0.12
pulse = np.zeros(n)
for b in range(int(total / beat) + 1):
    s0 = int(b * beat * SR); e0 = min(n, s0 + int(0.12 * SR))
    if s0 >= n: break
    tt = np.arange(e0 - s0) / SR
    pulse[s0:e0] += np.sin(2 * np.pi * 70 * tt) * np.exp(-tt * 28) * (0.5 if b % 4 == 0 else 0.22)
music = music + pulse * 0.6
music /= max(1e-6, np.abs(music).max())
fade = np.minimum(1, t / 1.0) * np.minimum(1, (total - t) / 1.2)
music = (music * fade).astype(np.float32)

# studio polish: high-pass, gentle EQ, compression, short room echo, normalise
sf.write('/tmp/_voice_raw.wav', voice, SR)
subprocess.run(['ffmpeg','-y','-v','error','-i','/tmp/_voice_raw.wav','-af','highpass=f=90,equalizer=f=220:t=q:w=1:g=2,equalizer=f=4500:t=q:w=1.2:g=-2,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,aecho=0.8:0.25:35:0.12,loudnorm=I=-16:TP=-1.5','-ar',str(SR),'/tmp/_voice_pol.wav'],check=True)
voice, _ = sf.read('/tmp/_voice_pol.wav', dtype='float32')
voice = np.pad(voice, (0, max(0, n - len(voice))))[:n]

# duck music under the voice
env = np.abs(voice)
w = int(0.15 * SR)
env = np.convolve(env, np.ones(w) / w, mode='same')
duck = 1 - 0.65 * np.clip(env / 0.08, 0, 1)
mix = voice * 1.0 + music * 0.22 * duck
mix = np.tanh(mix * 1.1)
sf.write(os.path.join(out, 'audio.wav'), mix, SR)
print('wrote', os.path.join(out, 'audio.wav'), f'{total:.1f}s')
