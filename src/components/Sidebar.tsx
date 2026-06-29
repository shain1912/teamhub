import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, MessageSquare, MessageCircle, Megaphone, Ticket, Rocket, BarChart3,
  CheckSquare, Users, Search, Clock, ChevronsLeft, ChevronsRight, X, LogOut, Sparkles,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import ClientsManager from './ClientsManager'

type Item = { to: string; label: string; icon: typeof Home }

const MAIN: Item[] = [
  { to: '/me', label: '내 작업', icon: Home },
  { to: '/tickets', label: '티켓', icon: Ticket },
  { to: '/sprints', label: '스프린트', icon: Rocket },
  { to: '/gantt', label: '간트차트', icon: BarChart3 },
  { to: '/checklists', label: '체크리스트', icon: CheckSquare },
  { to: '/announcements', label: '공지', icon: Megaphone },
]
const COMM: Item[] = [
  { to: '/channels', label: '채널', icon: MessageSquare },
  { to: '/dm', label: '메시지', icon: MessageCircle },
  { to: '/people', label: '팀원', icon: Users },
]
const ETC: Item[] = [
  { to: '/search', label: '검색', icon: Search },
  { to: '/audit', label: '활동', icon: Clock },
]

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const isGuest = profile?.role === 'guest'
  const [invite, setInvite] = useState(false)

  const groups: { label: string; items: Item[] }[] = isGuest
    ? [{ label: '메뉴', items: [...COMM.filter((n) => n.to === '/channels'), ...MAIN.filter((n) => n.to === '/tickets')] }]
    : [
        { label: '메인', items: MAIN },
        { label: '커뮤니케이션', items: COMM },
        { label: '기타', items: ETC },
      ]

  const name = profile?.full_name ?? profile?.email ?? '사용자'
  const inits = (profile?.full_name || profile?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden />}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 transition-[transform,width] duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0',
          'w-64',
          collapsed ? 'md:w-16' : 'md:w-64',
          'flex shrink-0 flex-col border-r border-hairline bg-bone text-ink',
        ].join(' ')}
      >
        {/* 워크스페이스 카드 */}
        <div className="flex items-center gap-2.5 px-3 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-raised">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="16" r="2" />
              <circle cx="19" cy="16" r="2" />
              <circle cx="12" cy="13" r="2.2" fill="currentColor" stroke="none" />
              <path d="M12 7.4 12 10.6M10 11.8 6.2 14.6M14 11.8l3.8 2.8" />
            </svg>
          </span>
          <div className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
            <div className="truncate font-display text-base font-bold leading-tight text-ink">TeamHub</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-wider text-ash">워크스페이스</div>
          </div>
          <button
            onClick={onToggleCollapse}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-mute transition hover:bg-black/5 hover:text-ink md:flex"
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-mute transition hover:bg-black/5 hover:text-ink md:hidden"
            aria-label="메뉴 닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 프라이머리 CTA — AI 비서 (전역 빠른 생성) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('teamhub:open-ai'))}
          className={`mx-3 mb-3 flex items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-bold text-white shadow-raised transition hover:bg-brand-dark dark:shadow-glow ${
            collapsed ? 'md:px-0' : ''
          }`}
          title="AI 비서로 빠르게 생성"
        >
          <Sparkles size={16} className="shrink-0" />
          <span className={collapsed ? 'md:hidden' : ''}>AI 비서</span>
        </button>

        {/* 네비 — 활성=좌측 액센트 + 브랜드 틴트 */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-1">
          {groups.map((g, gi) => (
            <div key={gi}>
              {!collapsed && (
                <div className="px-3 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">{g.label}</div>
              )}
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={onClose}
                    title={n.label}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        collapsed ? 'md:justify-center md:px-0' : ''
                      } ${isActive ? 'bg-brand/10 font-semibold text-brand' : 'font-medium text-charcoal hover:bg-black/5 hover:text-ink'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-brand" />}
                        <n.icon size={18} className="shrink-0" strokeWidth={isActive ? 2.3 : 1.9} />
                        <span className={collapsed ? 'md:hidden' : ''}>{n.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!isGuest && (
          <button
            onClick={() => setInvite(true)}
            className={`mx-3 mb-2 rounded-lg border border-hairline py-1.5 text-xs font-medium text-mute transition hover:border-ink/20 hover:text-ink ${
              collapsed ? 'md:hidden' : ''
            }`}
            title="클라이언트/게스트 관리"
          >
            클라이언트 · 게스트
          </button>
        )}

        {/* 유저 프로필 카드 */}
        <div className="border-t border-hairline p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">
              {inits}
            </span>
            <div className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{name}</span>
                {isGuest && <span className="rounded bg-mint px-1 py-0.5 text-[9px] font-bold text-white dark:text-canvas">게스트</span>}
              </div>
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-mint-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" /> 온라인
              </span>
            </div>
            <button
              onClick={signOut}
              className={`shrink-0 rounded-md p-1.5 text-ash transition hover:bg-black/5 hover:text-ink ${collapsed ? 'md:hidden' : ''}`}
              title="로그아웃"
              aria-label="로그아웃"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {invite && <ClientsManager onClose={() => setInvite(false)} />}
    </>
  )
}
