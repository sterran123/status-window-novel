"""대사 음성 생성 — VoxCPM2 (https://github.com/OpenBMB/VoxCPM)

  1) 인물마다 voices.json의 묘사로 기준 음성(ref)을 한 번 만든다  (보이스 디자인)
  2) 그 인물의 모든 대사를 기준 음성으로 복제해 읽힌다            (목소리 일관성)
  3) web/voice/*.mp3 + web/voice/manifest.json 생성 — 이미 만든 대사는 건너뛴다

사용 (voxcpm 설치된 파이썬으로):
  python tools/tts/voice.py              # 빠진 것만 생성
  python tools/tts/voice.py --only 아리아  # 특정 인물만
  python tools/tts/voice.py --redo-ref 태우 # 그 인물 기준 음성부터 다시 (대사도 다시)
  python tools/tts/voice.py --retake-cer 0.2 # 받아쓰기 오류율이 높았던 대사만 다시

새로 만드는 대사는 Whisper로 받아 적어 원문과 비교하고(문자 오류율), 높으면 최대 3번까지
다시 만들어 가장 정확한 것을 남긴다. 결과는 tools/tts/qa.json.
"""
import argparse, hashlib, json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pron import pronounce, sys_text

ROOT = Path(__file__).resolve().parents[2]
TTS = ROOT / 'tools' / 'tts'
REF = TTS / 'ref'
OUT = ROOT / 'web' / 'voice'
MANIFEST = OUT / 'manifest.json'
QA = TTS / 'qa.json'
YOUNG = {'CH01', 'BR_child01'}  # 학창 시절 장면의 지혁은 소년 목소리


def voiced(node):
    """음성을 붙이는 노드 — 대사·아리아·채팅 기록·시스템 메시지 (나레이션·상태창은 읽지 않음)"""
    t = node['type']
    return (t == 'msg' and node['speaker'] != '나레이션') or t in ('aria', 'chatline', 'sys')


def voice_key(node):
    if node['type'] == 'aria':
        return '아리아'
    if node['type'] == 'sys':
        return '시스템'
    sp = node['speaker']
    if sp == '지혁' and node.get('chapter') in YOUNG:
        return '지혁_소년'
    return sp


def line_key(node):
    """뷰어(novel.js voiceKey)와 같은 규칙 — 장\t화자\t대사 (채팅 기록은 화자 앞에 '-')"""
    t = node['type']
    sp = '아리아' if t == 'aria' else '시스템' if t == 'sys' else ('-' if t == 'chatline' else '') + node['speaker']
    return f"{node.get('chapter', '')}\t{sp}\t{node['text']}"


def clean(text):
    t = text.replace('……', '…').replace('——', ', ').replace(' — ', ', ').replace('—', ', ')
    t = re.sub(r'[「」『』《》]', '', t)
    t = re.sub(r'[ㅋㅎㄷㅠㅜ]+', '', t).strip()  # 채팅의 ㅋㅋ·ㄷㄷ·ㅠㅠ는 읽지 않는다
    t = re.sub(r'(^|\s)/(?=[가-힣A-Za-z])', r'\1', t)  # 채팅 명령어 '/핑'의 슬래시는 읽지 않는다
    return t


def speech_text(node):
    if node['type'] == 'sys':
        return sys_text(node['text'])
    return pronounce(clean(node['text']))  # 화면 글은 그대로, 읽을 때만 숫자·약어를 소리대로


_norm = lambda s: re.sub(r'[^가-힣A-Za-z0-9]', '', s).lower()


def cer(ref, hyp):
    a, b = _norm(ref), _norm(hyp)
    if not a:
        return 0.0
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[len(b)] / len(a)


class Checker:
    """Whisper 받아쓰기 — 생성된 음성이 대사를 제대로 읽었는지 본다"""
    def __init__(self):
        import torch
        os.add_dll_directory(os.path.join(os.path.dirname(torch.__file__), 'lib'))  # ctranslate2가 cuBLAS를 찾도록
        from faster_whisper import WhisperModel
        self.m = WhisperModel('medium', device='cuda', compute_type='float16')

    def score(self, wav, sr, said):
        import numpy as np
        x = np.interp(np.arange(0, len(wav), sr / 16000), np.arange(len(wav)), wav).astype('float32')
        segs, _ = self.m.transcribe(x, language='ko', beam_size=5)
        hyp = ''.join(s.text for s in segs).strip()
        return cer(said, hyp), hyp


def encode_mp3(wav, sr, dst):
    import numpy as np
    pcm = (np.clip(wav, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', 'pipe:0',
                    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-18:TP=-2,areverse,apad=pad_dur=0.12,areverse,apad=pad_dur=0.15',
                    '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '40k', str(dst)], input=pcm, check=True)
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(dst)],
                         capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', default=None)
    ap.add_argument('--redo-ref', nargs='*', default=[])
    ap.add_argument('--refs-only', action='store_true')
    ap.add_argument('--retake-cer', type=float, default=None, help='qa.json에서 오류율이 이 값 이상인 대사를 다시 만든다')
    ap.add_argument('--tries', type=int, default=3)
    ap.add_argument('--no-check', action='store_true')
    a = ap.parse_args()

    voices = {k: v for k, v in json.loads((TTS / 'voices.json').read_text('utf-8')).items() if not k.startswith('_')}
    story = json.loads((ROOT / 'story' / 'story.json').read_text('utf-8'))
    lines = [n for n in story['nodes'] if voiced(n)]
    OUT.mkdir(parents=True, exist_ok=True); REF.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text('utf-8')) if MANIFEST.exists() else {}

    import soundfile as sf
    from voxcpm import VoxCPM
    t0 = time.time()
    model = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, optimize=False)
    checker = None if a.no_check else Checker()
    qa = json.loads(QA.read_text('utf-8')) if QA.exists() else {}
    retake = {k for k, q in qa.items() if a.retake_cer is not None and q['cer'] >= a.retake_cer}
    sr = model.tts_model.sample_rate
    print(f'모델 로드 {time.time() - t0:.0f}s, sr={sr}', flush=True)

    # 1) 기준 음성 — 묘사가 바뀌면(해시 불일치) 다시 만든다
    ref_sig = {}
    for k, v in voices.items():
        sig = hashlib.sha1((v['design'] + '|' + v['sample']).encode()).hexdigest()[:10]
        ref_sig[k] = sig
        wav_p, sig_p = REF / f'{k}.wav', REF / f'{k}.sig'
        if wav_p.exists() and sig_p.exists() and sig_p.read_text() == sig and k not in a.redo_ref:
            continue
        wav = model.generate(text=f"({v['design']}){v['sample']}", cfg_value=2.0, inference_timesteps=10)
        sf.write(wav_p, wav, sr); sig_p.write_text(sig)
        print(f'[ref] {k} {len(wav) / sr:.1f}s', flush=True)
    if a.refs_only:
        return

    # 2) 대사 — 파일명은 (기준 음성 서명 + 대사) 해시, 이미 있으면 건너뜀
    todo = [n for n in lines if a.only is None or voice_key(n) in a.only]
    keep, made = {}, 0
    for i, n in enumerate(todo):
        vk = voice_key(n)
        if vk not in voices:
            print(f'  ! 목소리 없음: {vk}', flush=True); continue
        text = speech_text(n)
        if not re.search(r'[가-힣A-Za-z0-9]', text):
            continue
        fid = hashlib.sha1(f"{ref_sig[vk]}|{text}".encode()).hexdigest()[:12]
        dst = OUT / f'{fid}.mp3'
        k = line_key(n)
        if dst.exists() and k in manifest and manifest[k]['f'] == dst.name and k not in retake:
            keep[k] = manifest[k]; continue
        v = voices[vk]
        best = None
        for t in range(a.tries if checker else 1):
            wav = model.generate(text=text, prompt_wav_path=str(REF / f'{vk}.wav'), prompt_text=v['sample'],
                                 reference_wav_path=str(REF / f'{vk}.wav'), cfg_value=2.0, inference_timesteps=10)
            sc, hyp = checker.score(wav, sr, text) if checker else (0.0, '')
            # 너무 길게 늘어진 것(글자당 0.4초 이상)도 실패로 본다
            if len(wav) / sr > 0.4 * max(4, len(_norm(text))) + 1.5:
                sc = max(sc, 0.5)
            if best is None or sc < best[0]:
                best = (sc, hyp, wav)
            if sc <= 0.12:
                break
        sc, hyp, wav = best
        dur = encode_mp3(wav, sr, dst)
        keep[k] = {'f': dst.name, 'd': dur}; made += 1
        if checker:
            qa[k] = {'cer': round(sc, 3), 'hyp': hyp, 'said': text}
        print(f'[{i + 1}/{len(todo)}] {vk} {dur:.1f}s cer={sc:.2f}  {text[:30]}', flush=True)

    if a.only is not None:  # 일부만 돌렸으면 나머지 항목은 그대로 둔다
        manifest.update(keep); keep = manifest
    MANIFEST.write_text(json.dumps(keep, ensure_ascii=False, indent=0), 'utf-8')
    if checker:
        QA.write_text(json.dumps({k: q for k, q in qa.items() if k in keep}, ensure_ascii=False, indent=0), 'utf-8')
    used = {e['f'] for e in keep.values()}
    if a.only is None:  # 더 이상 쓰이지 않는 파일 정리
        for p in OUT.glob('*.mp3'):
            if p.name not in used:
                p.unlink()
    print(f'완료: 새로 {made}개, 전체 {len(keep)}개, {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
