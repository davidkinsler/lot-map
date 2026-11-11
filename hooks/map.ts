// What the map knows: which station an action belongs to, what to call it, and how to draw the board.
// Nothing here touches the engine.
import type { Board, Entry, StationId } from '../types'
import { stringsFor } from './text'
import type { Strings } from './text'

// ---- stations ---------------------------------------------------------------------------------

export const STATIONS: { id: StationId; icon: string }[] = [
  { id: 'you', icon: `${ring(0, -3.6, 3.4)}M-6.5 8c0-4 3-6.2 6.5-6.2s6.5 2.2 6.5 6.2` },
  { id: 'model', icon: 'M-5 -5h10v10h-10zM-2 -8.5v3.5M2 -8.5v3.5M-2 5v3.5M2 5v3.5M-8.5 -2h3.5M-8.5 2h3.5M5 -2h3.5M5 2h3.5' },
  { id: 'memory', icon: `M-5 4.5L0 -5L6 3.5M-5 4.5L6 3.5${ring(-5, 4.5, 2.1)}${ring(0, -5, 2.1)}${ring(6, 3.5, 2.1)}` },
  { id: 'files', icon: 'M-5.5 -8h7.5l3.5 3.5v12.5h-11zM2 -8v3.5h3.5' },
  { id: 'shell', icon: 'M-7.5 -5l5 5l-5 5M0 6h7.5' },
  { id: 'web', icon: `${ring(0, 0, 7.8)}M-7.8 0h15.6M0 -7.8c-4.2 4.2 -4.2 11.4 0 15.6M0 -7.8c4.2 4.2 4.2 11.4 0 15.6` },
  { id: 'browser', icon: 'M-8.5 -6.5h17v13h-17zM-8.5 -2.8h17M-6.3 -4.7h.1M-3.8 -4.7h.1' },
  { id: 'agents', icon: `M0 -4v3.5M0 -.5L-6 4M0 -.5L6 4${ring(0, -6, 2.1)}${ring(-6.5, 5.5, 2.1)}${ring(6.5, 5.5, 2.1)}` },
  { id: 'skills', icon: 'M1.5 -8.5L-5.5 1h4.5l-1.5 7.5l7.5 -9.8h-4.5z' },
  { id: 'hooks', icon: `M2.5 -5.5v8a4.2 4.2 0 1 1 -8.4 0v-1.5${ring(2.5, -7.3, 1.8)}` },
]

function ring(x: number, y: number, r: number): string {
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

// ---- what the person set -----------------------------------------------------------------------

/** The mod's options made ready to use. Whatever is missing or malformed counts as not set. */
export type Setup = {
  t: Strings
  core: string
  memoryServers: ReadonlySet<string>
  memoryCommands: readonly string[]
  /** The words after a memory command that may be shown. Any other word could be content. */
  memorySubcommands: ReadonlySet<string>
  memoryPaths: readonly string[]
  memoryLabels: ReadonlyMap<string, string>
  hookRecords: boolean
  /** Whether the first line of a hook's refusal is shown. Off, the row names only the tool. */
  hookReasons: boolean
  theme: 'auto' | 'dark' | 'light'
  /** Who sits at the top of the ring: the person, or the network with the person at the bottom. */
  layout: 'you-top' | 'you-bottom'
}

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => String(x).trim()).filter(x => x !== '')

export function setupFrom(options: Readonly<Record<string, unknown>> = {}): Setup {
  const memoryLabels = new Map<string, string>()
  for (const pair of list(options.memoryLabels)) {
    const at = pair.indexOf('=')
    if (at > 0 && at < pair.length - 1) memoryLabels.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
  }
  const core = typeof options.coreName === 'string' ? options.coreName.trim().slice(0, 10) : ''
  return {
    t: stringsFor(options.language),
    core: core === '' ? 'CLAUDE' : core,
    memoryServers: new Set(list(options.memoryServers)),
    memoryCommands: list(options.memoryCommands),
    memorySubcommands: new Set(list(options.memorySubcommands)),
    memoryPaths: list(options.memoryPaths),
    memoryLabels,
    hookRecords: options.hookRecords === true,
    hookReasons: options.hookReasons === true,
    theme: options.theme === 'dark' || options.theme === 'light' ? options.theme : 'auto',
    layout: options.layout === 'you-bottom' ? 'you-bottom' : 'you-top',
  }
}

// ---- classification ---------------------------------------------------------------------------

export type Classified = { station: StationId; label: string }

/** A path with Windows separators written as `/`, so that one rule reads paths from every system. */
const slashes = (path: string): string => path.replace(/\\/g, '/')

const lastTwo = (path: string): string => slashes(path).split('/').filter(Boolean).slice(-2).join('/')

const HOST = /^(?:[\p{L}\p{N}.-]+|\[[0-9a-f:.]+\])(?::\d+)?$/iu

/**
 * Only the host: a login, a password, a path or a query never reach a label.
 * A password may hold `/`, `?` or `#` unencoded, so the first of them is not always where the host ends:
 * `user:pa/ss@host` reads as the host `host`, and an address that can be read both ways gives its scheme alone.
 */
function hostOf(url: string): string {
  const [, scheme = '', rest = ''] = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(.*)$/is.exec(url) ?? []
  const end = rest.search(/[/?#]/)
  const first = end < 0 ? rest : rest.slice(0, end)
  const beyond = end < 0 ? '' : rest.slice(end)
  let host = first.split('@').pop() ?? ''
  if (!first.includes('@') && first.includes(':') && beyond.includes('@')) {
    // `name:word` before an `@` further on: a port if the word is a number, or else a login and a password.
    host = /:\d+$/.test(first) ? '' : (rest.slice(rest.lastIndexOf('@') + 1).split(/[/?#]/)[0] ?? '')
  }
  return HOST.test(host) ? host.slice(0, 40) : scheme
}

/** A label as it may be shown: no control characters, which a terminal would act on, and no direction marks. */
export function clean(label: string, max = 120): string {
  const text = label.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Claude Code's own memory folder counts for everyone; anything else is the person's to name. */
const isMemoryPath = (path: string, setup: Setup): boolean => {
  const p = slashes(path)
  return /\/\.claude\/projects\/[^/]+\/memory\//.test(p) || setup.memoryPaths.some(part => p.includes(slashes(part)))
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Commands that work on files and nothing else: they read, search, move or edit them in place. echo, cd and the like say nothing either way. */
const FILE_WORDS = new Set(['cat', 'head', 'tail', 'sed', 'grep', 'rg', 'find', 'ls', 'wc', 'cp', 'mv', 'mkdir', 'touch', 'diff', 'cmp', 'sort', 'uniq', 'cut', 'tr', 'awk', 'tee', 'stat', 'file', 'du', 'tree', 'ln', 'basename', 'dirname', 'realpath', 'jq'])
const NEUTRAL_WORDS = new Set(['echo', 'printf', 'cd', 'export', 'true', 'set', 'pwd', 'sleep', 'which', 'test', '['])
const NET_WORDS = new Set(['curl', 'wget', 'gh', 'ssh', 'scp', 'sftp', 'ftp', 'rsync', 'nc', 'ncat', 'telnet', 'ping', 'dig', 'nslookup'])
/** Commands that reach the network only with some of their subcommands. */
const NET_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
  git: new Set(['push', 'pull', 'fetch', 'clone', 'ls-remote']),
  npm: new Set(['install', 'i', 'ci', 'add', 'update', 'publish', 'view', 'audit']),
  pnpm: new Set(['install', 'i', 'add', 'update', 'publish']),
  yarn: new Set(['install', 'add', 'upgrade', 'publish']),
  bun: new Set(['install', 'add', 'update', 'publish']),
  pip: new Set(['install', 'download']),
  pip3: new Set(['install', 'download']),
  docker: new Set(['pull', 'push', 'login']),
  brew: new Set(['install', 'update', 'upgrade', 'fetch']),
  cargo: new Set(['install', 'fetch', 'publish', 'update']),
}
const RUNNERS = new Set(['python', 'python3', 'bash', 'sh', 'zsh', 'node'])

/**
 * The words of each command in a shell line, leading assignments taken off. Quotes stay: a quoted word is an argument.
 * `deep` also cuts at `$(…)`, backticks and brackets, to find a command run inside another; the pieces around it are then no commands.
 */
function segments(command: string, deep = false): string[][] {
  return command
    .split(deep ? /&&|\|\||;|\||\n|\$\(|`|\(|\)/ : /&&|\|\||;|\||\n/)
    .map(part => part.trim().split(/\s+/).filter(Boolean))
    .map(words => {
      let i = 0
      while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i] ?? '')) i++
      return words.slice(i)
    })
    .filter(words => words.length > 0)
}

/** A command's own name: no quotes, no folder before it, and no `.exe` after it, so `C:\tools\curl.exe` is `curl`. */
const base = (word = ''): string => (slashes(word.replace(/["']/g, '')).split('/').pop() ?? word).replace(/\.exe$/i, '')

/** A script's name without its ending: `recall-sync.py` is `recall-sync`. */
const stem = (name: string): string => name.replace(/\.[a-z0-9]+$/i, '')

/** A name is the command itself or begins with it and a separator: `recall` names `recall-sync.py`, never `recallable`. */
const named = (name: string, command: string): boolean => {
  const s = stem(name)
  return s === command || (s.startsWith(command) && /^[-_.]/.test(s.slice(command.length)))
}

/** The name a memory command goes by: its own, or the word after it when the person listed that word as a subcommand. */
function memoryLabel(words: string[], setup: Setup): string {
  const head = base(words[0])
  if (!setup.memoryCommands.includes(head)) return stem(base(RUNNERS.has(head) && words[1] ? words[1] : words[0]))
  const sub = words[1] ?? ''
  return setup.memorySubcommands.has(sub) ? sub : head
}

function classifyBash(command: string, description: string, setup: Setup): Classified {
  const lines = segments(command)
  const label = description.trim() || base(lines[0]?.[0] ?? 'shell')
  for (const words of lines) {
    const head = base(words[0])
    const script = RUNNERS.has(head) && words[1] ? base(words[1]) : ''
    if (setup.memoryCommands.some(c => named(head, c) || named(script, c))) {
      return { station: 'memory', label: memoryLabel(words, setup) }
    }
  }
  for (const words of segments(command, true)) {
    const head = base(words[0])
    if (NET_WORDS.has(head) || NET_SUBCOMMANDS[head]?.has(words[1] ?? '') === true) return { station: 'web', label }
  }
  const real = lines.filter(words => !NEUTRAL_WORDS.has(base(words[0])))
  if (real.length > 0 && real.every(words => FILE_WORDS.has(base(words[0])))) {
    return { station: isMemoryPath(command, setup) ? 'memory' : 'files', label }
  }
  return { station: 'shell', label }
}

export function classify(tool: string, input: Record<string, unknown>, setup: Setup): Classified {
  const { t } = setup
  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const path = str(input.file_path) || str(input.notebook_path)
      const action = t.fileAction[tool === 'Read' ? 'read' : tool === 'Write' ? 'write' : 'edit']
      const name = lastTwo(path)
      return { station: isMemoryPath(path, setup) ? 'memory' : 'files', label: name === '' ? tool : `${action} ${name}` }
    }
    case 'Grep':
    case 'Glob':
      return { station: 'files', label: tool }
    case 'Bash':
      return classifyBash(str(input.command), str(input.description), setup)
    case 'WebFetch':
      return { station: 'web', label: hostOf(str(input.url)) }
    case 'WebSearch':
      return { station: 'web', label: t.webSearch }
    case 'Artifact':
      return { station: 'web', label: t.artifact }
    case 'Agent':
      return { station: 'agents', label: str(input.description) || t.subagent }
    case 'Workflow':
      return { station: 'agents', label: t.workflow }
    case 'SendMessage':
    case 'TaskStop':
      return { station: 'agents', label: tool }
    case 'Skill':
      return { station: 'skills', label: str(input.skill) || t.skill }
    case 'ToolSearch':
      return { station: 'skills', label: t.loadingTools }
    case 'AskUserQuestion':
      return { station: 'you', label: t.questionForYou }
    case 'SendUserFile':
      return { station: 'you', label: t.fileForYou }
  }
  const mcp = /^mcp__([^_].*?)__(.+)$/.exec(tool)
  if (mcp === null) return { station: 'shell', label: tool }
  const [, server = '', name = ''] = mcp
  if (setup.memoryServers.has(server)) {
    // A number, or a short identifier: a longer string under `id` could be anything.
    const id = typeof input.id === 'number' || (typeof input.id === 'string' && /^[\w-]{1,24}$/.test(input.id)) ? ` #${input.id}` : ''
    return { station: 'memory', label: (setup.memoryLabels.get(name) ?? name.replace(/_/g, ' ')) + id }
  }
  if (server === 'Claude_Browser' || server === 'claude-in-chrome') {
    const url = str(input.url)
    return { station: 'browser', label: url && /^[a-z]+:/i.test(url) ? hostOf(url) : name.replace(/_/g, ' ') }
  }
  if (server === 'terminal') return { station: 'shell', label: name.replace(/_/g, ' ') }
  if (server === 'visualize' || server.startsWith('ccd_')) return { station: 'you', label: name.replace(/_/g, ' ') }
  if (server === 'plugin-authoring') return { station: 'skills', label: name.replace(/_/g, ' ') }
  return { station: 'web', label: `${server}: ${name.replace(/_/g, ' ')}` }
}

/** `claude-opus-5-5` reads as `opus 5.5`. */
export function shortModel(model: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  return m === null ? model : `${m[1]} ${m[2]}${m[3] !== undefined ? `.${m[3]}` : ''}`
}

export function formatMs(ms: number, t: Strings): string {
  return ms < 1000 ? t.ms(Math.max(1, Math.round(ms))) : ms < 60000 ? t.seconds((ms / 1000).toFixed(1)) : t.minutes(Math.floor(ms / 60000), Math.round((ms % 60000) / 1000))
}

/** The first line of a hook's refusal, cut short: the lines after it may repeat the whole command. */
export function firstLine(text: string, max = 72): string {
  const line = (text.split('\n').find(l => l.trim() !== '') ?? '').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** The record numbers a memory hook put in front of the model: `[#123`, `[now #123`, `[todo #123`. */
export function memoryIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\[(?:[a-z]+ )?#(\d+)/g)].map(m => m[1] ?? ''))]
}

// ---- drawing ----------------------------------------------------------------------------------

const W = 460
const H = 430
const CX = 230
const CY = 212
const RX = 176
const RY = 164
const NODE = 22
const CORE = 40
/** Where spokes and pulses meet the core: outside the context ring. */
const HUB = CORE + 8

type Palette = {
  ground: string
  raised: string
  line: string
  spoke: string
  bone: string
  ash: string
  dim: string
  accent: string
  hot: string
  red: string
  mem: string
  memHot: string
}

const DARK: Palette = {
  ground: '#0a0c11',
  raised: '#12151c',
  line: '#272c36',
  spoke: '#1a1e27',
  bone: '#ebe6dc',
  ash: '#9ba1ab',
  dim: '#6b7280',
  accent: '#e1ac6e',
  hot: '#f0c595',
  red: '#e8654f',
  mem: '#62c7ba',
  memHot: '#a5e6dc',
}

const LIGHT: Palette = {
  ground: '#f5f2ea',
  raised: '#ffffff',
  line: '#cfc9bc',
  spoke: '#e3ded2',
  bone: '#1f2228',
  ash: '#5f6570',
  dim: '#8b909a',
  accent: '#b8762a',
  hot: '#8f560f',
  red: '#c5402b',
  mem: '#1c8c81',
  memHot: '#136a62',
}

/**
 * For `auto`: the drawing is made in the dark palette, and these rules repaint it where the surface around it is light.
 * Every color on the map is one of the palette's, written as a plain attribute, so a rule per color reaches all of it;
 * a surface that drops the rules shows the dark map, whole.
 */
const LIGHT_RULES = `<style>@media (prefers-color-scheme: light){${(Object.keys(DARK) as (keyof Palette)[])
  .map(k => `[fill="${DARK[k]}"]{fill:${LIGHT[k]}}[stroke="${DARK[k]}"]{stroke:${LIGHT[k]}}`)
  .join('')}}</style>`

const FONT = 'font-family="SF Mono, ui-monospace, Menlo, monospace"'

const PULSE_MS = 800
const RIPPLE_MS = 450
const GLOW_MS = 3200
const ALARM_MS = 6000
const SWITCH_MS = 8000
const DONE_MS = 1100
const TRAIL_STOPS = 7

type Point = { x: number; y: number }

/** How many places the ring is turned. The stations keep their order, so the far side of the person is always the network. */
let shift = 0
const turn = (i: number): number => ((i + shift) * 2 * Math.PI) / STATIONS.length
const at = (a: number, f = 1): Point => ({ x: CX + RX * f * Math.sin(a), y: CY - RY * f * Math.cos(a) })
const place = (i: number): Point => at(turn(i))
const indexOf = (id: StationId): number => STATIONS.findIndex(s => s.id === id)

const n1 = (v: number): string => (Math.round(v * 10) / 10).toString()
/** A moment on the drawing's own clock, which starts at zero each time it is drawn; a past moment is negative. */
const clock = (ms: number): string => `${(ms / 1000).toFixed(3)}s`

/** Where a straight line from `from` to `to` meets the circle of radius `r` around `from`. */
function edge(from: Point, to: Point, r: number): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return { x: from.x + ((to.x - from.x) * r) / d, y: from.y + ((to.y - from.y) * r) / d }
}

/** The same line moved sideways, so that several pulses on one spoke fly side by side. */
function aside(a: Point, b: Point, off: number): [Point, Point] {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const dx = (-(b.y - a.y) * off) / d
  const dy = ((b.x - a.x) * off) / d
  return [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }]
}

/** A pulse with a short tail behind it. A hollow one is a signal nobody asked for. */
function pulse(a: Point, b: Point, color: string, age: number, radius: number, isHollow = false): string {
  // A negative begin carries on where the last drawing left off, so a redraw never restarts a flight.
  const path = `M${n1(a.x)} ${n1(a.y)}L${n1(b.x)} ${n1(b.y)}`
  let out = ''
  for (let k = isHollow ? 0 : 2; k >= 0; k--) {
    const timing = `begin="${clock(k * 45 - age)}" dur="${clock(PULSE_MS)}" fill="freeze"`
    const peak = n1(1 - 0.36 * k)
    const paint = isHollow ? `fill="none" stroke="${color}" stroke-width="1.4"` : `fill="${color}"`
    out +=
      `<circle r="${n1(radius * (1 - 0.27 * k))}" ${paint} opacity="0">` +
      `<animateMotion path="${path}" ${timing}/>` +
      `<animate attributeName="opacity" values="${peak};${peak};0" keyTimes="0;.82;1" ${timing}/>` +
      `</circle>`
  }
  return out
}

/** A ring that spreads from where a pulse lands, at the moment it lands. */
function ripple(p: Point, r: number, color: string, age: number): string {
  const timing = `begin="${clock(PULSE_MS - age)}" dur="${clock(RIPPLE_MS)}" fill="freeze"`
  return (
    `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0">` +
    `<animate attributeName="r" values="${r};${r + 11}" ${timing}/>` +
    `<animate attributeName="opacity" values=".7;0" ${timing}/></circle>`
  )
}

function beam(a: Point, b: Point, color: string, age: number, isDashed: boolean): string {
  return (
    `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="3 4"' : ''} opacity="0">` +
    `<animate attributeName="opacity" values=".75;0" begin="${clock(-age)}" dur="${clock(GLOW_MS / 2)}" fill="freeze"/></line>`
  )
}

/** How far from the core a leg bends, by how many stations apart its ends are: far enough in to clear the labels under the nodes, far enough out to clear the core. */
const BEND = [0.5, 0.5, 0.4, 0.45, 0.55, 0.75]

/** The way from one station to another: a curve through the room between the core and the ring. */
function leg(i: number, j: number): { path: string; end: Point } {
  const n = STATIONS.length
  let steps = (((j - i) % n) + n) % n
  if (steps > n / 2) steps -= n
  const bend = at(turn(i + steps / 2), BEND[Math.abs(steps)] ?? 0.5)
  const a = edge(place(i), bend, NODE + 4)
  const b = edge(place(j), bend, NODE + 4)
  return { path: `M${n1(a.x)} ${n1(a.y)}Q${n1(bend.x)} ${n1(bend.y)} ${n1(b.x)} ${n1(b.y)}`, end: b }
}

/** The stations the main loop went through, oldest first, a station visited twice in a row counted once. */
export function routeOf(entries: readonly Entry[], max = TRAIL_STOPS): { station: StationId; at: number }[] {
  const stops: { station: StationId; at: number }[] = []
  for (const e of entries) {
    if (e.from === 'agents' || e.station === 'model') continue
    const last = stops[stops.length - 1]
    if (last !== undefined && last.station === e.station) last.at = e.startedAt
    else stops.push({ station: e.station, at: e.startedAt })
  }
  return stops.slice(-max)
}

function trail(entries: readonly Entry[], now: number, c: Palette): string {
  const stops = routeOf(entries)
  let out = ''
  for (let k = 1; k < stops.length; k++) {
    const from = stops[k - 1]
    const to = stops[k]
    if (from === undefined || to === undefined) continue
    const { path, end } = leg(indexOf(from.station), indexOf(to.station))
    const isHead = k === stops.length - 1
    const opacity = n1(0.12 + (0.5 * k) / (stops.length - 1))
    // The newest leg draws itself; the rest are already there.
    const drawing = isHead
      ? ` pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(to.at - now)}" dur=".5s" fill="freeze"/></path>`
      : '/>'
    out += `<path d="${path}" fill="none" stroke="${c.bone}" stroke-width="${isHead ? 1.5 : 1.1}" stroke-linecap="round" opacity="${opacity}"${drawing}`
    if (isHead) {
      out +=
        `<circle cx="${n1(end.x)}" cy="${n1(end.y)}" r="2.4" fill="${c.bone}" opacity="0">` +
        `<animate attributeName="opacity" values="0;.85" begin="${clock(to.at - now + 400)}" dur=".15s" fill="freeze"/></circle>`
    }
  }
  return out
}

type Scene = { entries: Entry[]; board: Board; now: number; c: Palette; names: Strings['stations'] }

function station(s: (typeof STATIONS)[number], i: number, { entries, board, now, c, names }: Scene): { under: string; over: string } {
  const p = place(i)
  const x = n1(p.x)
  const y = n1(p.y)
  const count = board.counts[s.id] ?? 0
  const own = entries.filter(e => e.station === s.id)
  const running = own.filter(e => e.status === 'run')
  const latest = own.length > 0 ? own[own.length - 1] : undefined
  const since = latest === undefined ? Infinity : now - (latest.endedAt ?? latest.startedAt)
  const alarm = own.filter(e => e.status === 'block' || e.status === 'err').pop()
  const alarmAge = alarm === undefined ? Infinity : now - (alarm.endedAt ?? alarm.startedAt)
  const isAlarm = alarmAge < ALARM_MS
  const isLit = running.length > 0 || since < GLOW_MS
  const [main, hot] = s.id === 'memory' ? [c.mem, c.memHot] : [c.accent, c.hot]
  const color = isAlarm ? c.red : main
  const fade = isAlarm ? alarmAge : since
  const span = isAlarm ? ALARM_MS : GLOW_MS

  let under = ''
  if (isLit || isAlarm) {
    under +=
      running.length > 0 && !isAlarm
        ? `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity=".16"/>`
        : `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity="0">` +
          `<animate attributeName="opacity" values=".3;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>`
  }
  if (running.length > 0) {
    const elapsed = now - Math.min(...running.map(e => e.startedAt))
    const beat = `begin="${clock(-(elapsed % 1400))}" dur="1.4s" repeatCount="indefinite"`
    under +=
      `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.3">` +
      `<animate attributeName="r" values="${NODE};${NODE + 15}" ${beat}/>` +
      `<animate attributeName="opacity" values=".9;0" ${beat}/></circle>`
    // Two hands of a clock around the node: the inner one goes round in a minute, the outer one in ten.
    const hand = (r: number, width: number, lapMs: number, isOnce: boolean): string =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${hot}" stroke-width="${width}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 ${x} ${y})">` +
      `<animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(-(isOnce ? Math.min(elapsed, lapMs) : elapsed % lapMs))}" dur="${clock(lapMs)}" ${isOnce ? 'fill="freeze"' : 'repeatCount="indefinite"'}/></circle>`
    under += hand(NODE + 4, 2.2, 60_000, false) + hand(NODE + 8, 1.2, 600_000, true)
  }

  // A lit node wears a ring of its color while something runs; afterwards the ring fades back to the resting line.
  const lit = `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.2"`
  const cooling =
    running.length > 0
      ? `${lit}/>`
      : isLit || isAlarm
        ? `${lit} opacity="0"><animate attributeName="opacity" values="1;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>`
        : ''
  const glyphColor = isAlarm ? c.red : isLit ? hot : s.id === 'memory' && count > 0 ? main : c.ash
  // The words stand on a rim of the ground's own color, so a line that passes behind them never strikes them through.
  const rim = `paint-order="stroke" stroke="${c.ground}" stroke-width="3.5" stroke-linejoin="round"`
  let over =
    `<circle cx="${x}" cy="${y}" r="${NODE}" fill="${c.raised}" stroke="${c.line}" stroke-width="1.2"/>${cooling}` +
    `<path transform="translate(${x} ${y})" d="${s.icon}" fill="none" stroke="${glyphColor}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${x}" y="${n1(p.y + NODE + 15)}" text-anchor="middle" ${FONT} font-size="11.5" ${rim} fill="${isLit || isAlarm ? c.bone : c.ash}">${names[s.id]}</text>`

  if (count > 0) {
    // Memory keeps two counts: what was asked for, and what a hook brought down unasked.
    const pushed = s.id === 'memory' ? Math.min(count, board.pushed ?? 0) : 0
    const asked = count - pushed
    const figures =
      pushed === 0 ? String(count) : `${asked > 0 ? `${asked} ` : ''}<tspan fill="${main}">↓${pushed}</tspan>`
    over += `<text x="${x}" y="${n1(p.y + NODE + 28)}" text-anchor="middle" ${FONT} font-size="9.5" ${rim} fill="${c.dim}">${figures}</text>`
  }

  // Top right: how many run at once. Top left: what went wrong since the last message, until the next one.
  const corner = NODE * 0.74
  if (running.length > 1) {
    over +=
      `<circle cx="${n1(p.x + corner)}" cy="${n1(p.y - corner)}" r="8" fill="${c.raised}" stroke="${color}" stroke-width="1"/>` +
      `<text x="${n1(p.x + corner)}" y="${n1(p.y - corner + 3)}" text-anchor="middle" ${FONT} font-size="8.5" fill="${hot}">×${running.length}</text>`
  }
  const faults = board.faults?.[s.id] ?? 0
  if (faults > 0) {
    over +=
      `<circle cx="${n1(p.x - corner)}" cy="${n1(p.y - corner)}" r="7.5" fill="${c.red}"/>` +
      `<text x="${n1(p.x - corner)}" y="${n1(p.y - corner + 3.1)}" text-anchor="middle" ${FONT} font-size="9" font-weight="700" fill="${c.ground}">${faults > 99 ? '99+' : faults}</text>`
  }
  return { under, over }
}


/**
 * The newest `n` entries, and before them up to twenty older ones still running,
 * so that a long call (a subagent at work, a slow command) stays on the map until it ends.
 */
export function newest(entries: readonly Entry[], n: number): Entry[] {
  const cut = Math.max(0, entries.length - n)
  return [...entries.slice(0, cut).filter(e => e.status === 'run').slice(-20), ...entries.slice(cut)]
}

export function drawMap(board: Board, now: number, setup: Setup): string {
  const c = setup.theme === 'light' ? LIGHT : DARK
  shift = setup.layout === 'you-bottom' ? STATIONS.length / 2 : 0
  const core: Point = { x: CX, y: CY }
  const recent = newest(board.entries, 40)
  const flights = recent.filter(e => now - e.startedAt < PULSE_MS + RIPPLE_MS).slice(-14)
  const returns = recent.filter(e => e.endedAt !== undefined && e.from !== 'inbound' && now - e.endedAt < PULSE_MS + RIPPLE_MS).slice(-14)
  const beams = recent.filter(e => now - e.startedAt < GLOW_MS / 2).slice(-10)
  const anyRunning = recent.some(e => e.status === 'run')
  const agentsAt = place(indexOf('agents'))
  const isBad = (e: Entry): boolean => e.status === 'block' || e.status === 'err'
  const tone = (e: Entry): [string, string] => (e.station === 'memory' ? [c.mem, c.memHot] : [c.accent, c.hot])

  let body = `<rect width="${W}" height="${H}" rx="12" fill="${c.ground}"/>`

  // Contours around the core.
  for (const [rx, ry] of [[66, 62], [104, 97], [142, 132]]) {
    body += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.line}" stroke-width=".7" opacity=".45" stroke-dasharray="2 5"/>`
  }

  // Spokes first, then whatever flies along them, then the nodes on top.
  // A spoke wears in with use: by the end of a session the map shows where the work went.
  STATIONS.forEach((s, i) => {
    const p = place(i)
    const a = edge(core, p, HUB)
    const b = edge(p, core, NODE)
    const worn = Math.min(1, Math.log2(1 + (board.counts[s.id] ?? 0)) / 7)
    const line = `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke-width="${n1(1 + 2.6 * worn)}" stroke-linecap="round"`
    body += `${line} stroke="${c.spoke}"/>`
    if (worn > 0) body += `${line} stroke="${s.id === 'memory' ? c.mem : c.accent}" opacity="${n1(worn * 0.55)}"/>`
  })

  const scene: Scene = { entries: recent, board, now, c, names: setup.t.stations }
  const drawn = STATIONS.map((s, i) => station(s, i, scene))
  body += drawn.map(d => d.under).join('')
  body += trail(recent, now, c)

  /** The two ends of an entry's spoke: where it starts (the core or the agents station) and its own station. */
  const ends = (e: Entry): [Point, Point] => {
    const p = place(indexOf(e.station))
    const start = e.from === 'agents' ? agentsAt : core
    return [edge(start, p, e.from === 'agents' ? NODE : HUB), edge(p, start, NODE)]
  }
  /** Pulses that share a spoke and a moment fly in lanes, five apart. */
  const lane = (list: Entry[], e: Entry): number => {
    const peers = list.filter(x => x.station === e.station && x.from === e.from)
    return (peers.indexOf(e) - (peers.length - 1) / 2) * 5
  }

  for (const e of beams) {
    const [a, b] = ends(e)
    body += beam(a, b, isBad(e) ? c.red : tone(e)[0], now - e.startedAt, e.from === 'inbound')
  }
  for (const e of flights) {
    const [a, b] = aside(...ends(e), lane(flights, e))
    const age = now - e.startedAt
    const color = e.status === 'block' ? c.red : tone(e)[1]
    if (e.from === 'inbound') {
      body += pulse(b, a, color, age, 3.8, true) + ripple(core, HUB - 2, color, age)
    } else {
      body += pulse(a, b, color, age, 3.8) + ripple(place(indexOf(e.station)), NODE, color, age)
    }
  }
  for (const e of returns) {
    const [a, b] = aside(...ends(e), lane(returns, e))
    body += pulse(b, a, e.status === 'ok' ? c.ash : c.red, now - (e.endedAt as number), 2.6)
  }

  body += drawn.map(d => d.over).join('')

  // Each subagent still at work circles the agents station.
  const crew = (board.agents ?? []).slice(0, 6)
  crew.forEach((_, k) => {
    const lap = 7000
    const spin = `${n1(agentsAt.x)} ${n1(agentsAt.y)}`
    body +=
      `<g><animateTransform attributeName="transform" type="rotate" from="0 ${spin}" to="360 ${spin}" begin="${clock(-((now + (k * lap) / crew.length) % lap))}" dur="${clock(lap)}" repeatCount="indefinite"/>` +
      `<circle cx="${n1(agentsAt.x)}" cy="${n1(agentsAt.y - NODE - 6)}" r="3" fill="${c.hot}"/></g>`
  })

  // A name longer than three letters shrinks to stay inside the circle.
  const coreSize = Math.min(17, 62 / (0.75 * setup.core.length))

  // The core breathes at rest and quickens while something runs.
  const period = anyRunning ? 1600 : 4800
  const breath = `begin="${clock(-(now % period))}" dur="${clock(period)}" repeatCount="indefinite"`
  body +=
    `<circle cx="${CX}" cy="${CY}" r="${CORE + 6}" fill="${c.accent}" opacity=".08">` +
    `<animate attributeName="r" values="${CORE + 3};${CORE + 13};${CORE + 3}" ${breath}/>` +
    `<animate attributeName="opacity" values=".05;${anyRunning ? '.24' : '.12'};.05" ${breath}/></circle>` +
    `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="${c.raised}" stroke="${anyRunning ? c.accent : c.line}" stroke-width="1.3"/>`

  // The context window as a ring around the core: it fills as the session goes and empties at a compaction.
  if (board.context !== undefined) {
    const full = Math.max(0, Math.min(100, Math.round(board.context)))
    const ring = `cx="${CX}" cy="${CY}" r="${CORE + 5}" fill="none" stroke-width="2.2"`
    body +=
      `<circle ${ring} stroke="${c.line}" opacity=".7"/>` +
      `<circle ${ring} stroke="${full >= 90 ? c.red : full >= 70 ? c.accent : c.ash}" pathLength="100" stroke-dasharray="${full} 100" transform="rotate(-90 ${CX} ${CY})"/>` +
      `<text x="${CX}" y="${CY - 19}" text-anchor="middle" ${FONT} font-size="8" fill="${c.dim}">${full}%</text>`
  }

  const switchAge = board.switchedAt === undefined ? Infinity : now - board.switchedAt
  const isSwitching = switchAge >= 0 && switchAge < SWITCH_MS
  body += `<text x="${CX}" y="${CY + (board.model === undefined ? 6 : 1)}" text-anchor="middle" ${FONT} font-size="${n1(coreSize)}" letter-spacing="${n1(coreSize * 0.147)}" fill="${c.bone}">${escapeXml(setup.core)}</text>`
  if (board.model !== undefined) {
    body += `<text x="${CX}" y="${CY + 17}" text-anchor="middle" ${FONT} font-size="9" fill="${isSwitching ? c.hot : c.ash}">${escapeXml(shortModel(board.model))}</text>`
  }

  // A changed model rings at the core and at its station for a few seconds.
  if (isSwitching) {
    const model = place(indexOf('model'))
    const laps = Math.ceil((SWITCH_MS - switchAge) / 1600)
    for (const [p, r] of [[core, CORE], [model, NODE]] as const) {
      const ringing = `begin="${clock(-(switchAge % 1600))}" dur="1.6s" repeatCount="${laps}" fill="freeze"`
      body +=
        `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${c.bone}" stroke-width="1.4" opacity="0">` +
        `<animate attributeName="r" values="${r};${r + 26}" ${ringing}/>` +
        `<animate attributeName="opacity" values=".7;0" ${ringing}/></circle>`
    }
  }

  // The answer leaves the core as one wide ring.
  const done = recent.filter(e => e.mark === 'done').pop()
  if (done !== undefined && now - done.startedAt < DONE_MS) {
    const leaving = `begin="${clock(done.startedAt - now)}" dur="${clock(DONE_MS)}" fill="freeze"`
    body +=
      `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="none" stroke="${c.bone}" stroke-width="1.6" opacity="0">` +
      `<animate attributeName="r" values="${CORE};${CORE + 38}" ${leaving}/>` +
      `<animate attributeName="opacity" values=".6;0" ${leaving}/></circle>`
  }

  // Twice the viewBox, so the picture fills whatever room the pane gives it.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">${setup.theme === 'auto' ? LIGHT_RULES : ''}${body}</svg>`
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string)
}

// ---- the feed ---------------------------------------------------------------------------------

/** A row of the feed: one entry, or several finished ones in a row at one station, shown as the newest of them. */
export type Row = { entry: Entry; times: number; tookMs: number }

const isPlain = (e: Entry): boolean => e.status === 'ok' && e.mark === undefined

/**
 * The newest rows first. Finished calls that follow one another at one station fold into a single row.
 * Entries that `hide` names are left out, and the rows either side of them can then fold together.
 */
export function foldRows(entries: readonly Entry[], max = 16, hide: (e: Entry) => boolean = () => false): Row[] {
  const rows: Row[] = []
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e === undefined || hide(e)) continue
    const took = e.endedAt === undefined ? 0 : Math.max(0, e.endedAt - e.startedAt)
    const last = rows[rows.length - 1]
    if (last !== undefined && isPlain(e) && isPlain(last.entry) && last.entry.station === e.station && last.entry.from === e.from) {
      last.times++
      last.tookMs += took
      continue
    }
    if (rows.length === max) break
    rows.push({ entry: e, times: 1, tookMs: took })
  }
  return rows
}

export function describeNow(board: Board, t: Strings): string {
  const running = board.entries.filter(e => e.status === 'run')
  const context = board.context === undefined ? '' : ` · ${t.context} ${Math.round(board.context)}%`
  const top = running[running.length - 1]
  if (top === undefined) return `${t.idle}${context}`
  return `${t.stations[top.station]}: ${top.label}${running.length > 1 ? t.andMore(running.length - 1) : ''}${context}`
}
