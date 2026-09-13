import type { ReactNode } from 'react'

export type Tab = 'team' | 'ranking' | 'players' | 'profile' | 'apuestas'

interface ShellProps {
  tab: Tab
  onTabChange: (t: Tab) => void
  onSignOut: () => void
  isAdmin?: boolean
  onAdminClick?: () => void
  hideNav?: boolean
  children: ReactNode
}

const NAV_ITEMS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'team',     icon: '🌊', label: 'Mi Equipo'  },
  { tab: 'apuestas', icon: '🎲', label: 'Apuestas'   },
  { tab: 'ranking',  icon: '🏆', label: 'Ranking'    },
  { tab: 'players',  icon: '👥', label: 'Jugadores'  },
  { tab: 'profile',  icon: '👤', label: 'Perfil'     },
]

export function Shell({ tab, onTabChange, onSignOut, isAdmin, onAdminClick, hideNav, children }: ShellProps) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks" className="header-logo" />
        <h1 className="header-title">SHARKS FANTASY</h1>

        {/* Desktop nav — hidden on mobile via CSS */}
        {!hideNav && (
          <nav className="desktop-only desktop-nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.tab}
                className={`desktop-nav-btn ${tab === item.tab ? 'active' : ''}`}
                onClick={() => onTabChange(item.tab)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {isAdmin && <button onClick={onAdminClick} className="admin-btn">Admin</button>}
        <button onClick={onSignOut} className="signout-btn">Salir</button>
      </header>

      <main className="dashboard-main">
        {children}
      </main>

      {/* Mobile bottom nav — hidden on desktop via CSS */}
      {!hideNav && (
        <nav className="bottom-nav mobile-only">
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
      )}
    </div>
  )
}
