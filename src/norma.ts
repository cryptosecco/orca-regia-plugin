// Funzioni pure: dai dati grezzi (CLI di Orca, stato.json del Motore, API dei plugin) al «quadro»
// che il pannello disegna. Niente Node e niente Orca qui dentro, così si provano da sole.
//
// Regola sui testi: nel quadro entrano solo titoli e prime righe, mai il testo intero di un
// messaggio o di un prompt.
import { NOME, opzioniPredefinite, type Opzioni } from './opzioni'
import type { Agente, Attesa, Bot, Coda, Figlio, Fonti, Messaggio, Progetto, Prova, Quadro, Scheda, VoceCoda } from './protocol'

type Grezzo = any

/**
 * Il file di stato è fermo se il suo `aggiornato` è più vecchio di un minuto: chi lo scrive lo rinnova ogni
 * pochi secondi. Vale solo per chi ha impostato un file di stato; senza, questa fonte è spenta e non se ne parla.
 */
export const MOTORE_VECCHIO_MS = 60_000
/** L'ora di un istante, «10:53», nel fuso della macchina. */
export const oraDi = (quando: number): string => {
  const d = new Date(quando)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** La cartella di un bot sotto ~/.orca/bots, da un percorso che ci finisce dentro. */
export const casaDa = (percorso: unknown): string | null => /\.orca\/bots\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/?$/.exec(String(percorso ?? ''))?.[1] ?? null

export function corto(testo: unknown, n: number, casa = ''): string {
  let t = String(testo ?? '').replace(/\s+/g, ' ').trim()
  if (casa) t = t.split(casa).join('~')
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

/** La prima riga utile di un testo, senza le intestazioni automatiche delle consegne. */
export function primaRiga(testo: unknown, n = 140, casa = ''): string {
  let t = String(testo ?? '').trim()
  t = t.replace(/^─+[\s\S]*?─+\s*/, '')
  t = t.replace(/^\[Orca:[^\]]*\]\s*/, '')
  t = t.replace(/^Subject:\s*/, '')
  const taglio = t.slice(0, n).indexOf('\n')
  return corto(taglio > 0 ? t.slice(0, taglio) : t, n, casa)
}

export function ms(valore: unknown): number | null {
  if (valore === null || valore === undefined || valore === '' || valore === 'None') return null
  if (typeof valore === 'number') return Math.round(valore)
  const t = Date.parse(String(valore))
  return Number.isNaN(t) ? null : t
}

/**
 * Un percorso di file dentro un testo si accorcia al nome del file (o dell'ultima cartella): in un pannello
 * largo 380 px «~/Documents/projects/website/drafts/notes.md» si mangia tre righe.
 * Vale per i percorsi che partono da casa (`~/…`) o da una radice del disco (la cartella degli utenti, `/tmp/…`) e per
 * quelli relativi con almeno due cartelle (`eventi/urbe-eth-bbq/recap.md`). Restano com'erano le date
 * (21/11), le frazioni (686/686), i rami (fix/tremor), le rotte (/api/tremor) e gli indirizzi web.
 */
export function senzaPercorsi(testo: unknown): string {
  const PEZZO = String.raw`[\w.@+%-]+`
  const percorso = new RegExp(String.raw`(?<![\w:/.~%-])(?:(?:~|\/(?:Users|home|private|tmp|var|opt|etc|Applications|Library|Volumes|System))\/(?:${PEZZO}\/)*${PEZZO}\/?|(?:${PEZZO}\/){2,}(?:${PEZZO})?)`, 'g')
  return String(testo ?? '').replace(percorso, (trovato) => {
    const pezzi = trovato.split('/').filter((x) => x && x !== '~')
    const ultimo = pezzi[pezzi.length - 1] ?? ''
    // Un numero tra due barre non è un file: «12/05/2026» resta una data.
    if (!ultimo || pezzi.every((x) => /^\d+$/.test(x))) return trovato
    return ultimo + (trovato.endsWith('/') ? '/' : '')
  })
}

/**
 * La domanda aperta di un item, da come la dà Orca. Le domande vere e proprie stanno in `ask.questions`
 * (prompt, options, recommended) o in `decisions` (question, replies con recommended): vale la prima, con
 * le sue opzioni, e si dice quante altre ce ne sono. `contesto` è quello che le accompagna (il `gist`, cioè
 * l'ultimo commento): il pannello lo mostra solo quando una domanda non c'è. I percorsi di file si accorciano.
 */
export function normaDomanda(q: Grezzo, casa = ''): import('./protocol').Domanda | null {
  if (!q) return null
  const pulito = (t: unknown, n: number): string => corto(senzaPercorsi(t), n, casa)
  const domande: { chiede: string; opzioni: string[]; consigliata: number | null }[] = [
    ...(q.ask?.questions ?? []).map((d: Grezzo) => ({ chiede: d?.prompt, opzioni: (d?.options ?? []).map((o: Grezzo) => o?.label), consigliata: typeof d?.recommended === 'number' ? d.recommended : null })),
    ...(q.ask?.questions?.length ? [] : (q.decisions ?? [])).map((d: Grezzo) => {
      const risposte: Grezzo[] = d?.replies ?? []
      const scelta = risposte.findIndex((r) => r?.recommended === true)
      return { chiede: d?.question, opzioni: risposte.map((r) => r?.label), consigliata: scelta >= 0 ? scelta : null }
    })
  ].filter((d) => String(d.chiede ?? '').trim())
  const prima = domande[0]
  return {
    evento: String(q.eventId ?? ''),
    // Il testo libero serve solo se la domanda non è strutturata: altrimenti ripete domande e opzioni.
    contesto: pulito(q.ask?.context ?? q.gist ?? (domande.length ? '' : q.text), 260),
    chiede: pulito(prima?.chiede ?? '', 200),
    opzioni: (prima?.opzioni ?? []).map((o) => pulito(o, 90)).filter(Boolean),
    consigliata: prima?.consigliata ?? null,
    altre: Math.max(0, domande.length - 1)
  }
}

const STATI: Record<string, string> = {
  working: 'al lavoro',
  blocked: 'aspetta te',
  waiting: 'aspetta te',
  permission: 'aspetta te',
  done: 'finito'
}
export const statoAgente = (s: unknown): string => STATI[String(s)] ?? 'fermo'

const AGENTI: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok', gemini: 'Gemini', opencode: 'OpenCode', cursor: 'Cursor', pi: 'Pi' }
/** Il tipo di agente in parole, dalla sigla che usa Orca (`claude`, `grok`…). Mai un marchio disegnato. */
export function nomeAgente(sigla: unknown): string {
  const s = String(sigla ?? '').trim().toLowerCase()
  if (!s) return ''
  return AGENTI[s] ?? corto(s[0].toUpperCase() + s.slice(1), 18)
}

/**
 * Quello che serve di un bot.json: chi è e che foto profilo ha scelto in Orca (`avatar`, com'è scritto lì).
 * `sua` c'è solo se l'avatar è un'immagine caricata (`upload:…`): è il file letto dalla sua casa.
 */
export type FotoBot = { id: string; nome: string; casa: string; avatar: string; sua: FotoSua | null }
/**
 * L'immagine che un bot ha caricato in Orca (`avatar.png` nella sua casa; se manca, un `pfp.*`), già
 * pronta da mostrare. `impronta` cambia quando cambia l'id in bot.json o il file; `intera`: va mostrata
 * tutta, senza ritagliarla.
 */
export type FotoSua = { impronta: string; intera: boolean; url: string }
/**
 * Cosa dice il campo `avatar` di un bot.json, letto come lo legge Orca per la barra laterale:
 * `mascot:<id>` è una mascotte, `upload:<id>` un'immagine caricata (l'id cambia a ogni caricamento),
 * qualunque altro testo corto con una faccina è un'emoji. Vuoto o non riconosciuto: null.
 */
export type Avatar = { tipo: 'mascotte'; id: string } | { tipo: 'caricata'; chiave: string } | { tipo: 'emoji'; emoji: string }
export function avatarDi(avatar: unknown): Avatar | null {
  const a = typeof avatar === 'string' ? avatar.trim() : ''
  if (!a) return null
  if (a.startsWith('mascot:')) {
    const id = /^mascot:([A-Za-z][A-Za-z0-9]{0,7})$/.exec(a)?.[1]
    return id ? { tipo: 'mascotte', id } : null
  }
  if (a.startsWith('upload:')) {
    const chiave = a.slice(7)
    return /^[A-Za-z0-9._-]{1,64}$/.test(chiave) ? { tipo: 'caricata', chiave } : null
  }
  // Un'emoji: corta, con almeno una faccina o una bandiera, e senza lettere, cifre o segni da codice.
  return a.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(a) && !/[\p{L}<>&"'`\\\s]/u.test(a) ? { tipo: 'emoji', emoji: a } : null
}
/** La casa di un bot tra quelle lette: per id, poi per cartella se si sa, poi per nome (quello del bot.json o quello della cartella). */
export function fotoDi(foto: FotoBot[], bot: { id?: string; nome: string; casa?: string | null }): FotoBot | null {
  const nome = bot.nome.toLowerCase(), casa = bot.casa?.toLowerCase()
  return (
    (bot.id ? foto.find((f) => f.id && f.id === bot.id) : null) ??
    (casa ? foto.find((f) => f.casa.toLowerCase() === casa) : null) ??
    foto.find((f) => f.nome.toLowerCase() === nome) ??
    foto.find((f) => f.casa.toLowerCase() === nome) ??
    null
  )
}
/** L'id della mascotte di Orca, da `mascot:N1`. Un'immagine caricata o un'emoji non sono mascotte. */
export const mascotte = (avatar: unknown): string | null => {
  const a = avatarDi(avatar)
  return a?.tipo === 'mascotte' ? a.id : null
}
/** L'emoji che un bot ha scelto come avatar in Orca. Null: ha altro, o niente. */
export const emojiDi = (avatar: unknown): string | null => {
  const a = avatarDi(avatar)
  return a?.tipo === 'emoji' ? a.emoji : null
}
/**
 * La faccia di un bot nel quadro, da quello che dice il suo bot.json: la mascotte, l'emoji o l'immagine
 * caricata. Una sola delle tre, come in Orca; nessuna: resta l'icona ricavata dal nome.
 */
export const facciaDi = (f: FotoBot | null): { foto: string | null; emoji: string | null; fotoSua: { impronta: string; intera: boolean } | null } => {
  const a = avatarDi(f?.avatar)
  return {
    // Una mascotte letta dall'Orca di questa macchina si mostra come un'immagine sua; se non si è potuta
    // leggere resta solo il suo id, e il pannello disegna l'icona.
    foto: a?.tipo === 'mascotte' && !f?.sua ? a.id : null,
    emoji: a?.tipo === 'emoji' ? a.emoji : null,
    fotoSua: (a?.tipo === 'caricata' || a?.tipo === 'mascotte') && f?.sua ? { impronta: f.sua.impronta, intera: f.sua.intera } : null
  }
}

// ---------- CLI: schede, automazioni, bot, messaggi ----------

export function normaSchede(worktrees: Grezzo[], casa = ''): Scheda[] {
  return (worktrees ?? []).map((w) => {
    const pr = w.linkedPR
    return {
      progetto: String(w.repo ?? ''),
      nome: String(w.displayName ?? ''),
      percorso: corto(w.path, 300, casa),
      tipo: w.workspaceKind === 'git' ? 'worktree' : 'cartella',
      ramo: String(w.branch ?? '').replace('refs/heads/', ''),
      stato: String(w.status ?? ''),
      bot: typeof w.bot === 'string' ? w.bot : null,
      terminali: Number(w.liveTerminalCount ?? 0),
      ultimaAttivita: ms(w.lastActivityAt),
      pr: pr
        ? {
            numero: pr.number ?? null,
            titolo: corto(pr.title, 90),
            stato: String(pr.state ?? ''),
            controlli: String(pr.checksStatus ?? pr.checks ?? '')
          }
        : null,
      agenti: (w.agents ?? []).map((g: Grezzo) => ({
        tipo: String(g.agentType ?? ''),
        stato: statoAgente(g.state),
        titolo: corto(g.taskTitle || g.conversationName || '', 70),
        scheda: corto(g.conversationName || '', 70),
        cosaFa: corto(g.programStatus?.message ?? '', 90, casa),
        da: ms(g.stateStartedAt),
        worker: Boolean(g.taskTitle),
        terminale: typeof g.address === 'string' ? g.address : null
      }))
    }
  })
}

export function normaAutomazioni(lista: Grezzo[]): Quadro['automazioni'] {
  return (lista ?? []).map((a) => ({
    id: String(a.id ?? '').slice(0, 8),
    nome: String(a.name ?? ''),
    botId: a.bot?.botId ?? null,
    regola: a.rrule ?? a.schedule ?? null,
    attiva: Boolean(a.enabled),
    prossima: ms(a.nextRunAt),
    ultima: ms(a.lastRunAt),
    controlloPrima: Boolean(a.precheck)
  }))
}

export type CliGrezza = {
  bots: Grezzo[]
  /** Per id del bot. */
  perBot: Record<string, { item?: Grezzo; lavori?: Grezzo; chat?: Grezzo }>
  schede: Grezzo[]
  automazioni: Grezzo[]
  posta: Grezzo[]
  /** `orchestration worker-list`: i worker di orchestrazione con lo stato della loro consegna. */
  operai?: Grezzo[]
}

/** Una consegna di orchestrazione, per terminale: com'è andata. */
export type Operaio = { terminale: string; stato: 'lavoro' | 'aspetta' | 'finito' | 'errore' }

export type ParteCli = {
  bot: Bot[]
  schede: Scheda[]
  automazioni: Quadro['automazioni']
  messaggi: Messaggio[]
  operai?: Operaio[]
}

/**
 * Un bot una volta sola, per id. `bot list` mette in fila i bot di questo computer e quelli dei server
 * collegati (con `server`): un server che è lo stesso Orca ridà gli stessi bot, con lo stesso id. Resta la
 * copia di questo computer, o la prima che Orca elenca.
 */
export function botUnici(bots: Grezzo[]): Grezzo[] {
  const per = new Map<string, Grezzo>()
  for (const b of bots ?? []) {
    const id = String(b?.id ?? '')
    const gia = per.get(id)
    if (!gia || (gia.server && !b.server)) per.set(id, b)
  }
  return [...per.values()]
}

export function normaCli(grezza: CliGrezza, casa = ''): ParteCli {
  const schede = normaSchede(grezza.schede, casa)
  const automazioni = normaAutomazioni(grezza.automazioni)
  const chatDi = new Map<string, string>()
  const consegnaDi = new Map<string, { bot: string | null; titolo: string }>()
  // Le schede per id (`worktreeId`, lo stesso che dà `bot work list`): due progetti possono avere una scheda con lo stesso nome («main»).
  const idScheda = (grezza.schede ?? []).map((w) => String(w?.worktreeId ?? ''))
  const ids = new Set(idScheda.filter(Boolean))

  const bot: Bot[] = botUnici(grezza.bots ?? []).map((b) => {
    const nome = String(b.name)
    const dati = grezza.perBot[String(b.id)] ?? {}
    const chat: Grezzo[] = dati.chat?.chats ?? []
    for (const c of chat) chatDi.set(String(c.id), nome)
    const item = (dati.item?.items ?? []).map((i: Grezzo) => {
      const domanda = normaDomanda(i.question, casa)
      const consegne = (i.links ?? []).map((l: Grezzo) => {
        if (l.ref) consegnaDi.set(String(l.ref), { bot: nome, titolo: String(l.title ?? '') })
        return {
          titolo: corto(l.title, 90, casa),
          stato: String(l.state ?? ''),
          inizio: ms(l.startedAt),
          fine: ms(l.settledAt),
          esito: corto(l.report?.subject, 110, casa)
        }
      })
      return {
        uid: String(i.uid ?? i.number),
        numero: Number(i.number),
        titolo: corto(i.title, 140, casa),
        stato: String(i.status ?? ''),
        domanda,
        consegne,
        ultimaAttivita: ms(i.lastActivityAt),
        nato: ms(i.createdAt)
      }
    })
    // Gli spazi di lavoro del bot: per id quando Orca dà gli id; per nome solo se non li dà (una CLI più vecchia).
    const spaziId = new Set<string>(), spaziNome = new Set<string>()
    for (const w of dati.lavori?.workspaces ?? []) {
      if (w?.id && ids.size) spaziId.add(String(w.id))
      else spaziNome.add(String(w?.name))
    }
    const suo = (s: Scheda, i: number): boolean => s.bot === nome || spaziId.has(idScheda[i]) || spaziNome.has(s.nome)
    const casaBot = schede.find((s) => s.progetto === 'Bots' && (s.bot === nome || s.nome === nome))
    const sessione = casaBot?.agenti[0]
    return {
      id: String(b.id),
      nome,
      casa: casaDa(casaBot?.percorso),
      foto: null,
      emoji: null,
      fotoSua: null,
      inPausa: Boolean(b.paused),
      agente: nomeAgente(b.agent),
      specialita: corto(b.specialty, 150, casa),
      sessione: casaBot && sessione ? { stato: sessione.stato, da: sessione.da, percorso: casaBot.percorso, terminale: sessione.terminale } : null,
      chat: chat.slice(0, 1).map((c) => ({
        ultimaAttivita: ms(c.lastActivityAt),
        ultimoDetto: primaRiga(c.lastSaid, 130, casa).replace(/\*\*/g, ''),
        ultimaRichiesta: primaRiga(c.lastAsked, 130, casa).replace(/\*\*/g, '')
      })),
      item,
      worker: schede.filter((s, i) => s.progetto !== 'Bots' && suo(s, i)),
      automazioni: automazioni.filter((a) => a.botId === b.id)
    }
  })

  // Messaggi: la posta registra solo terminali e sessioni, i nomi si ricavano.
  const carichi = (grezza.posta ?? []).map((m) => {
    let carico: Grezzo = m.payload
    if (typeof carico === 'string') {
      try {
        carico = JSON.parse(carico)
      } catch {
        carico = {}
      }
    }
    return carico && typeof carico === 'object' ? carico : {}
  })
  const nomiRun = new Map<string, string>()
  ;(grezza.posta ?? []).forEach((m, i) => {
    const consegna = consegnaDi.get(String(carichi[i].dispatchId))
    if (consegna?.bot && m.run_id) nomiRun.set(String(m.run_id), consegna.bot)
  })
  ;(grezza.posta ?? []).forEach((m, i) => {
    const corpo = String(m.body ?? '')
    const compito = /for task "([^"]+)"/.exec(corpo)
    const id = carichi[i].dispatchId
    if (compito && id && !consegnaDi.has(String(id))) consegnaDi.set(String(id), { bot: null, titolo: compito[1] })
  })
  const chi = (maniglia: unknown, carico: Grezzo) => {
    const h = String(maniglia ?? '')
    if (h.startsWith('orca:')) return { nome: 'Orca', ruolo: 'sistema' }
    if (h.startsWith('orca_session_id:')) return { nome: chatDi.get(h.slice(16)) ?? 'session', ruolo: 'bot' }
    if (h.startsWith('run:')) {
      const nome = nomiRun.get(h.slice(4))
      return { nome: nome ?? 'coordinator', ruolo: nome ? 'bot' : 'coordinatore' }
    }
    const consegna = consegnaDi.get(String(carico.dispatchId)) ?? consegnaDi.get(h.replace('dispatch:', ''))
    return { nome: corto(consegna?.titolo || 'worker', 50), ruolo: 'worker' }
  }
  const messaggi: Messaggio[] = (grezza.posta ?? []).map((m, i) => ({
    id: String(m.id),
    tipo: String(m.type ?? ''),
    da: chi(m.from_handle ?? m.from, carichi[i]),
    a: chi(m.to_handle ?? m.to, carichi[i]),
    oggetto: corto(m.subject, 90, casa),
    primaRiga: primaRiga(m.body, 140, casa),
    quando: ms(m.created_at)
  }))

  return { bot, schede, automazioni, messaggi, operai: normaOperai(grezza.operai) }
}

/**
 * I worker di orchestrazione che hanno ancora un terminale, con l'esito della consegna: fallita o
 * abbandonata è un errore, riuscita è finita, una che chiede attenzione per una domanda aspetta una risposta.
 * Se un terminale ha più consegne vale l'ultima che Orca elenca per prima.
 */
export function normaOperai(lista: Grezzo[] | undefined): Operaio[] {
  const visti = new Set<string>()
  const operai: Operaio[] = []
  for (const w of lista ?? []) {
    const terminale = typeof w?.terminal === 'string' ? w.terminal : ''
    if (!terminale || visti.has(terminale)) continue
    visti.add(terminale)
    const attenzione: string[] = Array.isArray(w.attention) ? w.attention.map(String) : []
    const fallita = w.outcome === 'failed' || w.state === 'failed' || w.state === 'abandoned' || attenzione.includes('failure')
    const chiede = attenzione.some((x) => /question|blocked|escalation|permission|needs/i.test(x))
    operai.push({ terminale, stato: fallita ? 'errore' : w.state === 'succeeded' ? 'finito' : chiede ? 'aspetta' : 'lavoro' })
  }
  return operai
}

const PESO_FIGLIO: Record<Figlio['stato'], number> = { aspetta: 0, errore: 1, lavoro: 2, finito: 3, fermo: 4 }
const STATO_FIGLIO: Record<string, Figlio['stato']> = { 'al lavoro': 'lavoro', 'aspetta te': 'aspetta', finito: 'finito', errore: 'errore' }

/**
 * Gli agenti avviati da un bot, da tre fonti: gli agenti nei terminali dei suoi spazi di lavoro (`bot work
 * list` e `worktree ps`; quelli con un compito sono worker di orchestrazione, e `orchestration worker-list`
 * dice se la consegna è fallita o riuscita) e i sub-agenti di Claude Code delle sue sessioni (dal Motore).
 */
export function figliDi(bot: Bot, progetti: Progetto[], operai: Operaio[] = []): { figli: Figlio[]; subConclusi: number | null } {
  const perTerminale = new Map(operai.map((o) => [o.terminale, o]))
  const figli: Figlio[] = []
  for (const s of bot.worker) {
    s.agenti.forEach((g, i) => {
      const consegna = g.terminale ? perTerminale.get(g.terminale) : undefined
      const suo = STATO_FIGLIO[g.stato] ?? 'fermo'
      // La consegna dice com'è andata: fallita vale sempre; riuscita, o in attesa di una risposta, vale finché
      // l'agente nel terminale non si è rimesso al lavoro. Altrimenti vale lo stato dell'agente.
      let stato = suo
      if (consegna?.stato === 'errore') stato = 'errore'
      else if (consegna?.stato === 'finito' && suo !== 'lavoro' && suo !== 'aspetta') stato = 'finito'
      else if (consegna?.stato === 'aspetta' && suo !== 'lavoro') stato = 'aspetta'
      figli.push({ chiave: `t:${g.terminale ?? `${s.percorso}#${i}`}`, nome: corto(g.titolo || s.nome, 60), tipo: g.worker || consegna ? 'worker' : 'agente', stato, agente: nomeAgente(g.tipo), da: g.da, apri: { percorso: s.percorso, terminale: g.terminale } })
    })
  }
  // Le sessioni del bot, come le vede il Motore: ogni sub-agente al lavoro è un figlio.
  let conclusi: number | null = null
  const sessioni = progetti.flatMap((p) => p.agenti).filter((a) => a.bot && a.nome.toLowerCase() === bot.nome.toLowerCase())
  sessioni.forEach((a, n) => {
    if (a.subConclusi !== null) conclusi = (conclusi ?? 0) + a.subConclusi
    // Di un sub-agente si sa solo che c'è: cosa fa non esce dal worker.
    for (let i = 0; i < a.subAttivi; i++) {
      figli.push({ chiave: `s:${bot.id}:${n}:${i}`, nome: `sub-agent ${i + 1}`, tipo: 'sub', stato: 'lavoro', agente: 'Claude Code', da: null, apri: null, ...(a.vecchio ? { vecchio: true } : {}) })
    }
  })
  figli.sort((x, y) => PESO_FIGLIO[x.stato] - PESO_FIGLIO[y.stato])
  return { figli, subConclusi: conclusi }
}

// ---------- il file di stato facoltativo (il «Motore») ----------

export type ParteMotore = {
  aggiornato: number | null
  progetti: Progetto[]
  incroci: Quadro['incroci']
  conteggi: Record<string, number>
}

/** La casa di un bot dentro un percorso: `~/.orca/bots/<casa>`. */
const CASA_BOT = /\.orca\/bots\/([A-Za-z0-9][A-Za-z0-9._-]*)/

/**
 * `bots`: i bot che si conoscono, con la loro casa. Una sessione che lavora in `~/.orca/bots/<casa>`
 * è quel bot, comunque si chiami; di un bot senza casa nota (o dato solo per nome) vale il nome in minuscolo.
 */
export function normaMotore(stato: Grezzo, bots: (string | { nome: string; casa?: string | null })[], casa = ''): ParteMotore {
  const perCasa = new Map(bots.map((b) => (typeof b === 'string' ? [b.toLowerCase(), b] : [(b.casa || b.nome).toLowerCase(), b.nome])))
  const progetti: Progetto[] = (stato?.progetti ?? []).map((p: Grezzo) => ({
    nome: String(p.nome ?? ''),
    schede: (p.schede ?? []).map((s: Grezzo) => (typeof s === 'string' ? s : String(s?.nome ?? ''))),
    agenti: (p.agenti ?? []).map((a: Grezzo): Agente => {
      const tocca: string[] = (a.tocca ?? [])
        .map((t: Grezzo) => corto(typeof t === 'string' ? t : t?.percorso, 70, casa))
        .filter((t: string) => t && !t.startsWith('/private/tmp'))
      // È un bot la sessione che lavora nella sua casa. I file toccati contano solo se la cartella non si sa:
      // un agente di un progetto che modifica il SOUL.md di un bot resta un agente di quel progetto, non diventa quel bot.
      const casaBot = a.cartella ? CASA_BOT.exec(String(a.cartella)) : CASA_BOT.exec(tocca.join(' '))
      const nomeBot = casaBot ? perCasa.get(casaBot[1].toLowerCase()) : undefined
      const finestra = Number(a.finestra ?? 0)
      const contesto = typeof a.contesto === 'number' && a.contesto > 0 ? Math.round(a.contesto) : null
      // Il Motore legge le sessioni di Claude Code; gli altri agenti li segna «agente <sigla>» e
      // ne ripete la sigla al posto del modello, che in realtà non conosce.
      const esterno = /^agente\s+(\S+)/.exec(String(a.tipo ?? ''))?.[1] ?? ''
      const modello = String(a.modello ?? '')
      const aggiornato = ms(stato?.aggiornato)
      return {
        nome: nomeBot ?? corto(a.nome, 44),
        bot: Boolean(nomeBot),
        stato: String(a.stato ?? 'fermo'),
        dettaglio: corto(a.dettaglio, 90, casa),
        daSecondi: typeof a.fermoDaSecondi === 'number' ? a.fermoDaSecondi : null,
        agente: nomeAgente(esterno || (a.tipo === 'interattiva' || a.tipo === 'in background' ? 'claude' : '')),
        scheda: '',
        inSfondo: a.tipo === 'in background',
        modello: esterno && modello.toLowerCase() === esterno.toLowerCase() ? '' : corto(modello, 40),
        sforzo: corto(a.sforzo, 12).toLowerCase(),
        contesto,
        finestra: finestra > 0 ? finestra : null,
        contestoPct: contesto && finestra ? Math.round((100 * contesto) / finestra) : null,
        cacheScade: typeof a.cacheScadeTraSecondi === 'number' && aggiornato ? aggiornato + a.cacheScadeTraSecondi * 1000 : null,
        ruolo: a.ruolo ? String(a.ruolo) : '',
        inOrca: Boolean(a.terminaleOrca),
        terminale: typeof a.terminaleOrca === 'string' ? a.terminaleOrca : null,
        cartella: corto(a.cartella, 300, casa),
        domanda: corto(a.domanda, 140, casa),
        tocca: tocca.slice(0, 4),
        subAttivi: (a.subAgentiAttivi ?? []).length,
        // Dentro un agente che non è Claude Code il Motore non legge: il suo «0 sub-agenti» non è un dato.
        subConclusi: !esterno && typeof a.subAgentiConclusi === 'number' ? a.subAgentiConclusi : null
      }
    })
  }))
  return {
    aggiornato: ms(stato?.aggiornato),
    progetti,
    incroci: (stato?.incroci ?? []).map((x: Grezzo) => ({
      tipo: String(x.tipo ?? ''),
      percorso: corto(x.percorso, 120, casa),
      agenti: (x.agenti ?? []).map((n: Grezzo) => corto(typeof n === 'string' ? n : n?.nome, 60))
    })),
    conteggi: stato?.conteggi ?? {}
  }
}

/** Modello, sforzo, contesto e cache li sa solo il Motore: senza di lui mancano, e si dice. */
const SENZA_MOTORE = { inSfondo: false, modello: '', sforzo: '', contesto: null, finestra: null, contestoPct: null, cacheScade: null } as const

/**
 * Ufficio senza Motore: dalle schede della CLI. Stati sì, contesto e file toccati no. Nella casa di un bot
 * ogni chat è il bot (col suo nome, non col titolo della chat): poi `unAvatarPerBot` ne tiene una. Un
 * worker con un compito, anche se lavora nella casa di un bot, resta un agente.
 */
export function ufficioDaSchede(schede: Scheda[]): Progetto[] {
  const per = new Map<string, Progetto>()
  for (const s of schede) {
    const p = per.get(s.progetto) ?? { nome: s.progetto, schede: [], agenti: [] }
    per.set(s.progetto, p)
    p.schede.push(s.nome)
    const diBot = s.progetto === 'Bots' || casaDa(s.percorso) !== null
    for (const g of s.agenti) {
      const bot = diBot && !g.worker
      p.agenti.push({
        nome: (bot && s.bot) || g.titolo || s.nome,
        bot,
        stato: g.stato === 'finito' ? 'fermo' : g.stato,
        dettaglio: g.cosaFa,
        daSecondi: null,
        da: g.da,
        agente: nomeAgente(g.tipo),
        scheda: g.scheda,
        ...SENZA_MOTORE,
        ruolo: g.worker ? 'worker' : '',
        inOrca: true,
        terminale: g.terminale,
        cartella: s.percorso,
        domanda: '',
        tocca: [],
        subAttivi: 0,
        subConclusi: null
      })
    }
  }
  return [...per.values()]
}

/**
 * Quale sessione di un bot si vede nell'Office, la sua chat più attiva: prima quella che aspetta una
 * risposta, poi quella al lavoro, poi in errore (una chat vecchia finita male non copre quella che lavora), poi le altre.
 */
const PESO_SESSIONE: Record<string, number> = { 'aspetta te': 0, 'al lavoro': 1, errore: 2 }

/**
 * Nell'Office un bot è un avatar solo, comunque tante chat abbia: Orca elenca nella sua casa ogni chat, anche
 * le vecchie e quelle finite, e con una decina di bot l'Office arrivava a 65 avatar nella stanza dei bot e
 * a 74 agenti. Il bot si riconosce dall'id (per casa o per nome tra i bot noti); l'avatar è la sua chat più
 * attiva (vedi `PESO_SESSIONE`, a parità la più recente), nella stanza di quella chat, coi sub-agenti di
 * tutte. I worker dei bot non sono bot: restano agenti, uno per uno. Le attese, i figli e gli incroci si
 * calcolano prima, su tutte le sessioni, così nessuna domanda si perde.
 */
export function unAvatarPerBot(progetti: Progetto[], bot: Bot[], adesso = Date.now()): Progetto[] {
  const chi = (a: Agente): string => {
    const casa = casaDa(a.cartella)
    const b = (casa && bot.find((x) => x.casa === casa)) || bot.find((x) => x.nome.toLowerCase() === a.nome.toLowerCase())
    return b ? 'id:' + b.id : 'nome:' + (casa ?? a.nome.toLowerCase())
  }
  const quando = (a: Agente): number => a.da ?? (a.daSecondi !== null ? adesso - a.daSecondi * 1000 : 0)
  const gruppi = new Map<string, Agente[]>()
  for (const p of progetti) for (const a of p.agenti) if (a.bot) gruppi.set(chi(a), [...(gruppi.get(chi(a)) ?? []), a])
  const resta = new Map<Agente, Agente>()
  for (const sessioni of gruppi.values()) {
    const scelta = [...sessioni].sort((x, y) => (PESO_SESSIONE[x.stato] ?? 3) - (PESO_SESSIONE[y.stato] ?? 3) || quando(y) - quando(x))[0]
    const conclusi = sessioni.filter((a) => a.subConclusi !== null)
    resta.set(scelta, sessioni.length === 1 ? scelta : { ...scelta, subAttivi: sessioni.reduce((n, a) => n + a.subAttivi, 0), subConclusi: conclusi.length ? conclusi.reduce((n, a) => n + (a.subConclusi ?? 0), 0) : null })
  }
  return progetti.map((p) => ({ ...p, agenti: p.agenti.flatMap((a) => (!a.bot ? [a] : resta.has(a) ? [resta.get(a)!] : [])) }))
}

/**
 * Il file di stato non viene più aggiornato, ma l'ultimo c'è ancora. Quei dati non spariscono: restano a
 * schermo, segnati come non aggiornati (`vecchio`: l'ora dell'ultimo stato).
 *
 * Con la CLI (`schede`): lo stato di chi la CLI vede è quello fresco della CLI; un terminale che la CLI
 * non elenca più è stato chiuso, e l'agente esce; un agente nuovo entra senza i dati del Motore (mancano,
 * e si dice). Chi la CLI non vede (un agente fuori da Orca) resta col suo ultimo stato, segnato
 * (`statoVecchio`). Senza CLI è così per tutti.
 */
export function ufficioFermo(motore: ParteMotore, schede: Scheda[] | null): Progetto[] {
  const quando = motore.aggiornato ?? 0
  // «Fermo da N secondi» valeva all'ora dell'ultimo stato: diventa un'ora, così l'età continua a crescere.
  const invecchia = (a: Agente): Agente => ({ ...a, daSecondi: null, da: a.da ?? (a.daSecondi !== null && quando ? quando - a.daSecondi * 1000 : null), vecchio: quando })
  if (!schede) return motore.progetti.map((p) => ({ ...p, agenti: p.agenti.map((a) => ({ ...invecchia(a), statoVecchio: true })) }))
  const vivi = ufficioDaSchede(schede)
  const dellaCli = vivi.flatMap((p) => p.agenti)
  const delMotore = new Set(motore.progetti.flatMap((p) => p.agenti).map((a) => a.terminale).filter(Boolean))
  const visti = new Set<Agente>()
  // Lo stesso agente, come lo vede la CLI: dal terminale; chi per il Motore non ne ha uno (la chat di un
  // bot, una chat di Orca) dal nome del bot o dalla cartella, tra quelli che il Motore non ha già per terminale.
  const trova = (a: Agente): Agente | undefined => {
    const liberi = dellaCli.filter((v) => !visti.has(v))
    if (a.terminale) return liberi.find((v) => v.terminale === a.terminale)
    const senza = liberi.filter((v) => !delMotore.has(v.terminale))
    return a.bot ? senza.find((v) => v.bot && v.nome.toLowerCase() === a.nome.toLowerCase()) : senza.find((v) => !v.bot && Boolean(v.cartella) && v.cartella === a.cartella)
  }
  const progetti: Progetto[] = motore.progetti.map((p) => ({
    ...p,
    agenti: p.agenti.flatMap((a): Agente[] => {
      const vivo = trova(a)
      if (!vivo) return a.terminale ? [] : [{ ...invecchia(a), statoVecchio: true }]
      visti.add(vivo)
      return [{ ...invecchia(a), stato: vivo.stato, dettaglio: vivo.dettaglio || a.dettaglio, da: vivo.da ?? null, agente: vivo.agente || a.agente, scheda: vivo.scheda, ruolo: vivo.ruolo || a.ruolo }]
    })
  }))
  for (const p of vivi) {
    const nuovi = p.agenti.filter((a) => !visti.has(a))
    if (!nuovi.length) continue
    const suo = progetti.find((x) => x.nome === p.nome)
    if (suo) suo.agenti.push(...nuovi)
    else progetti.push({ ...p, agenti: nuovi })
  }
  return progetti
}

/** Ultimo ripiego: solo l'API dei plugin, una riga per scheda che ha qualcosa in corso. */
export function ufficioDaApi(workspaces: Grezzo[], casa = ''): Progetto[] {
  const per = new Map<string, Progetto>()
  for (const w of workspaces ?? []) {
    const nome = String(w.project ?? 'Altro')
    const p = per.get(nome) ?? { nome, schede: [], agenti: [] }
    per.set(nome, p)
    p.schede.push(String(w.name ?? ''))
    const st = w.status?.state
    if (st === 'working' || st === 'permission' || st === 'done') {
      p.agenti.push({
        nome: String(w.name ?? ''),
        bot: false,
        stato: statoAgente(st),
        dettaglio: st === 'permission' ? 'Asking for a permission' : '',
        daSecondi: null,
        da: ms(w.status?.lastActivityAt),
        agente: '',
        scheda: '',
        ...SENZA_MOTORE,
        ruolo: '',
        inOrca: true,
        terminale: null,
        cartella: corto(w.path, 300, casa),
        domanda: '',
        tocca: [],
        subAttivi: 0,
        subConclusi: null
      })
    }
  }
  return [...per.values()]
}

// ---------- la coda ----------

/**
 * Il bot che tiene la coda, tra i bot: quello scelto nelle impostazioni, riconosciuto dall'id, poi dal
 * nome (senza emoji né segni: «👑 Atlas» resta Atlas), poi dalla cartella della sua casa. Senza una
 * scelta non c'è: nessun bot viene dato per buono, e la coda è di tutti (vedi componiCoda).
 */
export function orchestratoreTra(bot: Bot[], codaBot = opzioniPredefinite().codaBot): Bot | undefined {
  const scelto = codaBot.trim().toLowerCase()
  if (!scelto) return undefined
  return bot.find((b) => b.id.toLowerCase() === scelto) ?? bot.find((b) => liscio(b.nome) === liscio(scelto)) ?? bot.find((b) => b.casa?.toLowerCase() === scelto)
}

const PESO_CODA: Record<string, number> = { needs_you: 0, in_progress: 1, planned: 2 }
const liscio = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// ---------- il titolo di un item: pallino, progetto, cosa, scadenza ----------
// Un titolo può essere scritto così: `<pallino> <Progetto> · <cosa> · ⏰ <gg/mm hh:mm>` (la scadenza solo
// se serve). Qui si rilegge quel formato con mano larga: emoji con o senza variante, spazi di ogni tipo,
// puntini diversi dal punto medio. Un titolo scritto in un altro modo resta com'è: senza priorità né progetto.

/** I progetti che si conoscono per nome: le corsie scelte nelle impostazioni, con i loro altri modi di scriverle. */
const noti = (o: Opzioni): Map<string, string> => new Map<string, string>([...o.corsie.map((p) => [liscio(p), p] as [string, string]), ...Object.entries(o.alias)])
/** Il nome di un progetto com'è nell'elenco delle corsie, se è uno di quelli; altrimenti null. */
export const progettoNoto = (nome: string, o: Opzioni = opzioniPredefinite()): string | null => noti(o).get(liscio(nome)) ?? null

// Il pallino: cerchi e quadrati colorati, più i segni che a volte li sostituiscono.
const PALLINI: [RegExp, number][] = [
  [/^(?:\u{1F534}|\u{1F7E5}|\u{2B55}|\u{1F6A8}|\u{2757}|\u{203C})/u, 0],
  [/^(?:\u{1F7E0}|\u{1F7E7}|\u{1F536}|\u{1F538})/u, 1],
  [/^(?:\u{1F7E1}|\u{1F7E8})/u, 2],
  [/^(?:\u{26AA}|\u{2B1C}|\u{25CB}|\u{25EF}|\u{26AC}|\u{1F518}|\u{25FB}|\u{25FD}|\u{1F7E2}|\u{1F535}|\u{1F7E3}|\u{26AB})/u, 3]
]
// Quello che può stare attorno a un'emoji senza contare: varianti, giunzioni, spazi anche non divisibili.
const CONTORNO = /^[\s\u00A0\u200B-\u200D\u2060\uFE0E\uFE0F]+/u
const PUNTO_MEDIO = /\s*[\u00B7\u2022\u2027\u2219\u22C5\u30FB\u2E31]\s*/u
const SVEGLIA = /[\u23F0\u23F1\u23F2\u{1F514}\u{1F550}-\u{1F567}][\uFE0E\uFE0F]?/u

export type TitoloLetto = {
  /** 0 🔴 oggi o scaduto, 1 🟠 entro 3 giorni, 2 🟡 questa settimana, 3 ⚪ quando capita (e chi non ha pallino). */
  priorita: 0 | 1 | 2 | 3
  /** Il titolo aveva il pallino. Falso: un titolo vecchio, che vale P3 e si vede in grigio. */
  conPallino: boolean
  /** Il progetto, scritto come nell'elenco delle corsie quando è uno di quelli. Vuoto: non si ricava. */
  progetto: string
  /** Il titolo senza pallino, senza progetto e senza scadenza. */
  testo: string
  /** La scadenza (ms). Senza ora, vale la fine di quel giorno. Null: non c'è. */
  scadenza: number | null
  /** La scadenza ha anche l'ora («21/11 17:00»). */
  conOra: boolean
}

/** Giorno e mese senza anno: l'anno è quello che porta la data più vicino ad adesso. */
function dataVicina(giorno: number, mese: number, anno: number | null, ore: number | null, minuti: number, adesso: number): number | null {
  if (!(giorno >= 1 && giorno <= 31 && mese >= 1 && mese <= 12)) return null
  if (ore !== null && !(ore >= 0 && ore <= 23 && minuti >= 0 && minuti <= 59)) return null
  const fai = (a: number): number | null => {
    const d = ore === null ? new Date(a, mese - 1, giorno, 23, 59, 59) : new Date(a, mese - 1, giorno, ore, minuti, 0)
    // Il 31/02 non esiste: Date lo farebbe scivolare a marzo.
    return d.getMonth() === mese - 1 && d.getDate() === giorno ? d.getTime() : null
  }
  if (anno !== null) return fai(anno < 100 ? 2000 + anno : anno)
  const quest = new Date(adesso).getFullYear()
  return [quest - 1, quest, quest + 1].map(fai).filter((t): t is number => t !== null).sort((x, y) => Math.abs(x - adesso) - Math.abs(y - adesso))[0] ?? null
}

const DATA = String.raw`(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?`
const ORA = String.raw`(?:[\s,]*(?:ore|alle|at|h\.?)?\s*(\d{1,2})[:.](\d{2}))?`
const DOPO_SVEGLIA = new RegExp(String.raw`^[\s:]*(?:entro\s+(?:il\s+)?|il\s+|by\s+|on\s+|due\s+)?${DATA}${ORA}\s*$`, 'iu')
const SCADUTO_IL = new RegExp(String.raw`(?:scadut[oaie]|overdue|expired)\s+(?:il\s+|l['’]\s*|on\s+|since\s+)?${DATA}`, 'iu')

/** Legge il titolo di un item. Non butta via niente: quello che non capisce resta nel testo. */
export function leggiTitolo(titolo: unknown, adesso: number, o: Opzioni = opzioniPredefinite()): TitoloLetto {
  // Con la lettura dei titoli spenta, un titolo è solo un titolo.
  if (!o.leggiTitoli) return { priorita: 3, conPallino: false, progetto: '', testo: String(titolo ?? '').replace(/\s+/g, ' ').trim(), scadenza: null, conOra: false }
  let t = String(titolo ?? '').replace(CONTORNO, '')
  let priorita: TitoloLetto['priorita'] = 3
  let conPallino = false
  for (const [segno, p] of PALLINI) {
    const m = segno.exec(t)
    if (!m) continue
    priorita = p as TitoloLetto['priorita']
    conPallino = true
    t = t.slice(m[0].length).replace(CONTORNO, '')
    break
  }
  // «P1 · Progetto · …» o «[P0] …»: la priorità scritta a lettere, con o senza pallino davanti.
  const sigla = /^\[?P([0-3])\]?(?=$|[\s:\u00B7\u2022-])[\s:\u00B7\u2022-]*/iu.exec(t)
  if (sigla) {
    if (!conPallino) priorita = Number(sigla[1]) as TitoloLetto['priorita']
    conPallino = true
    t = t.slice(sigla[0].length)
  }

  // La scadenza: quello che segue la sveglia, se è una data. Se non lo è, resta scritta nel testo.
  let scadenza: number | null = null
  let conOra = false
  const sveglia = SVEGLIA.exec(t)
  if (sveglia) {
    const m = DOPO_SVEGLIA.exec(t.slice(sveglia.index + sveglia[0].length))
    const quando = m ? dataVicina(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, m[4] ? Number(m[4]) : null, Number(m[5] ?? 0), adesso) : null
    if (quando !== null) {
      scadenza = quando
      conOra = Boolean(m?.[4])
      t = t.slice(0, sveglia.index).replace(new RegExp(PUNTO_MEDIO.source + '$', 'u'), '').trimEnd()
    }
  }
  // Senza sveglia vale anche «scaduto il 16/11» scritto nel testo, che resta dov'è.
  if (scadenza === null) {
    const m = SCADUTO_IL.exec(t)
    if (m) scadenza = dataVicina(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, null, 0, adesso)
  }

  // Il progetto: il primo pezzo prima del punto medio. Con il pallino vale qualunque nome corto; senza,
  // solo un progetto dell'elenco delle corsie, anche scritto «Progetto: cosa».
  let progetto = ''
  const taglio = PUNTO_MEDIO.exec(t)
  if (taglio && taglio.index > 0) {
    const primo = t.slice(0, taglio.index).trim(), resto = t.slice(taglio.index + taglio[0].length).trim()
    const noto = progettoNoto(primo, o)
    if (resto && (noto || (conPallino && primo.length <= 32))) {
      progetto = noto ?? primo
      t = resto
    }
  }
  if (!progetto) {
    const vecchio = /^([^:]{2,32}):\s+(\S.*)$/su.exec(t)
    const noto = vecchio ? progettoNoto(vecchio[1], o) : null
    if (vecchio && noto) {
      progetto = noto
      t = vecchio[2]
    }
  }
  return { priorita, conPallino, progetto, testo: t.replace(/\s+/g, ' ').trim() || String(titolo ?? '').trim(), scadenza, conOra }
}

/** La fine di oggi, nell'ora del posto. */
export const fineGiorno = (adesso: number): number => {
  const d = new Date(adesso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

/** L'ordine delle corsie: prima quelle scelte nelle impostazioni, poi le altre in ordine alfabetico, in fondo chi non ha progetto. */
export function ordinaProgetti(nomi: Iterable<string>, corsie: string[] = opzioniPredefinite().corsie): string[] {
  const posto = (n: string): number => (n ? (corsie.indexOf(n) + 1 || corsie.length + 1) : corsie.length + 2)
  return [...new Set(nomi)].sort((x, y) => posto(x) - posto(y) || x.localeCompare(y, 'en', { sensitivity: 'base' }))
}

/** Quante decisioni stanno in cima, in «Decidi adesso». Il resto aspetta in corsia. */
export const MASSIMO_DECIDI = 5
const senzaFine = (t: number | null): number => t ?? Infinity

/** Chi lavora a un item, quando si capisce: una consegna in corso, oppure il progetto nominato nel titolo. */
function chiLavora(item: Bot['item'][number], progetti: Progetto[], progetto: string): string {
  const inCorso = item.consegne.filter((c) => c.stato === 'working')
  if (inCorso.length) return `worker «${inCorso[0].titolo}»${inCorso.length > 1 ? ` and ${inCorso.length - 1} more` : ''}`
  // Il progetto letto dal titolo, e il pezzo prima dei due punti com'è scritto («website: new landing page»).
  const taglio = item.titolo.indexOf(':')
  const nomi = [liscio(progetto), taglio > 0 ? liscio(item.titolo.slice(0, taglio)) : ''].filter((n) => n.length >= 3)
  const p = progetti.find((x) => x.agenti.length && liscio(x.nome).length >= 3 && nomi.some((n) => liscio(x.nome) === n || n.startsWith(liscio(x.nome))))
  if (!p) return ''
  const lavorano = p.agenti.filter((a) => a.stato === 'al lavoro').length
  const n = p.agenti.length
  return `project ${p.nome}: ${n} ${n === 1 ? 'agent' : 'agents'}, ${lavorano ? `${lavorano} working` : 'idle'}`
}

/**
 * La coda. Con un bot scelto nelle impostazioni sono i suoi item, e solo i suoi, in corsie per progetto.
 * Senza una scelta sono gli item aperti di tutti i bot, in corsie per bot (`diTutti`): il plugin funziona
 * appena installato, senza sapere chi orchestra.
 * In ordine di priorità; a parità, prima chi aspetta una risposta, poi in corso, poi previsti; poi per
 * scadenza e per numero. In cima, «Decidi adesso»: al massimo cinque di quelli che aspettano, per priorità
 * e poi per scadenza. Una scadenza di oggi o già passata porta l'item a P0 anche se il pallino è rimasto indietro.
 */
export function componiCoda(bot: Bot[], progetti: Progetto[], o: Opzioni = opzioniPredefinite(), adesso = Date.now()): Coda {
  const lead = orchestratoreTra(bot, o.codaBot)
  const diTutti = !o.codaBot.trim()
  const stasera = fineGiorno(adesso)
  // Gli item chiusi non stanno in coda: di un bot scelto arrivano già solo gli aperti, di tutti si filtrano.
  const aperto = (stato: string): boolean => stato !== 'done' && stato !== 'closed'
  const di = diTutti ? bot.filter((b) => !b.soloMotore) : lead ? [lead] : []
  const voci = di
    .flatMap((b) => b.item.filter((i) => !diTutti || aperto(i.stato)).map((i) => ({ b, i })))
    .map(({ b, i }) => {
      const t = leggiTitolo(i.titolo, adesso, o)
      const oggi = t.priorita === 0 || (t.scadenza !== null && t.scadenza <= stasera)
      return {
        // Due bot possono avere un item con lo stesso uid: con tutti in coda la chiave porta anche il bot.
        uid: diTutti ? `${b.id}:${i.uid}` : i.uid,
        numero: i.numero,
        titolo: i.titolo,
        stato: i.stato,
        domanda: i.domanda,
        da: i.ultimaAttivita,
        chi: chiLavora(i, progetti, t.progetto),
        priorita: (oggi ? 0 : t.priorita) as TitoloLetto['priorita'],
        conPallino: t.conPallino,
        // La corsia: il progetto letto dal titolo, oppure il bot quando la coda è di tutti.
        progetto: diTutti ? b.nome : t.progetto,
        testo: senzaPercorsi(diTutti && t.progetto ? `${t.progetto} · ${t.testo}` : t.testo),
        scadenza: t.scadenza,
        conOra: t.conOra,
        nato: i.nato ?? null,
        oggi,
        bot: b.nome
      }
    })
    .sort((x, y) => x.priorita - y.priorita || (PESO_CODA[x.stato] ?? 3) - (PESO_CODA[y.stato] ?? 3) || senzaFine(x.scadenza) - senzaFine(y.scadenza) || x.numero - y.numero)
  const daDecidere = voci.filter((v) => v.stato === 'needs_you')
  const decidi = [...daDecidere]
    .sort((x, y) => x.priorita - y.priorita || senzaFine(x.scadenza) - senzaFine(y.scadenza) || senzaFine(x.nato) - senzaFine(y.nato) || x.numero - y.numero)
    .slice(0, MASSIMO_DECIDI)
    .map((v) => v.uid)
  return {
    // Se il bot scelto non c'è (o la CLI tace) resta il nome scritto nelle impostazioni; un id non è un nome da mostrare.
    bot: diTutti ? '' : (lead?.nome ?? (/^[0-9a-f-]{36}$/i.test(o.codaBot.trim()) ? 'the chosen bot' : o.codaBot.trim())),
    diTutti,
    // Di tutti: c'è se c'è almeno un bot letto dalla CLI. Di uno: se quel bot c'è.
    presente: diTutti ? di.length > 0 : Boolean(lead) && !lead?.soloMotore,
    voci,
    aspettano: daDecidere.length,
    decidi,
    oggi: voci.filter((v) => v.oggi).length,
    inCorso: voci.filter((v) => v.stato === 'in_progress').length,
    // Le corsie per bot restano nell'ordine in cui Orca elenca i bot.
    progetti: diTutti ? [...new Set(voci.map((v) => v.progetto))].sort((x, y) => di.findIndex((b) => b.nome === x) - di.findIndex((b) => b.nome === y)) : ordinaProgetti(voci.map((v) => v.progetto), o.corsie)
  }
}

// ---------- la sandbox degli audit ----------

/** Un file di `~/orca/sandbox/attive`, com'è: il suo nome e il suo testo. */
export type StatoLetto = { nome: string; testo: string }
const ID_PROVA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const HANDLE = /^[\w:.-]{1,120}$/
const STATI_PROVA = ['avvio', 'in_corso', 'chiusura'] as const
/** Per quanto una prova finita resta nel quadro, così il suo registro si può ancora aprire con un clic. */
export const TIENI_FINITE_MS = 15 * 60_000
export const MASSIMO_FINITE = 6

/**
 * Un file di stato della sandbox, letto con la mano larga sui campi e stretta su chi è: serve un oggetto
 * JSON con un `id` uguale al nome del file e un `pid`. Il resto può mancare o essere null (all'avvio
 * `secondi` non c'è, e un campo vuoto è null): resta vuoto, non viene inventato. Uno stato che non conosco
 * vale «in corso»: se il file c'è, la prova gira. Del registro tengo solo il nome del file.
 * Null: non è un file di stato. Il `pid` torna a parte: dice se la prova è ancora viva.
 */
export function normaProva(letto: StatoLetto, casa = ''): { prova: Prova; pid: number } | null {
  let g: Grezzo
  try {
    g = JSON.parse(letto.testo)
  } catch {
    return null
  }
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null
  const id = letto.nome.replace(/\.json$/, '')
  if (!ID_PROVA.test(id) || (g.id !== undefined && g.id !== null && String(g.id) !== id)) return null
  const pid = typeof g.pid === 'number' && Number.isInteger(g.pid) && g.pid > 1 ? g.pid : 0
  if (!pid) return null
  const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)
  const handle = (v: unknown): string | null => (typeof v === 'string' && HANDLE.test(v) ? v : null)
  const testo = (v: unknown, n: number): string => (typeof v === 'string' ? corto(v, n, casa) : '')
  const registro = typeof g.registro === 'string' ? g.registro.slice(g.registro.lastIndexOf('/') + 1) : ''
  return {
    pid,
    prova: {
      id,
      nome: testo(g.nome, 60) || id,
      stato: (STATI_PROVA as readonly string[]).includes(g.stato) ? g.stato : 'in_corso',
      agente: testo(g.agente, 24).toLowerCase(),
      bot: testo(g.bot, 60),
      terminale: handle(g.terminale),
      worktree: handle(g.worktree),
      workspace: handle(g.workspace),
      scheda: handle(g.scheda),
      cartella: testo(g.cartella, 200),
      comando: testo(g.comando, 200),
      inizio: typeof g.inizio === 'string' ? ms(g.inizio) : null,
      rete: g.rete === 'si' || g.rete === true,
      dominio: testo(g.dominio, 80),
      tempoMax: numero(g.tempo_max),
      cpuMax: numero(g.cpu_max),
      memMaxMb: numero(g.mem_max_mb),
      bloccati: numero(g.bloccati) ?? 0,
      memoriaMb: numero(g.memoria_mb),
      processi: numero(g.processi),
      secondi: numero(g.secondi),
      registro: /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.log$/.test(registro) ? registro : ''
    }
  }
}

/**
 * Le prove vive: i file che sono davvero file di stato e il cui `pid` è ancora un processo (un file
 * rimasto dopo un `kill -9` è orfano, e si ignora). In ordine d'inizio.
 */
export function normaSandbox(letti: StatoLetto[], vivo: (pid: number) => boolean, casa = ''): Prova[] {
  const prove: Prova[] = []
  for (const l of letti) {
    const n = normaProva(l, casa)
    if (n && vivo(n.pid) && !prove.some((p) => p.id === n.prova.id)) prove.push(n.prova)
  }
  return prove.sort((x, y) => (x.inizio ?? 0) - (y.inizio ?? 0) || x.id.localeCompare(y.id))
}

/**
 * Da un giro al successivo: una prova che c'era e non c'è più è finita, e resta nel quadro per un quarto
 * d'ora (al massimo le ultime sei) col suo ultimo stato, così il registro si apre ancora con un clic.
 */
export function proveFinite(prima: Prova[], vive: Prova[], adesso: number): Prova[] {
  const ci = new Set(vive.map((p) => p.id))
  return prima
    .filter((p) => !ci.has(p.id))
    .map((p): Prova => (p.stato === 'finita' ? p : { ...p, stato: 'finita', finita: adesso }))
    .filter((p) => adesso - (p.finita ?? adesso) < TIENI_FINITE_MS)
    .sort((x, y) => (y.finita ?? 0) - (x.finita ?? 0))
    .slice(0, MASSIMO_FINITE)
}

// ---------- il quadro ----------

export type Ingressi = {
  adesso: number
  cli: { parte: ParteCli | null; quando: number | null; errore: string | null }
  motore: { parte: ParteMotore | null; errore: string | null }
  api: { workspaces: Grezzo[] | null }
  botInArrivo: string[]
  /** Le foto profilo lette dai bot.json; senza, i bot restano con l'icona disegnata. */
  foto?: FotoBot[]
  casa?: string
  /** Chi tiene la coda e come si leggono i titoli. Senza: nessun bot dato per buono. */
  opzioni?: Opzioni
  /** Il file di stato facoltativo non è stato chiesto: quella fonte è spenta, non guasta. */
  motoreSpento?: boolean
  /** Le animazioni sono spente nelle impostazioni. */
  fermo?: boolean
  /** Le prove della sandbox, vive e appena finite. Null o assente: su questa macchina la sandbox non c'è. */
  sandbox?: { prove: Prova[] } | null
}

export function componi(x: Ingressi): Quadro {
  const cli = x.cli.parte
  const motoreVivo = Boolean(x.motore.parte?.aggiornato && x.adesso - x.motore.parte.aggiornato <= MOTORE_VECCHIO_MS)
  const motore = x.motore.parte

  let progetti: Progetto[]
  let ufficioDa: Fonti['ufficioDa']
  if (motore && motoreVivo) {
    progetti = motore.progetti
    ufficioDa = 'motore'
  } else if (cli && !x.cli.errore) {
    // File di stato fermo: gli stati dalla CLI, e i suoi ultimi dati (se ci sono) segnati come non aggiornati.
    progetti = motore ? ufficioFermo(motore, cli.schede) : ufficioDaSchede(cli.schede)
    ufficioDa = 'cli'
  } else if (x.api.workspaces) {
    progetti = ufficioDaApi(x.api.workspaces, x.casa)
    ufficioDa = 'api'
  } else {
    progetti = motore ? ufficioFermo(motore, null) : cli ? ufficioDaSchede(cli.schede) : []
    ufficioDa = motore ? 'motore' : cli ? 'cli' : 'niente'
  }

  // Senza CLI i bot si riconoscono solo come agenti del Motore: scheda minima, senza item.
  let bot: Bot[] = cli?.bot ?? []
  if (!cli && motore) {
    bot = motore.progetti
      .flatMap((p) => p.agenti)
      .filter((a) => a.bot || /\.orca\/bots\//.test(a.cartella))
      .map((a) => ({
        id: 'motore:' + a.nome,
        nome: a.bot ? a.nome : (/\.orca\/bots\/([a-z0-9-]+)/.exec(a.cartella)?.[1] ?? a.nome),
        casa: /\.orca\/bots\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(a.cartella)?.[1] ?? null,
        foto: null,
        emoji: null,
        fotoSua: null,
        inPausa: false,
        agente: a.agente,
        specialita: a.dettaglio,
        sessione: null,
        chat: [],
        item: [],
        worker: [],
        automazioni: [],
        soloMotore: true
      }))
      // Una volta per bot, non una per sessione.
      .filter((b, i, tutti) => tutti.findIndex((x) => (x.casa ?? x.nome).toLowerCase() === (b.casa ?? b.nome).toLowerCase()) === i)
  }
  // La foto profilo di ogni bot è quella che dice il suo bot.json, come nella barra laterale di Orca:
  // una mascotte, un'emoji o l'immagine caricata. Del file nel quadro va solo l'impronta: l'immagine
  // il pannello la chiede a parte (regia.foto).
  if (x.foto?.length) {
    bot = bot.map((b) => {
      const f = fotoDi(x.foto!, b)
      return { ...b, casa: b.casa ?? f?.casa ?? null, ...facciaDi(f) }
    })
  }
  // Quello che del terminale sa solo la CLI: il tipo di agente e il nome della scheda.
  if (cli && ufficioDa === 'motore') {
    const perTerminale = new Map(cli.schede.flatMap((s) => s.agenti).filter((g) => g.terminale).map((g) => [g.terminale as string, g]))
    progetti = progetti.map((p) => ({
      ...p,
      agenti: p.agenti.map((a) => {
        const g = a.terminale ? perTerminale.get(a.terminale) : undefined
        return g ? { ...a, agente: nomeAgente(g.tipo) || a.agente, scheda: g.scheda } : a
      })
    }))
  }
  // Gli agenti che ogni bot ha avviato: worker, agenti nei suoi spazi di lavoro, sub-agenti delle sue sessioni.
  bot = bot.map((b) => ({ ...b, ...figliDi(b, progetti, cli?.operai ?? []) }))
  const automazioni = cli?.automazioni ?? []

  const attese: Attesa[] = []
  for (const b of bot) {
    for (const i of b.item) {
      if (i.stato !== 'needs_you') continue
      attese.push({
        chiave: `item:${b.id}:${i.uid}:${i.domanda?.evento ?? ''}`,
        origine: 'item',
        chi: b.nome,
        dove: 'its own queue',
        titolo: i.titolo,
        domanda: i.domanda,
        da: i.ultimaAttivita,
        apri: null
      })
    }
  }
  for (const p of progetti) {
    for (const a of p.agenti) {
      if (a.stato !== 'aspetta te') continue
      attese.push({
        chiave: `agente:${p.nome}:${a.terminale ?? a.nome}`,
        origine: 'agente',
        chi: a.nome,
        dove: p.nome,
        titolo: a.domanda || a.dettaglio || 'Waiting for your answer',
        domanda: null,
        da: a.da ?? (a.daSecondi !== null ? x.adesso - a.daSecondi * 1000 : null),
        apri: { percorso: a.cartella || null, terminale: a.terminale }
      })
    }
  }

  const coda = componiCoda(bot, progetti, x.opzioni ?? opzioniPredefinite(), x.adesso)

  const zone = new Map<string, { agente: string; progetto: string; stato: string }[]>()
  if (ufficioDa === 'motore') {
    for (const p of progetti) {
      for (const a of p.agenti) {
        for (const t of a.tocca) {
          const lista = zone.get(t) ?? []
          zone.set(t, lista)
          lista.push({ agente: a.nome, progetto: p.nome, stato: a.stato })
        }
      }
    }
  }

  // Un bot «in arrivo» esce dall'elenco da solo quando esiste: si riconosce dal nome (anche se nel
  // frattempo ha preso un'emoji o altri segni) o dalla cartella della sua casa.
  const veri = new Set(bot.flatMap((b) => [liscio(b.nome), liscio(b.casa ?? '')]).filter(Boolean))
  // L'Office e i suoi conteggi: un avatar per bot. Attese, coda, figli e zone sono già fatti su tutte le sessioni.
  const ufficio = unAvatarPerBot(progetti, bot, x.adesso)
  const agenti = ufficio.flatMap((p) => p.agenti)
  return {
    quando: x.adesso,
    fermo: Boolean(x.fermo),
    ...(x.sandbox ? { sandbox: { prove: x.sandbox.prove } } : {}),
    fonti: {
      cli: { ok: Boolean(cli) && !x.cli.errore, quando: x.cli.quando, errore: x.cli.errore },
      motore: { ok: motoreVivo, aggiornato: motore?.aggiornato ?? null, errore: x.motore.errore, spento: Boolean(x.motoreSpento), ...(agenti.some((a) => a.vecchio !== undefined) ? { ultimi: true } : {}) },
      ufficioDa,
      incrociDisponibili: ufficioDa === 'motore' && motoreVivo
    },
    conteggi: {
      agenti: agenti.length,
      lavoro: agenti.filter((a) => a.stato === 'al lavoro').length,
      aspettano: agenti.filter((a) => a.stato === 'aspetta te').length,
      errori: agenti.filter((a) => a.stato === 'errore').length,
      incroci: motoreVivo ? (motore?.incroci.length ?? 0) : 0
    },
    attese,
    coda,
    bot,
    botInArrivo: x.botInArrivo.filter((n, i, tutti) => liscio(n) && !veri.has(liscio(n)) && tutti.findIndex((m) => liscio(m) === liscio(n)) === i),
    automazioni,
    messaggi: cli?.messaggi ?? [],
    schede: cli?.schede ?? [],
    progetti: ufficio,
    incroci: motoreVivo ? (motore?.incroci ?? []) : [],
    zone: [...zone.entries()].map(([percorso, chi]) => ({ percorso, agenti: chi }))
  }
}

// ---------- barra di stato e avvisi ----------

/**
 * La voce nella barra di stato conta, nella coda e solo lì, le cose di «Decidi adesso» (al massimo
 * cinque) e quelle di oggi: «Regia · 3 to decide · 1 today». Una parte a zero non si scrive.
 */
export function voceBarra(q: Quadro, nome = NOME): { text: string; tone: 'warning' | 'neutral' | 'danger'; tooltip: string } {
  const n = q.coda.decidi.length, oggi = q.coda.oggi
  const testo = [nome, n ? `${n} to decide` : '', oggi ? `${oggi} today` : ''].filter(Boolean).join(' · ')
  // Di chi è la coda, quando è di un bot solo.
  const di = q.coda.diTutti ? '' : corto(q.coda.bot, 24)
  if (!q.fonti.cli.ok && !q.fonti.motore.ok) {
    return { text: n || oggi ? testo : `${nome} · data stalled`, tone: 'danger', tooltip: q.fonti.motore.spento ? 'The Orca CLI is not answering: the data may be stale.' : 'Neither the Orca CLI nor the state file is answering: the data may be stale.' }
  }
  // Il file di stato è stato chiesto e non viene più aggiornato: la voce lo dice per prima cosa e diventa
  // rossa, qualunque cosa ci sia in coda. L'ora è quella dell'ultimo stato (non «da N minuti»), così la voce
  // non va riscritta a ogni giro. Chi non ha impostato un file di stato (`spento`) non lo vede mai.
  if (!q.fonti.motore.ok && !q.fonti.motore.spento) {
    const da = q.fonti.motore.aggiornato ? ` since ${oraDi(q.fonti.motore.aggiornato)}` : ''
    const avviso = `State file stopped${da}: sub-agents, context and overlaps are not updated.\nRestart the program that writes it.`
    const resto = voceBarra({ ...q, fonti: { ...q.fonti, motore: { ...q.fonti.motore, ok: true } } }, nome)
    const coda = n || oggi ? resto.tooltip.split('\n') : []
    while (coda.length && [avviso, ...coda].join('\n').length > MASSIMO_RIQUADRO) coda.pop()
    return { text: [nome, 'state file stopped', n ? `${n} to decide` : '', oggi ? `${oggi} today` : ''].filter(Boolean).join(' · '), tone: 'danger', tooltip: [avviso, ...coda].join('\n').slice(0, MASSIMO_RIQUADRO) }
  }
  if (n || oggi) {
    // Orca accetta un riquadro di 256 caratteri al massimo (oltre, rifiuta tutta la voce): righe corte,
    // e se ancora non ci sta si tolgono le ultime decisioni, che restano contate nella riga in fondo.
    const prime = q.coda.decidi.map((uid) => q.coda.voci.find((v) => v.uid === uid)).filter((v): v is VoceCoda => Boolean(v))
    const riga = (v: VoceCoda): string => `${SEGNO_PRIORITA[v.priorita]} ${corto(`${v.progetto ? v.progetto + ' · ' : ''}${v.testo}`, 32)}`
    const testa = [n ? 'Decide now' : 'Nothing to decide', di].filter(Boolean).join(' · ')
    const componi = (mostrate: number): string => {
      const altre = q.coda.aspettano - mostrate
      const coda = [altre > 0 ? `+${altre} more in lanes` : '', oggi ? `${oggi} due today or overdue` : ''].filter(Boolean).join(' · ')
      return [testa, ...prime.slice(0, mostrate).map(riga), coda].filter(Boolean).join('\n')
    }
    let mostrate = prime.length
    while (mostrate > 0 && componi(mostrate).length > MASSIMO_RIQUADRO) mostrate--
    return { text: testo, tone: 'warning', tooltip: componi(mostrate).slice(0, MASSIMO_RIQUADRO) }
  }
  return { text: nome, tone: 'neutral', tooltip: `Nothing to decide in ${di ? `${di}'s queue` : 'the queue'}. ${q.conteggi.lavoro} of ${q.conteggi.agenti} agents working.` }
}
const SEGNO_PRIORITA = ['🔴', '🟠', '🟡', '⚪']
/** Quanto può essere lungo il riquadro della voce di stato: il limite è di Orca. */
export const MASSIMO_RIQUADRO = 256

/**
 * Cosa avvisare: solo le attese che non erano già state viste. `prima` null vuol dire primo avvio:
 * si prende nota di quello che c'è, senza avvisare.
 */
export function attesaNuove(prima: readonly string[] | null, q: Quadro): { nuove: Attesa[]; viste: string[] } {
  const viste = q.attese.map((a) => a.chiave)
  if (prima === null) return { nuove: [], viste }
  const gia = new Set(prima)
  return { nuove: q.attese.filter((a) => !gia.has(a.chiave)), viste }
}

export function testoAvviso(nuove: Attesa[], nome = NOME): { title: string; body: string } {
  const title = nuove.length === 1 ? `${nome}: something new is waiting on you` : `${nome}: ${nuove.length} new things are waiting on you`
  const body = nuove
    .slice(0, 3)
    .map((a) => `${a.chi}: ${corto(a.domanda?.chiede || a.titolo, 90)}`)
    .join('\n')
  return { title, body }
}
