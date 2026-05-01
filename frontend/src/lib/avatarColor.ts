/**
 * Generate a consistent avatar swatch from a sender's name.
 *
 * Same input → same swatch (Slack/Gmail behaviour). The palette is a single
 * neutral gray ramp so avatars don't fight the rest of the UI for attention;
 * variation comes from initials, not hue.
 */

const COLORS = [
  { bg: 'bg-gray-100',  border: 'border-gray-200',  text: 'text-gray-800'  },
  { bg: 'bg-gray-200',  border: 'border-gray-300',  text: 'text-gray-900'  },
  { bg: 'bg-stone-100', border: 'border-stone-200', text: 'text-stone-800' },
  { bg: 'bg-stone-200', border: 'border-stone-300', text: 'text-stone-900' },
  { bg: 'bg-zinc-100',  border: 'border-zinc-200',  text: 'text-zinc-800'  },
  { bg: 'bg-zinc-200',  border: 'border-zinc-300',  text: 'text-zinc-900'  },
  { bg: 'bg-neutral-100', border: 'border-neutral-200', text: 'text-neutral-800' },
  { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-800'  },
  { bg: 'bg-slate-200', border: 'border-slate-300', text: 'text-slate-900'  },
]

export function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}
