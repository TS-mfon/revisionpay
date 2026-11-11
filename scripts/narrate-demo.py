"""Generate a synthetic voiceover for the public demo captions.

Requires edge-tts and FFmpeg. Only the public narration text is sent to the
speech service; no account data, browser recording or credentials are sent.
Run after record-demo.ts and before render-demo.py.
"""
import asyncio
import json
import os
import subprocess
import wave
from pathlib import Path

import edge_tts

root = Path(__file__).resolve().parent.parent
recording = json.loads((root / '.local/latest-demo-recording.json').read_text())
directory = Path(recording['directory'])
timeline = json.loads((directory / 'timeline.json').read_text())
voice = os.environ.get('REVISIONPAY_TTS_VOICE', 'en-US-AvaMultilingualNeural')
ffmpeg = os.environ.get('REVISIONPAY_FFMPEG', 'ffmpeg')


async def main():
    clips = []
    for index, chapter in enumerate(timeline['chapters']):
        text = chapter['caption']
        spoken = text.replace('RevisionPay', 'Revision Pay').replace(
            'revisionpay.vercel.app', 'Revision Pay dot Vercel dot app'
        )
        mp3 = directory / f'voice-{index:02}.mp3'
        wav = directory / f'voice-{index:02}.wav'
        stamp = directory / f'voice-{index:02}.json'
        settings = {'text': spoken, 'voice': voice, 'rate': '+0%'}
        if not (wav.exists() and stamp.exists() and json.loads(stamp.read_text()) == settings):
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(spoken, voice, rate='+0%').save(str(mp3))
                    subprocess.run([
                        ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                        '-i', str(mp3), '-ar', '48000', '-ac', '1', str(wav)
                    ], check=True)
                    stamp.write_text(json.dumps(settings))
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    print(f'Retrying narration section {index + 1}…', flush=True)
                    await asyncio.sleep(2 * (attempt + 1))
        with wave.open(str(wav)) as audio:
            duration = audio.getnframes() / audio.getframerate()
        clips.append({
            'title': chapter['title'], 'text': text,
            'audio': str(wav), 'duration': duration,
        })
        print(f'{index + 1}/{len(timeline["chapters"])}: {chapter["title"]} ({duration:.1f}s)', flush=True)
    (directory / 'narration.json').write_text(json.dumps({
        'voice': voice, 'synthetic': True, 'clips': clips,
    }, indent=2))


asyncio.run(main())
