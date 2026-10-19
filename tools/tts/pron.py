"""음성 합성용 발음 텍스트 — 화면에 보이는 대사는 그대로 두고, 읽을 때만 바꾼다.
숫자는 한국어로 풀고(고유어 단위/한자어 단위 구분), 영문 약어는 발음 사전으로.
시스템 메시지 블록은 sys_text()로 줄마다 끊어 읽는 문장으로 만든다."""
import re

# 영문 → 읽는 소리 (대소문자 그대로, 긴 것부터 바꾼다)
WORDS = {
    'AI_REPORT_LOG.md': '에이아이 리포트 로그', 'permission-denied': '퍼미션 디나이드', 'serverTimestamp': '서버 타임스탬프',
    'SHA-256': '샤 이백오십육', 'z-index': '제트 인덱스', 'signOut': '사인아웃', 'import': '임포트', 'tests/': '테스트',
    'tests': '테스트', 'Blaze': '블레이즈', 'Moim': '모임', 'LOCO': '로코', 'CORS': '코스', 'CSRF': '씨에스알에프',
    'Missing or insufficient permissions': '미싱 오어 인서피션트 퍼미션즈', 'honbab-ai.web.app': '혼밥 에이아이 닷 웹 닷 앱',
    'Firebase': '파이어베이스', 'Firestore': '파이어스토어', 'Functions': '펑션즈', 'storage': '스토리지',
    'isAdmin': '이즈 어드민', 'chats': '챗츠',
    'ARIA': '에이, 알, 아이, 에이', 'HP': '에이치피', 'OK': '오케이', 'AI': '에이아이', 'A 헤더': '에이 헤더',
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
        g = n % 10000 if size == 1 else n // size
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


def month(m: int) -> str:
    return {6: '유월', 10: '시월'}.get(m, sino(m) + '월')


def time_read(h, m):
    h, m = int(h), int(m)
    return f'{hour(h)} 시' + (f' {sino(m)} 분' if m else '')


def numbers(t: str) -> str:
    # 날짜 2026-05-26 → 이천이십육년 오월 이십육일, 표 안의 05-26 → 오월 이십육일
    t = re.sub(r'(\d{4})-(\d{2})-(\d{2})', lambda m: f'{sino(int(m[1]))}년 {month(int(m[2]))} {sino(int(m[3]))}일', t)
    t = re.sub(r'(?<![\d-])(\d{2})-(\d{2})(?![\d-])', lambda m: f'{month(int(m[1]))} {sino(int(m[2]))}일', t)
    # 시각 구간 10:40-11:10 → 열 시 사십 분부터 열한 시 십 분까지
    t = re.sub(r'(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})', lambda m: f'{time_read(m[1], m[2])}부터 {time_read(m[3], m[4])}까지', t)
    t = re.sub(r'(\d{1,2}):(\d{2})', lambda m: time_read(m[1], m[2]), t)
    # 진행·비율 824/824, (0/5) → 분수처럼 'b 분의 a'
    t = re.sub(r'(\d+)/(\d+)', lambda m: f'{sino(int(m[2]))} 분의 {sino(int(m[1]))}', t)
    t = re.sub(r'(\d+)B\b', r'\1바이트', t)
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
    for w in sorted(WORDS, key=len, reverse=True):
        t = re.sub(r'(?<![A-Za-z_])' + re.escape(w) + r'(?![A-Za-z_])', WORDS[w], t)
    t = re.sub(r'\s*→\s*', '에서 ', t)
    t = numbers(t)
    return re.sub(r'\s{2,}', ' ', t).strip()


def sys_text(t: str) -> str:
    """시스템 메시지 블록 → 소리 내 읽을 문장. 줄마다 끊어 읽고, 괄호·기호는 떼어 낸다"""
    out = []
    for line in t.split('\n'):
        line = line.strip()
        if not line:
            continue
        line = line.replace('(Y/N)', '').replace('※', '').replace('|', ',').replace('???', '알 수 없음')
        line = re.sub(r'["「」『』]', '', line).rstrip(':')
        line = re.sub(r'\]\s*→\s*', ']. 실제로는, ', line)     # [퀘스트] → 실제 할 일
        line = re.sub(r'\s*→\s*오늘', '부터 오늘까지', line)
        line = re.sub(r'^\[(.*)\]$', r'\1', line)          # [퀘스트: …] 의 대괄호
        line = re.sub(r'\[([^\]]*)\]', r'\1,', line)        # 줄 안의 [ ] 는 쉼표로
        line = re.sub(r'(?<=[가-힣\d)])\s*:\s+', ', ', line)  # '조건: …' → '조건, …'
        line = re.sub(r'(?<=[가-힣])/(?=[\d가-힣])', ', ', line)
        line = re.sub(r'\s*[—–]\s*', ', ', line).replace('·', ', ')
        line = pronounce(line)
        line = re.sub(r'[()]', ' ', line)
        line = re.sub(r'\s*,\s*(,\s*)*', ', ', line)
        line = re.sub(r',\s*\.', '.', line).strip(' ,')
        if line and line[-1] not in '.?!…':
            line += '.'
        out.append(line)
    return re.sub(r'\s{2,}', ' ', ' '.join(out))


if __name__ == '__main__':
    import json, sys
    from pathlib import Path
    sys.stdout.reconfigure(encoding='utf-8')
    story = json.loads((Path(__file__).resolve().parents[2] / 'story' / 'story.json').read_text('utf-8'))
    if '--sys' in sys.argv:
        for n in story['nodes']:
            if n['type'] == 'sys':
                print(n['text'].replace('\n', ' / '), '\n   →', sys_text(n['text']))
    else:
        for n in story['nodes']:
            if n['type'] in ('msg', 'aria', 'chatline') and n.get('speaker') != '나레이션' and re.search(r'[\dA-Za-z]', n['text']):
                p = pronounce(n['text'])
                if p != n['text']:
                    print(n['text'], '\n   →', p)
