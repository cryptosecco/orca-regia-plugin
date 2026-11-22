// Il worker del plugin. Tiene il quadro aggiornato in tempo reale: giri di lettura che non si
// sovrappongono, fatti partire dal tempo, dagli eventi di Orca e dai file che cambiano; a ogni giro
// avvisa il pannello, aggiorna la voce nella barra di stato e avvisa quando qualcosa di nuovo aspetta una risposta.
//
// Sola lettura, con due eccezioni volute: portare Orca su una scheda o un terminale
// (workspace:write) e mostrare un avviso (notifications:show). Non scrive a bot, agenti o terminali.
import type { OrcaWorkerApi } from 'orca/worker'
import { CASE_BOT, comandiARotazione, dipendenzeVere, espandi, FILE_DI_CASA, leggiCliAGiri, leggiFoto, leggiMotore, memoriaCli, type Dipendenze } from './fonti'
import { attesaNuove, componi, fotoDi, normaCli, normaMotore, testoAvviso, voceBarra, type FotoBot, type ParteCli } from './norma'
import { impostazioniDa, NOME, type Impostazioni } from './opzioni'
import type { Bersaglio, Quadro } from './protocol'

/** L'id della voce nella barra di stato e quello del comando, come nel manifest. */
const VOCE = 'status'
const COMANDO = 'show'
/** Le impostazioni del manifest, per chiave. */
const CHIAVI = ['queueBot', 'titleFormat', 'laneOrder', 'animations', 'refreshSeconds', 'notifications', 'expectedBots', 'stateFile', 'orcaCli', 'servers'] as const
const PRIMO_GIRO_MS = 1500
/**
 * Ogni quanto parte un giro sulla CLI. In ogni giro ci sono sempre la coda dell'orchestratore, gli stati
 * degli agenti e la posta; il resto (item, lavori e chat degli altri bot, automazioni) va a rotazione, e
 * l'impostazione «refreshSeconds» dice in quanto tempo la rotazione fa il giro completo.
 */
export const GIRO_CLI_MS = 4000
/** Dopo un evento di Orca o un file che cambia si aspetta un attimo, per prenderne più d'uno insieme. */
const DOPO_EVENTO_MS = 400
/** Mai due giri più vicini di così, nemmeno sotto una raffica di eventi. */
const MINIMO_TRA_GIRI_MS = 1000

let ferma: (() => void) | null = null

export function avvia(orca: OrcaWorkerApi, dip: Dipendenze = dipendenzeVere()): void {
  let quadro: Quadro | null = null
  let inCorso: Promise<Quadro> | null = null
  let timer: { annulla: () => void } | null = null
  let scadenza = Infinity
  let ultimoGiro = -Infinity
  let ultimoCli = -Infinity
  let viva = true
  // Cosa deve fare il prossimo giro: i file locali (Motore, case dei bot) si rileggono sempre, la CLI solo
  // se `cli`, e tutta insieme se `tutto` (il primo giro, e quando si preme «refresh»).
  // `ancora`: qualcosa è cambiato mentre un giro girava, quindi ne serve un altro appena finisce.
  const daFare = { cli: true, tutto: true, ancora: false }
  let inCorsoTutto = false
  const memoria = memoriaCli()
  // Ultimi dati buoni della CLI: restano a schermo, con la loro età, se la CLI smette di rispondere.
  let cli: { parte: ParteCli | null; quando: number | null; errore: string | null } = { parte: null, quando: null, errore: null }
  let schedeApi: { id: string; path: string; host: string | null }[] = []
  const daApi = (w: any): { id: string; path: string; host: string | null } => ({ id: String(w.id), path: String(w.path), host: typeof w.hostId === 'string' ? w.hostId : null })
  let workspaces: any[] | null = null
  // Le foto profilo dei bot: restano le ultime lette se una lettura fallisce.
  let foto: FotoBot[] = []
  let barra = ''
  let chiaviAttese: string | null = null
  // Le cartelle tenute d'occhio, per percorso.
  const occhi = new Map<string, { chiudi: () => void }>()
  // Cosa fare quando in una cartella tenuta d'occhio cambia qualcosa, per percorso.
  const cambi = new Map<string, (nome: string | null) => void>()

  /** Le impostazioni di adesso. Una che non si legge prende il suo valore neutro: nessun bot, nessun file. */
  const leggiImpostazioni = async (): Promise<Impostazioni> => {
    const grezze: Record<string, unknown> = {}
    for (const chiave of CHIAVI) {
      try {
        grezze[chiave] = await orca.settings.get(chiave)
      } catch {
        // Resta il valore neutro.
      }
    }
    return impostazioniDa(grezze)
  }
  const messaggio = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 160)

  /**
   * I file che cambiano fanno partire un giro, senza aspettare il tempo: il file di stato facoltativo
   * (solo se le impostazioni ne indicano uno), la cartella delle case dei bot (un bot nuovo) e, in ogni casa, bot.json, avatar.png e pfp.*. Si guarda
   * e basta; a ogni giro l'elenco si riallinea (case nuove, file di stato cambiato o tolto, sguardi persi).
   * Se uno sguardo perde un cambio c'è la rete di sicurezza: ogni giro a tempo (4 secondi) rilegge il
   * bot.json di ogni bot e riguarda misura e data della sua immagine, sguardi o no.
   */
  function guarda(percorsoStato: string): void {
    const radice = espandi(CASE_BOT, dip.casa)
    // Senza un file di stato nelle impostazioni non si guarda niente fuori dalle case dei bot.
    const stato = percorsoStato ? espandi(percorsoStato, dip.casa) : ''
    const taglio = stato.lastIndexOf('/')
    const voluti = new Map<string, (nome: string | null) => void>()
    if (taglio > 0) voluti.set(stato.slice(0, taglio), (nome) => (nome === null || nome === stato.slice(taglio + 1)) && chiedi(false))
    // Nella cartella delle case cambia qualcosa quando nasce o sparisce un bot: serve anche la CLI.
    voluti.set(radice, () => chiedi(true))
    // In una casa conta la faccia del bot. Orca riscrive bot.json e avatar.png con «scrivi e rinomina»:
    // lo sguardo sulla cartella regge (uno sul file no, resterebbe sul file vecchio), ma dopo ogni cambio
    // si ricollega lo stesso, così non resta mai appeso a qualcosa che non c'è più.
    for (const f of foto) {
      const percorso = `${radice}/${f.casa}`
      voluti.set(percorso, (nome) => {
        if (nome !== null && !FILE_DI_CASA.test(nome)) return
        ricollega(percorso)
        chiedi(false)
      })
    }
    for (const [percorso, occhio] of occhi) {
      if (voluti.has(percorso)) continue
      occhio.chiudi()
      occhi.delete(percorso)
      cambi.delete(percorso)
    }
    for (const [percorso, cambia] of voluti) {
      cambi.set(percorso, cambia)
      if (!occhi.has(percorso)) collega(percorso)
    }
  }
  /** Mette lo sguardo su una cartella. Quello che cambia va a chi è in `cambi` adesso, non a chi c'era. */
  function collega(percorso: string): void {
    try {
      const occhio = dip.osserva(percorso, (nome) => viva && occhi.get(percorso) === occhio && cambi.get(percorso)?.(nome), () => occhi.get(percorso) === occhio && occhi.delete(percorso))
      occhi.set(percorso, occhio)
    } catch {
      // La cartella non c'è (ancora): si riprova al prossimo giro.
    }
  }
  /** Chiude lo sguardo su una cartella e lo riapre subito; se non si riapre, ci riprova il prossimo giro. */
  function ricollega(percorso: string): void {
    const vecchio = occhi.get(percorso)
    occhi.delete(percorso)
    vecchio?.chiudi()
    collega(percorso)
  }

  async function giro(): Promise<Quadro> {
    const adesso = dip.adesso()
    const conCli = daFare.cli, tutto = daFare.tutto
    daFare.cli = daFare.tutto = daFare.ancora = false
    inCorsoTutto = conCli && tutto
    ultimoGiro = adesso
    const imp = await leggiImpostazioni()

    if (conCli) {
      ultimoCli = adesso
      try {
        // La rotazione fa il giro completo nel tempo dell'impostazione: tra 10 e 300 secondi.
        const quanti = Math.ceil((comandiARotazione(memoria.grezza?.bots.length ?? 0, 1 + (memoria.grezza?.server?.length ?? 0)) * GIRO_CLI_MS) / (imp.secondi * 1000))
        // La coda si legge a ogni giro: gli item del bot scelto, o di tutti quando non ne è scelto nessuno.
        const orchestratore = quadro?.coda.presente && !quadro.coda.diTutti ? quadro.bot.find((b) => b.nome === quadro?.coda.bot)?.id : undefined
        const grezza = await leggiCliAGiri(dip, imp.orca, memoria, { tutto, quanti, prioritario: orchestratore, tuttiGliItem: !imp.codaBot, server: imp.server })
        cli = { parte: normaCli(grezza, dip.casa), quando: adesso, errore: null }
      } catch (e) {
        cli = { ...cli, errore: messaggio(e) }
      }
    }

    // La rete di sicurezza delle foto: a ogni giro, quindi almeno ogni 4 secondi, si rilegge il bot.json
    // di ogni bot (è lui che comanda) e si riguardano misura e data della sua immagine.
    try {
      foto = await leggiFoto(dip, undefined, foto)
    } catch {
      // Le case dei bot non si leggono: restano le foto di prima, o le icone disegnate.
    }

    // Il file di stato è facoltativo: senza un percorso nelle impostazioni la fonte è spenta, e non si
    // cerca, non si legge e non si tiene d'occhio nessun file.
    const percorsoStato = imp.fileStato
    let motore: { parte: ReturnType<typeof normaMotore> | null; errore: string | null } = { parte: null, errore: null }
    if (percorsoStato) try {
      const stato = await leggiMotore(dip, percorsoStato)
      // Una sessione del Motore è di un bot se lavora nella sua casa: la casa viene dalla CLI o dal bot.json.
      const bots = (cli.parte?.bot ?? []).map((b) => ({ nome: b.nome, casa: b.casa ?? fotoDi(foto, b)?.casa ?? null }))
      motore = { parte: normaMotore(stato, bots, dip.casa), errore: null }
    } catch (e) {
      motore = { parte: null, errore: messaggio(e) }
    }
    guarda(percorsoStato)

    // L'API dei plugin: le schede servono per aprire con un clic e come ultimo ripiego dell'ufficio.
    // Si richiedono insieme alla CLI, non a ogni file che cambia.
    if (conCli || !workspaces) {
      try {
        workspaces = (await orca.host.call('workspace.list', { includeStatus: true })).workspaces as any[]
        schedeApi = workspaces.map(daApi)
      } catch {
        workspaces = null
      }
    }

    const nuovo = componi({ adesso, cli, motore, motoreSpento: !percorsoStato, api: { workspaces }, botInArrivo: imp.botAttesi, foto, casa: dip.casa, opzioni: imp, fermo: !imp.animazioni })
    quadro = nuovo
    if (!viva) return nuovo

    // La barra di stato si tocca solo quando cambia; il pannello viene avvisato a ogni giro, così sa
    // sempre quanto sono freschi i dati.
    const voce = voceBarra(nuovo)
    if (JSON.stringify(voce) !== barra) {
      try {
        await orca.host.call('statusBar.update', { id: VOCE, ...voce })
        barra = JSON.stringify(voce)
      } catch (e) {
        orca.log('barra di stato: ' + messaggio(e))
      }
    }
    await avvisa(nuovo, imp.avvisi)
    orca.panels.post('regia.cambiato', { quando: nuovo.quando })
    return nuovo
  }

  async function avvisa(q: Quadro, attivi: boolean): Promise<void> {
    // Le stesse attese del giro prima: niente di nuovo da dire, e niente da scrivere.
    const chiavi = q.attese.map((a) => a.chiave).join('\n')
    if (chiavi === chiaviAttese) return
    try {
      const salvate = await orca.storage.get('avvisate')
      const prima = Array.isArray(salvate) ? (salvate as string[]) : null
      const { nuove, viste } = attesaNuove(prima, q)
      if (prima === null || viste.join('\n') !== prima.join('\n')) await orca.storage.set('avvisate', viste)
      if (nuove.length && attivi) await orca.host.call('notifications.show', testoAvviso(nuove))
      chiaviAttese = chiavi
    } catch (e) {
      orca.log('avviso: ' + messaggio(e))
    }
  }

  /** Un giro alla volta: chi chiede mentre uno è in corso aspetta quello. */
  function aggiorna(): Promise<Quadro> {
    if (!inCorso) {
      timer?.annulla()
      scadenza = Infinity
      inCorso = giro().finally(() => {
        inCorso = null
        // Qualcuno ha chiesto un giro mentre questo girava: parte appena si può. Altrimenti il prossimo
        // è quello a tempo sulla CLI.
        if (daFare.cli || daFare.ancora) programma(DOPO_EVENTO_MS)
        else programma(GIRO_CLI_MS - (dip.adesso() - ultimoCli), true)
      })
    }
    return inCorso
  }

  /** Prenota il prossimo giro tra `traMs` (mai prima del minimo tra due giri). Una prenotazione più vicina vince. */
  function programma(traMs: number, conCli = false): void {
    if (!viva) return
    const attesa = Math.max(traMs, MINIMO_TRA_GIRI_MS - (dip.adesso() - ultimoGiro), 0)
    const quando = dip.adesso() + attesa
    // Il giro a tempo porta con sé la CLI solo se è lui a scattare: lo dice chi lo prenota.
    if (timer && quando >= scadenza) return
    timer?.annulla()
    scadenza = quando
    timer = dip.dopo(attesa, () => {
      timer = null
      scadenza = Infinity
      if (conCli || dip.adesso() - ultimoCli >= GIRO_CLI_MS) daFare.cli = true
      void aggiorna().catch((e) => orca.log('giro: ' + messaggio(e)))
    })
  }

  /** Qualcosa è cambiato (un evento di Orca, un file): un giro presto, con la CLI se serve. Mai due insieme. */
  function chiedi(conCli: boolean): void {
    if (conCli) daFare.cli = true
    // Il giro in corso potrebbe aver già letto: quando finisce ne parte un altro.
    daFare.ancora = true
    if (!inCorso) programma(DOPO_EVENTO_MS)
  }

  /** «Aggiorna» dal pannello: rilegge tutto adesso, e risponde col quadro nuovo. */
  async function tutto(): Promise<Quadro> {
    // Due richieste insieme fanno un giro solo; un giro parziale in corso si lascia finire, poi parte quello intero.
    while (inCorso) {
      if (inCorsoTutto) return inCorso
      await inCorso.catch(() => {})
    }
    daFare.cli = daFare.tutto = true
    return aggiorna()
  }

  async function apri(b: Bersaglio): Promise<{ aperto: boolean; come?: 'terminale' | 'scheda'; motivo?: string }> {
    const terminale = typeof b?.terminale === 'string' && /^[\w:.-]{1,120}$/.test(b.terminale) ? b.terminale : null
    const percorso = typeof b?.percorso === 'string' && b.percorso.length < 1024 ? espandi(b.percorso, dip.casa) : null
    if (terminale) {
      try {
        if ((await orca.host.call('terminal.focus', { terminalId: terminale })).focused) return { aperto: true, come: 'terminale' }
      } catch {
        // Il terminale non c'è più o Orca non lo riconosce: si ripiega sulla scheda.
      }
    }
    if (percorso) {
      if (!schedeApi.length) {
        try {
          schedeApi = ((await orca.host.call('workspace.list')).workspaces as any[]).map(daApi)
        } catch {
          schedeApi = []
        }
      }
      // La scheda che contiene quella cartella: prima la stessa, poi la più vicina che la contiene.
      // La scheda sulla cartella di casa conterrebbe tutto: vale solo se è proprio quella.
      const adatte = schedeApi.filter((s) => percorso === s.path || (s.path.replace(/\/$/, '') !== dip.casa && percorso.startsWith(s.path.replace(/\/$/, '') + '/')))
      // Con un server abbinato lo stesso percorso può esserci qui e là: vale la scheda del posto giusto.
      // Il posto lo dice la CLI: il terminale è di una scheda sola; un percorso, se sta in un posto solo.
      const lette = cli.parte?.schede ?? []
      const diTerminale = terminale ? lette.find((s) => s.agenti.some((g) => g.terminale === terminale)) : undefined
      const posti = [...new Set((diTerminale ? [diTerminale] : lette.filter((s) => espandi(s.percorso, dip.casa) === percorso)).map((s) => s.server ?? ''))]
      const host = posti.length !== 1 ? undefined : posti[0] ? cli.parte?.server?.find((s) => s.nome === posti[0])?.host : 'local'
      const delPosto = host ? adatte.filter((s) => (s.host ?? 'local') === host) : []
      const scheda = (delPosto.length ? delPosto : adatte).sort((x, y) => y.path.length - x.path.length)[0]
      if (scheda) {
        try {
          await orca.host.call('workspace.open', { workspaceId: scheda.id })
          return { aperto: true, come: 'scheda' }
        } catch (e) {
          return { aperto: false, motivo: messaggio(e) }
        }
      }
    }
    return { aperto: false, motivo: 'Cannot find this tab in Orca.' }
  }

  orca.panels.handle('regia.quadro', async () => quadro ?? (await aggiorna()))
  orca.panels.handle('regia.aggiorna', () => tutto())
  orca.panels.handle('regia.apri', (bersaglio) => apri(bersaglio))
  // L'immagine caricata di un bot. Il pannello dà solo l'id di un bot del quadro: si cerca tra le
  // foto già lette dalle case dei bot, e da qui non parte nessuna lettura di file.
  orca.panels.handle('regia.foto', async (chiesta) => {
    const id = typeof chiesta?.bot === 'string' ? chiesta.bot : ''
    const bot = id ? quadro?.bot.find((b) => b.id === id) : undefined
    const sua = bot ? fotoDi(foto, bot)?.sua : null
    return sua ? { impronta: sua.impronta, url: sua.url } : null
  })

  // Il comando della palette e il clic sulla voce di stato: fanno comparire la barra destra, dove
  // sta il pannello. Un plugin non può aprire direttamente il proprio pannello.
  orca.commands.register(COMANDO, async () => {
    try {
      await orca.host.call('commands.run', { action: 'sidebar.right.toggle' })
      return `${NOME} is in the right sidebar.`
    } catch (e) {
      return 'Cannot open the sidebar: ' + messaggio(e)
    }
  })

  for (const evento of ['agent.status.changed', 'workspace.changed', 'workspace.created', 'workspace.removed'] as const) {
    orca.events.on(evento, () => chiedi(true))
  }
  orca.settings.onDidChange?.(() => chiedi(true))

  ferma = () => {
    viva = false
    timer?.annulla()
    for (const occhio of occhi.values()) occhio.chiudi()
    occhi.clear()
    cambi.clear()
  }
  // Il primo giro parte poco dopo l'avvio, non dentro activate.
  programma(PRIMO_GIRO_MS)
}

export default function activate(orca: OrcaWorkerApi): void {
  avvia(orca)
}

export function deactivate(): void {
  ferma?.()
  ferma = null
}
