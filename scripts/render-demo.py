"""Render the narrated app walkthrough into a captioned, shareable MP4.

Run record-demo.ts and narrate-demo.py first, then set REVISIONPAY_FFMPEG to
an ffmpeg binary with libass and libx264 before running this script.
"""
import json
import os
import subprocess
import textwrap
import shutil
import math
from pathlib import Path

root = Path(__file__).resolve().parent.parent
recording = json.loads((root / '.local/latest-demo-recording.json').read_text())
directory = Path(recording['directory'])
timeline = json.loads((directory / 'timeline.json').read_text())
chapters = timeline['chapters']
trim = chapters[0]['start']
narration = json.loads((directory / 'narration.json').read_text())
clips = narration['clips']
if len(clips) != len(chapters) or any(
    c['text'] != chapter['caption'] or c['title'] != chapter['title']
    for c, chapter in zip(clips, chapters)
):
    raise SystemExit('Narration does not match this recording. Run narrate-demo.py again.')

# Hold the last frame of a scene when its narration needs more time. Keep
# natural speech speed and preserve the actual browser actions in sequence.
scenes = []
duration = 0
for i, (chapter, clip) in enumerate(zip(chapters, clips)):
    end = chapters[i + 1]['start'] if i + 1 < len(chapters) else timeline['duration']
    original = end - chapter['start']
    length = math.ceil(max(original, clip['duration'] + 0.7) * 30) / 30
    scenes.append({'start': duration, 'length': length, 'extra': length - original, 'rawEnd': end - trim})
    duration += length
if not 40 < duration < 178:
    raise SystemExit('Review the raw recording: duration must be under 178 seconds.')
ffmpeg = os.environ.get('REVISIONPAY_FFMPEG', 'ffmpeg')
output = root / 'apps/web/public/media'
output.mkdir(parents=True, exist_ok=True)

def clock(seconds, milliseconds=False):
    seconds = max(0, seconds)
    h = int(seconds // 3600)
    m = int(seconds // 60) % 60
    s = seconds % 60
    return f'{h:02}:{m:02}:{s:06.3f}' if milliseconds else f'{h}:{m:02}:{s:05.2f}'

styles = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,DM Sans,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,32,32,0,1
Style: Caption,DM Sans,22,&H00E7F2E6,&H00E7F2E6,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,32,32,0,1
Style: Mode,DM Sans,13,&H0089F3D9,&H0089F3D9,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,7,32,32,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
events = []
vtt = ['WEBVTT', '']
for i, chapter in enumerate(chapters):
    start = scenes[i]['start']
    end = start + scenes[i]['length']
    title = chapter['title'].replace('{', '').replace('}', '')
    caption = chapter['caption'].replace('{', '').replace('}', '')
    lines = r'\N'.join(textwrap.wrap(caption, 108))
    kind = chapter['kind'].upper()
    for style, position, text in [('Mode', r'{\pos(32,582)}', kind), ('Title', r'{\pos(32,605)}', title), ('Caption', r'{\pos(32,645)}', lines)]:
        events.append(f'Dialogue: 0,{clock(start)},{clock(end)},{style},,0,0,0,,{position}{text}')
    vtt.extend([f'{clock(start,True)} --> {clock(end,True)}', caption, ''])
subtitles = directory / 'captions.ass'
subtitles.write_text(styles + '\n'.join(events), encoding='utf-8')
(output / 'revisionpay-demo.en.vtt').write_text('\n'.join(vtt), encoding='utf-8')
video = output / 'revisionpay-demo.mp4'
fonts = directory / 'fonts'
fonts.mkdir(exist_ok=True)
shutil.copyfile(root / 'apps/web/public/fonts/dm-sans.ttf', fonts / 'dm-sans.ttf')
gaps = '+'.join(f"{s['extra']:.6f}*gte(T\\,{s['rawEnd']:.6f})" for s in scenes[:-1])
video_filter = f"[0:v]setpts=PTS-STARTPTS,setpts=PTS+({gaps})/TB,fps=30,tpad=stop_mode=clone:stop_duration={scenes[-1]['extra'] + 1:.6f},trim=duration={duration:.6f},drawbox=x=0:y=572:w=iw:h=148:color=0x173c2c:t=fill,drawbox=x=0:y=572:w=iw:h=3:color=0xd9f389:t=fill,ass={subtitles}:fontsdir={fonts}[video]"
audio_filters = []
for i, scene in enumerate(scenes):
    delay = round((scene['start'] + 0.25) * 1000)
    audio_filters.append(f'[{i+1}:a]adelay={delay}:all=1[a{i}]')
audio_filters.append(''.join(f'[a{i}]' for i in range(len(clips))) + f'amix=inputs={len(clips)}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration={duration:.6f}[audio]')
command = [ffmpeg, '-hide_banner', '-loglevel', 'warning', '-y', '-ss', str(trim), '-i', timeline['raw']]
for clip in clips:
    command.extend(['-i', clip['audio']])
command.extend(['-t', str(duration), '-filter_complex', ';'.join([video_filter, *audio_filters]), '-map', '[video]', '-map', '[audio]', '-filter_complex_threads', '2', '-r', '30', '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-b:a', '128k', '-movflags', '+faststart', str(video)])
subprocess.run(command, check=True)
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', '4', '-i', str(video), '-frames:v', '1', str(output / 'revisionpay-demo-poster.jpg')], check=True)
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(video), '-f', 'null', '-'], check=True)
(directory / 'render.json').write_text(json.dumps({'video':str(video),'durationSeconds':round(duration,2),'sizeBytes':video.stat().st_size,'chapters':len(chapters),'voice':narration['voice'],'scenes':scenes},indent=2))
print((directory / 'render.json').read_text())
