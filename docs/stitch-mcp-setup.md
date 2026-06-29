# Stitch MCP 연결 — API 키 방식 (gcloud 불필요) ✅ 완료

`.env` 의 `STITCH_API_KEY` 를 헤더로 쓰는 원격 HTTP MCP. OAuth/gcloud 필요 없음.

## 등록 명령 (이미 실행됨)

```
claude mcp add stitch --transport http https://stitch.googleapis.com/mcp \
  --header "X-Goog-Api-Key: <STITCH_API_KEY>" -s user
```

- 등록 위치: `~/.claude.json` (user 스코프) — 프로젝트 `.mcp.json` 안 건드림
- 키는 `.env` 의 `STITCH_API_KEY` 값을 사용 (커밋 파일엔 안 박힘)

## 검증 결과

- `initialize` → HTTP 200 ✅
- `tools/list` → 14개 도구 반환 ✅
  `list_projects`, `get_project`, `list_screens`, `get_screen`,
  `generate_screen_from_text`, `edit_screens`, `generate_variants`,
  `create_design_system`, `apply_design_system`, `create_design_system_from_design_md`,
  `update_design_system`, `list_design_systems`, `upload_design_md`, `create_project`

## 마지막 한 단계: Claude Code 재시작

`claude mcp list` 에서 처음엔 `tools fetch failed` 로 보일 수 있는데(클라이언트가 아직 갱신 전),
엔드포인트는 정상입니다. **Claude Code 재시작 후 `/mcp`** 하면 `stitch` 도구가 잡힙니다.

재시작 후 저에게 "됐어" 라고만 주세요 →
프로젝트 `7986685272346136680` 의 7개 화면(디자인 시스템·회원가입·로그인·간트·공지·티켓·스프린트)을
`get_screen` 으로 받아 리디자인 시작합니다.

## 관리 명령

- 제거: `claude mcp remove stitch -s user`
- 목록: `claude mcp list`

> 참고: 이 방식은 `.env` 파일 충돌 이슈(로컬 proxy 방식의 `invalid character` 에러)가 없습니다.
> gcloud 는 설치돼 있지만 이 방식엔 안 쓰입니다 — 그냥 둬도 무해.
