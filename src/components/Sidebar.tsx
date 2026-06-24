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
    <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-200">
      <div className="px-5 py-4 text-lg font-bold text-white">TeamHub</div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive ? 'bg-brand text-white' : 'hover:bg-slate-800'
              }`
            }
          >
            <span>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 px-4 py-3 text-xs">
        <div className="truncate text-slate-300">{profile?.full_name ?? profile?.email ?? '사용자'}</div>
        <button onClick={signOut} className="mt-1 text-slate-400 hover:text-white">
          로그아웃
        </button>
      </div>
    </aside>
  )
}
