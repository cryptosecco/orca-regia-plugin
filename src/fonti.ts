// Le fonti fuori dall'API dei plugin: la CLI di Orca (bot, schede, messaggi, automazioni), un file
// di stato facoltativo (modello, sforzo, contesto, cache, file toccati, incroci: spento se non se ne
// indica uno) e, nelle case dei bot, i bot.json (quale foto profilo hanno in Orca) e l'immagine di chi ne ha caricata una.
//
// Solo lettura. I comandi sono un elenco fisso scritto qui sotto: da questo file non parte
// nessun comando che scrive a un bot, a un agente o a un terminale.
import { execFile } from 'node:child_process'
import { watch } from 'node:fs'
import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { avatarDi, type CliGrezza, type FotoBot, type FotoSua } from './norma'

/** Gli unici comandi che il plugin lancia. `{bot}` è l'id di un bot preso da `bot list`: il nome può cambiare e portare un'emoji, l'id no. */
export const COMANDI = {
  bot: ['bot', 'list'],
  item: ['bot', 'item', 'list', '--bot', '{bot}'],
  lavori: ['bot', 'work', 'list', '--bot', '{bot}'],
  chat: ['bot', 'chats', '--bot', '{bot}'],
  schede: ['worktree', 'ps', '--limit', '300'],
  automazioni: ['automations', 'list'],
  posta: ['orchestration', 'inbox', '--limit', '40', '--full'],
  // I worker di orchestrazione con lo stato della loro consegna: dice quali agenti sono stati avviati, e com'è finita.
  operai: ['orchestration', 'worker-list']
} as const
export type NomeComando = keyof typeof COMANDI

/** L'id di un bot è un UUID: solo così entra in un comando. */
export const ID_BOT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Dove Orca mette la sua CLI su macOS: si prova dopo il percorso delle impostazioni e prima di `orca` nel PATH. */
export const ORCA_APP = '/Applications/Orca.app/Contents/Resources/bin/orca'
/** Il nome di un server Orca abbinato (`--environment <nome>`): solo così entra in un comando. */
export const NOME_SERVER = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/
/** Dove gira il worker: serve a trovare la CLI dell'Orca che lo ha avviato, su qualunque sistema. */
export type Posto = { sistema: string; risorse?: string; eseguibile?: string }
export const postoVero = (): Posto => ({ sistema: process.platform, risorse: (process as { resourcesPath?: string }).resourcesPath, eseguibile: process.execPath })
/**
 * Gli eseguibili da provare, in ordine: quello delle impostazioni, la CLI dentro l'Orca che ha avviato
 * il worker (`resources/bin`), quella di macOS, poi il PATH. Su Linux la CLI si chiama `orca-ide`, e
 * `orca` nel PATH è il lettore di schermo di GNOME: lì `orca` da solo non si lancia mai.
 */
export function eseguibiliOrca(impostato: string, casa: string, posto: Posto = postoVero()): string[] {
  const linux = posto.sistema === 'linux'
  const nomi = linux ? ['orca-ide'] : ['orca', 'orca-ide']
  const risorse = [posto.risorse, posto.eseguibile ? `${dirname(posto.eseguibile)}/resources` : ''].filter((r): r is string => typeof r === 'string' && r.startsWith('/'))
  return [...new Set([
    impostato.trim() && espandi(impostato.trim(), casa),
    ...risorse.flatMap((r) => nomi.map((n) => `${r}/bin/${n}`)),
    linux ? '' : ORCA_APP,
    ...(linux ? [`${casa}/.local/bin/orca-ide`] : []),
    ...nomi
  ].filter(Boolean))] as string[]
}
/** Le case dei bot di Orca: in ognuna un bot.json e, se il bot ha caricato un'immagine, il suo avatar.png. Si leggono e basta. */
export const CASE_BOT = '~/.orca/bots'
/**
 * L'immagine di un bot che in Orca ha un avatar caricato (`upload:…`), nella sua casa: solo questi nomi,
 * in quest'ordine. `avatar.png` è il file che mostra Orca (512 px); i `pfp.*` sono solo il ripiego se manca.
 */
export const NOMI_PFP = ['avatar.png', 'pfp.png', 'pfp.svg', 'pfp.jpg'] as const
/** I file di una casa di bot che cambiano la sua faccia: quando cambiano, il pannello si aggiorna. */
export const FILE_DI_CASA = /^(bot\.json|avatar\.png|pfp\.(png|svg|jpg))$/
/**
 * Dove l'app di Orca tiene le sue mascotte, su questa macchina. Il plugin non le porta con sé: le legge
 * da qui, dall'Orca di chi lo usa, come legge l'immagine caricata di un bot. Se la cartella non c'è
 * (un altro sistema, un'altra versione) il bot resta con l'icona disegnata.
 */
export const MASCOTTE_ORCA = ['/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/renderer/assets']
/** Il file di una mascotte dentro Orca: l'id (una lettera e una cifra), un trattino, l'impronta, `.svg`. */
const FILE_MASCOTTA = /^([A-Z][0-9])-[A-Za-z0-9_-]{6,12}\.svg$/
/** Un SVG da mostrare come immagine non deve portare codice né risorse esterne. */
const SVG_VIETATO = /<script|<foreignObject|\son[a-z]+\s*=|href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i
/** Una foto più grande non viene letta. */
export const MASSIMO_PFP = 1024 * 1024

export type Dipendenze = {
  casa: string
  /** Dove gira il worker. Senza: quello vero. */
  posto?: Posto
  adesso: () => number
  /** Lancia `orca <argomenti> --json` e restituisce il testo stampato. */
  lancia: (eseguibile: string, argomenti: string[]) => Promise<string>
  leggiFile: (percorso: string) => Promise<string>
  /** I nomi dentro una cartella. */
  elenca: (cartella: string) => Promise<string[]>
  /** Cos'è un percorso, senza seguire i collegamenti: un collegamento simbolico non è un file. */
  stato: (percorso: string) => Promise<{ file: boolean; byte: number; modificato: number }>
  /** Il percorso vero, con i collegamenti risolti. */
  vero: (percorso: string) => Promise<string>
  /** I byte di un file normale, al massimo `massimo`: uno più grande è un errore e non viene letto. */
  leggiByte: (percorso: string, massimo: number) => Promise<Uint8Array>
  dopo: (ms: number, fn: () => void) => { annulla: () => void }
  /**
   * Tiene d'occhio una cartella (non quelle dentro): `cambia` riceve il nome di quello che è cambiato,
   * o null se non si sa. `guasto` avvisa che lo sguardo si è perso. Lancia un errore se la cartella non c'è.
   */
  osserva: (cartella: string, cambia: (nome: string | null) => void, guasto: () => void) => { chiudi: () => void }
}

export function dipendenzeVere(): Dipendenze {
  return {
    casa: homedir(),
    adesso: () => Date.now(),
    lancia: (eseguibile, argomenti) =>
      new Promise((ok, no) => {
        // Un comando rifiutato esce con un codice d'errore ma stampa lo stesso la sua risposta JSON: quella si tiene,
        // così si distingue «questo comando no» da «la CLI (o il server) non risponde».
        execFile(eseguibile, argomenti, { timeout: 10_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (errore, stdout) =>
          errore && !String(stdout ?? '').trimStart().startsWith('{') ? no(errore) : ok(String(stdout))
        )
      }),
    leggiFile: (percorso) => readFile(percorso, 'utf8'),
    elenca: (cartella) => readdir(cartella),
    stato: async (percorso) => {
      const s = await lstat(percorso)
      return { file: s.isFile(), byte: s.size, modificato: Math.round(s.mtimeMs) }
    },
    vero: (percorso) => realpath(percorso),
    leggiByte: async (percorso, massimo) => {
      const f = await open(percorso, 'r')
      try {
        // La misura si rilegge sul file aperto: tra il controllo e la lettura non può cambiare sotto.
        const s = await f.stat()
        if (!s.isFile() || s.size > massimo) throw new Error('file too large or not a regular file')
        const { bytesRead, buffer } = await f.read(Buffer.alloc(s.size), 0, s.size, 0)
        return buffer.subarray(0, bytesRead)
      } finally {
        await f.close()
      }
    },
    osserva: (cartella, cambia, guasto) => {
      // Non tiene vivo il processo, e guarda solo: non apre né legge i file che cambiano.
      const occhio = watch(cartella, { persistent: false }, (_evento, nome) => cambia(nome === null ? null : String(nome)))
      occhio.on('error', () => {
        occhio.close()
        guasto()
      })
      return { chiudi: () => occhio.close() }
    },
    dopo: (ms, fn) => {
      const t = setTimeout(fn, ms)
      // Il timer non deve tenere vivo un processo di prova o di `plugin check`.
      t.unref?.()
      return { annulla: () => clearTimeout(t) }
    }
  }
}

/** `server`: il nome di un server Orca abbinato; il comando va a lui (`--environment <nome>`) e non all'Orca di questa macchina. */
export function argomentiDi(comando: NomeComando, bot?: string, server?: string): string[] {
  const modello: readonly string[] = COMANDI[comando]
  if (server && !NOME_SERVER.test(server)) throw new Error(`invalid server name for ${comando}`)
  const dove = server ? ['--environment', server] : []
  if (modello.includes('{bot}')) {
    if (!bot || !ID_BOT.test(bot)) throw new Error(`invalid bot id for ${comando}`)
    return [...modello.map((a) => (a === '{bot}' ? bot : a)), ...dove, '--json']
  }
  return [...modello, ...dove, '--json']
}

export const espandi = (percorso: string, casa: string): string =>
  percorso === '~' ? casa : percorso.startsWith('~/') ? casa + percorso.slice(1) : percorso

/** Un comando, con il primo eseguibile che risponde. Restituisce `result`. */
async function comando(dip: Dipendenze, eseguibili: string[], nome: NomeComando, bot?: string, server?: string): Promise<any> {
  const argomenti = argomentiDi(nome, bot, server)
  let ultimo: unknown = new Error('no orca executable found')
  for (const eseguibile of eseguibili) {
    try {
      const dati = JSON.parse(await dip.lancia(eseguibile, argomenti))
      // `rifiutato`: la CLI ha risposto, ed è questo comando che non va (un bot che non c'è più, un comando che
      // quel server non conosce); chi chiama non lo prende per un server muto. Muto è chi non si raggiunge.
      if (!dati?.ok) throw Object.assign(new Error(String(dati?.error?.message ?? dati?.error?.code ?? 'response not ok')), { rifiutato: !IRRAGGIUNGIBILE.test(`${dati?.error?.code ?? ''} ${dati?.error?.message ?? ''}`) })
      return dati.result
    } catch (errore) {
      ultimo = errore
    }
  }
  throw ultimo
}

/** Quello che un posto dà di suo: le schede, la posta, i worker di orchestrazione e le automazioni. */
type DiPosto = { schede: any[]; posta: any[]; operai: any[]; automazioni: any[] }
const CAMPO = { schede: 'worktrees', posta: 'messages', operai: 'workers', automazioni: 'automations' } as const
/** Questa macchina, tra i posti: i server abbinati hanno il loro nome. */
const QUI = ''

/**
 * Quello che si ricorda della CLI tra un giro e l'altro: l'eseguibile buono, gli ultimi dati, a che punto è
 * la rotazione e, per posto (questa macchina e ogni server abbinato), l'ultima risposta buona: un server
 * che tace per un giro resta a schermo com'era.
 */
export type MemoriaCli = { buono: string | null; grezza: CliGrezza | null; turno: number; posti: Record<string, DiPosto> }
export const memoriaCli = (): MemoriaCli => ({ buono: null, grezza: null, turno: 0, posti: {} })

/** Il server abbinato su cui vive un bot, come lo dice `bot list` (`server.on`). Vuoto: è di questa macchina. */
export const serverDi = (bot: any): string => (typeof bot?.server?.on === 'string' && NOME_SERVER.test(bot.server.on) ? bot.server.on : '')
/**
 * I server abbinati che `worktree ps` di questa macchina dice di aver lasciato fuori, col modo di chiederli
 * (`--environment <nome>`): è la CLI stessa a dire dove sta il resto.
 */
export const serverTaciuti = (risposta: any): { nome: string; host: string }[] =>
  (Array.isArray(risposta?.hostScope?.omittedHostSelectors) ? risposta.hostScope.omittedHostSelectors : [])
    .map((o: any) => ({ nome: /^--environment (.+)$/.exec(String(o?.selector ?? ''))?.[1] ?? '', host: String(o?.hostId ?? '') }))
    .filter((o: { nome: string }) => NOME_SERVER.test(o.nome))

/** Un errore della CLI che parla della strada verso un server, non del comando. */
const IRRAGGIUNGIBILE = /unreachable|unavailable|not reachable|time[d ]?[ -]?out|offline|disconnected|connect|socket|ECONN|EHOST|ENET/i

/** Più passi insieme, al massimo `n` per volta; con `n` 1 è uno dopo l'altro. */
async function aGruppi(passi: (() => Promise<void>)[], n: number): Promise<void> {
  for (let i = 0; i < passi.length; i += n) await Promise.all(passi.slice(i, i + n).map((p) => p()))
}
/** Quanti comandi insieme verso i server: ognuno passa per la rete e costa più di un secondo, sei insieme poco più di due. */
export const INSIEME_COI_SERVER = 6

/**
 * Un giro sulla CLI, un comando dopo l'altro (senza server abbinati mai in parallelo), a priorità:
 *  - sempre: `bot list`, gli item del bot `prioritario` (l'orchestratore: la coda), le schede con gli
 *    stati degli agenti, la posta (i flussi) e i worker di orchestrazione (gli agenti avviati dai bot);
 *  - a rotazione, `quanti` per giro: item, lavori e chat degli altri bot e le automazioni;
 *  - tutto insieme al primo giro, con `tutto`, e per un bot appena comparso (così arriva già intero).
 * Se `bot list` non risponde il giro fallisce e la memoria resta com'era; un altro comando che manca
 * lascia il dato di prima.
 *
 * Con un server Orca abbinato (il modello client/server: l'Orca di questa macchina fa da finestra, bot e
 * progetti stanno sul server) `bot list` elenca già i bot del server, ma tutto il resto la CLI lo chiede
 * solo all'Orca di qui. Perciò i comandi di un bot vanno al suo server, e schede, posta, worker e
 * automazioni si leggono da questa macchina e da ogni server, e si mettono insieme. I server sono quelli
 * che la CLI stessa nomina (vedi serverDi e serverTaciuti); `server` nelle opzioni li limita a un elenco
 * (vuoto: solo questa macchina). Un server che non risponde a un comando salta gli altri del giro. Un
 * comando a un server passa per la rete e costa più di un secondo: quelli per i server partono a sei per
 * volta, accanto a quelli per questa macchina che restano uno dopo l'altro, così un giro resta di pochi secondi.
 */
export async function leggiCliAGiri(dip: Dipendenze, percorsoOrca: string, mem: MemoriaCli, opzioni: { tutto?: boolean; prioritario?: string; tuttiGliItem?: boolean; quanti?: number; server?: string[] | null } = {}): Promise<CliGrezza> {
  const tutti = eseguibiliOrca(percorsoOrca, dip.casa, dip.posto)
  // Il primo comando sceglie l'eseguibile buono: gli altri non riprovano quelli che mancano.
  const eseguibili = mem.buono && tutti.includes(mem.buono) ? [mem.buono, ...tutti.filter((e) => e !== mem.buono)] : tutti
  let bots: any[] = []
  let errore: unknown = new Error('no orca executable found')
  let buono = ''
  for (const e of eseguibili) {
    try {
      bots = (await comando(dip, [e], 'bot'))?.bots ?? []
      buono = e
      errore = null
      break
    } catch (x) {
      errore = x
    }
  }
  if (errore) {
    mem.buono = null
    throw errore
  }
  mem.buono = buono

  // I server che in questo giro non hanno risposto: non si richiede loro altro fino al prossimo.
  const muti = new Set<string>()
  const prova = async (nome: NomeComando, bot?: string, posto: string = QUI) => {
    if (muti.has(posto)) return null
    try {
      return await comando(dip, [buono], nome, bot, posto || undefined)
    } catch (e) {
      // Un comando rifiutato (un bot che non c'è più) non dice niente del server; tutto il resto sì.
      if (posto && !(e as { rifiutato?: boolean })?.rifiutato) muti.add(posto)
      return null
    }
  }
  const voluti = opzioni.server ?? null
  const ammesso = (nome: string): boolean => voluti === null || voluti.includes(nome)
  const prima = mem.grezza
  const tutto = Boolean(opzioni.tutto) || !prima
  // I comandi di un bot vanno col suo id: un bot rinominato («👑 Atlas») resta lo stesso bot.
  // Un bot di un server escluso dalle impostazioni resta in elenco, ma non gli si chiede niente.
  const dove = new Map<string, string>(bots.map((b) => [String(b?.id ?? ''), serverDi(b)]))
  const ids = bots.map((b) => String(b?.id ?? '')).filter((id) => ID_BOT.test(id) && (!dove.get(id) || ammesso(dove.get(id)!)))
  const perBot: CliGrezza['perBot'] = {}
  for (const id of ids) if (prima?.perBot[id]) perBot[id] = { ...prima.perBot[id] }
  // Un passo sa a quale posto parla: quelli per questa macchina vanno in fila, quelli per i server a gruppi.
  type Passo = { posto: string; fai: () => Promise<void> }
  const diBot = (id: string, cosa: 'item' | 'lavori' | 'chat'): Passo => ({
    posto: dove.get(id) ?? QUI,
    fai: async () => {
      const r = await prova(cosa, id, dove.get(id))
      perBot[id] = { ...perBot[id], ...(r === null && perBot[id]?.[cosa] !== undefined ? {} : { [cosa]: r }) }
    }
  })

  // Le schede di questa macchina si leggono per prime: la loro risposta dice quali server ha lasciato fuori.
  const posti: Record<string, DiPosto> = {}
  const tieni = (posto: string): DiPosto => (posti[posto] ??= mem.posti[posto] ?? { schede: [], posta: [], operai: [], automazioni: [] })
  const diPosto = async (posto: string, cosa: keyof DiPosto): Promise<any> => {
    const r = await prova(cosa, undefined, posto)
    const p = tieni(posto)
    // Ogni scheda porta il nome del suo server: serve ad aprire quella giusta quando due posti hanno lo stesso percorso.
    if (r) posti[posto] = { ...p, [cosa]: (r[CAMPO[cosa]] ?? []).map((x: any) => (cosa === 'schede' && x && typeof x === 'object' ? { ...x, server: posto || null } : x)) }
    return r
  }
  const qui = await diPosto(QUI, 'schede')
  const taciuti = serverTaciuti(qui)
  const server = [...new Set([...bots.map(serverDi), ...taciuti.map((t) => t.nome), ...(qui ? [] : (prima?.server ?? []).map((s) => s.nome))])].filter((n) => n && ammesso(n)).slice(0, 8)
  // L'host che Orca dà alle schede di un server (`runtime:…`): serve ad aprire quella giusta.
  const hostDi = new Map<string, string>([...(prima?.server ?? []).map((s) => [s.nome, s.host ?? ''] as [string, string]), ...taciuti.map((t) => [t.nome, t.host] as [string, string])])
  const luoghi = [QUI, ...server]

  const prioritario = opzioni.prioritario && ids.includes(opzioni.prioritario) ? opzioni.prioritario : ''
  const nuovi = ids.filter((id) => !perBot[id])
  // Sempre: la coda, gli stati, i flussi. Un bot nuovo si legge subito tutto.
  // Quando la coda è di tutti i bot (`tuttiGliItem`), gli item di ognuno sono la coda: si leggono a ogni giro.
  const inCoda = (id: string): boolean => (opzioni.tuttiGliItem ? true : id === prioritario)
  const subito: Passo[] = [...ids.filter((id) => inCoda(id) && !nuovi.includes(id)).map((id) => diBot(id, 'item')), ...nuovi.flatMap((id) => [diBot(id, 'item'), diBot(id, 'lavori'), diBot(id, 'chat')])]
  const resto: Passo[] = [...ids.filter((id) => !nuovi.includes(id)).flatMap((id) => [...(inCoda(id) ? [] : [diBot(id, 'item')]), diBot(id, 'lavori'), diBot(id, 'chat')]), ...luoghi.map((l): Passo => ({ posto: l, fai: async () => void (await diPosto(l, 'automazioni')) }))]
  const quanti = tutto ? resto.length : Math.min(resto.length, Math.max(1, Math.floor(opzioni.quanti ?? 1)))
  const aTurno = Array.from({ length: quanti }, (_, i) => resto[(mem.turno + i) % resto.length])
  mem.turno = tutto ? 0 : (mem.turno + quanti) % Math.max(1, resto.length)
  const diTutti = (cosa: keyof DiPosto, dove: string[]): Passo[] => dove.map((l): Passo => ({ posto: l, fai: async () => void (await diPosto(l, cosa)) }))
  const passi = [...subito, ...aTurno, ...diTutti('schede', server), ...diTutti('posta', luoghi), ...diTutti('operai', luoghi)]
  const per = (remoti: boolean) => passi.filter((p) => Boolean(p.posto) === remoti).map((p) => p.fai)
  await Promise.all([aGruppi(per(false), 1), aGruppi(per(true), INSIEME_COI_SERVER)])

  const insieme = (cosa: keyof DiPosto): any[] => luoghi.flatMap((l) => tieni(l)[cosa])
  // La posta di più posti si rimette in ordine di tempo, la più nuova in cima, com'è quella di uno solo.
  const quando = (m: any): number => (typeof m?.created_at === 'number' ? m.created_at : Date.parse(String(m?.created_at ?? '')) || 0)
  const posta = insieme('posta')
  const grezza: CliGrezza = {
    bots,
    perBot,
    schede: insieme('schede'),
    automazioni: insieme('automazioni'),
    posta: luoghi.filter((l) => tieni(l).posta.length).length > 1 ? [...posta].sort((x, y) => quando(y) - quando(x)).slice(0, 40) : posta,
    operai: insieme('operai'),
    server: server.map((nome) => ({ nome, ok: !muti.has(nome), ...(hostDi.get(nome) ? { host: hostDi.get(nome) } : {}) }))
  }
  mem.posti = Object.fromEntries(luoghi.map((l) => [l, tieni(l)]))
  mem.grezza = grezza
  return grezza
}

/** Quanti comandi ha la rotazione, con questi bot e questi posti (questa macchina più i server): serve a spartirli tra i giri. */
export const comandiARotazione = (bot: number, posti = 1): number => Math.max(1, bot * 3 - 1 + Math.max(1, posti))

/** Un giro completo sulla CLI, senza memoria: tutti i comandi, uno dopo l'altro. */
export const leggiCli = (dip: Dipendenze, percorsoOrca = ''): Promise<CliGrezza> => leggiCliAGiri(dip, percorsoOrca, memoriaCli(), { tutto: true })

/** Il file di stato facoltativo. Senza un percorso non si legge niente: chi chiama non deve nemmeno arrivare qui. */
export async function leggiMotore(dip: Dipendenze, percorso: string): Promise<any> {
  if (!percorso.trim()) throw new Error('no state file set')
  return JSON.parse(await dip.leggiFile(espandi(percorso.trim(), dip.casa)))
}

const NOME_CASA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * Che immagine è, dai suoi byte e non dal nome: un file che non è quello che dice di essere si scarta.
 * `intera` dice come va mostrata: una figura su fondo trasparente (PNG con l'alfa, SVG) si vede tutta,
 * centrata; una foto piena (JPEG, PNG senza alfa) riempie il riquadro e si ritaglia ai lati.
 */
export function tipoImmagine(nome: string, b: Uint8Array): { mime: string; intera: boolean } | null {
  const inizio = (firma: number[]) => firma.every((x, i) => b[i] === x)
  if (nome === 'pfp.png' || nome === 'avatar.png') {
    // Firma PNG, poi IHDR: il tipo di colore (byte 25) 4 o 6 ha l'alfa.
    if (b.length < 33 || !inizio([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null
    return { mime: 'image/png', intera: b[25] === 4 || b[25] === 6 }
  }
  if (nome === 'pfp.jpg') return b.length > 3 && inizio([0xff, 0xd8, 0xff]) ? { mime: 'image/jpeg', intera: false } : null
  if (nome === 'pfp.svg') return /^﻿?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(new TextDecoder().decode(b.subarray(0, 2048))) ? { mime: 'image/svg+xml', intera: true } : null
  return null
}

/**
 * L'immagine di un bot che in Orca ha un avatar caricato: `avatar.png` nella sua casa e, solo se manca o
 * non è buono, pfp.png, pfp.svg, pfp.jpg. Vale il primo che è un file normale, non vuoto, fino a 1 MB, e
 * che è davvero un'immagine di quel tipo. Niente altri nomi e niente collegamenti: il percorso vero deve
 * essere proprio `<case dei bot>/<casa>/<nome>`.
 * `chiave` è l'id del caricamento scritto in bot.json (`upload:<id>`): entra nell'impronta, così una
 * foto ricaricata in Orca si rilegge sempre, anche se il file avesse la stessa misura e la stessa data.
 * `prima` è la foto letta al giro prima: se né l'id né il file sono cambiati non viene riletta.
 */
export async function leggiPfp(dip: Dipendenze, radiceVera: string, casa: string, chiave = '', prima: FotoSua | null = null): Promise<FotoSua | null> {
  if (!NOME_CASA.test(casa)) return null
  for (const nome of NOMI_PFP) {
    try {
      const percorso = `${radiceVera}/${casa}/${nome}`
      const s = await dip.stato(percorso)
      if (!s.file || s.byte < 1 || s.byte > MASSIMO_PFP) continue
      if ((await dip.vero(percorso)) !== percorso) continue
      const impronta = `${chiave ? chiave + ':' : ''}${nome}:${s.byte}:${s.modificato}`
      if (prima?.impronta === impronta) return prima
      const byte = await dip.leggiByte(percorso, MASSIMO_PFP)
      const tipo = byte.length <= MASSIMO_PFP ? tipoImmagine(nome, byte) : null
      if (!tipo) continue
      return { impronta, intera: tipo.intera, url: `data:${tipo.mime};base64,${Buffer.from(byte).toString('base64')}` }
    } catch {
      // Non c'è, o non si legge: si prova il nome dopo.
    }
  }
  return null
}

/**
 * La mascotte di Orca con quell'id, letta dall'app installata su questa macchina. Solo un file col nome
 * fatto come quelli di Orca, normale (niente collegamenti), fino a 1 MB, che sia davvero un SVG e non
 * porti codice né risorse esterne. `prima`: la foto del giro prima, che non si rilegge se il file è lo stesso.
 */
export async function leggiMascotta(dip: Dipendenze, id: string, prima: FotoSua | null = null, cartelle: readonly string[] = MASCOTTE_ORCA): Promise<FotoSua | null> {
  if (!/^[A-Z][0-9]$/.test(id)) return null
  for (const cartella of cartelle) {
    try {
      const nome = (await dip.elenca(cartella)).filter((n) => FILE_MASCOTTA.exec(n)?.[1] === id).sort()[0]
      if (!nome) continue
      const percorso = `${cartella}/${nome}`
      const s = await dip.stato(percorso)
      if (!s.file || s.byte < 1 || s.byte > MASSIMO_PFP) continue
      const impronta = `mascot:${nome}:${s.byte}:${s.modificato}`
      if (prima?.impronta === impronta) return prima
      const byte = await dip.leggiByte(percorso, MASSIMO_PFP)
      if (!tipoImmagine('pfp.svg', byte) || SVG_VIETATO.test(new TextDecoder().decode(byte))) continue
      return { impronta, intera: true, url: `data:image/svg+xml;base64,${Buffer.from(byte).toString('base64')}` }
    } catch {
      // La cartella non c'è, o il file non si legge: si prova la prossima.
    }
  }
  return null
}

/**
 * La foto profilo di ogni bot, dalla sua casa. Comanda il campo `avatar` del bot.json, come nella barra
 * laterale di Orca: un'emoji non fa leggere nessun file, una mascotte (`mascot:N1`) si legge dall'app di
 * Orca (vedi leggiMascotta), e un `pfp.*` lasciato nella casa non vince mai su di loro; solo con
 * `upload:<id>` si legge l'immagine dalla casa (vedi leggiPfp).
 * Sola lettura; dal bot.json escono solo id, nome e avatar. Una casa illeggibile si salta; un bot senza
 * avatar c'è lo stesso (la sua casa va tenuta d'occhio). `prima` sono le foto del giro prima.
 */
export async function leggiFoto(dip: Dipendenze, cartella = CASE_BOT, prima: FotoBot[] = [], mascotte: readonly string[] = MASCOTTE_ORCA): Promise<FotoBot[]> {
  const radice = espandi(cartella, dip.casa)
  const nomi = (await dip.elenca(radice)).filter((n) => NOME_CASA.test(n)).sort().slice(0, 60)
  const radiceVera = await dip.vero(radice).catch(() => '')
  const gia = new Map(prima.map((f) => [f.casa, f.sua]))
  const foto: FotoBot[] = []
  for (const casa of nomi) {
    let bot: any = null
    try {
      bot = JSON.parse(await dip.leggiFile(`${radice}/${casa}/bot.json`))
    } catch {
      // Non è la casa di un bot, o il file non si legge.
    }
    if (!bot || typeof bot !== 'object') continue
    const avatar = typeof bot.avatar === 'string' ? bot.avatar.trim().slice(0, 80) : ''
    const scelta = avatarDi(avatar)
    const sua =
      radiceVera && scelta?.tipo === 'caricata' ? await leggiPfp(dip, radiceVera, casa, scelta.chiave, gia.get(casa) ?? null) : scelta?.tipo === 'mascotte' ? await leggiMascotta(dip, scelta.id, gia.get(casa) ?? null, mascotte) : null
    foto.push({ id: String(bot.id ?? ''), nome: String(bot.name ?? casa), casa, avatar, sua })
  }
  return foto
}
