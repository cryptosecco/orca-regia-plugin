// La colla del pannello: chiede il quadro al worker, lo ridisegna quando cambia e inoltra i clic.
// Tutto l'HTML viene da viste.js. Il pannello non chiama mai la rete né la CLI: parla solo col worker.
import * as V from './viste.js'
import { T } from './testi.js'

const api = globalThis.orca
const $ = (id) => document.getElementById(id)
const VISTE = { panoramica: V.panoramica, coda: V.coda, flussi: V.flussi, ufficio: V.ufficio, incroci: V.incroci }

// Fermo: lo chiede il sistema («riduci movimento») oppure l'impostazione «Animations: off» del plugin, che
// arriva col quadro e mette la classe `fermo` sulla pagina (il CSS ferma tutto anche lì).
const diSistema = matchMedia('(prefers-reduced-motion: reduce)').matches
let fermo = diSistema
function animazioni(q) {
  fermo = diSistema || Boolean(q && q.fermo)
  document.documentElement.classList.toggle('fermo', fermo)
}

let quadro = null
let vista = 'panoramica'
// `aperte`: le voci della coda con la domanda aperta (per uid), così un ridisegno non le richiude.
// Della coda: `filtro` («oggi», «decidere», «corso»), `progetto` (una corsia sola; undefined: tutte) e
// `chiuse`, le corsie richiuse, che restano nello storage del plugin (storage:own) tra una volta e l'altra.
// Dell'Office: `lista` (l'elenco di schede al posto della mappa) e `scelto` (l'avatar con la scheda aperta).
// Della sandbox: `prova`, l'id della prova di cui è aperta la scheda (da qualsiasi vista).
// Della coda anche `esiti`: le scelte premute in questo pannello (copiate, in invio, non riuscite, cambiate), per
// V.chiaveScelta; quelle già inviate le sa il worker (`quadro.scelte`). Spariscono quando la domanda cambia
// o la voce esce dalla coda.
const scelte = { lista: false, scelto: '', tipo: '', tutti: false, stato: '', fornitore: '', aperte: [], filtro: '', progetto: undefined, chiuse: [], prova: '', esiti: {} }
const CHIAVE_CHIUSE = 'coda.corsieChiuse'
// L'elenco aperto sotto il tabellone: `fisso` l'ha aperto un clic (o un tocco), `sopra` il passaggio del mouse.
const tab = { fisso: '', sopra: '' }
const chiudiTab = () => { tab.fisso = ''; tab.sopra = '' }
// Gli agenti avviati dai bot che sono appena nati, che hanno appena finito o che non ci sono più: per un
// attimo il diagramma li disegna con la loro animazione (viste.js: nasce, spegne, esce).
// `passati`: chi è appena entrato nella stanza Sandbox dell'Office, o ne è appena uscito.
const mosse = { nati: new Map(), spenti: new Map(), usciti: [], entrati: new Map(), partiti: [], passati: new Map() }
const DURA_MOSSA = 1400
let timerMosse = 0
const ultimo = { vista: '', fonti: '', schede: '', piede: '', tabellone: '', prova: '' }
// I numeri del tabellone all'ultimo disegno: quando uno cambia, per un attimo si accende.
const contiPrima = new Map()
let timerAvviso = 0

function metti(el, html, chiave) {
  // Ridisegna solo se cambia: uno scorrimento o un fuoco non saltano a ogni giro.
  if (ultimo[chiave] === html) return
  ultimo[chiave] = html
  // Un ridisegno non deve far perdere il punto: restano lo scorrimento dei riquadri che si scorrono
  // e il fuoco della tastiera, ritrovati per chiave.
  const scorsi = [...el.querySelectorAll('[data-scorre]')].map((r) => [r.dataset.scorre, r.scrollTop])
  const fuoco = el.contains(document.activeElement) ? document.activeElement.dataset.k : ''
  el.innerHTML = html
  for (const [nome, alto] of scorsi) for (const r of el.querySelectorAll('[data-scorre]')) if (r.dataset.scorre === nome) r.scrollTop = alto
  if (fuoco) [...el.querySelectorAll('[data-k]')].find((x) => x.dataset.k === fuoco && x.getClientRects().length)?.focus({ preventScroll: true })
  if (chiave === 'vista') nascondiFumetto()
  // Una foto profilo che non si è caricata non viene ritentata a ogni giro: resta l'icona disegnata.
  for (const f of el.querySelectorAll('[data-foto]')) if (rotte.has(sorgente(f))) f.classList.add('rotta')
  vesti(el)
}

// Foto profilo: se il file di una mascotte non si carica, al suo posto resta l'icona disegnata.
const rotte = new Set()
const sorgente = (f) => { const i = f.querySelector('img, image'); return i ? i.getAttribute('src') || i.getAttribute('href') : '' }
document.addEventListener('error', (evento) => {
  const f = evento.target instanceof Element ? evento.target.closest('[data-foto]') : null
  if (!f) return
  rotte.add(sorgente(f))
  f.classList.add('rotta')
}, true)

// ---------- le immagini caricate dei bot (avatar.png nella casa del bot) ----------
// Nel quadro c'è solo l'impronta del file: l'immagine arriva dal worker con regia.foto, una volta per
// impronta, e resta qui. viste.js lascia il posto vuoto (data-sua: l'id del bot; data-impronta) e `vesti` lo riempie.
const sue = new Map()
const chieste = new Map()
const guaste = new Set()
const IMMAGINE = /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/
function vesti(el) {
  for (const f of el.querySelectorAll('[data-sua]')) {
    const { sua: id, impronta } = f.dataset
    const s = sue.get(id)
    if (s?.impronta !== impronta) {
      void chiedi(id, impronta)
      continue
    }
    const i = f.querySelector('img, image')
    i.setAttribute(i.localName === 'image' ? 'href' : 'src', s.url)
    f.classList.remove('rotta')
  }
}
async function chiedi(id, impronta) {
  if (chieste.get(id) === impronta) return
  chieste.set(id, impronta)
  try {
    const r = await api.plugin.request('regia.foto', { bot: id })
    if (!r || typeof r.url !== 'string' || !IMMAGINE.test(r.url)) return
    sue.set(id, { impronta: String(r.impronta), url: r.url })
    vesti(document)
  } catch {
    // Il worker non risponde: resta l'icona, e si riprova al prossimo ridisegno.
    chieste.delete(id)
  }
}
// Un'immagine caricata che il browser non riesce a mostrare: quel bot resta con l'icona disegnata.
const senzaGuaste = (q) => (guaste.size ? { ...q, bot: q.bot.map((b) => (b.fotoSua && guaste.has(b.id + '\n' + b.fotoSua.impronta) ? { ...b, fotoSua: null } : b)) } : q)
document.addEventListener('error', (evento) => {
  // Il simbolo di un fornitore che non si carica non c'entra con la foto del bot che gli sta sopra.
  const f = evento.target instanceof Element && !evento.target.closest('.marchio') ? evento.target.closest('[data-sua]') : null
  if (!f) return
  guaste.add(f.dataset.sua + '\n' + f.dataset.impronta)
  disegna()
}, true)

function disegna() {
  if (!quadro) return
  const ora = Date.now()
  metti($('fonti'), V.fonti(quadro, ora), 'fonti')
  metti(
    $('schede'),
    V.schede(quadro)
      .map(([id, nome, n, tono]) => `<button role="tab" type="button" data-vista="${id}" class="${tono ? 'amb' : ''}" aria-selected="${id === vista}">${nome}<span class="conta">${n}</span></button>`)
      .join('<span class="p" aria-hidden="true">·</span>'),
    'schede'
  )
  metti($('scr'), V.piede(quadro), 'piede')
  metti($('tabellone'), V.tabellone(senzaGuaste(quadro), { vista, stato: scelte.stato, fornitore: scelte.fornitore, aperto: tab.sopra || tab.fisso, prova: scelte.prova }), 'tabellone')
  for (const el of $('tabellone').querySelectorAll('[data-conta]')) {
    const prima = contiPrima.get(el.dataset.conta)
    contiPrima.set(el.dataset.conta, el.textContent)
    // Il numero è cambiato: una piccola animazione (il CSS la spegne con «riduci movimento»).
    if (prima !== undefined && prima !== el.textContent && !fermo) el.classList.add(Number(el.textContent) > Number(prima) ? 'sale' : 'scende')
  }
  metti($('vista'), VISTE[vista](senzaGuaste(quadro), ora, { ...scelte, nati: [...mosse.nati.keys()], spenti: [...mosse.spenti.keys()], usciti: mosse.usciti, entrati: [...mosse.entrati.keys()], partiti: mosse.partiti, passati: [...mosse.passati.keys()] }), 'vista')
  // La scheda della prova scelta sta sotto ogni vista: dal vivo finché gira, col registro quando è finita.
  const prova = scelte.prova ? (quadro.sandbox?.prove ?? []).find((p) => p.id === scelte.prova) : null
  if (prova) copiaProva = prova
  if ($('prova')) metti($('prova'), scelte.prova ? V.schedaProva(quadro, ora, { prova: scelte.prova, registro: registri.get(scelte.prova), copia: copiaProva }) : '', 'prova')
  if (scelte.prova && (!prova || prova.stato === 'finita')) void chiediRegistro(scelte.prova)
}

// ---------- la sandbox: il registro di una prova, e il lampo a ogni tentativo bloccato ----------
// Il registro la sandbox lo scrive solo a prova finita: lo si chiede al worker allora, per id della prova.
// Se non c'è ancora si riprova qualche volta (la prova può essere finita un attimo prima del file).
const registri = new Map()
const tentativi = new Map()
const chiestoIl = new Map()
let copiaProva = null
async function chiediRegistro(id) {
  const fatti = tentativi.get(id) ?? 0
  if (registri.get(id)?.stato === 'pronto' || registri.get(id)?.attesa || fatti >= 4 || Date.now() - (chiestoIl.get(id) ?? 0) < 1500) return
  chiestoIl.set(id, Date.now())
  tentativi.set(id, fatti + 1)
  registri.set(id, { ...registri.get(id), attesa: true })
  let r
  try {
    r = await api.plugin.request('regia.registro', { prova: id })
  } catch {
    r = null
  }
  registri.set(id, r && r.stato === 'pronto' && typeof r.testo === 'string' ? { stato: 'pronto', nome: String(r.nome ?? ''), testo: r.testo } : fatti + 1 >= 4 || r?.stato === 'sconosciuta' ? { stato: 'manca' } : {})
  if (r?.stato === 'sconosciuta') tentativi.set(id, 4)
  if (scelte.prova !== id) return
  disegna()
  // La scheda cresce col registro: resta in vista.
  if (registri.get(id).stato === 'pronto') $('scheda-prova')?.scrollIntoView({ block: 'nearest', behavior: fermo ? 'auto' : 'smooth' })
}
/** Quanti tentativi bloccati aveva ogni prova all'ultimo quadro. */
const bloccatiPrima = new Map()
const DURA_LAMPO = 950
let timerLampo = 0
/**
 * Un tentativo bloccato in più (rete, file, limiti): un lampo rosso sulla stanza, sul lucchetto e sul
 * conteggio di quella prova. Con «riduci movimento» niente lampo: cambia solo il numero.
 */
function lampeggia(q) {
  const scattate = new Set()
  for (const p of q.sandbox?.prove ?? []) {
    const prima = bloccatiPrima.get(p.id)
    bloccatiPrima.set(p.id, p.bloccati)
    if (prima !== undefined && p.bloccati > prima && p.stato !== 'finita') scattate.add(p.id)
  }
  for (const id of bloccatiPrima.keys()) if (!(q.sandbox?.prove ?? []).some((p) => p.id === id)) bloccatiPrima.delete(id)
  if (fermo || !scattate.size) return
  for (const el of document.querySelectorAll('[data-blocchi]')) {
    if (el.dataset.blocchi !== '*' && !scattate.has(el.dataset.blocchi)) continue
    el.classList.remove('lampo-r')
    void el.getBoundingClientRect()
    el.classList.add('lampo-r')
  }
  clearTimeout(timerLampo)
  timerLampo = setTimeout(() => { for (const el of document.querySelectorAll('.lampo-r')) el.classList.remove('lampo-r') }, DURA_LAMPO)
}
/** Gli agenti che in un quadro stanno nella stanza Sandbox, per chiave (anche gli ospiti). */
const nellaSandbox = (q) => {
  if (!q?.sandbox) return new Set()
  const s = V.inSandbox(q)
  return new Set([...s.perAgente.keys(), ...s.deiBot.map((x) => 'bot:' + x.bot.id), ...s.sciolte.map((p) => 'prova:' + p.id)])
}

function avviso(testo) {
  const el = $('avviso')
  el.textContent = testo
  el.hidden = !testo
  clearTimeout(timerAvviso)
  if (testo) timerAvviso = setTimeout(() => avviso(''), 6000)
}

/** Chi sono i figli dei bot in un quadro, per chiave. */
const figliIn = (q) => new Map((q?.bot ?? []).flatMap((b) => (b.figli ?? []).map((f) => [f.chiave, { ...f, bot: b.nome }])))
/** Gli agenti dell'Office in un quadro, per chiave, ognuno con la sua stanza. */
const agentiIn = (q) => new Map((q?.progetti ?? []).flatMap((p) => p.agenti.map((a) => [V.chiaveAgente(a, p.nome), { ...a, chiave: V.chiaveAgente(a, p.nome), progetto: p.nome }])))
/**
 * Tra un quadro e il successivo: chi è nato, chi ha appena finito, chi è sparito. Con «riduci movimento»
 * non si anima niente: i nodini compaiono e spariscono e basta. Al primo quadro nessuno «nasce».
 */
function muovi(prima, dopo) {
  if (fermo || !prima) return
  const c = Date.now() + DURA_MOSSA, vecchi = figliIn(prima), nuovi = figliIn(dopo)
  for (const [k, f] of nuovi) {
    const era = vecchi.get(k)
    if (!era) mosse.nati.set(k, c)
    else if (era.stato !== f.stato && (f.stato === 'finito' || f.stato === 'fermo')) mosse.spenti.set(k, c)
  }
  for (const [k, f] of vecchi) if (!nuovi.has(k)) mosse.usciti.push({ ...f, fino: c })
  mosse.usciti = mosse.usciti.filter((u) => !nuovi.has(u.chiave)).slice(-24)
  // Lo stesso per gli agenti nelle stanze dell'Office: chi arriva entra, chi non c'è più esce.
  const erano = agentiIn(prima), sono = agentiIn(dopo)
  for (const k of sono.keys()) if (!erano.has(k)) mosse.entrati.set(k, c)
  for (const [k, a] of erano) if (!sono.has(k)) mosse.partiti.push({ ...a, fino: c })
  mosse.partiti = mosse.partiti.filter((u) => !sono.has(u.chiave)).slice(-24)
  // Chi entra nella stanza Sandbox o ne esce compare lì (o di nuovo nella sua stanza) con un'animazione sua.
  const fuori = nellaSandbox(prima), dentro = nellaSandbox(dopo)
  for (const k of dentro) if (!fuori.has(k)) mosse.passati.set(k, c)
  for (const k of fuori) if (!dentro.has(k)) mosse.passati.set(k, c)
  if (!mosse.nati.size && !mosse.spenti.size && !mosse.usciti.length && !mosse.entrati.size && !mosse.partiti.length && !mosse.passati.size) return
  clearTimeout(timerMosse)
  timerMosse = setTimeout(posa, DURA_MOSSA + 50)
}
/** Finita l'animazione, nodini e avatar tornano fermi e quelli spariti se ne vanno. */
function posa() {
  const ora = Date.now()
  for (const m of [mosse.nati, mosse.spenti, mosse.entrati, mosse.passati]) for (const [k, fino] of m) if (fino <= ora) m.delete(k)
  mosse.usciti = mosse.usciti.filter((u) => u.fino > ora)
  mosse.partiti = mosse.partiti.filter((u) => u.fino > ora)
  disegna()
  if (mosse.nati.size || mosse.spenti.size || mosse.usciti.length || mosse.entrati.size || mosse.partiti.length || mosse.passati.size) timerMosse = setTimeout(posa, 300)
}

async function carica(nome = 'regia.quadro') {
  try {
    const prima = quadro
    quadro = await api.plugin.request(nome)
    animazioni(quadro)
    muovi(prima, quadro)
    scelte.esiti = esitiVivi(scelte.esiti, quadro)
    disegna()
    lampeggia(quadro)
  } catch (errore) {
    // Resta scritto nei log del plugin (`orca plugin logs`): un errore qui non deve passare in silenzio.
    console.error('[panel]', errore)
    if (!quadro) $('vista').innerHTML = `<p class="niente">${T.pannello.workerDown(V.e(errore?.code || errore?.message || T.pannello.errorWord))}</p>`
    else avviso(T.pannello.workerDownStale)
  }
}


// ---------- andare a una scheda: si scorre fin lì e la si evidenzia un attimo ----------
const spegni = new WeakMap()
function lampo(el) {
  clearTimeout(spegni.get(el))
  el.classList.remove('lampo')
  void el.offsetWidth
  el.classList.add('lampo')
  spegni.set(el, setTimeout(() => el.classList.remove('lampo'), 1800))
}

/** `dove` è «coda» (la vista Queue, da capo e senza filtri) oppure «bot:Nome» (la sua scheda nella Panoramica). */
function vai(dove) {
  if (dove === 'coda') {
    vista = 'coda'
    scelte.filtro = ''
    scelte.progetto = undefined
    disegna()
    scrollTo({ top: 0, behavior: fermo ? 'auto' : 'smooth' })
    const cima = $('decidi')
    if (!cima) return true
    lampo(cima)
    cima.focus({ preventScroll: true })
    return true
  }
  if (vista !== 'panoramica') {
    vista = 'panoramica'
    disegna()
  }
  const nome = dove.startsWith('bot:') ? dove.slice(4) : ''
  const scheda = [...document.querySelectorAll('[data-bot]')].find((x) => x.dataset.bot === nome)
  if (!scheda) return false
  // Sotto la testata che resta ferma in alto.
  const testa = document.querySelector('.testa')
  const sopra = (getComputedStyle(testa).position === 'sticky' ? testa.offsetHeight : 0) + 12
  scrollTo({ top: Math.max(0, scheda.getBoundingClientRect().top + scrollY - sopra), behavior: fermo ? 'auto' : 'smooth' })
  lampo(scheda)
  scheda.focus({ preventScroll: true })
  return true
}

async function apriInOrca(d) {
  let esito
  try {
    esito = await api.plugin.request('regia.apri', JSON.parse(d.apri))
  } catch {
    esito = { aperto: false }
  }
  if (esito.aperto) return
  // Orca non lo trova: se l'elemento ha un ripiego (la scheda del bot qui nel pannello) si va lì.
  if (d.ripiego && vai(d.ripiego)) avviso(T.pannello.openChatFallback)
  else avviso(esito.motivo || T.pannello.cannotOpen)
}

/**
 * Gli esiti di questo pannello che valgono ancora: la voce aspetta ancora una risposta, la sua domanda è la
 * stessa (stesso evento), e il worker non la sa già inviata (allora vale la sua, in `q.scelte`). Uno «in
 * invio» resta finché la richiesta non torna.
 */
function esitiVivi(esiti, q) {
  const vive = (q?.coda?.voci ?? []).filter((v) => v.stato === 'needs_you' && v.domanda?.evento).map((v) => `${v.uid}:${v.domanda.evento}:`)
  return Object.fromEntries(Object.entries(esiti).filter(([k, es]) => vive.some((t) => k.startsWith(t)) && (es.stato === 'invio' || !q?.scelte?.[k])))
}

/** Quanto aspetta il pannello il worker: rilegge l'item e manda il messaggio, due comandi della CLI. */
const ATTESA_SCELTA_MS = 45_000

/**
 * Niente parte: si segna la scelta, si prova a copiare la risposta pronta (V.testoRisposta) e si apre la
 * chat del bot che ha l'item, dove la si incolla o la si scrive.
 */
async function copiaEApri(d, voce, q, o, chiave) {
  // Prima si segna la scelta, così si vede subito; la copia può non riuscire, o non rispondere mai (un
  // pannello senza gli appunti): le si dà al massimo un attimo.
  scelte.esiti = { ...scelte.esiti, [chiave]: { o, stato: 'aperta', copiata: false } }
  disegna()
  let copiata = false
  try {
    await Promise.race([navigator.clipboard.writeText(V.testoRisposta(voce, q, o)), new Promise((_, no) => setTimeout(() => no(new Error('clipboard timeout')), 800))])
    copiata = true
  } catch {
    // Il pannello può non avere gli appunti: la scelta resta scritta sotto la domanda.
  }
  if (copiata) {
    scelte.esiti = { ...scelte.esiti, [chiave]: { o, stato: 'aperta', copiata } }
    disegna()
  }
  if (d.apri) await apriInOrca(d)
  else if (d.vai) vai(d.vai)
}

/**
 * Un'opzione di una domanda della coda. Con un bot nel menu «Send choices to» la scelta va a lui: il pannello
 * manda al worker solo la voce, l'evento della domanda e due numeri, e il worker rilegge l'item da Orca e
 * manda il messaggio. Mentre parte, e dopo, i tasti di quella domanda sono spenti; se non parte si dice
 * perché e si può riprovare. Senza un bot non parte niente: copia e apre la chat.
 */
async function scegli(d) {
  const voce = (quadro?.coda?.voci ?? []).find((v) => v.uid === d.scelta)
  const q = Number(d.q), o = Number(d.o)
  const quesito = voce && voce.domanda?.evento === d.evento ? voce.domanda.domande?.[q] : undefined
  if (!quesito || !quesito.opzioni?.[o]) {
    // La domanda è cambiata tra il disegno e il clic: si ridisegna e non parte niente.
    avviso(T.pannello.questionChanged)
    disegna()
    return
  }
  const chiave = V.chiaveScelta(voce.uid, voce.domanda.evento, q, quesito.multi ? o : undefined)
  if (!V.botScelte(quadro)) return copiaEApri(d, voce, q, o, chiave)
  const prima = V.esitiDi(quadro, scelte.esiti)[chiave]
  // Un secondo clic (o un doppio clic) mentre parte, o dopo che è partita, non fa niente.
  if (prima && (prima.stato === 'invio' || prima.stato === 'inviata')) return
  scelte.esiti = { ...scelte.esiti, [chiave]: { o, stato: 'invio' } }
  disegna()
  let esito
  try {
    esito = await api.plugin.request('regia.scelta', { item: voce.uid, evento: voce.domanda.evento, q, o }, { timeoutMs: ATTESA_SCELTA_MS })
  } catch (errore) {
    esito = { stato: 'errore', motivo: errore?.code === 'timeout' ? T.pannello.workerSlow : T.pannello.workerNoAnswer(errore?.code || errore?.message || T.pannello.errorWord) }
  }
  // L'impostazione è stata svuotata intanto: niente è partito, si fa come senza.
  if (esito?.stato === 'spento') {
    const { [chiave]: _, ...resto } = scelte.esiti
    scelte.esiti = resto
    return copiaEApri(d, voce, q, o, chiave)
  }
  const stato = ['inviata', 'cambiata', 'errore'].includes(esito?.stato) ? esito.stato : 'errore'
  scelte.esiti = { ...scelte.esiti, [chiave]: { o: stato === 'inviata' && Number.isInteger(esito.o) ? esito.o : o, stato, quando: esito?.quando, motivo: typeof esito?.motivo === 'string' ? esito.motivo : undefined } }
  disegna()
  // Una domanda cambiata: si rilegge subito la coda, così la carta mostra quella nuova.
  if (stato === 'cambiata') void carica('regia.aggiorna')
}

document.addEventListener('click', async (evento) => {
  // Il lucchetto, la stanza Sandbox, «N in sandbox» e «N blocked» aprono la scheda di quella prova; un altro
  // clic sullo stesso, o la ✕, la chiude. Viene prima di tutto: un lucchetto può stare dentro un altro tasto.
  const sbx = evento.target instanceof Element ? evento.target.closest('[data-prova]') : null
  if (sbx) {
    nascondiFumetto()
    chiudiTab()
    const id = sbx.dataset.prova
    scelte.prova = scelte.prova === id ? '' : id
    if (scelte.prova) {
      scelte.scelto = ''
      tentativi.delete(scelte.prova)
      chiestoIl.delete(scelte.prova)
    }
    disegna()
    if (scelte.prova) $('scheda-prova')?.scrollIntoView({ block: 'nearest', behavior: fermo ? 'auto' : 'smooth' })
    return
  }
  const el = evento.target instanceof Element ? evento.target.closest('button, [data-apri], [data-vai], [data-vista], [data-scegli]') : null
  // Un clic fuori dal tabellone richiude il suo elenco; uno dentro (una riga, «show in Office») pure, dopo aver fatto il suo.
  const fuori = !(evento.target instanceof Element && evento.target.closest('#tabellone'))
  if ((tab.fisso || tab.sopra) && (fuori || (el && !('tab' in el.dataset)))) {
    chiudiTab()
    if (!el) disegna()
  }
  if (!el) return
  const d = el.dataset
  nascondiFumetto()
  if ('scelta' in d) {
    await scegli(d)
  } else if ('tab' in d) {
    // Un numero del tabellone: il clic (o il tocco) apre e fissa l'elenco dei suoi agenti, un altro lo chiude.
    tab.fisso = tab.fisso === d.tab ? '' : d.tab
    tab.sopra = ''
    disegna()
  } else if (el.id === 'aggiorna') {
    el.disabled = true
    await carica('regia.aggiorna')
    el.disabled = false
  } else if (d.vista) {
    vista = d.vista in VISTE ? d.vista : 'panoramica'
    // Dal diagramma si arriva all'Ufficio anche già filtrato su chi aspetta.
    if ('stato' in d) {
      scelte.stato = d.stato
      // Dal tabellone anche per fornitore; da ogni altro punto il filtro del fornitore si toglie.
      scelte.fornitore = d.fornitore || ''
    }
    disegna()
    scrollTo(0, 0)
  } else if (d.vai) {
    vai(d.vai)
  } else if ('scegli' in d) {
    // Un clic su un avatar apre la sua scheda sotto la mappa; un altro clic, o la ✕, la chiude.
    scelte.scelto = scelte.scelto === d.scegli ? '' : d.scegli
    if (scelte.scelto) scelte.prova = ''
    disegna()
    if (scelte.scelto) $('scheda-agente')?.scrollIntoView({ block: 'nearest', behavior: fermo ? 'auto' : 'smooth' })
  } else if ('ufficioLista' in d) {
    scelte.lista = Boolean(d.ufficioLista)
    disegna()
  } else if ('filtroCoda' in d) {
    // «all» toglie anche il progetto; gli altri filtri si sommano alla corsia scelta.
    scelte.filtro = d.filtroCoda
    if (!d.filtroCoda) scelte.progetto = undefined
    disegna()
  } else if ('corsia' in d) {
    scelte.chiuse = scelte.chiuse.includes(d.corsia) ? scelte.chiuse.filter((p) => p !== d.corsia) : [...scelte.chiuse, d.corsia]
    disegna()
    // Le corsie richiuse si ricordano. Se lo storage non risponde, valgono fino alla chiusura del pannello.
    void api.storage?.set(CHIAVE_CHIUSE, scelte.chiuse).catch(() => {})
  } else if (d.voce) {
    scelte.aperte = scelte.aperte.includes(d.voce) ? scelte.aperte.filter((u) => u !== d.voce) : [...scelte.aperte, d.voce]
    disegna()
  } else if ('filtroTipo' in d) {
    scelte.tipo = d.filtroTipo
    disegna()
  } else if ('tutti' in d) {
    scelte.tutti = Boolean(d.tutti)
    disegna()
  } else if ('filtroStato' in d) {
    scelte.stato = d.filtroStato
    disegna()
  } else if (d.apri) {
    disegna()
    await apriInOrca(d)
  }
})

// Col mouse basta passare sopra un numero del tabellone; l'elenco resta finché il mouse è sul tabellone.
document.addEventListener('pointerover', (evento) => {
  if (evento.pointerType === 'touch') return
  const el = evento.target instanceof Element ? evento.target.closest('[data-tab]') : null
  if (!el || el.disabled || tab.sopra === el.dataset.tab) return
  tab.sopra = el.dataset.tab
  disegna()
})
$('tabellone').addEventListener('mouseleave', () => {
  if (!tab.sopra) return
  tab.sopra = ''
  disegna()
})

// Il filtro per progetto è un menu: una corsia sola, oppure tutte.
// Il menu «Send choices to» della Queue: il bot che riceve le scelte, salvato dal worker nello storage del
// plugin. Cambiarlo non manda niente; se il worker lo rifiuta, il menu torna com'era e lo si dice.
document.addEventListener('change', async (evento) => {
  const el = evento.target instanceof HTMLSelectElement && 'botScelte' in evento.target.dataset ? evento.target : null
  if (!el || !quadro) return
  el.disabled = true
  let r
  try {
    r = await api.plugin.request('regia.botScelte', { bot: el.value })
  } catch (errore) {
    r = { errore: errore?.code || errore?.message || T.pannello.errorWord }
  }
  if (r && 'invioScelte' in r) quadro = { ...quadro, invioScelte: r.invioScelte }
  else avviso(T.coda.menuFailed(r?.errore || T.pannello.errorWord))
  // Il menu si ridisegna sempre: col bot nuovo, o con quello di prima se non è cambiato.
  ultimo.vista = ''
  disegna()
})

document.addEventListener('change', (evento) => {
  const el = evento.target instanceof HTMLSelectElement && 'filtroProgetto' in evento.target.dataset ? evento.target : null
  if (!el) return
  scelte.progetto = el.value === '·tutti' ? undefined : el.value
  disegna()
})

// Da tastiera: i nodi del diagramma non sono <button>, quindi Invio e Spazio li premono qui.
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    if (tab.fisso || tab.sopra) { chiudiTab(); disegna() }
    else if (scelte.prova) { scelte.prova = ''; disegna() }
    return nascondiFumetto()
  }
  if (evento.key !== 'Enter' && evento.key !== ' ') return
  const el = evento.target instanceof Element && evento.target.matches('[role="button"]:not(button)') ? evento.target : null
  if (!el) return
  evento.preventDefault()
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
})

// ---------- il riquadro al passaggio del mouse (e col fuoco da tastiera) ----------
// Il testo è in data-info, una riga per riga: la prima fa da titolo. Si scrive con textContent.
const fumetto = document.createElement('div')
fumetto.className = 'fumetto'
fumetto.setAttribute('role', 'tooltip')
fumetto.hidden = true
document.body.append(fumetto)
let sotto = null

function nascondiFumetto() {
  sotto = null
  fumetto.hidden = true
}
function mettiFumetto(x, y, sopraDi = y) {
  const l = fumetto.offsetWidth, a = fumetto.offsetHeight
  const giu = y + 16 + a <= innerHeight - 4
  fumetto.style.left = Math.max(4, Math.min(x + 12, innerWidth - l - 4)) + 'px'
  fumetto.style.top = Math.max(4, giu ? y + 16 : sopraDi - a - 10) + 'px'
}
function mostraFumetto(el) {
  if (sotto === el) return
  sotto = el
  fumetto.replaceChildren(...el.dataset.info.split('\n').map((riga, i) => {
    const r = document.createElement(i ? 'span' : 'b')
    r.textContent = riga
    if (riga.startsWith(T.click)) r.className = 'fa'
    return r
  }))
  fumetto.hidden = false
}
const conInfo = (bersaglio) => (bersaglio instanceof Element ? bersaglio.closest('[data-info]') : null)
document.addEventListener('pointermove', (evento) => {
  if (evento.pointerType === 'touch') return
  const el = conInfo(evento.target)
  if (!el) return void (sotto && !sotto.matches(':focus-visible') && nascondiFumetto())
  mostraFumetto(el)
  mettiFumetto(evento.clientX, evento.clientY)
})
document.addEventListener('pointerleave', nascondiFumetto)
document.addEventListener('focusin', (evento) => {
  const el = conInfo(evento.target)
  if (!el || !el.matches(':focus-visible')) return
  mostraFumetto(el)
  const r = el.getBoundingClientRect()
  mettiFumetto(r.left + r.width / 2 - fumetto.offsetWidth / 2 - 12, r.bottom - 8, r.top)
})
document.addEventListener('focusout', nascondiFumetto)
addEventListener('scroll', nascondiFumetto, { passive: true })

api.plugin.on('regia.cambiato', () => void carica())
// «da 4 min», «tra 15 h»: si aggiornano da soli, senza nuove letture.
setInterval(disegna, 30_000)

// Come nella prova 2: l'orologio in fondo, e il segno di chi lavora che gira (/ - \ |).
// Con prefers-reduced-motion il segno resta fermo.
// Il conto alla rovescia della cache scende ogni secondo; a zero la riga si ridisegna («fredda»).
// Con prefers-reduced-motion i numeri non scorrono: si aggiornano quando si ridisegna la vista.
const orologio = () => {
  $('orol').textContent = new Date().toTimeString().slice(0, 8)
  // «aggiornato 3 s fa»: l'età dei dati scorre ogni secondo, anche tra un quadro e l'altro.
  if (quadro) metti($('fonti'), V.fonti(quadro, Date.now()), 'fonti')
  if (fermo) return
  const ora = Date.now()
  let scaduta = false
  for (const el of document.querySelectorAll('[data-scade]')) {
    const resta = (Number(el.dataset.scade) - ora) / 1000
    if (resta <= 0) scaduta = true
    else el.textContent = V.conto(resta)
  }
  if (scaduta) disegna()
}
orologio()
setInterval(orologio, 1000)
const GIRO = ['/', '-', '\\', '|']
let tic = 0
{
  setInterval(() => {
    if (fermo) return
    const g = GIRO[++tic % 4]
    for (const el of document.querySelectorAll('.gira')) el.textContent = g
  }, 140)
}

// Le corsie richiuse l'ultima volta.
try {
  const salvate = await api.storage?.get(CHIAVE_CHIUSE)
  if (Array.isArray(salvate)) scelte.chiuse = salvate.filter((p) => typeof p === 'string').slice(0, 60)
} catch {
  // Lo storage non risponde: le corsie partono tutte aperte.
}

// Il pannello si apre sempre sulla Panoramica: il diagramma dei flussi è la prima cosa che si vede.
await carica()
