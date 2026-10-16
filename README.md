# 상태창이 뜬 날 — 채팅형 장편소설

과제11 — 나에 대한 3만 자 장편소설. 내 삶의 실제 고비(혼밥비서·봇 런타임 재구축·역분석·보안 재설계·리추얼 과정)를 뼈대로, 현대판타지 상태창 설정으로 각색한 채팅형 선택지 소설.

- 주인공: 권지혁 (소설 속 이름 — 본인은 본명 사용)
- 분량: 본문 12장, 공백 제외 30,270자
- 엔딩: 트루(본문) / 노멀 / 새드 / 히든 4종 + 각 장 사이드 분기 7개

## 구조

- `story/chapters/CH01~12.md` — 본문 (경량 마크업: `> 이름:` 대사, `[SYS]` 시스템, `[STATUS]` 상태창, `::: choice` 분기)
- `story/endings/` — 엔딩 4종
- `story/branches/` — 사이드 분기 씬
- `story/worldsheet.md` — 인물·관계·지명·시간선·세계규칙 대조표 원본
- `story/outline.md` — 장별 인과표
- `manuscript.md` — 제출용 정본 원고 (본문 + 부록: 분기 안내·대조표·수정기록·AI판단·확인방법)
- `web/` — 채팅형 뷰어 (`node tools/serve.js` → http://localhost:8642/web/)
  - 자동 재생(선택지·엔딩에서 정지)/수동 모드, 다크·라이트 테마, 인물 이름 바꾸기, 이어보기 팝업, 탭 전환 시 자동저장 — ⚙ 설정에서 변경
  - 배포: https://sterran123.github.io/status-window-novel/web/

## 명령

- `node tools/build.js` — 챕터 마크업 → manuscript.md + story/story.json 재생성, 글자수·장수 출력
- `node tools/check.js` — 경계표시·글자수·목차 일치·금지구·중복문단·실명 검사
- `node tools/anchors.js` — 대조표 앵커(CHxx-Pnnn) 재계산
- `node tools/serve.js` — 로컬 미리보기 서버

참고소설(문체 분석용)·참고자료(실제 프로젝트 로그)는 비공개 재료라 커밋하지 않는다 (.gitignore).
