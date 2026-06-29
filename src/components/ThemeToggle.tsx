import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../store/theme'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      className={`grid h-9 w-9 place-items-center rounded-full text-mute transition hover:bg-bone hover:text-ink ${className}`}
      title={dark ? '라이트 모드로' : '다크 모드로'}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
