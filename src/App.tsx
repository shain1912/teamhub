import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import Login from './pages/Login'
import Layout from './components/Layout'
import Channels from './pages/Channels'
import Announcements from './pages/Announcements'
import Tickets from './pages/Tickets'
import Gantt from './pages/Gantt'
import Checklists from './pages/Checklists'

export default function App() {
  const { session, loading, init } = useAuth()

  useEffect(() => {
    init()
  }, [init])

  if (loading) {
    return <div className="grid h-full place-items-center text-slate-400">불러오는 중…</div>
  }

  if (!session) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/channels" replace />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/channels/:channelId" element={<Channels />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/gantt" element={<Gantt />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="*" element={<Navigate to="/channels" replace />} />
      </Routes>
    </Layout>
  )
}
