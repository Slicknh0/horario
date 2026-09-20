import { err, ok, type Plan, type Result } from './types'

export const PLAN_LIMITS: Record<Plan, { maxActiveServices: number }> = {
  free: { maxActiveServices: 3 },
  pro: { maxActiveServices: Number.POSITIVE_INFINITY },
}

export function canActivateService(
  plan: Plan,
  activeCount: number,
): Result<void, 'PLAN_LIMIT'> {
  return activeCount < PLAN_LIMITS[plan].maxActiveServices
    ? ok(undefined)
    : err('PLAN_LIMIT')
}
