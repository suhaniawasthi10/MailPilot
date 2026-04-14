/**
 * Generate a consistent avatar color from a sender's name.
 *
 * Same input always produces the same color (like Slack/Gmail).
 * Palette is tuned for our cream/ink theme — muted, watercolor-style
 * tones that sit cleanly on cream paper. No neon, no /15 dark-mode bg.
 */

const COLORS = [
  // Editorial palette: tinted "ink on aged paper" — light bg + rich text
  { bg: 'bg-rose-100',    border: 'border-rose-200',    text: 'text-rose-800'    }, // dusty rose
  { bg: 'bg-amber-100',   border: 'border-amber-200',   text: 'text-amber-900'   }, // clay
  { bg: 'bg-orange-100',  border: 'border-orange-200',  text: 'text-orange-900'  }, // terracotta
  { bg: 'bg-emerald-100', border: 'border-emerald-200', text: 'text-emerald-900' }, // sage
  { bg: 'bg-teal-100',    border: 'border-teal-200',    text: 'text-teal-900'    }, // mint
  { bg: 'bg-blue-100',    border: 'border-blue-200',    text: 'text-blue-900'    }, // dusty blue
  { bg: 'bg-violet-100',  border: 'border-violet-200',  text: 'text-violet-900'  }, // plum
  { bg: 'bg-pink-100',    border: 'border-pink-200',    text: 'text-pink-900'    }, // soft pink
  { bg: 'bg-stone-200',   border: 'border-stone-300',   text: 'text-stone-800'   }, // warm tan
  { bg: 'bg-slate-200',   border: 'border-slate-300',   text: 'text-slate-800'   }, // pewter
]

export function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}
