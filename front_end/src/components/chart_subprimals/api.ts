import { getApiBase as resolveApiBase } from '../../utils/apiBase'

export function getApiBase(): string {
  return resolveApiBase()
}

export function toApiParams(code: string): { baseImps: string; hint?: string; fatLimit?: number } {
  if (code === '112A_L') return { baseImps: '112A', hint: 'light' }
  if (code === '112A_H') return { baseImps: '112A', hint: 'heavy' }
  if (code === '168_1') return { baseImps: '168', hint: 'Round, top inside round', fatLimit: 1 }
  if (code === '168_3') return { baseImps: '168', hint: 'Round, top inside round', fatLimit: 3 }
  return { baseImps: code }
}
