// Il worker del plugin. Tiene il quadro aggiornato in tempo reale: giri di lettura che non si
// sovrappongono, fatti partire dal tempo, dagli eventi di Orca e dai file che cambiano; a ogni giro
// avvisa il pannello, aggiorna la voce nella barra di stato e avvisa quando qualcosa di nuovo aspetta una risposta.
//
// In lettura, con tre eccezioni volute: portare Orca su una scheda o un terminale (workspace:write),
// mostrare un avviso (notifications:show) e, solo se nel menu «Send choices to» della Queue c'è un bot,
// mandargli con la CLI di Orca la scelta premuta su un'opzione della coda (`regia.scelta`). Non scrive ad
// agenti o terminali e non risponde agli item.
import type { OrcaWorkerApi } from 'orca/worker'
import { CASE_BOT, comandiARotazione, dipendenzeVere, eseguibileBuono, espandi, FILE_DI_CASA, ID_BOT, leggiCliAGiri, leggiFoto, leggiItem, leggiMotore, leggiRegistro, leggiSandbox, mandaScelta, memoriaCli, SANDBOX, type Dipendenze } from './fonti'
import { attesaNuove, botScelteDa, chiaveScelta, componi, corto, destinoScelte, fotoDi, messaggioScelta, normaCli, normaDomanda, normaMotore, normaSandbox, proveFinite, quesitiDi, richiestaScelta, scelteVive, testoAvviso, voceBarra, type FotoBot, type ParteCli } from './norma'
import { impostazioniDa, NOME, type Impostazioni } from './opzioni'
import type { Bersaglio, BotScelte, EsitoScelta, Prova, Quadro, SceltaInviata } from './protocol'

/** L'id della voce nella barra di stato e quello del comando, come nel manifest. */
const VOCE = 'status'
const COMANDO = 'show'
/** Le impostazioni del manifest, per chiave. */
const CHIAVI = ['queueBot', 'titleFormat', 'laneOrder', 'animations', 'refreshSeconds', 'notifications', 'expectedBots', 'stateFile', 'orcaCli'] as const
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

/** Dove restano le scelte già mandate, nello storage del plugin: un pannello riaperto o un worker ripartito non le rimanda. */
const CHIAVE_INVIATE = 'scelte.inviate'
/**
 * Il bot scelto nel menu «Send choices to» della Queue, nello storage del plugin (`storage:own`): non è
 * un'impostazione del manifest, così la 0.8.5 non aggiunge contributi e l'aggiornamento non chiede di
 * nuovo l'approvazione. Lo scrive solo il worker, su richiesta del pannello (`regia.botScelte`).
 */
const CHIAVE_BOT = 'scelte.bot'

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
  let schedeApi: { id: string; path: string }[] = []
  let workspaces: any[] | null = null
  // Le foto profilo dei bot: restano le ultime lette se una lettura fallisce.
  let foto: FotoBot[] = []
  // La sandbox degli audit: le prove vive e quelle appena finite. Null: su questa macchina non c'è.
  let sandbox: { prove: Prova[] } | null = null
  let barra = ''
  let chiaviAttese: string | null = null
  // Le scelte già mandate (per chiaveScelta) e quelle che stanno partendo adesso: la stessa scelta
  // non parte due volte, nemmeno con due clic di fila o due pannelli aperti.
  let inviate: Record<string, SceltaInviata> | null = null
  // Il bot scelto nel menu «Send choices to»: undefined finché non si è letto lo storage, null se non c'è.
  let botScelte: BotScelte | null | undefined
  const inVolo = new Map<string, Promise<EsitoScelta>>()
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
    // I file di stato della sandbox cambiano ogni secondo mentre una prova gira: si rileggono solo i file,
    // senza la CLI. La cartella si guarda solo dove la sandbox c'è.
    if (sandbox) voluti.set(`${espandi(SANDBOX, dip.casa)}/attive`, (nome) => (nome === null || nome.endsWith('.json')) && chiedi(false))
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
        const quanti = Math.ceil((comandiARotazione(memoria.grezza?.bots.length ?? 0) * GIRO_CLI_MS) / (imp.secondi * 1000))
        // La coda si legge a ogni giro: gli item del bot scelto, o di tutti quando non ne è scelto nessuno.
        const orchestratore = quadro?.coda.presente && !quadro.coda.diTutti ? quadro.bot.find((b) => b.nome === quadro?.coda.bot)?.id : undefined
        const grezza = await leggiCliAGiri(dip, imp.orca, memoria, { tutto, quanti, prioritario: orchestratore, tuttiGliItem: !imp.codaBot })
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

    // La sandbox: i file di stato delle prove in corso, in sola lettura. Una prova che c'era e non c'è più
    // è finita: resta un quarto d'ora, per poterne aprire il registro.
    try {
      const letti = await leggiSandbox(dip)
      if (letti) {
        const vive = normaSandbox(letti, dip.vivo, dip.casa)
        sandbox = { prove: [...vive, ...proveFinite(sandbox?.prove ?? [], vive, adesso)] }
      } else sandbox = null
    } catch {
      // Una lettura andata storta non fa «finire» le prove: resta quello che si sapeva.
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
        schedeApi = workspaces.map((w) => ({ id: String(w.id), path: String(w.path) }))
      } catch {
        workspaces = null
      }
    }

    const nuovo = componi({ adesso, cli, motore, motoreSpento: !percorsoStato, api: { workspaces }, botInArrivo: imp.botAttesi, foto, casa: dip.casa, opzioni: imp, fermo: !imp.animazioni, sandbox })
    nuovo.invioScelte = destinoScelte(nuovo.bot, await caricaBotScelte())
    nuovo.scelte = await scelteDel(nuovo, conCli && !cli.errore)
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

  async function caricaBotScelte(): Promise<BotScelte | null> {
    if (botScelte !== undefined) return botScelte
    try {
      botScelte = botScelteDa(await orca.storage.get(CHIAVE_BOT))
    } catch {
      botScelte = null
    }
    return botScelte
  }

  /**
   * Il menu «Send choices to» del pannello: `bot` è l'id di uno dei bot di Orca, o vuoto per nessuno. Si
   * salva nello storage del plugin e vale da subito; non manda niente. Un id che non è di un bot si rifiuta.
   */
  async function sceglieBot(chiesta: unknown): Promise<{ invioScelte: Quadro['invioScelte'] } | { errore: string }> {
    const id = chiesta && typeof chiesta === 'object' && typeof (chiesta as any).bot === 'string' ? String((chiesta as any).bot).toLowerCase() : null
    if (id === null) return { errore: 'The panel sent an invalid choice of bot: nothing changed.' }
    const q = quadro ?? (await aggiorna())
    const b = id ? q.bot.find((x) => x.id.toLowerCase() === id && !x.soloMotore && ID_BOT.test(x.id)) : null
    if (id && !b) return { errore: 'That is not one of Orca\'s bots: nothing changed.' }
    const nuovo: BotScelte | null = b ? { id: b.id.toLowerCase(), nome: corto(b.nome, 80) } : null
    try {
      await orca.storage.set(CHIAVE_BOT, nuovo)
    } catch (e) {
      return { errore: 'Cannot save the choice of bot: ' + messaggio(e) }
    }
    botScelte = nuovo
    q.invioScelte = destinoScelte(q.bot, nuovo)
    orca.log(nuovo ? `choices now go to ${nuovo.nome}` : 'choices are no longer sent')
    orca.panels.post('regia.cambiato', { quando: q.quando })
    return { invioScelte: q.invioScelte }
  }

  async function caricaInviate(): Promise<Record<string, SceltaInviata>> {
    if (inviate) return inviate
    try {
      const salvate = await orca.storage.get(CHIAVE_INVIATE)
      inviate = salvate && typeof salvate === 'object' && !Array.isArray(salvate) ? { ...(salvate as Record<string, SceltaInviata>) } : {}
    } catch {
      inviate = {}
    }
    return inviate
  }

  /**
   * Le scelte inviate che valgono in questo quadro. Con la CLI appena letta si dimenticano quelle di voci
   * uscite dalla coda o di domande cambiate; senza, si tengono tutte (la coda potrebbe essere vecchia).
   */
  async function scelteDel(q: Quadro, coiDatiNuovi: boolean): Promise<Record<string, SceltaInviata>> {
    const tutte = await caricaInviate()
    const vive = scelteVive(tutte, q)
    if (coiDatiNuovi && q.coda.presente && Object.keys(vive).length !== Object.keys(tutte).length) {
      inviate = vive
      try {
        await orca.storage.set(CHIAVE_INVIATE, vive)
      } catch (e) {
        orca.log('scelte: ' + messaggio(e))
      }
    }
    return vive
  }

  /**
   * Un'opzione premuta nella coda: con un bot nel menu «Send choices to» la scelta va a quel bot, una
   * volta sola; senza, non parte niente (`spento`: il pannello copia la risposta e apre la chat). Dal
   * pannello arrivano solo uid, evento e due numeri; domanda e opzione si rileggono da Orca un attimo
   * prima di mandare, e se non sono più quelle non parte niente.
   */
  async function scegli(chiesta: unknown): Promise<EsitoScelta> {
    const r = richiestaScelta(chiesta)
    if (!r) return { stato: 'errore', motivo: 'The panel sent an invalid choice: nothing was sent.' }
    const scelto = await caricaBotScelte()
    if (!scelto) return { stato: 'spento' }
    const imp = await leggiImpostazioni()
    const q = quadro ?? (await aggiorna())
    const voce = q.coda.voci.find((v) => v.uid === r.item)
    const quesito = voce?.domanda?.evento === r.evento ? voce.domanda.domande[r.q] : undefined
    if (!voce || voce.stato !== 'needs_you' || !quesito?.opzioni[r.o]) return { stato: 'cambiata', motivo: 'This question is no longer open here: nothing was sent.' }
    const chiave = chiaveScelta(voce.uid, r.evento, r.q, quesito.multi ? r.o : undefined)
    const gia = (await caricaInviate())[chiave]
    if (gia) return { stato: 'inviata', o: gia.o, quando: gia.quando, gia: true }
    const volo = inVolo.get(chiave)
    if (volo) return volo
    const invio = invia(q, imp, scelto, voce, r.q, r.o, chiave).finally(() => inVolo.delete(chiave))
    inVolo.set(chiave, invio)
    return invio
  }

  async function invia(q: Quadro, imp: Impostazioni, scelto: BotScelte, voce: Quadro['coda']['voci'][number], qi: number, oi: number, chiave: string): Promise<EsitoScelta> {
    // Chi riceve: il bot del menu, per id. Chi ha l'item: il bot della voce.
    const destino = q.bot.find((b) => b.id.toLowerCase() === scelto.id && !b.soloMotore)
    if (!destino || !ID_BOT.test(destino.id)) return { stato: 'errore', motivo: `“${scelto.nome || 'The chosen bot'}” (Send choices to) is no longer one of Orca's bots: nothing was sent.` }
    const suo = q.bot.find((b) => b.nome === voce.bot)
    const eseguibile = eseguibileBuono(dip, imp.orca, memoria)
    let item: any
    try {
      item = await leggiItem(dip, eseguibile, voce.numero)
    } catch (e) {
      return { stato: 'errore', motivo: 'Cannot read the item from Orca: ' + messaggio(e) + '. Nothing was sent.' }
    }
    // La domanda dev'essere ancora quella che si è vista: stesso item dello stesso bot, che aspetta ancora
    // una risposta, stesso evento, e la stessa opzione allo stesso posto.
    const proprietario = String(item?.owner?.botId ?? suo?.id ?? '')
    const stessa =
      item &&
      (!suo || proprietario === suo.id) &&
      (item.uid === undefined || String(item.uid) === voce.uid || `${proprietario}:${item.uid}` === voce.uid) &&
      item.status === 'needs_you' &&
      String(item.question?.eventId ?? '') === voce.domanda?.evento &&
      normaDomanda(item.question, dip.casa)?.domande[qi]?.opzioni[oi]?.etichetta === voce.domanda?.domande[qi]?.opzioni[oi]?.etichetta
    const quando = dip.adesso()
    // L'item è del bot che riceve: il messaggio va nella chat dell'item. Di un altro bot: nella sua chat Home, col nome di chi ha l'item.
    const nellItem = proprietario === destino.id
    const m = stessa ? messaggioScelta({ numero: voce.numero, titolo: String(item.title ?? voce.titolo), quesiti: quesitiDi(item.question), q: qi, o: oi, quando, diAltro: nellItem ? undefined : voce.bot || undefined }) : null
    if (!m) {
      chiedi(true)
      return { stato: 'cambiata', motivo: 'In Orca this question has changed or is closed: nothing was sent.' }
    }
    const motivo = await mandaScelta(dip, eseguibile, { bot: destino.id, numero: voce.numero, nellItem, ...m })
    if (motivo) return { stato: 'errore', motivo }
    inviate = { ...(await caricaInviate()), [chiave]: { o: oi, quando } }
    try {
      await orca.storage.set(CHIAVE_INVIATE, inviate)
    } catch (e) {
      orca.log('scelte: ' + messaggio(e))
    }
    orca.log(`choice sent to ${destino.nome}: item ${voce.numero}, question ${qi + 1}, option ${oi + 1}`)
    if (quadro) quadro.scelte = { ...(quadro.scelte ?? {}), [chiave]: { o: oi, quando } }
    // Il bot aggiornerà l'item: la coda si rilegge presto, e la carta esce quando l'ha fatto.
    chiedi(true)
    return { stato: 'inviata', o: oi, quando }
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
          schedeApi = ((await orca.host.call('workspace.list')).workspaces as any[]).map((w) => ({ id: String(w.id), path: String(w.path) }))
        } catch {
          schedeApi = []
        }
      }
      // La scheda che contiene quella cartella: prima la stessa, poi la più vicina che la contiene.
      // La scheda sulla cartella di casa conterrebbe tutto: vale solo se è proprio quella.
      const scheda = schedeApi
        .filter((s) => percorso === s.path || (s.path.replace(/\/$/, '') !== dip.casa && percorso.startsWith(s.path.replace(/\/$/, '') + '/')))
        .sort((x, y) => y.path.length - x.path.length)[0]
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
  // Un'opzione premuta nella coda: la scelta va al bot dell'impostazione, se c'è. Solo da un clic nel pannello, mai da un giro.
  orca.panels.handle('regia.scelta', (chiesta) => scegli(chiesta))
  // Il menu «Send choices to» della Queue: quale bot riceve le scelte. Non manda niente.
  orca.panels.handle('regia.botScelte', (chiesta) => sceglieBot(chiesta))
  // L'immagine caricata di un bot. Il pannello dà solo l'id di un bot del quadro: si cerca tra le
  // foto già lette dalle case dei bot, e da qui non parte nessuna lettura di file.
  orca.panels.handle('regia.foto', async (chiesta) => {
    const id = typeof chiesta?.bot === 'string' ? chiesta.bot : ''
    const bot = id ? quadro?.bot.find((b) => b.id === id) : undefined
    const sua = bot ? fotoDi(foto, bot)?.sua : null
    return sua ? { impronta: sua.impronta, url: sua.url } : null
  })

  // Il registro di una prova della sandbox. Il pannello dà solo l'id di una prova del quadro: il nome del
  // file è quello letto dal suo file di stato, e si cerca soltanto nella cartella dei registri.
  orca.panels.handle('regia.registro', async (chiesta) => {
    const id = typeof chiesta?.prova === 'string' ? chiesta.prova : ''
    const prova = id ? sandbox?.prove.find((p) => p.id === id) : undefined
    if (!prova) return { stato: 'sconosciuta' as const, nome: '', testo: '' }
    const testo = prova.registro ? await leggiRegistro(dip, prova.registro) : null
    return testo === null ? { stato: 'manca' as const, nome: prova.registro, testo: '' } : { stato: 'pronto' as const, nome: prova.registro, testo }
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
