// Il contratto tra il worker (src/worker.ts) e il pannello (panel/regia.js), dichiarato una volta.

export type AgenteScheda = {
  tipo: string
  stato: string
  titolo: string
  /** Il nome della conversazione, cioè della scheda del terminale. */
  scheda: string
  cosaFa: string
  da: number | null
  worker: boolean
  terminale: string | null
}

export type Scheda = {
  progetto: string
  nome: string
  percorso: string
  /** Il server Orca abbinato su cui sta la scheda. Null o assente: questa macchina. */
  server?: string | null
  tipo: 'worktree' | 'cartella'
  ramo: string
  stato: string
  bot: string | null
  terminali: number
  ultimaAttivita: number | null
  pr: { numero: number | null; titolo: string; stato: string; controlli: string } | null
  agenti: AgenteScheda[]
}

export type Domanda = {
  evento: string
  contesto: string
  chiede: string
  opzioni: string[]
  consigliata: number | null
  /** Quante altre domande ci sono oltre alla prima. */
  altre: number
}

export type Bot = {
  id: string
  /** Il nome com'è in Orca, emoji compresa («👑 Atlas»). Può cambiare: chi è il bot lo dicono l'id e la casa. */
  nome: string
  /** La cartella della sua casa sotto ~/.orca/bots (`atlas`, `echo`). Null: non si sa. Icona e foto vanno con lei. */
  casa: string | null
  /**
   * La foto profilo è quella scelta in Orca (`avatar` nel bot.json), una sola di queste tre; tutte null:
   * l'icona ricavata dal nome. `foto`: l'id di una mascotte (`N1`).
   */
  foto: string | null
  /** Un'emoji scelta come avatar. */
  emoji: string | null
  /**
   * L'immagine caricata in Orca (`upload:…`: l'`avatar.png` nella casa del bot). Qui c'è solo
   * l'impronta (cambia quando cambia l'id in bot.json o il file); l'immagine si chiede con `regia.foto`.
   * `intera`: è una figura su fondo trasparente, va mostrata tutta e non ritagliata.
   */
  fotoSua: { impronta: string; intera: boolean } | null
  inPausa: boolean
  /** Il tipo di agente del bot, in parole («Claude Code»). Vuoto: non si sa. */
  agente: string
  specialita: string
  /** La sessione del bot nella sua casa, se Orca la elenca: dice se sta lavorando adesso. */
  sessione: { stato: string; da: number | null; percorso: string; terminale: string | null } | null
  chat: { ultimaAttivita: number | null; ultimoDetto: string; ultimaRichiesta: string }[]
  item: {
    uid: string
    numero: number
    titolo: string
    stato: string
    domanda: Domanda | null
    consegne: { titolo: string; stato: string; inizio: number | null; fine: number | null; esito: string }[]
    ultimaAttivita: number | null
    /** Quando è nato l'item. L'ultima attività non dice l'età: un item ritoccato per riordinarlo sembrerebbe nuovo. */
    nato?: number | null
  }[]
  worker: Scheda[]
  /**
   * Gli agenti che questo bot ha avviato e che ci sono ancora: prima chi aspetta, poi chi è in errore,
   * chi lavora, chi ha finito. Vuoto: nessuno (o non si sa: senza CLI restano solo i sub-agenti).
   */
  figli?: Figlio[]
  /** Quanti sub-agenti delle sue sessioni hanno già finito. Null: non si sa. */
  subConclusi?: number | null
  automazioni: Quadro['automazioni']
  /** Riconosciuto solo dal Motore, perché la CLI non risponde: niente item né worker. */
  soloMotore?: boolean
}

/**
 * Un agente avviato da un bot: un worker di orchestrazione, un agente in un terminale di un suo spazio di
 * lavoro, o un sub-agente di Claude Code di una sua sessione.
 */
export type Figlio = {
  /** Stabile finché è lo stesso agente: il pannello ci riconosce chi nasce e chi sparisce. */
  chiave: string
  nome: string
  tipo: 'worker' | 'agente' | 'sub'
  /** lavoro, aspetta (una risposta), finito, errore (la consegna è fallita o è stata abbandonata), fermo. */
  stato: 'lavoro' | 'aspetta' | 'finito' | 'errore' | 'fermo'
  /** Il tipo di agente in parole («Claude Code»). Vuoto: non si sa. */
  agente: string
  da: number | null
  apri: Bersaglio | null
}

export type Agente = {
  nome: string
  bot: boolean
  stato: string
  dettaglio: string
  daSecondi: number | null
  da?: number | null
  /** Il tipo di agente in parole («Claude Code», «Grok», «Codex»). Vuoto: non si sa. */
  agente: string
  /** Il nome della scheda del terminale in Orca, quando la CLI lo dà. */
  scheda: string
  /** Sessione in background, fuori da un terminale interattivo. */
  inSfondo: boolean
  /** Vuoto: manca. */
  modello: string
  /** Lo sforzo (effort) come lo dichiara l'agente: low, medium, high, xhigh, max. Vuoto: manca. */
  sforzo: string
  /** Token nel contesto e ampiezza della finestra. Null: manca. */
  contesto: number | null
  finestra: number | null
  contestoPct: number | null
  /** Quando scade la cache del prompt (ms). Nel passato: è fredda. Null: manca. */
  cacheScade: number | null
  ruolo: string
  inOrca: boolean
  terminale: string | null
  cartella: string
  domanda: string
  tocca: string[]
  subAttivi: number
  /** Sub-agenti che hanno finito. Null: manca. */
  subConclusi: number | null
}

export type Progetto = { nome: string; schede: string[]; agenti: Agente[] }

export type Messaggio = {
  id: string
  tipo: string
  da: { nome: string; ruolo: string }
  a: { nome: string; ruolo: string }
  oggetto: string
  primaRiga: string
  quando: number | null
}

/** Dove porta un clic: una cartella di lavoro e, se c'è, il terminale dell'agente. */
export type Bersaglio = { percorso: string | null; terminale: string | null }

export type Attesa = {
  /** Stabile finché la stessa cosa aspetta: serve a non ripetere l'avviso. */
  chiave: string
  origine: 'item' | 'agente'
  chi: string
  dove: string
  titolo: string
  domanda: Domanda | null
  da: number | null
  apri: Bersaglio | null
}

/** Un task nella coda dell'orchestratore: un suo item, e solo suo. */
export type VoceCoda = {
  uid: string
  numero: number
  titolo: string
  stato: string
  domanda: Domanda | null
  /** Da quando è in questo stato (ultima attività dell'item). */
  da: number | null
  /** Chi ci lavora, quando si capisce: il worker con una consegna in corso o il progetto del titolo. */
  chi: string
  /**
   * Dal titolo, quando è scritto così: `<pallino> <Progetto> · <cosa> · ⏰ <gg/mm hh:mm>`.
   * 0 🔴 oggi o scaduto, 1 🟠 entro 3 giorni, 2 🟡 questa settimana, 3 ⚪ quando capita. Una scadenza di oggi
   * o già passata porta a 0 anche se il pallino è rimasto indietro.
   */
  priorita: 0 | 1 | 2 | 3
  /** Falso: un titolo vecchio, senza pallino. Vale P3 e si vede in grigio. */
  conPallino: boolean
  /** Il progetto, cioè la corsia. Vuoto: dal titolo non si ricava. */
  progetto: string
  /** Il titolo senza pallino, progetto e scadenza. */
  testo: string
  /** La scadenza (ms); senza ora, la fine di quel giorno. Null: non c'è. */
  scadenza: number | null
  conOra: boolean
  /** Quando è nato l'item: da qui l'età. */
  nato: number | null
  /** È di oggi: P0, oppure scade oggi o è già scaduto. */
  oggi: boolean
  /** Il bot che ha questo item: è nella sua chat che si risponde. */
  bot: string
}

export type Coda = {
  /** Il bot che tiene la coda, scelto nelle impostazioni. Vuoto: la coda è di tutti i bot. */
  bot: string
  /** Nessun bot scelto: in coda ci sono gli item aperti di tutti i bot, e le corsie sono i bot. */
  diTutti: boolean
  /** Falso se quel bot non c'è, o se la CLI non risponde e dei suoi item non si sa niente. */
  presente: boolean
  /** Già in ordine: per priorità; a parità prima chi aspetta una risposta, poi in corso, poi previsti; poi per scadenza. */
  voci: VoceCoda[]
  /** Quanti aspettano una decisione, in tutto. */
  aspettano: number
  /** «Decidi adesso»: gli uid di al massimo cinque item che aspettano una risposta, per priorità e poi per scadenza. */
  decidi: string[]
  /** Quanti item aperti sono di oggi (P0, in scadenza oggi o scaduti). */
  oggi: number
  inCorso: number
  /** Le corsie che hanno almeno un item, nell'ordine voluto. Vuoto: gli item senza progetto, in fondo. */
  progetti: string[]
}

export type Fonti = {
  /** `server`: i server Orca abbinati letti oltre a questa macchina, e se hanno risposto all'ultimo giro. */
  cli: { ok: boolean; quando: number | null; errore: string | null; server?: { nome: string; ok: boolean }[] }
  /** `spento`: il file di stato facoltativo non è stato chiesto. Non è un guasto, e non si legge niente. */
  motore: { ok: boolean; aggiornato: number | null; errore: string | null; spento: boolean }
  ufficioDa: 'motore' | 'cli' | 'api' | 'niente'
  incrociDisponibili: boolean
}

export type Quadro = {
  quando: number
  /** Le animazioni sono spente nelle impostazioni: il pannello si comporta come con «riduci movimento». */
  fermo: boolean
  fonti: Fonti
  conteggi: { agenti: number; lavoro: number; aspettano: number; errori: number; incroci: number }
  /** Tutto quello che aspetta una risposta, anche fuori dalla coda: serve agli avvisi. */
  attese: Attesa[]
  /** La coda: è lei che conta nella scheda «Coda» e nella barra di stato. */
  coda: Coda
  bot: Bot[]
  botInArrivo: string[]
  automazioni: {
    id: string
    nome: string
    botId: string | null
    regola: string | null
    attiva: boolean
    prossima: number | null
    ultima: number | null
    controlloPrima: boolean
  }[]
  messaggi: Messaggio[]
  schede: Scheda[]
  progetti: Progetto[]
  incroci: { tipo: string; percorso: string; agenti: string[] }[]
  zone: { percorso: string; agenti: { agente: string; progetto: string; stato: string }[] }[]
}

declare module 'orca' {
  interface PluginRequests {
    /** L'ultimo quadro; il primo giro parte se non ce n'è ancora uno. */
    'regia.quadro': { output: Quadro }
    /** Rilegge adesso tutte le fonti (senza sovrapporsi a un giro in corso). */
    'regia.aggiorna': { output: Quadro }
    /** Porta Orca su una scheda o su un terminale. Non scrive niente. */
    'regia.apri': { input: Bersaglio; output: { aperto: boolean; come?: 'terminale' | 'scheda'; motivo?: string } }
    /** L'immagine caricata di un bot (per id), tra quelle già lette dalle case dei bot. Null: non ne ha. */
    'regia.foto': { input: { bot: string }; output: { impronta: string; url: string } | null }
  }
  interface PluginPanelEvents {
    /** Il quadro è cambiato: il pannello lo richiede con regia.quadro. */
    'regia.cambiato': { quando: number }
  }
}
