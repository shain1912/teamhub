import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import Login from './pages/Login'
import Layout from './components/Layout'
import MyWork from './pages/MyWork'
import People from './pages/People'
import Channels from './pages/Channels'
import Announcements from './pages/Announcements'
import Tickets from './pages/Tickets'
import Sprints from './pages/Sprints'
import Gantt from './pages/Gantt'
import Checklists from './pages/Checklists'
import Search from './pages/Search'
import Notifications from './pages/Notifications'
import Audit from './pages/Audit'

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
        <Route path="/" element={<Navigate to="/me" replace />} />
        <Route path="/me" element={<MyWork />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:userId" element={<People />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/channels/:channelId" element={<Channels />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/sprints" element={<Sprints />} />
        <Route path="/gantt" element={<Gantt />} />
        <Route path="/checklists" element={<Checklists />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/me" replace />} />
      </Routes>
    </Layout>
  )
}
