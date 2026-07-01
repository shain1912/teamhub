# TeamHub MCP 원격 배포 (팀 공유)

로컬 `stdio` MCP는 "내 PC의 내 Claude"만 쓸 수 있다. 팀원들이 각자 Claude에서
TeamHub를 AI로 다루게 하려면 MCP 서버를 **HTTP 로 호스팅**하고 각자 접속하게 한다.

```
직원 Claude ──(HTTPS + Bearer 토큰)──▶ teamhub-mcp (VPS .156, Cloudflare) ──(service_role)──▶ 자체호스팅 Supabase
```

> ⚠️ 이 서버는 **service_role 키**(RLS 우회 = DB god-mode)로 동작한다.
> 키는 **서버 환경변수에만** 두고, 직원에게는 절대 주지 않는다. 직원은 `MCP_AUTH_TOKEN` 만 받는다.
> 그래서 신뢰하는 **내부 직원용**이다. 외부 클라이언트에 열려면 유저별 인증(OAuth/Supabase JWT)으로 업그레이드해야 한다.

> **2026-07 인프라 전환**: Render/Supabase Cloud를 더 이상 쓰지 않는다. `teamhub-mcp`는 자체 VPS(156.228.4.156, Cloudflare 프록시)의 Docker 컨테이너로 `mcp.kodekorea.kr`에서 동작한다. `*.onrender.com`/`*.supabase.co`를 하드코딩하지 않는다. 인프라 전반은 `kodekorea-cloud` 스킬 참고.

---

## 1. 배포 (VPS Docker + Caddy)

`render.yaml`은 더 이상 쓰지 않는다. 배포는 `.156` 박스에서 직접:

1. 박스에 SSH: `ssh -i ~/.ssh/id_rsa -o ConnectionAttempts=25 ubuntu@156.228.4.156` (SSH 패킷손실 있어 재시도 옵션 필수)
2. 레포 클론/풀: `~/render-apps/teamhub` (server/ 이미지 빌드)
3. 컨테이너 실행: `docker run -d --restart unless-stopped -p 127.0.0.1:<port>:<containerport> --env-file ~/render-apps/env/teamhub-mcp.env <image>` — 아래 환경변수 필요:
   - `SUPABASE_URL` = `https://supabase.kodekorea.kr`
   - `SUPABASE_SERVICE_ROLE_KEY` = 자체호스팅 Supabase의 legacy JWT service_role 키 (Studio 또는 서버 `.env`에서 확인 — SSH 터널로만 접근)
   - `MCP_TRANSPORT` = `http`
   - `MCP_AUTH_TOKEN` = 직원에게 공유할 토큰 (새로 발급 시 충분히 긴 랜덤 문자열)
4. Caddy에 `mcp.kodekorea.kr { reverse_proxy 127.0.0.1:<port> }` 블록 추가 → `sudo systemctl reload caddy`
5. Cloudflare에 `mcp.kodekorea.kr` A 레코드 → `156.228.4.156`, **Proxied**
6. 배포 완료 후 헬스체크: `https://mcp.kodekorea.kr/healthz` → `{"ok":true,...}`

시크릿은 `~/render-apps/env/*.env`(박스 안, chmod 600)에만 둔다. **git에 커밋하거나 클라이언트에 노출하지 않는다.**

---

## 2. 직원 연결 (Claude Code)

각 직원이 자기 PC에서 한 번만 실행:

```bash
claude mcp add --transport http teamhub \
  https://mcp.kodekorea.kr/mcp \
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
`teamhub` 항목(`node server/dist/index.js`)은 수정 없이 계속 쓸 수 있다. `.env`의
`VITE_SUPABASE_URL`만 `https://supabase.kodekorea.kr`로 맞추면 된다.

```bash
cd server && npm run build   # dist/index.js 생성
```

---

## 4. 토큰 관리 / 보안

- 토큰이 유출되면 `.156`의 `teamhub-mcp` 컨테이너 env에서 `MCP_AUTH_TOKEN` 을 새 값으로 바꾸고 재기동 → 전원 재설정.
- 더 강한 보안(직원별 식별·권한, 클라이언트 개방)이 필요해지면:
  - 직원의 **Supabase 액세스 토큰(JWT)** 을 받아 검증하고, service_role 대신 **유저 토큰으로 RLS 적용**하는 방식으로 전환.
  - 그러면 감사 로그가 실제 사람으로 찍히고, 각자 권한 범위 안에서만 동작한다.
