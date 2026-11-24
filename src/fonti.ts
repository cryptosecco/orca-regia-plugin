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
import { win32 } from 'node:path'
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

/**
 * L'ambiente per la CLI. Orca avvia il worker con un ambiente ridotto, e su Windows in quell'ambiente
 * non ci sono APPDATA né LOCALAPPDATA: la CLI senza APPDATA non trova il runtime di Orca, e risponde
 * `runtime_unavailable` a ogni comando. Qui si rimmettono, se mancano; tutto il resto resta com'è.
 */
export function envPerLaCli(
  ambiente: Record<string, string | undefined> = process.env,
  casa = homedir(),
  sistema = process.platform
): Record<string, string | undefined> {
  const env = { ...ambiente }
  if (sistema === 'win32') {
    env.APPDATA ??= win32.join(casa, 'AppData', 'Roaming')
    env.LOCALAPPDATA ??= win32.join(casa, 'AppData', 'Local')
  }
  return env
}

/**
 * La CLI di Orca su Windows, se si trova. Serve il percorso intero: lanciata con un nome solo
 * (`orca`), la CLI cerca il suo comando nella cartella in cui si trova, e il worker gira dentro la
 * cartella dell'app: da lì il comando non c'è, e ogni chiamata muore con `MODULE_NOT_FOUND`.
 */
export function cliDiWindows(
  sistema = process.platform,
  risorse = (process as { resourcesPath?: string }).resourcesPath,
  eseguibile = process.execPath,
  casa = homedir()
): string[] {
  if (sistema !== 'win32') return []
  const basi = [
    risorse,
    eseguibile ? win32.join(win32.dirname(eseguibile), 'resources') : '',
    win32.join(casa, 'AppData', 'Local', 'Programs', 'orca', 'resources')
  ]
  return [...new Set(basi.filter((b): b is string => Boolean(b)).map((b) => win32.join(b, 'bin', 'orca.exe')))]
}

export function dipendenzeVere(): Dipendenze {
  return {
    casa: homedir(),
    adesso: () => Date.now(),
    lancia: (eseguibile, argomenti) =>
      new Promise((ok, no) => {
        execFile(eseguibile, argomenti, { env: envPerLaCli(), timeout: 10_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (errore, stdout) =>
          errore ? no(errore) : ok(String(stdout))
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

export function argomentiDi(comando: NomeComando, bot?: string): string[] {
  const modello: readonly string[] = COMANDI[comando]
  if (modello.includes('{bot}')) {
    if (!bot || !ID_BOT.test(bot)) throw new Error(`invalid bot id for ${comando}`)
    return [...modello.map((a) => (a === '{bot}' ? bot : a)), '--json']
  }
  return [...modello, '--json']
}

export const espandi = (percorso: string, casa: string): string =>
  percorso === '~' ? casa : percorso.startsWith('~/') ? casa + percorso.slice(1) : percorso

/** Un comando, con il primo eseguibile che risponde. Restituisce `result`. */
async function comando(dip: Dipendenze, eseguibili: string[], nome: NomeComando, bot?: string): Promise<any> {
  const argomenti = argomentiDi(nome, bot)
  let ultimo: unknown = new Error('no orca executable found')
  for (const eseguibile of eseguibili) {
    try {
      const dati = JSON.parse(await dip.lancia(eseguibile, argomenti))
      if (!dati?.ok) throw new Error(String(dati?.error?.message ?? dati?.error?.code ?? 'response not ok'))
      return dati.result
    } catch (errore) {
      ultimo = errore
    }
  }
  throw ultimo
}

/** Quello che si ricorda della CLI tra un giro e l'altro: l'eseguibile buono, gli ultimi dati, a che punto è la rotazione. */
export type MemoriaCli = { buono: string | null; grezza: CliGrezza | null; turno: number }
export const memoriaCli = (): MemoriaCli => ({ buono: null, grezza: null, turno: 0 })

/**
 * Un giro sulla CLI, un comando dopo l'altro (mai in parallelo), a priorità:
 *  - sempre: `bot list`, gli item del bot `prioritario` (l'orchestratore: la coda), le schede con gli
 *    stati degli agenti, la posta (i flussi) e i worker di orchestrazione (gli agenti avviati dai bot);
 *  - a rotazione, `quanti` per giro: item, lavori e chat degli altri bot e le automazioni;
 *  - tutto insieme al primo giro, con `tutto`, e per un bot appena comparso (così arriva già intero).
 * Se `bot list` non risponde il giro fallisce e la memoria resta com'era; un altro comando che manca
 * lascia il dato di prima.
 */
export async function leggiCliAGiri(dip: Dipendenze, percorsoOrca: string, mem: MemoriaCli, opzioni: { tutto?: boolean; prioritario?: string; tuttiGliItem?: boolean; quanti?: number } = {}): Promise<CliGrezza> {
  const tutti = [...new Set([percorsoOrca.trim() && espandi(percorsoOrca.trim(), dip.casa), ORCA_APP, ...cliDiWindows(), 'orca'].filter(Boolean))] as string[]
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

  const prova = async (nome: NomeComando, bot?: string) => {
    try {
      return await comando(dip, [buono], nome, bot)
    } catch {
      return null
    }
  }
  const prima = mem.grezza
  const tutto = Boolean(opzioni.tutto) || !prima
  // I comandi di un bot vanno col suo id: un bot rinominato («👑 Atlas») resta lo stesso bot.
  const ids = bots.map((b) => String(b?.id ?? '')).filter((id) => ID_BOT.test(id))
  const perBot: CliGrezza['perBot'] = {}
  for (const id of ids) if (prima?.perBot[id]) perBot[id] = { ...prima.perBot[id] }
  const grezza: CliGrezza = { bots, perBot, schede: prima?.schede ?? [], automazioni: prima?.automazioni ?? [], posta: prima?.posta ?? [], operai: prima?.operai ?? [] }
  type Passo = () => Promise<void>
  const diBot = (id: string, cosa: 'item' | 'lavori' | 'chat'): Passo => async () => {
    const r = await prova(cosa, id)
    perBot[id] = { ...perBot[id], ...(r === null && perBot[id]?.[cosa] !== undefined ? {} : { [cosa]: r }) }
  }
  const schede: Passo = async () => {
    const r = await prova('schede')
    if (r || !prima) grezza.schede = r?.worktrees ?? []
  }
  const posta: Passo = async () => {
    const r = await prova('posta')
    if (r || !prima) grezza.posta = r?.messages ?? []
  }
  const operai: Passo = async () => {
    const r = await prova('operai')
    if (r || !prima) grezza.operai = r?.workers ?? []
  }
  const automazioni: Passo = async () => {
    const r = await prova('automazioni')
    if (r || !prima) grezza.automazioni = r?.automations ?? []
  }
  const prioritario = opzioni.prioritario && ids.includes(opzioni.prioritario) ? opzioni.prioritario : ''
  const nuovi = ids.filter((id) => !perBot[id])
  // Sempre: la coda, gli stati, i flussi. Un bot nuovo si legge subito tutto.
  // Quando la coda è di tutti i bot (`tuttiGliItem`), gli item di ognuno sono la coda: si leggono a ogni giro.
  const inCoda = (id: string): boolean => (opzioni.tuttiGliItem ? true : id === prioritario)
  const subito: Passo[] = [...ids.filter((id) => inCoda(id) && !nuovi.includes(id)).map((id) => diBot(id, 'item')), ...nuovi.flatMap((id) => [diBot(id, 'item'), diBot(id, 'lavori'), diBot(id, 'chat')])]
  const resto: Passo[] = [...ids.filter((id) => !nuovi.includes(id)).flatMap((id) => [...(inCoda(id) ? [] : [diBot(id, 'item')]), diBot(id, 'lavori'), diBot(id, 'chat')]), automazioni]
  for (const passo of subito) await passo()
  const quanti = tutto ? resto.length : Math.min(resto.length, Math.max(1, Math.floor(opzioni.quanti ?? 1)))
  for (let i = 0; i < quanti; i++) await resto[(mem.turno + i) % resto.length]()
  mem.turno = tutto ? 0 : (mem.turno + quanti) % Math.max(1, resto.length)
  await schede()
  await posta()
  await operai()
  mem.grezza = grezza
  return grezza
}

/** Quanti comandi ha la rotazione, con questi bot: serve a spartirli tra i giri. */
export const comandiARotazione = (bot: number): number => Math.max(1, bot * 3 - 1 + 1)

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
