# TeamHub MCP 원격 배포 (팀 공유)

로컬 `stdio` MCP는 "내 PC의 내 Claude"만 쓸 수 있다. 팀원들이 각자 Claude에서
TeamHub를 AI로 다루게 하려면 MCP 서버를 **HTTP 로 호스팅**하고 각자 접속하게 한다.

```
직원 Claude ──(HTTPS + Bearer 토큰)──▶ teamhub-mcp (Render) ──(service_role)──▶ Supabase
```

> ⚠️ 이 서버는 **service_role 키**(RLS 우회 = DB god-mode)로 동작한다.
> 키는 **이 서버 환경변수에만** 두고, 직원에게는 절대 주지 않는다. 직원은 `MCP_AUTH_TOKEN` 만 받는다.
> 그래서 신뢰하는 **내부 직원용**이다. 외부 클라이언트에 열려면 유저별 인증(OAuth/Supabase JWT)으로 업그레이드해야 한다.

---

## 1. 배포 (Render Blueprint)

`render.yaml` 에 `teamhub-mcp` web service 가 이미 정의돼 있다.

1. Render 대시보드 → **New → Blueprint** → 이 레포 선택 → `render.yaml` 적용
2. `teamhub-mcp` 서비스의 환경변수 입력:
   - `SUPABASE_URL` = `https://yyzyorxqkcmbkompymfc.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase 대시보드 → Project Settings → API → **service_role** 키
   - `MCP_TRANSPORT` = `http` (이미 설정됨)
   - `MCP_AUTH_TOKEN` = Render 가 자동 생성(`generateValue`). 배포 후 **Environment 탭에서 값 확인** → 직원에게 공유할 토큰.
3. 배포 완료 후 헬스체크: `https://teamhub-mcp.onrender.com/healthz` → `{"ok":true,...}`

> 커스텀 도메인을 붙이려면 Render 서비스 설정에서 `mcp.kodekorea.kr` 등을 연결.

### 인스턴스 플랜
`render.yaml` 은 `plan: starter`(상시 가동, 슬립 없음)로 설정돼 있다.
트래픽이 커지면 `standard`/`pro` 로 올린다. (free 로 두면 15분 유휴 시 슬립하니 주의.)

---

## 2. 직원 연결 (Claude Code)

각 직원이 자기 PC에서 한 번만 실행:

```bash
claude mcp add --transport http teamhub \
  https://teamhub-mcp.onrender.com/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

확인:
```bash
claude mcp list          # teamhub 가 connected 로 뜨면 성공
```

### Claude Desktop
`claude_desktop_config.json` 에 원격 MCP 로 추가(또는 Settings → Connectors).
헤더에 동일하게 `Authorization: Bearer <토큰>` 을 넣는다.

---

## 3. 로컬 개발은 그대로

`PORT`/`MCP_TRANSPORT` 가 없으면 기존 `stdio` 로 동작한다. 루트 `.mcp.json` 의
`teamhub` 항목(`node server/dist/index.js`)은 수정 없이 계속 쓸 수 있다.

```bash
cd server && npm run build   # dist/index.js 생성
```

---

## 4. 토큰 관리 / 보안

- 토큰이 유출되면 Render 환경변수에서 `MCP_AUTH_TOKEN` 을 새 값으로 바꾸고 재배포 → 전원 재설정.
- 더 강한 보안(직원별 식별·권한, 클라이언트 개방)이 필요해지면:
  - 직원의 **Supabase 액세스 토큰(JWT)** 을 받아 검증하고, service_role 대신 **유저 토큰으로 RLS 적용**하는 방식으로 전환.
  - 그러면 감사 로그가 실제 사람으로 찍히고, 각자 권한 범위 안에서만 동작한다.
