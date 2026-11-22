// What the person who installs the plugin can choose, and what the code falls back on when they
// choose nothing. The plugin knows nothing about any particular setup: bots, projects and people come
// from what Orca reports. Pure: no Node and no Orca in here.

/** The plugin's display name, in the status bar, in notifications and in the panel. */
export const NOME = 'Regia'

/** How the queue and the titles are read. */
export type Opzioni = {
  /**
   * The bot that holds the queue: its id or its name (an emoji or punctuation in the name does not
   * matter), or its home folder under `~/.orca/bots`. Empty: no bot is assumed, and the queue shows
   * the open items of every bot, grouped by bot.
   */
  codaBot: string
  /**
   * Read `<dot> <Project> · <what> · ⏰ <dd/mm hh:mm>` from item titles. A title written any other way is
   * shown as it is. False: titles are never parsed.
   */
  leggiTitoli: boolean
  /** Project lanes in the order wanted; any other project follows in alphabetical order. */
  corsie: string[]
  /** Other spellings of a project name (lower case, letters and digits only) → the name in `corsie`. Not a setting. */
  alias: Record<string, string>
}

export const NEUTRE: Opzioni = { codaBot: '', leggiTitoli: true, corsie: [], alias: {} }

let predefinite: Opzioni = NEUTRE
/** The options a function uses when it is given none. Neutral unless a test sets its own. */
export const opzioniPredefinite = (): Opzioni => predefinite
/** For tests only: the options used when none are given. The worker always passes its own. */
export function impostaPredefinite(o: Partial<Opzioni> | null): void {
  predefinite = o ? { ...NEUTRE, ...o } : NEUTRE
}

/** Everything the worker reads from the plugin's settings, with the manifest's defaults. */
export type Impostazioni = Opzioni & {
  /** Seconds for the slow rotation of CLI reads to go all the way round: 10 to 300. */
  secondi: number
  avvisi: boolean
  /** Names shown dashed until a bot with that name exists. */
  botAttesi: string[]
  /** Path to an optional JSON state file with model, effort, context and overlaps. Empty: the source is off. */
  fileStato: string
  /** Path to the Orca CLI executable. Empty: the CLI of the Orca app that runs the plugin, then the PATH. */
  orca: string
  /**
   * The paired Orca servers to read next to this machine. Null: every server the Orca CLI reports
   * (the default). A list: only those. Empty list: this machine only.
   */
  server: string[] | null
  /** False: every animation is stopped, whatever the system says. */
  animazioni: boolean
}

const testo = (v: unknown, massimo: number): string => (typeof v === 'string' ? v.trim().slice(0, massimo) : '')
const elenco = (v: unknown, massimo: number): string[] => [...new Set(testo(v, massimo).split(',').map((n) => n.trim()).filter(Boolean))].slice(0, 40)

/** Empty means every paired server; `local`, `none` or `off` alone means this machine only; otherwise the names listed. */
function serverDa(v: unknown): string[] | null {
  const nomi = elenco(v, 300)
  if (!nomi.length) return null
  return nomi.length === 1 && /^(local|none|off)$/i.test(nomi[0]) ? [] : nomi
}

/** From the raw settings (the keys of the manifest) to what the code uses. Anything missing or odd takes the default. */
export function impostazioniDa(s: Record<string, unknown> | null | undefined): Impostazioni {
  const g = s ?? {}
  const secondi = Number(g.refreshSeconds)
  return {
    codaBot: testo(g.queueBot, 80),
    leggiTitoli: g.titleFormat !== false,
    corsie: elenco(g.laneOrder, 600),
    alias: {},
    secondi: Number.isFinite(secondi) ? Math.min(300, Math.max(10, Math.round(secondi))) : 20,
    avvisi: g.notifications !== false,
    botAttesi: elenco(g.expectedBots, 200),
    fileStato: testo(g.stateFile, 400),
    orca: testo(g.orcaCli, 400),
    server: serverDa(g.servers),
    animazioni: g.animations !== 'off'
  }
}
