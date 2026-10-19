"""음성 합성용 발음 텍스트 — 화면에 보이는 대사는 그대로 두고, 읽을 때만 바꾼다.
숫자는 한국어로 풀고(고유어 단위/한자어 단위 구분), 영문 약어는 발음 사전으로."""
import re

# 영문 → 읽는 소리 (대소문자 그대로 일치)
WORDS = {
    'HP': '에이치피', 'import': '임포트', 'permission-denied': '퍼미션 디나이드', 'LOCO': '로코',
    'CORS': '코스', 'CSRF': '씨에스알에프', 'ARIA': '에이, 알, 아이, 에이',
}
SINO = '영일이삼사오육칠팔구'
NATIVE_ONES = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉']
NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']
# 고유어 수로 읽는 단위 (100 미만일 때)
NATIVE_UNITS = '개|명|건|번|살|마리|줄|장|겹|칸|군데|가지|시간|통|잔|캔|밤|구간'


def sino(n: int) -> str:
    if n == 0:
        return '영'
    out = ''
    for unit, size in (('만', 10000), ('', 1)):
        g = n // size % 10000 if size == 1 else n // size
        if not g:
            continue
        s = ''
        for u, d in (('천', 1000), ('백', 100), ('십', 10), ('', 1)):
            k = g // d % 10
            if k:
                s += ('' if (k == 1 and u) else SINO[k]) + u
        out += s + unit
    return out


def native(n: int) -> str:
    if n == 0:
        return '영'
    if n == 20:
        return '스무'
    return NATIVE_TENS[n // 10] + NATIVE_ONES[n % 10]


def hour(h: int) -> str:
    return native(h) if 1 <= h <= 24 else sino(h)  # 13:00 → 열세 시


def time_read(h, m):
    h, m = int(h), int(m)
    return f'{hour(h)} 시' + (f' {sino(m)} 분' if m else '')


def numbers(t: str) -> str:
    # 시각 구간 10:40-11:10 → 열 시 사십 분부터 열한 시 십 분까지
    t = re.sub(r'(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})', lambda m: f'{time_read(m[1], m[2])}부터 {time_read(m[3], m[4])}까지', t)
    t = re.sub(r'(\d{1,2}):(\d{2})', lambda m: time_read(m[1], m[2]), t)
    # 824/824 → 팔백이십사 중 팔백이십사
    t = re.sub(r'(\d+)/(\d+)', lambda m: f'{sino(int(m[1]))} 중 {sino(int(m[2]))}', t)
    t = re.sub(r'(?<![\w가-힣])-(\d)', r'마이너스 \1', t)
    t = re.sub(r'(?<![\w가-힣])\+(\d)', r'플러스 \1', t)
    t = re.sub(r'(?<!\d)6월', '유월', t)
    t = re.sub(r'(?<!\d)10월', '시월', t)
    t = re.sub(r'(\d+)\.(\d+)', lambda m: f'{sino(int(m[1]))} 점 {" ".join(SINO[int(c)] for c in m[2])}', t)

    def one(m):  # 단위만 잡고 뒤의 조사는 그대로 둔다
        n = int(m[1].replace(',', ''))
        unit = m[3] or ''
        if unit and 0 < n < 100:
            return f'{native(n)} {unit}'
        return f'{sino(n)} {unit}' if unit else sino(n) + m[2]  # 단위가 없으면 원래 띄어쓰기 유지
    t = re.sub(r'(\d[\d,]*)(\s*)(' + NATIVE_UNITS + r')?', one, t)
    return t


def pronounce(t: str) -> str:
    for w, r in WORDS.items():
        t = re.sub(r'(?<![A-Za-z])' + re.escape(w) + r'(?![A-Za-z])', r, t)
    t = t.replace('→', '에서 ')
    t = numbers(t)
    return re.sub(r'\s{2,}', ' ', t).strip()


if __name__ == '__main__':
    import json, sys
    from pathlib import Path
    sys.stdout.reconfigure(encoding='utf-8')
    story = json.loads((Path(__file__).resolve().parents[2] / 'story' / 'story.json').read_text('utf-8'))
    for n in story['nodes']:
        if ((n['type'] == 'msg' and n['speaker'] != '나레이션') or n['type'] == 'aria') and re.search(r'[\dA-Za-z]', n['text']):
            p = pronounce(n['text'])
            if p != n['text']:
                print(n['text'], '\n   →', p)
