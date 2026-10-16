# 스토리 데이터 형식 (story.json)

소설의 단일 원천. 여기서 웹 뷰어와 원고(manuscript.md)를 동시에 생성한다.
분기가 있어도 "메인 루트(main: true 경로)"가 원고 본문이 된다.

## 최상위

```json
{
  "title": "제목",
  "protagonist": "권지혁",
  "chapters": [ { "id": "CH01", "title": "장 제목" } ],
  "nodes": [ ... ],
  "endings": [ { "id": "END_TRUE", "label": "트루 엔딩" } ]
}
```

## 노드 종류

- `{ "type": "msg", "speaker": "나레이션|지혁|시스템|상대이름", "text": "...", "chapter": "CH01", "next": "노드id" }`
- `{ "type": "sys", "text": "[시스템 메시지]", "chapter": "CH01", "next": "..." }` — 상태창/퀘스트/알림
- `{ "type": "status", "stats": {"레벨":1,...}, "next": "..." }` — 상태창 카드
- `{ "type": "choice", "prompt": "선택 안내", "chapter": "CH01", "options": [ { "label": "버튼 글", "goto": "노드id", "main": true } ] }` — `main: true` 가 원고 루트
- `{ "type": "end", "ending": "END_TRUE" }`

규칙: next 가 없으면 직후 노드로 진행. 장 시작은 chapter 필드로 표시.
