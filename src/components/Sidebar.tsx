import { NavLink } from 'react-router-dom'
import { useAuth } from '../store/auth'

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

export default function Sidebar() {
  const { profile, signOut } = useAuth()

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink text-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="h-2.5 w-2.5 rounded-full bg-brand" />
        <span className="font-display text-xl font-bold tracking-tight text-white">TeamHub</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-full px-3 py-2 text-sm transition ${
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
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3 text-xs">
        <div className="truncate text-white/80">{profile?.full_name ?? profile?.email ?? '사용자'}</div>
        <button onClick={signOut} className="mt-1 text-white/45 transition hover:text-white">
          로그아웃
        </button>
      </div>
    </aside>
  )
}
