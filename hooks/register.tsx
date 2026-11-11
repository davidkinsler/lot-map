import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Entry, StationId, Status } from '../types'
import { DARK_TONES, ON_TONE, STATIONS, classify, clean, describeNow, drawMap, firstLine, foldRows, formatMs, memoryIds, newest, notKeptAt, setupFrom, shortModel, tally, usedAt } from './map'
import type { Setup } from './map'

const PANE = 'lot-map'
const KEEP = 80
const CREW = 12

// Change the tag when a field of Entry or Board changes: it declines what an earlier version stored.
const board = atom({ plugin: 'lot-map', key: 'board' } as const, { entries: [], counts: {} } as Board, { shape: 'board-3' })

// The station whose list is open under the map, or '' for none.
const shown = atom({ plugin: 'lot-map', key: 'shown' } as const, '' as string, { shape: 'shown-1' })

const newId = (now: number): string => `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** Whatever goes wrong on the map must never reach the tool, the turn or the conversation. */
async function quietly<T>(work: () => Promise<T>): Promise<T | undefined> {
  try {
    return await work()
  } catch {
    return undefined
  }
}

type Start = {
  station: StationId
  label: string
  from?: Entry['from']
  status?: Status
  agentId?: string
  mark?: Entry['mark']
  /** Adds nothing to the station's count: a second view of something already counted. */
  uncounted?: boolean
  /** What the station's list records for this use; the label when absent. */
  name?: string
  startedAt?: number
  endedAt?: number
  patch?: Partial<Pick<Board, 'model' | 'step' | 'switchedAt'>>
}

const isFault = (status: Status): boolean => status === 'err' || status === 'block'

const oneMore = (faults: Board['faults'], station: StationId): Board['faults'] => ({ ...faults, [station]: (faults?.[station] ?? 0) + 1 })

async function begin($: EngineInterface, start: Start): Promise<string | undefined> {
  return quietly(async () => {
    const now = await $.clock.now()
    const entry: Entry = {
      id: newId(now),
      station: start.station,
      label: clean(start.label),
      from: start.from ?? 'core',
      startedAt: start.startedAt ?? now,
      status: start.status ?? 'run',
      ...(start.status !== undefined ? { endedAt: start.endedAt ?? now } : {}),
      ...(start.agentId !== undefined ? { agentId: start.agentId } : {}),
      ...(start.mark !== undefined ? { mark: start.mark } : {}),
    }
    await update($, board, b => ({
      ...b,
      ...start.patch,
      entries: newest([...b.entries, entry], KEEP),
      counts: start.uncounted ? b.counts : { ...b.counts, [entry.station]: (b.counts[entry.station] ?? 0) + 1 },
      ...(start.uncounted ? {} : { used: tally(b.used, entry.station, start.name === undefined ? entry.label : clean(start.name)) }),
      // What a hook brought to memory unasked is counted apart from what was asked for.
      ...(entry.station === 'memory' && entry.from === 'inbound' && !start.uncounted ? { pushed: (b.pushed ?? 0) + 1 } : {}),
      // An interrupted turn lands on the person's own station and is no fault of anything.
      ...(isFault(entry.status) && entry.station !== 'you' ? { faults: oneMore(b.faults, entry.station) } : {}),
      ...(entry.agentId !== undefined && !(b.agents ?? []).includes(entry.agentId)
        ? { agents: [...(b.agents ?? []), entry.agentId].slice(-CREW) }
        : {}),
    }))
    return entry.id
  })
}

async function finish($: EngineInterface, id: string | undefined, status: Status, patch?: Pick<Board, 'context'>): Promise<void> {
  if (id === undefined) return
  await quietly(async () => {
    const now = await $.clock.now()
    await update($, board, b => {
      const open = b.entries.find(e => e.id === id && e.status === 'run')
      return {
        ...b,
        ...patch,
        entries: b.entries.map(e => (e === open ? { ...e, status, endedAt: now } : e)),
        ...(open !== undefined && isFault(status) ? { faults: oneMore(b.faults, open.station) } : {}),
      }
    })
  })
}

/** How full the context window is, as the status line has it; costs nothing. */
async function contextOf($: EngineInterface): Promise<Pick<Board, 'context'>> {
  const percent = await quietly(async () => (await $.session.usage()).context.percent)
  return typeof percent === 'number' ? { context: percent } : {}
}

/** What a settings hook added to the context: shown as the hook acting and, when it brought records, as memory. */
async function noteContext($: EngineInterface, context: readonly string[] | undefined, when: string, setup: Setup): Promise<void> {
  const { t } = setup
  const text = (context ?? []).join('\n')
  if (text.trim() === '') return
  const ids = setup.hookRecords ? memoryIds(text) : []
  if (ids.length === 0) {
    await begin($, { station: 'hooks', label: t.addedContext(when), status: 'ok' })
    return
  }
  await begin($, { station: 'hooks', label: t.addedMemory(when), status: 'ok' })
  const shown = ids.slice(0, 6).map(id => `#${id}`).join(' ')
  await begin($, {
    station: 'memory',
    label: t.records(ids.length, `${shown}${ids.length > 6 ? ' …' : ''}`),
    from: 'inbound',
    status: 'ok',
  })
}

export const register: Register = (on, options) => {
  const setup = setupFrom(options)
  const { t } = setup
  // The feed's second column fits the longest station name of the language.
  const column = Math.max(8, ...Object.values(t.stations).map(name => name.length))

  // Calls a settings hook refused, so that the tool's own row reads as blocked and not as an error.
  // Loses nothing across a reload that matters: a reload never lands in the middle of a call.
  const refused = new Set<string>()

  // The model the main loop last ran on: in this session, or else in the last session in this folder.
  // The one thing the map keeps between sessions, and only its name.
  let lastModel: string | undefined
  let modelKey = 'model'

  on('session.start', async ($, e, next) => {
    await quietly(() => $.command.register({ name: 'lot-map', description: t.command }))
    void quietly(() => $.ui.open({ id: PANE, title: t.title }))
    await quietly(async () => {
      modelKey = `model:${e.cwd}`
      const kept = await $.store.get(modelKey)
      if (lastModel === undefined && typeof kept === 'string') lastModel = kept
    })
    return next(e)
  })

  on('command.run', { command: 'lot-map' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: t.title })
    return { text: opened.isPlaced ? t.opened : t.cannotOpen(String(opened.reason)) }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && e.text !== '') {
      // A new message clears what went wrong on the way to the last answer.
      await quietly(() => update($, board, b => (b.faults === undefined ? b : { ...b, faults: {} })))
      await begin($, { station: 'you', label: t.newMessage, from: 'inbound', status: 'ok' })
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    if (isMain && lastModel !== e.model) {
      const before = lastModel
      lastModel = e.model
      void quietly(() => $.store.set(modelKey, e.model))
      if (before !== undefined) {
        const now = await quietly(() => $.clock.now())
        await begin($, {
          station: 'model',
          label: `${shortModel(before)} → ${shortModel(e.model)}`,
          status: 'ok',
          mark: 'switch',
          uncounted: true,
          ...(now !== undefined ? { patch: { switchedAt: now } } : {}),
        })
      }
    }
    const id = await begin($, {
      station: 'model',
      label: `${shortModel(e.model)} · ${t.step(e.index + 1)}${isMain ? '' : ` · ${t.subagent}`}`,
      from: isMain ? 'core' : 'agents',
      // The list counts steps by model, not one name per step.
      name: `${shortModel(e.model)}${isMain ? '' : ` · ${t.subagent}`}`,
      ...(isMain ? { patch: { model: e.model, step: e.index + 1 } } : { agentId: e.agentId }),
    })
    try {
      return yield* next(e)
    } finally {
      await finish($, id, 'ok', isMain ? await contextOf($) : undefined)
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      // A subagent's loop is over: it leaves the agents station, and a call of its that never reported back is settled.
      const agentId = e.agentId
      await quietly(async () => {
        const now = await $.clock.now()
        await update($, board, b => ({
          ...b,
          agents: (b.agents ?? []).filter(id => id !== agentId),
          entries: b.entries.map(x => (x.status === 'run' && x.agentId === agentId ? { ...x, status: 'ok' as const, endedAt: now } : x)),
        }))
      })
    } else {
      await begin($, {
        station: 'you',
        label: e.isAborted ? t.turnAborted : t.answerReady,
        status: e.isAborted ? 'err' : 'ok',
        ...(e.isAborted ? {} : { mark: 'done' as const }),
      })
      // An interrupted call never reports back; left alone its row would pulse for the rest of the session.
      await quietly(async () => {
        const now = await $.clock.now()
        await update($, board, b => ({
          ...b,
          entries: b.entries.map(x => (x.status === 'run' && x.from === 'core' ? { ...x, status: 'ok' as const, endedAt: now } : x)),
        }))
      })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = await quietly(async () => {
      const seen = classify(e.tool, e as unknown as Record<string, unknown>, setup)
      return begin($, { ...seen, ...(e.agentId === undefined ? { from: 'core' as const } : { from: 'agents' as const, agentId: e.agentId }) })
    })
    try {
      const ran = await next(e)
      const wasRefused = ran.deny !== undefined || (e.tool_use_id !== undefined && refused.delete(e.tool_use_id))
      await finish($, id, wasRefused ? 'block' : ran.isError === true ? 'err' : 'ok')
      return ran
    } catch (failure) {
      await finish($, id, 'err')
      throw failure
    }
  })

  on('classic.PreToolUse', async ($, e, next) => {
    const startedAt = (await quietly(() => $.clock.now())) ?? 0
    const decided = await next(e)
    const endedAt = (await quietly(() => $.clock.now())) ?? startedAt
    if (decided.deny !== undefined) {
      if (e.tool_use_id !== undefined) refused.add(e.tool_use_id)
      await begin($, { station: 'hooks', label: (setup.hookReasons ? firstLine(decided.deny) : '') || t.stopped(e.tool), status: 'block', startedAt })
    } else if (decided.ask !== undefined) {
      await begin($, { station: 'hooks', label: t.askedPermission(e.tool), status: 'ok', startedAt, endedAt })
    } else if (endedAt - startedAt >= 400) {
      // A check that took a moment is worth seeing; the instant ones are not.
      await begin($, { station: 'hooks', label: t.checkBefore(e.tool), status: 'ok', startedAt, endedAt })
    }
    return decided
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    await noteContext($, result.additionalContext, t.toMessage, setup)
    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    await noteContext($, result.additionalContext, t.atStart, setup)
    return result
  })

  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    // A skill the model called is already on the map as its tool call; this one catches a typed slash command.
    await quietly(async () => {
      const now = await $.clock.now()
      await update($, board, b => {
        if (b.entries.some(x => x.station === 'skills' && x.status === 'run' && x.label === e.skill)) return b
        const entry: Entry = { id: newId(now), station: 'skills', label: clean(e.skill), from: 'core', startedAt: now, endedAt: now, status: 'ok' }
        return {
          ...b,
          entries: newest([...b.entries, entry], KEEP),
          counts: { ...b.counts, skills: (b.counts.skills ?? 0) + 1 },
          used: tally(b.used, 'skills', entry.label),
        }
      })
    })
    return result
  })

  on('session.compact', async ($, e, next) => {
    const id = await begin($, { station: 'model', label: t.compacting })
    try {
      return await next(e)
    } finally {
      await finish($, id, 'ok', await contextOf($))
    }
  })

  // The map's last picture and the board it was drawn from. A pane is drawn again on every scroll too, and each new
  // picture (its animations are timed from the moment it is drawn) was loaded afresh, so the pane jumped while scrolled.
  // The map is drawn again only when the board changes.
  let drawn: { from: string; source: string } | undefined

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, board)
    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    // A finished model step adds nothing the line above the feed does not say ("step 5"), and every other row would be one.
    const isFinishedStep = (x: Entry): boolean => x.station === 'model' && x.status === 'ok' && x.mark === undefined && x.label !== t.compacting
    const rows = foldRows(state.entries, 16, isFinishedStep).map(({ entry, times, tookMs }) => {
      const isSwitch = entry.mark === 'switch'
      const mark = isSwitch ? '◆' : entry.status === 'run' ? '●' : entry.status === 'ok' ? '·' : '✕'
      const took = entry.endedAt === undefined ? t.running : tookMs > 0 ? formatMs(tookMs, t) : ''
      // Theme keys, so the rows read on a light theme as well as on a dark one.
      const color = isSwitch || entry.status === 'run' ? 'claude' : entry.status === 'ok' ? undefined : 'error'
      // A subagent's own calls are indented under an arrow, so they read apart from the main loop's.
      const byAgent = entry.from === 'agents' ? '↳ ' : ''
      const line = `${mark} ${t.stations[entry.station].padEnd(column)} ${byAgent}${entry.label}${times > 1 ? `  +${times - 1}` : ''}${took === '' ? '' : `  ${took}`}`
      return (
        <Text mono size="footnote" color={color} dimColor={entry.status === 'ok' && !isSwitch}>
          {line}
        </Text>
      )
    })
    const feed = rows.length > 0 ? rows : [<Text dimColor>{t.nothingYet}</Text>]
    const current = <Text mono size="footnote">{describeNow(state, t)}</Text>

    // A button for each station used so far, with its count; a press opens its list under the buttons, a second press closes it.
    const { Button } = $.ui.resolve(e)
    const open = (await quietly(() => read($, shown))) ?? ''
    const usedStations = STATIONS.filter(s => (state.counts[s.id] ?? 0) > 0)
    const toggle = (id: StationId) => () => void quietly(() => update($, shown, was => (was === id ? '' : id)))
    const buttons =
      usedStations.length === 0 ? (
        <Text dimColor>{t.noCounts}</Text>
      ) : (
        <Box flexDirection="row" flexWrap="wrap" gap="xs">
          {usedStations.map(s => {
            // A small chip in the station's own map color, with dark words on it, so it reads on a light pane and a dark one;
            // the open station's chip takes the brighter tone and bold words. The Text carries the color too, in case a surface draws the button over the Box.
            const tone = DARK_TONES[s.id][open === s.id ? 1 : 0]
            const words = `${t.stations[s.id]} ${state.counts[s.id] ?? 0}`
            return (
              <Box key={`chip-${s.id}`} backgroundColor={tone} paddingX="xs">
                <Button key={`station-${s.id}`} plain label={words} onPress={toggle(s.id)}>
                  <Text size="caption" color={ON_TONE} backgroundColor={tone} weight={open === s.id ? 'bold' : 'regular'}>
                    {words}
                  </Text>
                </Button>
              </Box>
            )
          })}
        </Box>
      )
    const openStation = usedStations.find(s => s.id === open)
    const list = openStation === undefined ? [] : usedAt(state, openStation.id)
    // Uses the count holds but the list does not: counted when no names were kept.
    const notKept = openStation === undefined ? 0 : notKeptAt(state, openStation.id)
    const details =
      openStation === undefined ? null : (
        <Box flexDirection="column">
          {/* Only the dot takes the station's color: pale map colors are hard to read as words on a light pane. */}
          <Box flexDirection="row">
            <Text mono size="footnote" color={DARK_TONES[openStation.id][0]}>●</Text>
            <Text mono size="footnote" bold>{` ${t.stations[openStation.id]}:`}</Text>
          </Box>
          {list.map(([name, times]) => <Text mono size="footnote">{`  ${name}${times > 1 ? `  ×${times}` : ''}`}</Text>)}
          {notKept > 0 ? <Text mono size="footnote" dimColor>{`  ${t.notKept(notKept)}`}</Text> : null}
          {list.length === 0 && notKept <= 0 ? <Text mono size="footnote" dimColor>{`  ${t.nothingYet}`}</Text> : null}
          {/* A rule between the list and the rest of the pane; cut at the pane's edge, never wrapped. */}
          <Text mono size="footnote" dimColor wrap="truncate">{'─'.repeat(200)}</Text>
        </Box>
      )

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          {current}
          {buttons}
          {details}
          {feed}
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e)
    const from = JSON.stringify(state)
    if (drawn?.from !== from) drawn = { from, source: drawMap(state, now, setup) }
    return (
      <Box flexDirection="column">
        <Svg source={drawn.source} alt={`${t.title}. ${describeNow(state, t)}`} />
        {buttons}
        {details}
        {current}
        {feed}
      </Box>
    )
  })
}
