import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useWorkspace } from './store/workspace'
import Login from './pages/Login'
import Join, { PENDING_INVITE_KEY, INVITE_ERROR_KEY } from './pages/Join'
import Layout from './components/Layout'
import MyWork from './pages/MyWork'
import People from './pages/People'
import Channels from './pages/Channels'
import DirectMessages from './pages/DirectMessages'
import Announcements from './pages/Announcements'
import Tickets from './pages/Tickets'
import Sprints from './pages/Sprints'
import Gantt from './pages/Gantt'
import Checklists from './pages/Checklists'
import Search from './pages/Search'
import Notifications from './pages/Notifications'
import Audit from './pages/Audit'
import MyPage from './pages/MyPage'
import Trash from './pages/Trash'

export default function App() {
  const { session, loading, init, profile } = useAuth()
  const { list, load, accept } = useWorkspace()
  const navigate = useNavigate()
  const [wsReady, setWsReady] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  // 로그인 완료 → 워크스페이스 로드 + 대기 중인 초대 자동 수락
  useEffect(() => {
    if (!session || !profile) {
      setWsReady(false)
      return
    }
    let cancelled = false
    ;(async () => {
      let pending: string | null = null
      try {
        pending = sessionStorage.getItem(PENDING_INVITE_KEY)
      } catch {
        /* ignore */
      }
      if (pending) {
        const res = await accept(pending)
        try {
          sessionStorage.removeItem(PENDING_INVITE_KEY)
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setWsReady(true)
          if (res.error) {
            try {
              sessionStorage.setItem(INVITE_ERROR_KEY, res.error)
            } catch {
              /* ignore */
            }
            navigate('/join')
          } else {
            navigate('/me')
          }
        }
        return
      }
      await load()
      if (!cancelled) setWsReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [session, profile, accept, load, navigate])

  if (loading) {
    return <div className="grid h-full place-items-center text-ash">불러오는 중…</div>
  }

  // 비로그인 — /join 은 초대 링크로 처음 오는 사람을 위해 공개 접근 허용
  if (!session) {
    return (
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  // 로그인됨 — 워크스페이스 로드/초대 처리 대기
  if (!wsReady) {
    return <div className="grid h-full place-items-center text-ash">불러오는 중…</div>
  }

  const isGuest = profile?.role === 'guest'

  // 비게스트인데 소속 워크스페이스가 없으면 → 참여 안내(게스트는 채널 접근 유지)
  if (list.length === 0 && !isGuest) {
    return (
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="*" element={<Join />} />
      </Routes>
    )
  }

  const home = isGuest ? '/channels' : '/me'

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/me" element={<MyWork />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:userId" element={<People />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/channels/:channelId" element={<Channels />} />
        <Route path="/dm" element={<DirectMessages />} />
        <Route path="/dm/:channelId" element={<DirectMessages />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/sprints" element={<Sprints />} />
        <Route path="/gantt" element={<Gantt />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/join" element={<Join />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  )
}
