interface Props {
  onClose: () => void
}

// The jornada stat editor is disabled until Phase B. The old version never
// loaded the existing historial row for the selected (jugador, jornada), so
// hitting "Guardar" overwrote a real jornada with zeros — corrupting the
// player's accumulated stats and the ranking. Phase B rebuilds this panel as
// a full view (see docs/superpowers/specs/2026-09-03-federation-sync-and-admin-design.md).
// Until then, correct historial rows directly in Supabase.
export function AdminPanel({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={e => e.stopPropagation()}>
        <div className="admin-header">
          <h2>Admin Panel</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>

        <div className="admin-section">
          <h3>Editar Jornada</h3>
          <p className="admin-msg">
            🚧 El editor de estadísticas está deshabilitado hasta la Fase B.
            No cargaba los valores existentes y guardar sobrescribía la jornada
            con ceros. Para correcciones puntuales, edita la tabla{' '}
            <code>historial</code> directamente en Supabase.
          </p>
        </div>
      </div>
    </div>
  )
}
