import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario } from '../../types'

interface Props {
  usuario: Usuario
  userEmail: string
  onUpdate: (nombre: string) => Promise<unknown>
  onSignOut: () => void
}

export function Profile({ usuario, userEmail, onUpdate, onSignOut }: Props) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await onUpdate(nombre)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      alert('Sesión expirada. Vuelve a iniciar sesión.')
      setDeleting(false)
      setConfirmDelete(false)
      return
    }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
    })
    if (res.ok) {
      onSignOut()
    } else {
      alert('Error eliminando cuenta. Contacta al admin.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="profile">
      <h2 className="section-title">Mi Perfil</h2>

      <div className="profile-email">
        <span className="label">Email</span>
        <span className="value">{userEmail}</span>
      </div>

      <div className="profile-field">
        <label className="label" htmlFor="nombre-input">Nombre del entrenador</label>
        <div className="input-row">
          <input
            id="nombre-input"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className="auth-input"
          />
          <button onClick={handleSave} disabled={saving} className="save-btn">
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="danger-zone">
        <h3>Zona de peligro</h3>
        {!confirmDelete ? (
          <button className="danger-btn" onClick={() => setConfirmDelete(true)}>
            Eliminar cuenta
          </button>
        ) : (
          <div className="confirm-delete">
            <p>¿Seguro? Se borrarán todos tus datos permanentemente.</p>
            <button className="danger-btn" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
            <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
