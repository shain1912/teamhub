import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import AnnouncementBanner from './AnnouncementBanner'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AnnouncementBanner />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
