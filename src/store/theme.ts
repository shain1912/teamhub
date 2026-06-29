import { create } from 'zustand'

type Theme = 'light' | 'dark'

function initial(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark'
  try {
    const t = localStorage.getItem('theme')
    if (t === 'dark' || t === 'light') return t
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(t: Theme) {
  const el = document.documentElement
  el.classList.toggle('dark', t === 'dark')
  try {
    localStorage.setItem('theme', t)
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    apply(next)
    set({ theme: next })
  },
  setTheme: (t) => {
    apply(t)
    set({ theme: t })
  },
}))
