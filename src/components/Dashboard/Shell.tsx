import type { ReactNode } from 'react'

export type Tab = 'team' | 'ranking' | 'players' | 'profile'

interface ShellProps {
  tab: Tab
  onTabChange: (t: Tab) => void
  onSignOut: () => void
  children: ReactNode
}

const NAV_ITEMS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'team',    icon: '🌊', label: 'Mi Equipo'  },
  { tab: 'ranking', icon: '🏆', label: 'Ranking'    },
  { tab: 'players', icon: '👥', label: 'Jugadores'  },
  { tab: 'profile', icon: '👤', label: 'Perfil'     },
]

export function Shell({ tab, onTabChange, onSignOut, children }: ShellProps) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks" className="header-logo" />
        <h1 className="header-title">SHARKS FANTASY</h1>
        <button onClick={onSignOut} className="signout-btn">Salir</button>
      </header>

      <main className="dashboard-main">
        {children}
      </main>

      <nav className="bottom-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.tab}
            className={`bottom-nav-btn ${tab === item.tab ? 'active' : ''}`}
            onClick={() => onTabChange(item.tab)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
