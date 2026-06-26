import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../store/auth'
import ClientsManager from './ClientsManager'

const NAV = [
  { to: '/me', label: '내 작업', icon: '🏠' },
  { to: '/channels', label: '채널', icon: '💬' },
  { to: '/announcements', label: '공지', icon: '📢' },
  { to: '/tickets', label: '티켓', icon: '🎫' },
  { to: '/sprints', label: '스프린트', icon: '🏃' },
  { to: '/gantt', label: '간트차트', icon: '📊' },
  { to: '/checklists', label: '체크리스트', icon: '✅' },
  { to: '/people', label: '팀원', icon: '👥' },
  { to: '/search', label: '검색', icon: '🔍' },
  { to: '/audit', label: '활동', icon: '🕑' },
]

interface SidebarProps {
  /** 데스크탑 아이콘만 보기(접힘) 여부 */
  collapsed: boolean
  /** 데스크탑 접기/펴기 토글 */
  onToggleCollapse: () => void
  /** 모바일 드로어 열림 여부 */
  mobileOpen: boolean
  /** 모바일 드로어 닫기(배경 탭·네비 이동 시) */
  onClose: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const isGuest = profile?.role === 'guest'
  const [invite, setInvite] = useState(false)
  // 게스트는 채널·티켓만 (나머지 섹션은 RLS로도 비지만 UI에서도 숨김)
  const nav = isGuest ? NAV.filter((n) => n.to === '/channels' || n.to === '/tickets') : NAV

  return (
    <>
      {/* 모바일 배경 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={[
          // 모바일: 화면 밖 고정 드로어 → mobileOpen 시 슬라이드 인
          'fixed inset-y-0 left-0 z-40 transition-[transform,width] duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // 데스크탑: 항상 보이고 흐름 안에 배치
          'md:static md:z-auto md:translate-x-0',
          // 폭: 모바일은 항상 w-56, 데스크탑은 접힘에 따라 w-16/w-56
          'w-56',
          collapsed ? 'md:w-16' : 'md:w-56',
          'flex shrink-0 flex-col bg-ink text-white',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
          <span
            className={`font-display text-xl font-bold tracking-tight text-white ${
              collapsed ? 'md:hidden' : ''
            }`}
          >
            TeamHub
          </span>
          {/* 데스크탑 접기/펴기 토글 (모바일에선 숨김) */}
          <button
            onClick={onToggleCollapse}
            className="ml-auto hidden h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white md:flex"
            title={collapsed ? '펼치기' : '접기'}
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {collapsed ? '»' : '«'}
          </button>
          {/* 모바일 닫기 버튼 */}
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onClose}
              title={n.label}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-full px-3 py-2 text-sm transition ${
                  collapsed ? 'md:justify-center md:px-0' : ''
                } ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />
                  )}
                  <span className="text-base">{n.icon}</span>
                  <span className={collapsed ? 'md:hidden' : ''}>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {!isGuest && (
          <button
            onClick={() => setInvite(true)}
            className={`mx-2 mb-1 rounded-full border border-white/15 py-1.5 text-xs text-white/70 transition hover:bg-white/5 hover:text-white ${
              collapsed ? 'md:hidden' : ''
            }`}
            title="클라이언트/게스트 관리"
          >
            클라이언트 · 게스트
          </button>
        )}

        <div className="border-t border-white/10 px-4 py-3 text-xs">
          <div className={`flex items-center gap-1.5 truncate text-white/80 ${collapsed ? 'md:hidden' : ''}`}>
            {isGuest && <span className="rounded-full bg-brand/30 px-1.5 py-0.5 text-[9px] font-semibold text-white">게스트</span>}
            <span className="truncate">{profile?.full_name ?? profile?.email ?? '사용자'}</span>
          </div>
          <button
            onClick={signOut}
            className="mt-1 text-white/45 transition hover:text-white"
            title="로그아웃"
          >
            {collapsed ? <span className="hidden md:inline">⎋</span> : null}
            <span className={collapsed ? 'md:hidden' : ''}>로그아웃</span>
          </button>
        </div>
      </aside>

      {invite && <ClientsManager onClose={() => setInvite(false)} />}
    </>
  )
}
