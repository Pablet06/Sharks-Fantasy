import { useAuth } from './hooks/useAuth'
import { useJugadores } from './hooks/useJugadores'
import { useUsuario } from './hooks/useUsuario'
import { Auth } from './components/Auth/Auth'
import { Dashboard } from './components/Dashboard/Dashboard'

export function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { jugadores, loading: jugadoresLoading } = useJugadores()
  const { usuario, loading: usuarioLoading, updateNombre } = useUsuario(user?.id)

  if (authLoading || jugadoresLoading) {
    return (
      <div className="loading-screen">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" className="loading-logo" />
        <p>Cargando...</p>
      </div>
    )
  }

  if (!user) return <Auth jugadores={jugadores} />

  if (usuarioLoading) {
    return (
      <div className="loading-screen">
        <p>Cargando equipo...</p>
      </div>
    )
  }

  if (!usuario) {
    return (
      <div className="error-screen">
        <p>Error cargando perfil. Contacta al admin.</p>
        <button onClick={signOut}>Cerrar sesión</button>
      </div>
    )
  }

  return (
    <Dashboard
      user={user}
      usuario={usuario}
      jugadores={jugadores}
      onSignOut={signOut}
      onUpdateNombre={updateNombre}
    />
  )
}
