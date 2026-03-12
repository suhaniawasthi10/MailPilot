/**
 * Generate a consistent color from a sender's name.
 * Same name always produces the same color (like Slack/Gmail).
 */

const COLORS = [
  { bg: 'bg-rose-500/15', border: 'border-rose-500/25', text: 'text-rose-400' },
  { bg: 'bg-blue-500/15', border: 'border-blue-500/25', text: 'text-blue-400' },
  { bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', text: 'text-emerald-400' },
  { bg: 'bg-violet-500/15', border: 'border-violet-500/25', text: 'text-violet-400' },
  { bg: 'bg-amber-500/15', border: 'border-amber-500/25', text: 'text-amber-400' },
  { bg: 'bg-cyan-500/15', border: 'border-cyan-500/25', text: 'text-cyan-400' },
  { bg: 'bg-pink-500/15', border: 'border-pink-500/25', text: 'text-pink-400' },
  { bg: 'bg-teal-500/15', border: 'border-teal-500/25', text: 'text-teal-400' },
  { bg: 'bg-orange-500/15', border: 'border-orange-500/25', text: 'text-orange-400' },
  { bg: 'bg-indigo-500/15', border: 'border-indigo-500/25', text: 'text-indigo-400' },
]

export function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}
