// Every word the map shows, in each language it speaks.
// A new language is one more table here and one more value of `language` in plugin.json.
import type { StationId } from '../types'

export type Strings = {
  title: string
  command: string
  opened: string
  cannotOpen: (reason: string) => string
  stations: Record<StationId, string>
  newMessage: string
  answerReady: string
  turnAborted: string
  step: (n: number) => string
  subagent: string
  compacting: string
  addedContext: (when: string) => string
  addedMemory: (when: string) => string
  toMessage: string
  atStart: string
  records: (n: number, shown: string) => string
  stopped: (tool: string) => string
  askedPermission: (tool: string) => string
  checkBefore: (tool: string) => string
  running: string
  nothingYet: string
  noCounts: string
  idle: string
  context: string
  andMore: (n: number) => string
  webSearch: string
  artifact: string
  workflow: string
  skill: string
  loadingTools: string
  questionForYou: string
  fileForYou: string
  /** The word before a file's name: read, written or edited. */
  fileAction: Record<'read' | 'write' | 'edit', string>
  /** Under a station's list: uses counted before names were kept (an earlier version, in the same session). */
  notKept: (n: number) => string
  ms: (n: number) => string
  seconds: (s: string) => string
  minutes: (m: number, s: number) => string
}

const en: Strings = {
  title: 'Work map',
  command: 'Open the work map beside the chat',
  opened: 'Work map opened.',
  cannotOpen: reason => `Nowhere to show the map right now: ${reason}`,
  stations: {
    you: 'You',
    model: 'Model',
    memory: 'Memory',
    files: 'Files',
    shell: 'Shell',
    web: 'Network',
    browser: 'Browser',
    agents: 'Agents',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'new message',
  answerReady: 'answer ready',
  turnAborted: 'turn interrupted',
  step: n => `step ${n}`,
  subagent: 'subagent',
  compacting: 'compacting context',
  addedContext: when => `added context ${when}`,
  addedMemory: when => `added memory ${when}`,
  toMessage: 'to the message',
  atStart: 'at session start',
  records: (n, shown) => `${n} record${n === 1 ? '' : 's'}: ${shown}`,
  stopped: tool => `stopped ${tool}`,
  askedPermission: tool => `asked permission: ${tool}`,
  checkBefore: tool => `check before ${tool}`,
  running: 'running',
  nothingYet: 'Nothing yet.',
  noCounts: 'No counts yet.',
  idle: 'Nothing is running.',
  context: 'context',
  andMore: n => ` and ${n} more`,
  webSearch: 'web search',
  artifact: 'artifact',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'loading tools',
  questionForYou: 'question for you',
  fileForYou: 'file for you',
  fileAction: { read: 'read', write: 'write', edit: 'edit' },
  notKept: n => `${n} more from before the list was kept`,
  ms: n => `${n} ms`,
  seconds: s => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const ru: Strings = {
  title: 'Карта работы',
  command: 'Открыть карту работы рядом с чатом',
  opened: 'Карта работы открыта.',
  cannotOpen: reason => `Карту сейчас негде показать: ${reason}`,
  stations: {
    you: 'Ты',
    model: 'Модель',
    memory: 'Память',
    files: 'Файлы',
    shell: 'Терминал',
    web: 'Сеть',
    browser: 'Браузер',
    agents: 'Агенты',
    skills: 'Скиллы',
    hooks: 'Хуки',
  },
  newMessage: 'новое сообщение',
  answerReady: 'ответ готов',
  turnAborted: 'ход прерван',
  step: n => `шаг ${n}`,
  subagent: 'субагент',
  compacting: 'сжатие контекста',
  addedContext: when => `добавил контекст ${when}`,
  addedMemory: when => `подмешал память ${when}`,
  toMessage: 'к сообщению',
  atStart: 'при старте',
  records: (n, shown) => `записей ${n}: ${shown}`,
  stopped: tool => `остановил ${tool}`,
  askedPermission: tool => `спросил разрешение: ${tool}`,
  checkBefore: tool => `проверка перед ${tool}`,
  running: 'идёт',
  nothingYet: 'Пока ничего не было.',
  noCounts: 'Счётчики пусты.',
  idle: 'Сейчас ничего не выполняется.',
  context: 'контекст',
  andMore: n => ` и ещё ${n}`,
  webSearch: 'поиск в сети',
  artifact: 'артефакт',
  workflow: 'рабочий процесс',
  skill: 'скилл',
  loadingTools: 'загрузка инструментов',
  questionForYou: 'вопрос тебе',
  fileForYou: 'файл тебе',
  fileAction: { read: 'чтение', write: 'запись', edit: 'правка' },
  notKept: n => `ещё ${n} до того, как список начал вестись`,
  ms: n => `${n} мс`,
  seconds: s => `${s} с`,
  minutes: (m, s) => `${m} мин ${s} с`,
}

const es: Strings = {
  title: 'Mapa de trabajo',
  command: 'Abrir el mapa de trabajo junto al chat',
  opened: 'Mapa de trabajo abierto.',
  cannotOpen: reason => `Ahora no hay dónde mostrar el mapa: ${reason}`,
  stations: {
    you: 'Tú',
    model: 'Modelo',
    memory: 'Memoria',
    files: 'Archivos',
    shell: 'Terminal',
    web: 'Red',
    browser: 'Navegador',
    agents: 'Agentes',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'mensaje nuevo',
  answerReady: 'respuesta lista',
  turnAborted: 'turno interrumpido',
  step: n => `paso ${n}`,
  subagent: 'subagente',
  compacting: 'compactando el contexto',
  addedContext: when => `añadió contexto ${when}`,
  addedMemory: when => `añadió memoria ${when}`,
  toMessage: 'al mensaje',
  atStart: 'al iniciar la sesión',
  records: (n, shown) => `${n} registro${n === 1 ? '' : 's'}: ${shown}`,
  stopped: tool => `detuvo ${tool}`,
  askedPermission: tool => `pidió permiso: ${tool}`,
  checkBefore: tool => `comprobación antes de ${tool}`,
  running: 'en curso',
  nothingYet: 'Todavía nada.',
  noCounts: 'Aún no hay recuentos.',
  idle: 'No hay nada en ejecución.',
  context: 'contexto',
  andMore: n => ` y ${n} más`,
  webSearch: 'búsqueda web',
  artifact: 'artefacto',
  workflow: 'flujo de trabajo',
  skill: 'skill',
  loadingTools: 'cargando herramientas',
  questionForYou: 'pregunta para ti',
  fileForYou: 'archivo para ti',
  fileAction: { read: 'leer', write: 'escribir', edit: 'editar' },
  notKept: n => `${n} más de antes de que se guardara la lista`,
  ms: n => `${n} ms`,
  seconds: s => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const fr: Strings = {
  title: 'Carte du travail',
  command: 'Ouvrir la carte du travail à côté du chat',
  opened: 'Carte du travail ouverte.',
  cannotOpen: reason => `Impossible d'afficher la carte pour le moment : ${reason}`,
  stations: {
    you: 'Vous',
    model: 'Modèle',
    memory: 'Mémoire',
    files: 'Fichiers',
    shell: 'Terminal',
    web: 'Réseau',
    browser: 'Navigateur',
    agents: 'Agents',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'nouveau message',
  answerReady: 'réponse prête',
  turnAborted: 'tour interrompu',
  step: n => `étape ${n}`,
  subagent: 'sous-agent',
  compacting: 'compactage du contexte',
  addedContext: when => `contexte ajouté ${when}`,
  addedMemory: when => `mémoire ajoutée ${when}`,
  toMessage: 'au message',
  atStart: 'au démarrage de la session',
  records: (n, shown) => `${n} enregistrement${n > 1 ? 's' : ''} : ${shown}`,
  stopped: tool => `${tool} arrêté`,
  askedPermission: tool => `autorisation demandée : ${tool}`,
  checkBefore: tool => `vérification avant ${tool}`,
  running: 'en cours',
  nothingYet: 'Rien pour le moment.',
  noCounts: 'Aucun compteur pour le moment.',
  idle: 'Rien en cours.',
  context: 'contexte',
  andMore: n => ` et ${n} de plus`,
  webSearch: 'recherche web',
  artifact: 'artefact',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'chargement des outils',
  questionForYou: 'question pour vous',
  fileForYou: 'fichier pour vous',
  fileAction: { read: 'lire', write: 'écrire', edit: 'modifier' },
  notKept: n => `${n} de plus, d'avant la tenue de la liste`,
  ms: n => `${n} ms`,
  seconds: s => `${s.replace('.', ',')} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const de: Strings = {
  title: 'Arbeitskarte',
  command: 'Arbeitskarte neben dem Chat öffnen',
  opened: 'Arbeitskarte geöffnet.',
  cannotOpen: reason => `Die Karte kann gerade nirgends angezeigt werden: ${reason}`,
  stations: {
    you: 'Du',
    model: 'Modell',
    memory: 'Gedächtnis',
    files: 'Dateien',
    shell: 'Terminal',
    web: 'Netzwerk',
    browser: 'Browser',
    agents: 'Agenten',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'neue Nachricht',
  answerReady: 'Antwort fertig',
  turnAborted: 'Durchgang abgebrochen',
  step: n => `Schritt ${n}`,
  subagent: 'Subagent',
  compacting: 'Kontext wird komprimiert',
  addedContext: when => `Kontext ${when} hinzugefügt`,
  addedMemory: when => `Erinnerungen ${when} hinzugefügt`,
  toMessage: 'zur Nachricht',
  atStart: 'beim Sitzungsstart',
  records: (n, shown) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}: ${shown}`,
  stopped: tool => `${tool} gestoppt`,
  askedPermission: tool => `um Erlaubnis gefragt: ${tool}`,
  checkBefore: tool => `Prüfung vor ${tool}`,
  running: 'läuft',
  nothingYet: 'Noch nichts.',
  noCounts: 'Noch keine Zählerstände.',
  idle: 'Nichts läuft.',
  context: 'Kontext',
  andMore: n => ` und ${n} weitere`,
  webSearch: 'Websuche',
  artifact: 'Artefakt',
  workflow: 'Workflow',
  skill: 'Skill',
  loadingTools: 'Werkzeuge werden geladen',
  questionForYou: 'Frage an dich',
  fileForYou: 'Datei für dich',
  fileAction: { read: 'lesen', write: 'schreiben', edit: 'bearbeiten' },
  notKept: n => `${n} weitere von vor Beginn der Liste`,
  ms: n => `${n} ms`,
  seconds: s => `${s.replace('.', ',')} s`,
  minutes: (m, s) => `${m} Min. ${s} s`,
}

const TABLES = new Map<unknown, Strings>([['en', en], ['ru', ru], ['es', es], ['fr', fr], ['de', de]])

export const stringsFor = (language: unknown): Strings => TABLES.get(language) ?? en
