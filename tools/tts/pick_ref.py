"""기준 음성 후보 고르기 — 묘사로 후보를 여러 개 만들고, 받아쓰기로 정확한 것 중
음높이(F0 중앙값)가 가장 낮은(=나이 들어 들리는) 것을 tools/tts/ref/<인물>.wav로 쓴다.
후보는 tools/tts/ref/candidates/에 남겨 직접 들어 볼 수 있다.

  python tools/tts/pick_ref.py 아버지 어머니 --n 4
  python tools/tts/pick_ref.py 태우 --n 3 --pick high   # 젊고 밝게: 음높이가 높은 쪽
"""
import argparse, hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice import TTS, REF, Checker

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('who', nargs='+')
    ap.add_argument('--n', type=int, default=4)
    ap.add_argument('--pick', choices=['low', 'high'], default='low')
    a = ap.parse_args()

    import librosa, numpy as np, soundfile as sf
    from voxcpm import VoxCPM
    voices = json.loads((TTS / 'voices.json').read_text('utf-8'))
    model = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, optimize=False)
    sr = model.tts_model.sample_rate
    checker = Checker()
    cand_dir = REF / 'candidates'; cand_dir.mkdir(parents=True, exist_ok=True)
    for k in a.who:
        v = voices[k]
        rows = []
        for i in range(a.n):
            wav = model.generate(text=f"({v['design']}){v['sample']}", cfg_value=2.0, inference_timesteps=10)
            sc, hyp = checker.score(wav, sr, v['sample'])
            y = librosa.resample(wav.astype('float32'), orig_sr=sr, target_sr=16000)
            f0, ok, _ = librosa.pyin(y, fmin=60, fmax=400, sr=16000)
            f0m = float(np.nanmedian(f0[ok])) if ok.any() else 999.0
            p = cand_dir / f'{k}_{i + 1}.wav'
            sf.write(p, wav, sr)
            rows.append((sc, f0m, p, wav))
            print(f'{k} 후보{i + 1}: F0 {f0m:.0f}Hz  cer {sc:.2f}  {hyp}', flush=True)
        good = [r for r in rows if r[0] <= 0.15] or rows
        best = min(good, key=lambda r: r[1] if a.pick == 'low' else -r[1])
        sf.write(REF / f'{k}.wav', best[3], sr)
        (REF / f'{k}.sig').write_text(hashlib.sha1((v['design'] + '|' + v['sample']).encode()).hexdigest()[:10])
        print(f'→ {k}: {best[2].name} 선택 (F0 {best[1]:.0f}Hz)', flush=True)
