import { expect, test } from 'claude-code/testing'

import type { Board } from '../types'
import type { Entry } from '../types'
import { MAX_NAMES, classify, clean, drawMap, firstLine, foldRows, formatMs, memoryIds, newest, notKeptAt, routeOf, setupFrom, tally, usedAt } from './map'
import { stringsFor } from './text'

const PANE = {
  plugin: 'lot-map',
  component: 'Pane',
  requestId: 'lot-map',
  props: { title: 'Map', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// Someone's own setup as it stands in settings: Russian labels and a memory of their own.
const OWN = {
  language: 'ru',
  coreName: 'ДОМ',
  memoryServers: ['recall'],
  memoryCommands: ['recall', 'check_recall'],
  memorySubcommands: ['add', 'memory'],
  memoryPaths: ['/.recall/'],
  memoryLabels: ['search=поиск', 'get_note=чтение записи'],
  hookRecords: true,
} as const
const SETUP = setupFrom(OWN)
const STRANGER = setupFrom({ language: 'en', coreName: 'CLAUDE', memoryServers: ['memory'], hookRecords: false })

test('every kind of call lands on its station', () => {
  const at = (tool: string, input: Record<string, unknown>) => classify(tool, input, SETUP).station
  expect(at('Bash', { command: 'recall memory journal --last 30' })).toBe('memory')
  expect(at('Bash', { command: 'python3 ~/.claude/scripts/recall-sync.py --apply' })).toBe('memory')
  expect(at('Bash', { command: 'python3 scripts/check_recall.py' })).toBe('memory')
  expect(at('Bash', { command: 'D=/tmp; cat $D/a | grep x; echo done' })).toBe('files')
  expect(at('Bash', { command: 'cat ~/.claude/projects/-Users-a/memory/x.md' })).toBe('memory')
  expect(at('Bash', { command: 'cat ~/.recall/x.md' })).toBe('memory')
  expect(at('Bash', { command: 'git push origin main' })).toBe('web')
  expect(at('Bash', { command: 'gh pr list' })).toBe('web')
  expect(at('Bash', { command: 'git status' })).toBe('shell')
  expect(at('Bash', { command: 'python3 _src/build.py' })).toBe('shell')
  expect(at('Read', { file_path: '/a/b/c/content.py' })).toBe('files')
  expect(at('Grep', { pattern: 'x' })).toBe('files')
  expect(at('Glob', { pattern: 'x' })).toBe('files')
  expect(at('Edit', { file_path: '/Users/a/.claude/projects/p/memory/n.md' })).toBe('memory')
  expect(at('mcp__recall__search', { query: 'x' })).toBe('memory')
  expect(at('mcp__Claude_Browser__navigate', { url: 'https://a.b/c' })).toBe('browser')
  expect(at('WebFetch', { url: 'https://a.b/c' })).toBe('web')
  expect(at('Agent', { description: 'x' })).toBe('agents')
  expect(at('Skill', { skill: 'pdf' })).toBe('skills')
  expect(at('AskUserQuestion', {})).toBe('you')
})

test('out of the box, memory is only what every install has', () => {
  const at = (tool: string, input: Record<string, unknown>) => classify(tool, input, STRANGER).station
  expect(at('Read', { file_path: '/Users/a/.claude/projects/p/memory/n.md' })).toBe('memory')
  expect(at('Read', { file_path: '/Users/a/.recall/n.md' })).toBe('files')
  expect(at('mcp__memory__search_nodes', {})).toBe('memory')
  expect(at('mcp__recall__search', {})).toBe('web')
  expect(at('Bash', { command: 'recall memory journal' })).toBe('shell')
  expect(classify('mcp__memory__search_nodes', {}, STRANGER).label).toBe('search nodes')
})

test('labels never carry what was written or searched', () => {
  const label = (tool: string, input: Record<string, unknown>) => classify(tool, input, SETUP).label
  expect(label('Read', { file_path: '/a/b/c/content.py' })).toBe('чтение c/content.py')
  expect(label('Write', { file_path: '/a/b/c/content.py', content: 'private' })).toBe('запись c/content.py')
  expect(label('Edit', { file_path: '/a/b/c/content.py', old_string: 'private' })).toBe('правка c/content.py')
  expect(label('Read', {})).toBe('Read')
  expect(label('Bash', { command: 'recall add "private text" --category journal' })).toBe('add')
  expect(label('Bash', { command: 'recall memory journal --last 30' })).toBe('memory')
  expect(label('Bash', { command: 'recall add private words here' })).toBe('add')
  expect(label('Bash', { command: 'recall private words here' })).toBe('recall')
  expect(label('Bash', { command: 'recall "private text"' })).toBe('recall')
  expect(label('mcp__recall__search', { query: 'private' })).toBe('поиск')
  expect(label('mcp__recall__get_note', { id: 7 })).toBe('чтение записи #7')
  expect(label('WebFetch', { url: 'https://a.b/secret?x=1' })).toBe('a.b')
  expect(label('WebFetch', { url: 'https://user:private@a.b/x' })).toBe('a.b')
  expect(label('WebFetch', { url: 'a.b/reset?token=private' })).toBe('a.b')
  expect(label('WebFetch', { url: 'file:///Users/a/private.txt' })).toBe('file')
  expect(label('mcp__Claude_Browser__navigate', { url: 'https://user:private@a.b/x' })).toBe('a.b')
  expect(label('Grep', { pattern: 'private' })).toBe('Grep')
  expect(label('WebSearch', { query: 'private' })).toBe('поиск в сети')
})

test('a password never reaches a label, even with a slash, a question mark or a hash in it', () => {
  const label = (url: string) => classify('WebFetch', { url }, SETUP).label
  expect(label('https://user:pa/ss@host.com/x')).toBe('host.com')
  expect(label('https://user:pa?ss@host.com')).toBe('host.com')
  expect(label('https://user:p#w@host.com')).toBe('host.com')
  expect(label('https://u:p%40ss@h.com')).toBe('h.com')
  expect(label('postgres://admin:hunter2@db.internal:5432/prod')).toBe('db.internal:5432')
  // A number after the colon may be a port or a password: neither reading is shown.
  expect(label('https://user:12345/x@host.com')).toBe('https')
  expect(label('https://host.com:8080/x?mail=a@b.com')).toBe('https')
  expect(label('https://host.com/x?mail=a@b.com')).toBe('host.com')
  expect(label('https://[::1]:8080/x')).toBe('[::1]:8080')
  expect(label('https://пример.рф/x')).toBe('пример.рф')
  expect(label('https://bad host/x')).toBe('https')
})

test('a Windows path is read like any other: the last two parts, memory folders, command names', () => {
  const label = (tool: string, input: Record<string, unknown>) => classify(tool, input, SETUP).label
  const at = (tool: string, input: Record<string, unknown>, setup = SETUP) => classify(tool, input, setup).station
  expect(label('Read', { file_path: 'C:\\Users\\a\\private\\c\\content.py' })).toBe('чтение c/content.py')
  expect(label('Edit', { file_path: 'C:\\Users\\a\\b/mixed\\n.md' })).toBe('правка mixed/n.md')
  expect(at('Read', { file_path: 'C:\\Users\\a\\.claude\\projects\\C--Users-a-p\\memory\\n.md' }, STRANGER)).toBe('memory')
  expect(at('Read', { file_path: 'C:\\Users\\a\\.recall\\n.md' })).toBe('memory')
  expect(at('Read', { file_path: 'C:\\Users\\a\\recall\\n.md' })).toBe('files')
  expect(at('Bash', { command: 'C:\\tools\\curl.exe -s https://a.b/list' })).toBe('web')
  expect(at('Bash', { command: 'C:\\Git\\cmd\\git.exe push origin main' })).toBe('web')
  expect(at('Bash', { command: 'C:\\tools\\grep.exe x C:\\Users\\a\\.recall\\n.md' })).toBe('memory')
  expect(label('Bash', { command: 'C:\\Users\\a\\private\\python.exe build.py' })).toBe('python')
  expect(label('Bash', { command: 'C:\\Users\\a\\private\\recall.exe add private words' })).toBe('add')
})

test('a memory command shows a word after it only when that word is a listed subcommand', () => {
  const label = (command: string) => classify('Bash', { command }, SETUP).label
  expect(label('recall add private words')).toBe('add')
  expect(label('recall hello world')).toBe('recall')
  expect(label('recall search private')).toBe('recall')
  expect(classify('mcp__recall__get_note', { id: 'note-7' }, SETUP).label).toBe('чтение записи #note-7')
  expect(classify('mcp__recall__get_note', { id: 'private words under id' }, SETUP).label).toBe('чтение записи')
})

test('a memory command is matched by its whole name, not by how any name starts', () => {
  const short = setupFrom({ memoryCommands: ['m', 'recall'] })
  const at = (command: string) => classify('Bash', { command }, short).station
  expect(at('mv a b')).toBe('files')
  expect(at('mkdir x')).toBe('files')
  expect(at('make all')).toBe('shell')
  expect(at('recallable --now')).toBe('shell')
  expect(at('m note')).toBe('memory')
  expect(at('recall-sync.py --apply')).toBe('memory')
  expect(at('python3 scripts/recall_check.py')).toBe('memory')
})

test('commands that reach the network light Network, also from inside another command', () => {
  const at = (command: string) => classify('Bash', { command }, SETUP).station
  expect(at('rsync -a a/ host:b/')).toBe('web')
  expect(at('nc -z host 80')).toBe('web')
  expect(at('npm install')).toBe('web')
  expect(at('npm test')).toBe('shell')
  expect(at('docker pull image')).toBe('web')
  expect(at('docker ps')).toBe('shell')
  expect(at('cat $(curl -s https://a.b/list)')).toBe('web')
  expect(at('cat `curl -s https://a.b/list`')).toBe('web')
  expect(at('cat "$(dirname x)/a"')).toBe('files')
})

test('a label loses what a terminal would act on', () => {
  expect(clean('a\u001b[31mred\u0007 b')).toBe('a [31mred b')
  expect(clean('line\nnext\ttab')).toBe('line next tab')
  expect(clean('x\u202egnp.exe')).toBe('x gnp.exe')
  expect(clean('я'.repeat(200)).length).toBe(120)
})

test('hook helpers', () => {
  expect(memoryIds('• [#1971 excerpt] and [now #45] and [todo #3] and [#1971 again]')).toEqual(['1971', '45', '3'])
  expect(firstLine('\nBlocked by x: rule.\nCommand: secret')).toBe('Blocked by x: rule.')
  expect(formatMs(1500, stringsFor('en'))).toBe('1.5 s')
  expect(formatMs(1500, stringsFor('ru'))).toBe('1.5 с')
  expect(formatMs(1500, stringsFor('de'))).toBe('1,5 s')
  expect(stringsFor('en').records(1, '#7')).toBe('1 record: #7')
  expect(stringsFor('en').stations.web).toBe('Network')
})

const LANGUAGES = ['en', 'ru', 'es', 'fr', 'de'] as const

test('every language has every word, in a table of its own', () => {
  const en = stringsFor('en')
  for (const language of LANGUAGES) {
    const t = stringsFor(language)
    expect(Object.keys(t).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(t.stations).sort()).toEqual(Object.keys(en.stations).sort())
    expect(Object.values(t.stations).every(name => name !== '')).toBe(true)
  }
  expect(new Set(LANGUAGES.map(language => stringsFor(language).title)).size).toBe(LANGUAGES.length)
  expect(stringsFor('constructor').title).toBe(en.title)
})

for (const [language, row] of [['es', 'Archivos  leer b/content.py'], ['fr', 'Fichiers   lire b/content.py'], ['de', 'Dateien    lesen b/content.py']] as const) {
  test(`the pane speaks ${language}, its columns even`, { options: { language } }, async ($, on) => {
    on('clock.now', () => ({ value: 1_000_000 }))
    on('tool.call', () => ({ result: {} }))
    await $.tool.call({ tool: 'Read', file_path: '/a/b/content.py' })

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /b\/content\.py/ }))?.text).toContain(row)
    await ui.unmount()
  })
}

test('options that make no sense count as not set', () => {
  const odd = setupFrom({ language: 'xx', coreName: '   ', memoryServers: 7, memoryLabels: ['no-equals', '=x', 'y='], hookRecords: 'yes' })
  expect(odd.t.idle).toBe(stringsFor('en').idle)
  expect(odd.core).toBe('CLAUDE')
  expect(odd.memoryServers.size).toBe(0)
  expect(odd.memoryLabels.size).toBe(0)
  expect(odd.hookRecords).toBe(false)
})

test('a long name shrinks inside the core and cannot break the drawing', () => {
  const svg = (name: string) => drawMap({ entries: [], counts: {} }, 1000, setupFrom({ coreName: name }))
  expect(svg('A<B&"C"DEFGHIJK')).toContain('A&lt;B&amp;&quot;C&quot;DEF<')
  expect(svg('ABC')).toContain('font-size="17" letter-spacing="2.5"')
  expect(svg('CLAUDE')).toContain('font-size="13.8"')
  expect(svg('')).toContain('>CLAUDE<')
})

test('the drawing stays within what Svg accepts at its fullest', () => {
  const now = 1_000_000
  const stations = ['you', 'model', 'memory', 'files', 'shell', 'web', 'browser', 'agents', 'skills', 'hooks'] as const
  const board: Board = {
    model: 'claude-opus-5-5',
    step: 12,
    counts: { files: 12345 },
    entries: Array.from({ length: 80 }, (_, i) => ({
      id: String(i),
      station: stations[i % stations.length] as (typeof stations)[number],
      label: 'x'.repeat(70),
      from: 'core' as const,
      startedAt: now - 100 - i,
      status: 'run' as const,
    })),
  }
  const svg = drawMap(board, now, SETUP)
  expect(svg.length).toBeLessThan(131072)
  expect(svg).toContain('<animateMotion')
  expect(svg).toContain('opus 5.5')
  expect(svg).not.toContain('xxxxx')
  expect(svg).not.toContain('NaN')
  // Attributes are well formed: none empty, none run into the next.
  expect(svg).not.toContain('=""')
  expect(/"[a-z-]+="/.test(svg)).toBe(false)
  expect(svg).toContain('font-family="SF Mono, ui-monospace, Menlo, monospace"')
  expect(svg).not.toContain('Infinity')
})

test('with no options set the map speaks English and shows no record numbers', async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('tool.call', () => ({ result: {} }))
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['• [#12 excerpt] text of a note'] }))

  await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'default' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a/b/content.py' })
  await $.tool.call({ tool: 'Bash', command: 'recall add note', description: 'Save a note' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /[а-яё]/i })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /added context to the message/ }))?.text).toContain('Hooks')
    expect((await ui.find({ type: 'Text', text: /b\/content\.py/ }))?.text).toContain('Files')
    expect((await ui.find({ type: 'Text', text: /Save a note/ }))?.text).toContain('Shell')
    expect(await ui.find({ type: 'Text', text: /#12/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a call shows on the pane, on every surface', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('command.register', () => ({ value: { command: 'lot-map' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Read', file_path: '/a/b/content.py' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /b\/content\.py/ }))?.text).toContain('Файлы')
    await ui.unmount()
  }
})

test('a call a settings hook refused reads as blocked, with the hook lit and its words kept back', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('classic.PreToolUse', () => ({ deny: 'JUDGE: found key sk-private\nCommand: secret' }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'Показать статус' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /остановил Bash/ }))?.text).toContain('Хуки')
  expect((await ui.find({ type: 'Text', text: /Показать статус/ }))?.text).toContain('✕')
  expect(await ui.find({ type: 'Text', text: /JUDGE|sk-private|secret/ })).toBeUndefined()
  await ui.unmount()
})

test('with hookReasons on, the first line of a refusal shows and the rest does not', { options: { ...OWN, hookReasons: true } }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('classic.PreToolUse', () => ({ deny: 'JUDGE: нельзя\nCommand: secret' }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'Показать статус' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /JUDGE/ }))?.text).toContain('Хуки')
  expect(await ui.find({ type: 'Text', text: /secret/ })).toBeUndefined()
  await ui.unmount()
})

test('memory a hook adds shows as numbers, never as its text', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('classic.UserPromptSubmit', () => ({ additionalContext: ['• [#1971 excerpt] тайный текст записи\n• [#277 excerpt] ещё'] }))

  await $.classic.UserPromptSubmit({ prompt: 'привет', permission_mode: 'default' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /записей 2/ }))?.text).toContain('#1971 #277')
  expect(await ui.find({ type: 'Text', text: /тайный/ })).toBeUndefined()
  await ui.unmount()
})

test('a broken board never stops the tool', async ($, on) => {
  on('state.get', () => { throw new Error('no state') })
  on('state.set', () => { throw new Error('no state') })
  on('tool.call', () => ({ result: { ok: true } }))

  const ran = await $.tool.call({ tool: 'Read', file_path: '/a' })
  expect(ran.deny).toBeUndefined()
  expect(ran.result).toEqual({ ok: true })
})

test('what an earlier version stored is declined', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('state.get', () => ({ value: { value: { rows: 1 }, version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Пока ничего/ }))?.text).toBe('Пока ничего не было.')
  await ui.unmount()
})

const STEP = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as const

test('a model step streams through untouched, and once done leaves the feed to the calls it made', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('turn.step', async function* () {
    yield { kind: 'text', index: 0, text: 'первый' } as never
    yield { kind: 'text', index: 0, text: 'второй' } as never
    return { turnId: 't1', index: 0, answer: '', toolUses: [] } as never
  })

  const seen: unknown[] = []
  const stream = $.turn.step(STEP)
  for await (const chunk of stream) seen.push(chunk)
  expect(seen).toEqual([{ kind: 'text', index: 0, text: 'первый' }, { kind: 'text', index: 0, text: 'второй' }])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /шаг 1/ })).toBeUndefined()
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('opus 5.5')
  await ui.unmount()
})

test('a broken board never stops a model step', async ($, on) => {
  on('state.get', () => { throw new Error('no state') })
  on('state.set', () => { throw new Error('no state') })
  on('clock.now', () => { throw new Error('no clock') })
  on('turn.step', async function* () {
    yield { kind: 'text', index: 0, text: 'дошло' } as never
    return { turnId: 't1', index: 0, answer: '', toolUses: [] } as never
  })

  const seen: unknown[] = []
  for await (const chunk of $.turn.step(STEP)) seen.push(chunk)
  expect(seen).toEqual([{ kind: 'text', index: 0, text: 'дошло' }])
})

test('the end of a turn settles a call that never reported back', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* () {
    yield { kind: 'text', index: 0, text: 'и всё' } as never
    return { turnId: 't1', index: 0, answer: '', toolUses: [] } as never
  })
  // A step that was never read to its end stays "running", as an interrupted call does.
  const hanging = $.turn.step(STEP)[Symbol.asyncIterator]()
  await hanging.next()

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /ход прерван/ }))?.text).toContain('Ты')
  expect(await ui.find({ type: 'Text', text: /идёт/ })).toBeUndefined()
  await ui.unmount()
})

// ---- what the second version added ---------------------------------------------------------------

const entry = (station: Entry['station'], startedAt: number, more: Partial<Entry> = {}): Entry => ({
  id: `${station}${startedAt}`,
  station,
  label: station,
  from: 'core',
  startedAt,
  endedAt: startedAt + 10,
  status: 'ok',
  ...more,
})

test('the route is the main loop\'s stations in order, repeats and model steps left out', () => {
  const entries = [
    entry('you', 1, { from: 'inbound' }),
    entry('model', 2),
    entry('memory', 3),
    entry('memory', 4),
    entry('model', 5),
    entry('files', 6),
    entry('shell', 7, { from: 'agents', agentId: 'a1' }),
    entry('shell', 8),
  ]
  expect(routeOf(entries).map(stop => stop.station)).toEqual(['you', 'memory', 'files', 'shell'])
  expect(routeOf(entries)[1]?.at).toBe(4)
  expect(routeOf(entries, 2).map(stop => stop.station)).toEqual(['files', 'shell'])

  const svg = drawMap({ entries, counts: {} }, 5000, STRANGER)
  expect(svg.split('<path d="M').length - 1).toBe(3)
  expect(svg).toContain('stroke-dashoffset')
})

test('finished calls in a row at one station fold into one row, anything else stands alone', () => {
  const rows = foldRows([
    entry('files', 1),
    entry('files', 20),
    entry('files', 40),
    entry('shell', 60, { status: 'err' }),
    entry('shell', 80, { status: 'err' }),
    entry('model', 100, { mark: 'switch' }),
    entry('files', 120, { status: 'run', endedAt: undefined }),
    entry('files', 140),
  ])
  expect(rows.map(row => `${row.entry.station} ${row.times} ${row.tookMs}`)).toEqual([
    'files 1 10',
    'files 1 0',
    'model 1 10',
    'shell 1 10',
    'shell 1 10',
    'files 3 30',
  ])
  expect(foldRows(Array.from({ length: 40 }, (_, i) => entry(i % 2 ? 'files' : 'shell', i * 20))).length).toBe(16)
})

test('a spoke wears in with use and memory has a colour of its own', () => {
  const quiet = drawMap({ entries: [], counts: {} }, 1000, STRANGER)
  const busy = drawMap({ entries: [], counts: { files: 200, memory: 9 }, pushed: 4 }, 1000, STRANGER)
  expect(quiet).not.toContain('stroke-width="3.6"')
  expect(busy).toContain('stroke-width="3.6"')
  expect(busy).toContain('>5 <tspan fill="#62c7ba">↓4</tspan>')
  expect(drawMap({ entries: [], counts: { memory: 4 }, pushed: 4 }, 1000, STRANGER)).toContain('><tspan fill="#62c7ba">↓4</tspan>')
})

test('a long call shows two clock hands, several at once a count, a fault a dot until the next message', () => {
  const now = 1_000_000
  const running = (startedAt: number): Entry => entry('shell', startedAt, { status: 'run', endedAt: undefined })
  const one = drawMap({ entries: [running(now - 90_000)], counts: { shell: 1 } }, now, STRANGER)
  expect(one).toContain('begin="-30.000s" dur="60.000s" repeatCount="indefinite"')
  expect(one).toContain('begin="-90.000s" dur="600.000s" fill="freeze"')
  expect(one).not.toContain('×')
  const three = drawMap({ entries: [running(now - 300), running(now - 200), running(now - 100)], counts: { shell: 3 } }, now, STRANGER)
  expect(three).toContain('>×3<')
  expect(drawMap({ entries: [], counts: {}, faults: { shell: 2 } }, now, STRANGER)).toContain('font-weight="700" fill="#0a0c11">2<')
  expect(drawMap({ entries: [], counts: {} }, now, STRANGER)).not.toContain('font-weight="700"')
})

test('the context ring, the crew, the model change and the light theme are drawn only when there is something to show', () => {
  const now = 1_000_000
  const bare = drawMap({ entries: [], counts: {} }, now, STRANGER)
  expect(bare).not.toContain('pathLength="100"')
  expect(bare).not.toContain('animateTransform')
  expect(bare).toContain('#0a0c11')

  const full = drawMap({ entries: [], counts: {}, model: 'claude-fable-5-2', context: 92.4, agents: ['a', 'b'], switchedAt: now - 2000 }, now, STRANGER)
  expect(full).toContain('stroke="#e8654f" pathLength="100" stroke-dasharray="92 100"')
  expect(full).toContain('>92%<')
  expect(full.split('<animateTransform').length - 1).toBe(2)
  expect(full).toContain('repeatCount="4" fill="freeze"')
  expect(drawMap({ entries: [], counts: {}, switchedAt: now - 9000 }, now, STRANGER)).not.toContain('repeatCount="1" fill="freeze"')

  // Left to itself the map is drawn dark and carries the rules that repaint it on a light surface; a set theme carries none.
  expect(bare).toContain('<style>@media (prefers-color-scheme: light){[fill="#0a0c11"]{fill:#f5f2ea}')
  expect(bare).toContain('<rect width="460" height="430" rx="12" fill="#0a0c11"/>')
  const dark = drawMap({ entries: [], counts: {} }, now, setupFrom({ theme: 'dark' }))
  expect(dark).not.toContain('<style>')
  expect(dark).not.toContain('#f5f2ea')
  const light = drawMap({ entries: [], counts: {} }, now, setupFrom({ theme: 'light' }))
  expect(light).not.toContain('<style>')
  expect(light).toContain('<rect width="460" height="430" rx="12" fill="#f5f2ea"/>')
  // Whatever is lit, every color the dark drawing uses is one the rules know.
  const lit = drawMap(
    { entries: [entry('memory', now - 100, { from: 'inbound' }), entry('shell', now - 50, { status: 'err' }), entry('files', now - 20, { status: 'run', endedAt: undefined })], counts: { files: 50, memory: 3 }, pushed: 1, faults: { shell: 1 }, context: 80, agents: ['a'], switchedAt: now - 10, model: 'claude-fable-5-2' },
    now,
    setupFrom({ theme: 'dark' }),
  )
  const known = new Set(['#0a0c11', '#12151c', '#272c36', '#1a1e27', '#ebe6dc', '#9ba1ab', '#6b7280', '#e1ac6e', '#f0c595', '#e8654f', '#62c7ba', '#a5e6dc'])
  expect([...new Set(lit.match(/#[0-9a-f]{6}/g) ?? [])].filter(color => !known.has(color))).toEqual([])
})

const stepOn = (model: string) => ({ turnId: 't1', index: 0, model, messageCount: 1 }) as const

test('a model that changes mid-session is a row of its own, and the first model of a session is not', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [] } as never
  })
  for (const model of ['claude-opus-5-5', 'claude-opus-5-5', 'claude-fable-5-2']) {
    for await (const _ of $.turn.step(stepOn(model))) void _
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /→/ })
  expect(row?.text).toContain('◆ Модель')
  expect(row?.text).toContain('opus 5.5 → fable 5.2')
  expect(await ui.find({ type: 'Text', text: /шаг 1/ })).toBeUndefined()
  await ui.unmount()
})

test('a long call stays on the map however many calls come after it', () => {
  const now = 1_000_000
  const long = entry('agents', now - 120_000, { status: 'run', endedAt: undefined })
  const after = Array.from({ length: 100 }, (_, i) => entry('files', now - 100_000 + i * 100))
  expect(newest([long, ...after], 40)[0]).toBe(long)
  expect(newest([long, ...after], 40).length).toBe(41)
  expect(newest([entry('files', 1), ...after], 40).length).toBe(40)
  expect(newest(after.slice(0, 10), 40).length).toBe(10)
  const svg = drawMap({ entries: [long, ...after], counts: { agents: 1, files: 100 } }, now, STRANGER)
  expect(svg).toContain('dur="60.000s" repeatCount="indefinite"')
})

test('with finished model steps hidden, the calls either side of them fold together', () => {
  const isStep = (e: Entry): boolean => e.station === 'model' && e.status === 'ok'
  const rows = foldRows([entry('files', 1), entry('model', 2), entry('files', 3), entry('model', 4, { status: 'run', endedAt: undefined })], 16, isStep)
  expect(rows.map(r => [r.entry.station, r.times])).toEqual([['model', 1], ['files', 2]])
})

test('a subagent\'s own calls are marked in the feed, the main loop\'s are not', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('tool.call', () => ({ result: {} }))
  await $.tool.call({ tool: 'Read', file_path: '/a/b/main.py' })
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List the folder', agentId: 'a1' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /List the folder/ }))?.text).toContain('↳ List the folder')
  expect((await ui.find({ type: 'Text', text: /main\.py/ }))?.text).not.toContain('↳')
  await ui.unmount()
})

test('a subagent circles the agents station until its loop ends, and its hanging call is settled then', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* () {
    yield { kind: 'text', index: 0, text: 'x' } as never
    return { turnId: 't2', index: 0, answer: '', toolUses: [] } as never
  })
  const hanging = $.turn.step({ ...stepOn('claude-haiku-5-5'), turnId: 't2', agentId: 'a1' } as never)[Symbol.asyncIterator]()
  await hanging.next()

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /идёт/ }))?.text).toContain('субагент')
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('animateTransform')
  await ui.unmount()

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'a1' } as never)

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /идёт/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /ответ готов/ })).toBeUndefined()
  expect((await ui.find({ type: 'Svg' }))?.props.source).not.toContain('animateTransform')
  await ui.unmount()
})

test('what goes wrong stays on its station until the next message; an interrupted turn is no fault', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('tool.call', () => ({ result: {}, isError: true }) as never)

  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'Показать статус' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' } as never)

  const dots = async (): Promise<number> => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const source = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    return source.split('font-weight="700"').length - 1
  }
  expect(await dots()).toBe(1)
  await $.turn.start({ text: 'дальше', turnId: 't2' } as never)
  expect(await dots()).toBe(0)
})

test('the context window shows as soon as the engine tells how full it is', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 37 } } }) as never)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [] } as never
  })
  for await (const _ of $.turn.step(stepOn('claude-opus-5-5'))) void _

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('>37%<')
  expect((await ui.find({ type: 'Text', text: /контекст 37%/ }))?.text).toContain('Сейчас ничего не выполняется')
  await ui.unmount()
})

test('the ring can be turned so that the person is at the bottom and the network at the top', () => {
  const heightOf = (svg: string, name: string): number => Number(new RegExp(`y="([\\d.]+)"[^>]*>${name}<`).exec(svg)?.[1])
  const board: Board = { entries: [], counts: {} }
  const usual = drawMap(board, 1000, setupFrom({ theme: 'dark' }))
  const turned = drawMap(board, 1000, setupFrom({ theme: 'dark', layout: 'you-bottom' }))
  expect(heightOf(usual, 'You')).toBeLessThan(heightOf(usual, 'Network'))
  expect(heightOf(turned, 'You')).toBe(heightOf(usual, 'Network'))
  expect(heightOf(turned, 'Network')).toBe(heightOf(usual, 'You'))
  expect(heightOf(turned, 'Browser')).toBe(heightOf(usual, 'Model'))
  // A turned map does not leak into the next one drawn, and nonsense counts as not set.
  expect(drawMap(board, 1000, setupFrom({ theme: 'dark' }))).toBe(usual)
  expect(drawMap(board, 1000, setupFrom({ theme: 'dark', layout: 'sideways' }))).toBe(usual)
})

test('a station keeps the names it was used for, the most used first, thirty at most', () => {
  let used = tally(undefined, 'skills', 'pdf')
  used = tally(used, 'skills', 'map-design')
  used = tally(used, 'skills', 'map-design')
  used = tally(used, 'files', 'read a/b.md')
  expect(usedAt({ entries: [], counts: {}, used }, 'skills')).toEqual([['map-design', 2], ['pdf', 1]])
  expect(usedAt({ entries: [], counts: {}, used }, 'files')).toEqual([['read a/b.md', 1]])
  expect(usedAt({ entries: [], counts: {} }, 'web')).toEqual([])
  // A name is never an object key, so these are names like any other.
  used = tally(tally(used, 'shell', 'constructor'), 'shell', '__proto__')
  expect(usedAt({ entries: [], counts: {}, used }, 'shell')).toEqual([['constructor', 1], ['__proto__', 1]])
  let full: Board['used'] = undefined
  for (let i = 0; i < MAX_NAMES + 5; i++) full = tally(full, 'shell', `job ${i}`)
  full = tally(full, 'shell', 'job 0')
  const list = usedAt({ entries: [], counts: {}, used: full }, 'shell')
  expect(list.length).toBe(MAX_NAMES + 1)
  expect(list[0]).toEqual(['…', 5])
  expect(list[1]).toEqual(['job 0', 2])
  // What the count holds beyond the list: uses counted before names were kept.
  expect(notKeptAt({ entries: [], counts: { skills: 5 }, used }, 'skills')).toBe(2)
  expect(notKeptAt({ entries: [], counts: { skills: 2 } }, 'skills')).toBe(2)
  expect(notKeptAt({ entries: [], counts: { skills: 3 }, used }, 'skills')).toBe(0)
  expect(stringsFor('en').notKept(2)).toBe('2 more from before the list was kept')
})

test('a station\'s button opens what it was used for, and a second press closes it', { options: OWN }, async ($, on) => {
  on('clock.now', () => ({ value: 1_000_000 }))
  on('tool.call', () => ({ result: {} }))
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [] } as never
  })
  await $.tool.call({ tool: 'Skill', skill: 'map-design' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'map-design' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'pdf' } as never)
  for (let i = 0; i < 2; i++) for await (const _ of $.turn.step(STEP)) void _

  for (const surface of ['terminal', 'desktop'] as const) {
    let ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /map-design  ×2/ })).toBeUndefined()
    await ui.press({ key: 'station-skills' })
    await ui.unmount()

    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /map-design/ }))?.text).toBe('  map-design  ×2')
    expect((await ui.find({ type: 'Text', text: /pdf/ }))?.text).toBe('  pdf')
    expect(await ui.find({ type: 'Text', text: /больше|до того/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^─+$/ }))?.text.length).toBe(200)
    await ui.press({ key: 'station-model' })
    await ui.unmount()

    ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /map-design/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /opus 5\.5/ }))?.text).toBe('  opus 5.5  ×2')
    await ui.press({ key: 'station-model' })
    await ui.unmount()

    ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /opus 5\.5  ×2/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
    await ui.unmount()
  }
})
