# Google 로그인 활성화 가이드 (TeamKode)

앱엔 "Google로 계속하기" 버튼이 이미 있습니다. **Supabase에 Google provider만 켜면** 바로 동작합니다.
순서: ① Google Cloud에서 OAuth 자격증명 발급 → ② Supabase에 등록. (~10분)

> **복사해서 쓸 값**
> - 프로젝트 ref: `yyzyorxqkcmbkompymfc`
> - **승인된 리디렉션 URI**(가장 중요): `https://yyzyorxqkcmbkompymfc.supabase.co/auth/v1/callback`
> - 승인된 JavaScript 원본: `https://team.kodekorea.kr` , `http://localhost:5173`
> - 운영 주소: `https://team.kodekorea.kr`

---

## ① Google Cloud Console — OAuth 자격증명 발급

1. https://console.cloud.google.com 접속 → 상단에서 **프로젝트 선택/새로 만들기** (예: "TeamKode").
2. 좌측 메뉴 **API 및 서비스 → OAuth 동의 화면**
   - User Type: **External(외부)** 선택 → 만들기
   - 앱 이름: `TeamKode`, 사용자 지원 이메일/개발자 연락처 이메일 입력
   - 범위(Scopes): `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` 추가 (기본값으로 충분)
   - **게시 상태**: "테스트" 상태면 등록한 테스트 사용자만 가능 → 사내 전체가 쓰려면 나중에 **"앱 게시(프로덕션)"** 로 전환 (외부+민감하지 않은 범위라 보통 심사 없이 즉시)
3. **API 및 서비스 → 사용자 인증 정보(Credentials) → + 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: `TeamKode Web`
   - **승인된 JavaScript 원본**에 추가:
     ```
     https://team.kodekorea.kr
     http://localhost:5173
     ```
   - **승인된 리디렉션 URI**에 추가 (★ 이게 틀리면 로그인 실패):
     ```
     https://yyzyorxqkcmbkompymfc.supabase.co/auth/v1/callback
     ```
   - **만들기** → 뜨는 **클라이언트 ID** 와 **클라이언트 보안 비밀(Secret)** 를 복사해 둡니다.

---

## ② Supabase — Google provider 켜기

**방법 A (대시보드):**
1. https://supabase.com/dashboard → 프로젝트(`yyzyorxqkcmbkompymfc`) → **Authentication → Sign In / Providers**
2. **Google** 토글 ON → ①에서 받은 **Client ID** / **Client Secret** 붙여넣기 → **Save**
3. **Authentication → URL Configuration** 에서
   - **Site URL**: `https://team.kodekorea.kr` (이미 설정돼 있음)
   - **Redirect URLs** 에 `https://team.kodekorea.kr/**` 와 `http://localhost:5173/**` 가 있는지 확인(없으면 추가)

**방법 B (제가 대신):** ①의 **Client ID + Secret 를 저에게 주시면** Supabase Management API로 한 번에 켜고 검증해 드립니다.

---

## ③ 확인

- 운영(team.kodekorea.kr) 또는 로컬에서 로그인 화면 → **"Google로 계속하기"** → 구글 계정 선택 → 자동 로그인되면 끝.
- 처음 로그인하는 구글 계정은 `profiles` 행이 자동 생성되도록 돼 있습니다(앱의 onAuthStateChange 처리).

### 자주 나는 오류
| 증상 | 원인 / 해결 |
|------|-------------|
| `redirect_uri_mismatch` | ①의 **승인된 리디렉션 URI** 가 `https://yyzyorxqkcmbkompymfc.supabase.co/auth/v1/callback` 와 정확히 일치해야 함(끝 슬래시·http/https 주의) |
| `provider is not enabled` | ② Supabase에서 Google 토글 ON + Save 안 됨 |
| 로그인 후 localhost로 튐 | Supabase **Site URL** 이 `https://team.kodekorea.kr` 인지 확인 |
| 테스트 사용자만 됨 | ① OAuth 동의 화면을 **프로덕션으로 게시** |
