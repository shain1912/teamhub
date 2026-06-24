export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: string
}

export interface Channel {
  id: string
  name: string
  description: string | null
  is_private: boolean
  is_dm: boolean
  created_at: string
}

export interface Message {
  id: string
  channel_id: string
  user_id: string | null
  body: string
  parent_id: string | null
  created_at: string
  edited_at: string | null
  profiles?: Profile | null
  reactions?: Reaction[]
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string | null
  emoji: string
  created_at: string
}

export interface FileRow {
  id: string
  channel_id: string | null
  message_id: string | null
  uploader_id: string | null
  name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export type Priority = 'normal' | 'high' | 'urgent'

export interface Announcement {
  id: string
  title: string
  body: string
  author_id: string | null
  priority: Priority
  pinned: boolean
  published_at: string
  expires_at: string | null
}

export type TicketStatus = 'open' | 'in_progress' | 'done' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TicketType = 'epic' | 'story' | 'task' | 'bug' | 'subtask'

export interface Ticket {
  id: string
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  type: TicketType
  labels: string[]
  story_points: number | null
  sprint_id: string | null
  parent_ticket_id: string | null
  reporter_id: string | null
  assignee_id: string | null
  channel_id: string | null
  due_date: string | null
  created_at: string
  updated_at: string
  assignee?: Profile | null
}

export interface TicketComment {
  id: string
  ticket_id: string
  user_id: string | null
  body: string
  created_at: string
  profiles?: Profile | null
}

export interface Project {
  id: string
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
}

export interface Sprint {
  id: string
  name: string
  project_id: string | null
  goal: string | null
  start_date: string | null
  end_date: string | null
  status: 'planned' | 'active' | 'completed'
  created_at: string
}

export interface GanttTask {
  id: string
  project_id: string
  title: string
  start_date: string
  end_date: string
  progress: number
  status: 'todo' | 'doing' | 'done'
  assignee_id: string | null
  sort_order: number
}

export interface GanttDependency {
  id: string
  task_id: string
  depends_on_task_id: string
}

export interface Checklist {
  id: string
  title: string
  project_id: string | null
  ticket_id: string | null
  owner_id: string | null
  created_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  content: string
  is_done: boolean
  assignee_id: string | null
  due_date: string | null
  follow_up_at: string | null
  completed_at: string | null
  sort_order: number
}

export type NotificationType = 'mention' | 'assignment' | 'follow_up' | 'system'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export interface AuditEntry {
  id: string
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
  profiles?: Profile | null
}
