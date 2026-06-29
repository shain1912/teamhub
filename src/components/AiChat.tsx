import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Check, AlertTriangle, Send } from 'lucide-react'
import { useAuth } from '../store/auth'
import { glmChat, isGlmConfigured, type GlmMessage } from '../lib/glm'
import { AI_TOOLS, executeAiTool, loadAiContext } from '../lib/aiTools'

interface ChatLine {
  role: 'user' | 'assistant'
  text: string
  actions?: { ok: boolean; summary: string }[]
}

const SYSTEM_BASE = `너는 TeamHub 협업 워크스페이스의 AI 비서다.
티켓·스프린트·프로젝트·간트·체크리스트·공지·메시지·채널·댓글·라벨·배정·반응·알림을 도구로 직접 다룬다(생성/조회/수정).
규칙:
- 요청이면 되묻지 말고 즉시 적절한 도구를 호출하라. 모호하면 합리적 기본값을 쓴다(우선순위 medium, 상태 기본값 등).
- 필요하면 먼저 조회 도구(list_*/search)로 현재 데이터를 확인한 뒤 수정/생성하라.
- 여러 항목을 요청받으면 각 항목마다 도구를 정확히 한 번씩 호출해 전부 생성하라. 누락 금지.
- 이미 성공한 도구 호출을 같은 인자로 반복하지 마라(중복 생성 금지). 도구가 성공 결과를 주면 그 작업은 끝난 것이다.
- 티켓·스프린트·프로젝트·채널·체크리스트는 이름으로 지칭하면 알아서 찾는다(UUID 불필요).
- 삭제(delete_*)는 되돌릴 수 없다. 사용자가 명확히 삭제를 요청할 때만 호출하고, 무엇을 지웠는지 분명히 알려라. 대상이 모호하면 먼저 목록을 보여주고 확인받아라.
- 제목/내용은 사용자가 말한 핵심 문구를 그대로 한국어로 사용하라. 임의로 영어로 번역하거나 "urgent issue" 같은 일반어로 바꾸지 마라. (예: "로그인 버그" 요청 → title="로그인 버그")
- 한 요청에서 우선순위·담당자·마감일 등 언급된 모든 정보를 빠짐없이 인자로 채워라.
- 날짜는 YYYY-MM-DD. "다음주","내일" 같은 표현은 오늘 날짜 기준으로 계산하라.
- 담당자는 이름 또는 이메일로 지정한다(아래 팀원 목록 참고).
- 간트작업은 프로젝트가 반드시 필요하다. 없으면 먼저 create_project 후 진행하라.
- 작업을 마치면 무엇을 만들었는지 한국어로 간단히 요약한다.`

export default function AiChat() {
  const profile = useAuth((s) => s.profile)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<ChatLine[]>([])
  const ctxRef = useRef<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines, busy])

  // 사이드바 'AI 비서' 버튼 등에서 전역 이벤트로 열기
  useEffect(() => {
    const open = () => setOpen(true)
    window.addEventListener('teamhub:open-ai', open)
    return () => window.removeEventListener('teamhub:open-ai', open)
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setLines((l) => [...l, { role: 'user', text }])
    setBusy(true)
    try {
      if (!ctxRef.current) ctxRef.current = await loadAiContext()
      const today = new Date().toISOString().slice(0, 10)
      const convo: GlmMessage[] = [
        { role: 'system', content: `${SYSTEM_BASE}\n\n오늘 날짜: ${today}\n${ctxRef.current}` },
        // 직전까지의 대화(표시용)를 간단 텍스트로 전달
        ...lines.map((l) => ({ role: l.role, content: l.text }) as GlmMessage),
        { role: 'user', content: text },
      ]

      const actions: { ok: boolean; summary: string }[] = []
      const seen = new Set<string>() // 이번 턴에 이미 실행한 변경 호출(중복 방지)
      const isMutation = (n: string) => /^(create_|delete_|post_|add_|assign_|set_|move_|toggle_)/.test(n)
      let final = ''
      // 에이전트 루프: 도구 호출이 끝날 때까지 (최대 8회)
      for (let i = 0; i < 8; i++) {
        const msg = await glmChat(convo, AI_TOOLS as unknown as unknown[])
        convo.push(msg)
        if (msg.tool_calls && msg.tool_calls.length) {
          for (const tc of msg.tool_calls) {
            let args: any = {}
            try {
              args = JSON.parse(tc.function.arguments || '{}')
            } catch {
              args = {}
            }
            const sig = `${tc.function.name}:${JSON.stringify(args)}`
            let result
            if (isMutation(tc.function.name) && seen.has(sig)) {
              // 같은 변경을 한 턴에 또 호출 → 실행하지 않고 이미 처리됨으로 응답
              result = { ok: true, summary: `(중복 무시) ${tc.function.name} 은(는) 이미 처리됨` }
            } else {
              result = await executeAiTool(tc.function.name, args, { userId: profile?.id ?? null })
              if (isMutation(tc.function.name)) seen.add(sig)
              actions.push(result)
            }
            convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
          }
          continue // 결과를 모델에 다시 전달해 후속 판단
        }
        final = msg.content ?? ''
        break
      }
      setLines((l) => [...l, { role: 'assistant', text: final || '완료했습니다.', actions: actions.length ? actions : undefined }])
      // 생성 결과가 현재 페이지에 반영되도록 새로고침 신호
      if (actions.some((a) => a.ok)) window.dispatchEvent(new CustomEvent('teamhub:data-changed'))
    } catch (e: any) {
      setLines((l) => [...l, { role: 'assistant', text: `오류가 났어요: ${e?.message ?? e}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-overlay transition hover:bg-brand-dark dark:shadow-glow"
        aria-label="AI 비서 열기"
        title="AI 비서"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {/* 패널 */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[32rem] max-h-[calc(100vh-7rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white"><Sparkles size={15} /></span>
            <div className="flex-1">
              <div className="text-sm font-bold text-ink">AI 비서</div>
              <div className="text-[11px] text-ash">티켓·스프린트·간트·체크리스트를 만들어줘요</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {!isGlmConfigured && (
              <p className="rounded-xl bg-brand/10 p-3 text-xs text-brand-dark">
                <code className="font-mono">VITE_GLM_API_KEY</code> 가 설정되지 않았습니다. <code>.env</code> 에 z.ai 키를 넣고 새로고침하세요.
              </p>
            )}
            {lines.length === 0 && isGlmConfigured && (
              <div className="space-y-2 text-xs text-mute">
                <p className="font-semibold text-charcoal">예시로 이렇게 말해보세요:</p>
                {[
                  '로그인 버그 티켓 만들어줘. 우선순위 높음, 담당 철수, 내일까지',
                  '다음주 월요일부터 2주짜리 스프린트 "출시 준비" 만들어줘',
                  '배포 체크리스트 만들어. 항목: 빌드, 테스트, 롤백계획',
                ].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="block w-full rounded-xl border border-hairline bg-bone px-3 py-2 text-left transition hover:border-brand/40"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {lines.map((l, i) => (
              <div key={i} className={l.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    l.role === 'user' ? 'bg-brand text-white' : 'bg-bone text-ink'
                  }`}
                >
                  {l.text}
                </div>
                {l.actions && (
                  <div className="mt-1 space-y-1">
                    {l.actions.map((a, j) => (
                      <div
                        key={j}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
                          a.ok ? 'bg-mint-soft text-mint-ink' : 'bg-danger-soft text-danger-ink'
                        }`}
                      >
                        {a.ok ? <Check size={12} className="shrink-0" /> : <AlertTriangle size={12} className="shrink-0" />}
                        <span>{a.summary}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="text-xs text-ash">생각 중…</div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
            className="flex items-center gap-2 border-t border-hairline px-3 py-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isGlmConfigured || busy}
              placeholder="무엇을 만들까요?"
              className="min-w-0 flex-1 rounded-lg border border-hairline px-3 py-1.5 text-sm outline-none focus:border-ink disabled:opacity-50"
            />
            <button
              disabled={!isGlmConfigured || busy || !input.trim()}
              aria-label="보내기"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white transition hover:bg-brand-dark disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
