// Which user id should this request delete?
export function resolveTarget(
  callerId: string,
  callerIsAdmin: boolean,
  body: { target_user_id?: string } | null,
): { id: string } | { error: string } {
  const target = body?.target_user_id
  if (!target || target === callerId) return { id: callerId }
  if (!callerIsAdmin) return { error: 'forbidden' }
  return { id: target }
}
