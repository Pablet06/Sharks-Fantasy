import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function HistorialAdmin({ data }: Props) {
  void data
  return <p className="admin-msg">Sección en construcción.</p>
}
