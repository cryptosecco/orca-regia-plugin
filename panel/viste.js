// Le viste del pannello (con le foto profilo e le icone dei bot) come funzioni pure: dal quadro
// del worker a stringhe HTML. Niente DOM e niente `orca` qui dentro: così si provano con `orca plugin test`.
import { T } from './testi.js'

/**
 * Le mascotte che il plugin porta con sé: nessuna. Quella di un bot arriva dal worker, che la legge
 * dall'Orca di chi usa il plugin, e si mostra come un'immagine sua (vedi `ritratto`).
 */
export const MASCOTTE = []

export const e = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---------- tempo ----------
export const durata = (s) => {
  s = Math.max(0, Math.round(s))
  if (s < 90) return s + T.tempo.unit.s
  if (s < 5400) return Math.round(s / 60) + T.tempo.unit.min
  if (s < 129600) return Math.round(s / 3600) + T.tempo.unit.h
  return Math.round(s / 86400) + T.tempo.unit.d
}
const fa = (ms, ora) => (ms ? T.tempo.ago(durata((ora - ms) / 1000)) : '')
/** L'ora di un istante, «10:53», nel fuso della macchina. */
export const oraDi = (ms) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** Il segno di un dato dell'ultimo file di stato, che ora è fermo: c'è ancora, ma non è aggiornato. */
const nonAggiornato = (quando) => `<span class="non-agg" title="${T.fermo.lastValue}">${quando ? T.fermo.notUpdatedSince(oraDi(quando)) : T.fermo.notUpdated}</span>`
const tra = (ms, ora) => (ms ? (ms >= ora ? T.tempo.in(durata((ms - ora) / 1000)) : T.tempo.late) : '')
const due = (n) => String(n).padStart(2, '0')
const MESI = T.tempo.months
export const giornoOra = (ms, ora) => {
  if (!ms) return ''
  const d = new Date(ms), oggi = new Date(ora)
  const hm = `${due(d.getHours())}:${due(d.getMinutes())}`
  return d.toDateString() === oggi.toDateString() ? hm : `${d.getDate()} ${MESI[d.getMonth()]} ${hm}`
}
export const regola = (r) => {
  const m = /FREQ=DAILY;BYHOUR=(\d+);BYMINUTE=(\d+)/.exec(r || '')
  return m ? T.tempo.everyDayAt(`${due(m[1])}:${due(m[2])}`) : r || T.tempo.onDemand
}

// ---------- stati: sempre un segno e una parola, mai solo il colore ----------
const CHIAVE = { 'al lavoro': 'lavoro', 'aspetta te': 'aspetta', finito: 'finito', errore: 'errore', fermo: 'fermo', previsto: 'previsto' }
// Glifi da terminale: il lavoro gira (/ - \\ |), il resto è un carattere fermo.
const SEGNI = { lavoro: '/', aspetta: '⚠\uFE0E', finito: '✓', errore: '✗', fermo: '·', previsto: '◌' }
const chiave = (s) => CHIAVE[s] || 'fermo'
const segno = (k) => `<span class="segno c-${k}${k === 'lavoro' ? ' gira' : ''}" aria-hidden="true">${SEGNI[k]}</span>`
/** La barra del design system: piena fin dove serve, tratteggiata nel resto. Senza stili in linea. */
const barra = (pct, classe = '') => `<svg class="barra-v ${classe}" viewBox="0 0 100 9" preserveAspectRatio="none" aria-hidden="true"><rect width="${Math.max(0, Math.min(100, pct))}" height="9"/></svg>`
const nn = (i) => String(i + 1).padStart(2, '0')
/** Gli stati viaggiano in italiano nel quadro (sono chiavi); a schermo vanno in inglese. */
const PAROLE = { 'al lavoro': T.stato.working, 'aspetta te': T.stato.waitingOnYou, finito: T.stato.done, errore: T.stato.error, fermo: T.stato.idle, previsto: T.stato.planned }
export const dici = (s) => PAROLE[s] || s
const stato = (nome, testo) => `<span class="stato ${chiave(nome)}">${segno(chiave(nome))}${e(testo || dici(nome))}</span>`
const STATO_ITEM = { needs_you: ['aspetta te', T.stato.waitingOnYou], in_progress: ['al lavoro', T.stato.inProgress], done: ['finito', T.stato.closed], closed: ['finito', T.stato.closed], blocked: ['errore', T.stato.blocked], snoozed: ['fermo', T.stato.snoozed], planned: ['previsto', T.stato.planned] }
const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`

/** Una spiegazione lunga: resta a un clic, chiusa, invece di occupare la pagina con un paragrafo grigio. */
const comeSiLegge = (testo) => `<details class="nota"><summary>${T.howToRead}</summary><p>${testo}</p></details>`

/** Attributi di un elemento che, cliccato, porta Orca su una scheda o un terminale. */
const apri = (bersaglio) =>
  bersaglio && (bersaglio.percorso || bersaglio.terminale)
    ? ` data-apri="${e(JSON.stringify({ percorso: bersaglio.percorso || null, terminale: bersaglio.terminale || null }))}" title="${T.openInOrca}"`
    : ''

// ---------- interattività: tutto in sola lettura ----------
// Un elemento dice cosa fa al clic con un attributo, e regia.js lo esegue:
// data-apri (porta Orca su una scheda, un terminale o la chat di un bot; con data-ripiego, dove andare
// se Orca non lo trova), data-vai («coda»: la vista Coda; «bot:Nome»: scorre fin lì e la evidenzia), data-vista
// (cambia vista), data-voce (apre e chiude la domanda di una voce della coda), data-corsia (richiude una
// corsia), data-filtro-coda e data-filtro-progetto (i filtri della coda). data-info è il riquadro che compare
// al passaggio del mouse e col fuoco da tastiera: la prima riga è il titolo.
const bersaglio = (b) => e(JSON.stringify({ percorso: b.percorso || null, terminale: b.terminale || null }))
const azApri = (b, ripiego = '') => (b && (b.percorso || b.terminale) ? ` data-apri="${bersaglio(b)}"${ripiego ? ` data-ripiego="${e(ripiego)}"` : ''}` : ripiego ? ` data-vai="${e(ripiego)}"` : '')
const azVai = (dove) => ` data-vai="${e(dove)}"`
const azVista = (vista, stato) => ` data-vista="${vista}"${stato === undefined ? '' : ` data-stato="${e(stato)}"`}`
const info = (...righe) => ` data-info="${e(righe.flat().filter(Boolean).join('\n'))}"`
/** Un elemento del diagramma che si preme: col mouse, oppure con Tab e Invio. */
const premibile = (chiaveFuoco, etichetta) => ` role="button" tabindex="0" data-k="${e(chiaveFuoco)}" aria-label="${e(etichetta)}"`
/** La chat di un bot è la sua casa (~/.orca/bots/<nome>) come spazio di lavoro di Orca. */
const chatDi = (b) => (b && b.sessione && b.sessione.percorso ? { percorso: b.sessione.percorso, terminale: null } : null)

// ---------- intestazione: un avviso solo quando una fonte è ferma ----------
/**
 * Finché tutto arriva, qui non c'è niente. Compare una riga
 * solo per un problema: la CLI non risponde, il Motore è fermo, o il quadro è più vecchio di 30 secondi.
 */
/**
 * Il file di stato è stato chiesto nelle impostazioni e non viene più aggiornato: una fascia rossa in testa
 * al pannello, in tutte le viste, che dice da quanto è fermo e cosa a schermo non è più aggiornato. Chi non
 * ha impostato un file di stato (`spento`) non la vede mai: per lui quella fonte non esiste, non è ferma.
 */
export function motoreFermo(q, ora) {
  const f = q.fonti
  if (f.motore.ok || f.motore.spento) return ''
  const quando = f.motore.aggiornato
  const da = quando ? T.fermo.since(durata((ora - quando) / 1000), oraDi(quando)) : T.fermo.noData
  const cosa = f.motore.ultimi ? (f.ufficioDa === 'cli' ? T.fermo.lastWithCli : T.fermo.lastOnly) : T.fermo.without[f.ufficioDa]
  return `<div class="motore-fermo"><span class="mf-t">${segno('errore')}<b>${T.fermo.title}</b><span class="mf-da">${e(da)}</span></span><span class="mf-c">${e(cosa)}</span><span class="mf-r">${T.fermo.restart}</span></div>`
}

export function fonti(q, ora) {
  const f = q.fonti
  const righe = []
  const eta = Math.max(0, Math.round((ora - q.quando) / 1000))
  if (eta > 30) righe.push(T.fonti.notUpdating(fa(q.quando, ora)))
  if (!f.cli.ok) righe.push(f.cli.quando ? T.fonti.botsCliStale(fa(f.cli.quando, ora)) : f.motore.spento ? T.fonti.botsCliDown : T.fonti.botsCliOnlyState)
  return motoreFermo(q, ora) + righe.map((t) => `<span class="fonte guasto">${segno('errore')}<span>${e(t)}</span></span>`).join('')
}

/** Di chi è la coda, a parole e già protetta per l'HTML: «Atlas's queue», oppure «the queue» quando è di tutti i bot. */
const laCoda = (c) => (c.diTutti || !c.bot ? T.coda.theQueue : T.coda.botQueue(e(c.bot)))

// ---------- il tabellone: quanti agenti lavorano adesso, e di chi sono ----------
/** I fornitori, nell'ordine in cui si leggono. `altri` raccoglie chi non si riconosce. */
export const FORNITORI = [['claude', 'Claude'], ['openai', 'OpenAI'], ['grok', 'Grok'], ['gemini', 'Gemini'], ['altri', T.tabellone.other]]
/**
 * Di chi è un agente: prima dal modello (`opus-5-5`, `gpt-5`, `grok-4`, `gemini-2.5`), poi dal tipo di
 * agente («Claude Code», «Codex», «Grok», «Gemini»). Un bot o un worker è un agente come gli altri.
 */
export function fornitoreDi(a) {
  const riconosci = (t) => {
    t = String(t ?? '').toLowerCase()
    if (/claude|opus|sonnet|haiku|fable|mythos|anthropic/.test(t)) return 'claude'
    if (/gpt|codex|openai|chatgpt|\bo[1-9]\b|\bo[1-9]-/.test(t)) return 'openai'
    if (/grok|xai/.test(t)) return 'grok'
    if (/gemini|google/.test(t)) return 'gemini'
    return ''
  }
  return riconosci(a.modello) || riconosci(a.agente) || 'altri'
}
// ---------- i simboli dei fornitori ----------
const NOME_FORNITORE = Object.fromEntries(FORNITORI)
// I segni dei fornitori: forme semplici, non marchi.
const NEUTRI = { claude: '<circle cx="6" cy="6" r="4.4"/>', openai: '<rect x="1.8" y="1.8" width="8.4" height="8.4"/>', grok: '<path d="M6 1 11 6 6 11 1 6z"/>', gemini: '<path d="M6 1.4 11 10.4H1z"/>', altri: '<circle class="vuoto" cx="6" cy="6" r="3.9"/>' }
/**
 * Al posto del nome di un fornitore scritto e basta: un segno neutro (una forma semplice, non un marchio)
 * col nome accanto. Il plugin non porta con sé loghi o mascotte di terzi. `vivo`: quel fornitore ha agenti
 * al lavoro, e il segno respira (solo scala e opacità, nel CSS). `dice`: un'etichetta diversa dal nome.
 */
export function marchio(id, { vivo = false, dice = '' } = {}) {
  const nome = NOME_FORNITORE[id] || NOME_FORNITORE.altri, etichetta = e(dice || nome)
  return `<span class="marchio neutro${vivo ? ' vivo' : ''}" role="img" aria-label="${etichetta}" title="${etichetta}"><svg viewBox="0 0 12 12" aria-hidden="true">${NEUTRI[id] || NEUTRI.altri}</svg><span class="nome-m">${e(nome)}</span></span>`
}

/**
 * L'unico posto in cui si contano gli agenti: gli stessi dell'Office, ognuno una volta, divisi per stato e
 * (chi lavora) per fornitore. Il numero grande, i numeri dei fornitori, le parole dette accanto, l'elenco
 * che si apre, la riga in fondo e la scheda «Office» vengono tutti da qui, quindi non possono dire cose diverse.
 */
export function gruppiTabellone(q) {
  const tutti = q.progetti.flatMap((p) => p.agenti.map((a) => ({ ...a, progetto: p.nome, chiave: chiaveAgente(a, p.nome) })))
  const di = (s) => tutti.filter((a) => a.stato === s)
  const lavoro = di('al lavoro')
  return { tutti, lavoro, aspettano: di('aspetta te'), errori: di('errore'), fornitori: FORNITORI.map(([id, nome]) => ({ id, nome, lavoro: lavoro.filter((a) => fornitoreDi(a) === id), agenti: tutti.filter((a) => fornitoreDi(a) === id).length })) }
}
/** Gli stessi gruppi, in numeri. */
export function contiTabellone(q) {
  const g = gruppiTabellone(q)
  return { agenti: g.tutti.length, lavoro: g.lavoro.length, aspettano: g.aspettano.length, errori: g.errori.length, fornitori: g.fornitori.map((f) => ({ id: f.id, nome: f.nome, lavoro: f.lavoro.length, agenti: f.agenti })) }
}
const QUANTI_IN_ELENCO = 8
/**
 * Il tabellone in testa a ogni vista, dal totale al dettaglio: quanti agenti lavorano adesso (grande); poi,
 * per ogni fornitore che ne ha almeno uno al lavoro, il suo simbolo col numero (chi è a zero non c'è); a
 * destra chi aspetta una risposta e chi è in errore. Un numero, al passaggio del mouse o premuto (su touch, al
 * tocco), apre sotto l'elenco di quegli agenti: un piccolo avatar, il nome e cosa stanno facendo; da lì un
 * clic porta dall'agente, e «show in Office» apre l'Office filtrato. `vista.aperto` dice quale elenco è
 * aperto; `vista.vista`, `stato` e `fornitore` servono a segnare il filtro in uso nell'Office.
 */
export function tabellone(q, vista = {}) {
  const g = gruppiTabellone(q)
  const inOffice = vista.vista === 'ufficio'
  const voci = [
    { chiave: 'lavoro', lista: g.lavoro, classe: 'c-lavoro primo', stato: 'al lavoro', fornitore: '', dice: T.tabellone.ofWorking(g.lavoro.length, plurale(g.tutti.length, ...T.n.agent)), dentro: `<span>${T.tabellone.working}</span>` },
    ...g.fornitori.filter((f) => f.lavoro.length).map((f) => ({ chiave: f.id, lista: f.lavoro, classe: 'c-lavoro forn', stato: 'al lavoro', fornitore: f.id, dice: T.tabellone.ofWorking(f.lavoro.length, plurale(f.agenti, ...T.n.providerAgent(f.nome))), prima: marchio(f.id, { vivo: true }) })),
    { chiave: 'aspettano', lista: g.aspettano, classe: 'c-aspetta', stato: 'aspetta te', fornitore: '', dice: T.tabellone.areWaiting(plurale(g.aspettano.length, ...T.n.agentIs)), dentro: `<span>${T.tabellone.waiting}</span>` },
    { chiave: 'errori', lista: g.errori, classe: 'c-errore', stato: 'errore', fornitore: '', dice: T.tabellone.inError(plurale(g.errori.length, ...T.n.agent)), dentro: `<span>${T.tabellone.errors}</span>` }
  ]
  const aperta = voci.find((v) => v.chiave === vista.aperto && v.lista.length) || null
  const filtrato = (v) => inOffice && (vista.stato || '') === v.stato && (vista.fornitore || '') === v.fornitore
  const tasto = (v) => {
    const n = v.lista.length
    return `<button type="button" class="tab-n ${v.classe}${n ? '' : ' zero'}${filtrato(v) ? ' filtra' : ''}" data-tab="${v.chiave}" data-k="tab:${v.chiave}" aria-label="${e(v.dice)}" aria-expanded="${aperta === v}"${n ? ' aria-controls="tab-chi"' : ' disabled'}>${v.prima || ''}<b class="num" data-conta="${v.chiave}">${n}</b>${v.dentro || ''}</button>`
  }
  const [totale, ...altre] = voci
  const fornitori = altre.filter((v) => v.fornitore), stati = altre.filter((v) => !v.fornitore)
  return `<div class="tab-riga">${tasto(totale)}<span class="tab-forn">${fornitori.map(tasto).join('')}</span><span class="tab-altri">${stati.map(tasto).join('')}</span></div>${aperta ? elencoTabellone(q, aperta, filtrato(aperta)) : ''}`
}
/** L'elenco che si apre sotto un numero del tabellone: proprio gli agenti contati lì, uno per riga. */
function elencoTabellone(q, v, filtrato) {
  const fotoBot = new Map(q.bot.map((b) => [b.nome.toLowerCase(), { ico: chiaveIcona(b), foto: b.foto, sua: suaDi(b), emoji: b.emoji ?? null, chat: chatDi(b) }]))
  const riga = (a) => {
    const f = a.bot ? fotoBot.get(a.nome.toLowerCase()) : null
    const bersaglio = (f && f.chat) || { percorso: a.cartella, terminale: a.terminale }
    const fa = (a.stato === 'aspetta te' && a.domanda ? a.domanda : a.dettaglio) || ''
    const secondi = a.daSecondi ?? (a.da ? (q.quando - a.da) / 1000 : null)
    return `<li><button type="button" class="chi-r c-${chiave(a.stato)}" data-k="chi:${e(a.chiave)}"${azApri(bersaglio)} title="${a.bot ? T.tabellone.openChat : T.tabellone.openTerminal}">${ritratto({ nome: a.nome, bot: a.bot, ico: f ? f.ico : a.nome, foto: f ? f.foto : null, sua: f ? f.sua : null, emoji: f ? f.emoji : null })}<span class="chi-nome taglia">${e(a.nome)}</span><span class="chi-dove taglia">${e(a.bot ? T.bot.tag : a.progetto)}${secondi === null ? '' : ` · ${durata(secondi)}`}</span><span class="chi-fa taglia">${fa ? e(fa) : `<span class="muto">${T.tabellone.noDetail}</span>`}</span></button></li>`
  }
  const resto = v.lista.length - QUANTI_IN_ELENCO
  const office = `<button type="button" class="collega" data-vista="ufficio" data-stato="${filtrato ? '' : e(v.stato)}" data-fornitore="${filtrato ? '' : v.fornitore}" data-k="chi:office">${filtrato ? T.tabellone.clearOffice : T.tabellone.showInOffice}</button>`
  return `<div class="tab-chi ${v.classe.split(' ')[0]}" id="tab-chi" role="group" aria-label="${e(v.dice)}"><p class="tab-chi-t"><span>${e(v.dice)}</span>${office}</p><ul>${v.lista.slice(0, QUANTI_IN_ELENCO).map(riga).join('')}</ul>${resto > 0 ? `<p class="muto">${T.tabellone.moreInOffice(resto)}</p>` : ''}</div>`
}

/** La riga in fondo, come la barra di stato della prova 2: il riassunto in una frase. Il primo pezzo porta alla coda. */
export function piede(q) {
  const c = contiTabellone(q), n = q.coda.decidi.length, oggi = q.coda.oggi
  const coda = n || oggi ? [n ? T.piede.toDecide(n) : '', oggi ? T.piede.today(oggi) : ''].filter(Boolean).join(' · ') : T.piede.nothing
  return `<button type="button" class="vai-coda"${azVai('coda')} title="${T.piede.goTo(laCoda(q.coda))}">${coda}</button> · ${plurale(c.agenti, ...T.n.agent)} · ${T.piede.working(c.lavoro)}${q.fonti.motore.spento ? '' : ` · ${plurale(q.incroci.length, ...T.n.overlap)}`}`
}

/** Il numero sulla scheda «Coda» conta le cose di «Decidi adesso», come la barra di stato: in ambra se ce ne sono. */
export function schede(q) {
  return [
    ['panoramica', T.schede.overview, q.bot.length, ''],
    ['coda', T.schede.queue, q.coda.decidi.length, q.coda.decidi.length ? 'aspetta' : ''],
    ['flussi', T.schede.flows, q.messaggi.length, ''],
    ['ufficio', T.schede.office, contiTabellone(q).agenti, ''],
    // Gli incroci li sa solo il file di stato facoltativo: senza, la scheda non c'è.
    ...(q.fonti.motore.spento ? [] : [['incroci', T.schede.overlaps, q.incroci.length, q.incroci.length ? 'aspetta' : '']])
  ]
}

// ---------- icone: una per bot, disegnate qui, uguali nel diagramma e nelle tabelle ----------
// Griglia 24×24, tratto a 1.6 con gli angoli vivi come il resto del pannello; le parti piene hanno
// la classe «p». Nessuna immagine e nessun marchio: sono segni generici del mestiere del bot.
const DISEGNI = {
  // Non sono bot: i nodi fissi del diagramma.
  '·tu': '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4.6 3-7 7.5-7s7.5 2.4 7.5 7"/>',
  '·coda': '<path d="M3.5 5.5h17M3.5 12h17M3.5 18.5h11"/><path class="p" d="M17 16.5h4v4h-4z"/>',
  '·worker': '<path d="M3 4.5h18v15H3zM7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  '·ufficio': '<path d="M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7z"/><path class="p" d="M13.5 13.5h7v7h-7z"/>',
  '·pr': '<circle cx="6.5" cy="5.5" r="2.3"/><circle cx="6.5" cy="18.5" r="2.3"/><circle cx="17.5" cy="18.5" r="2.3"/><path d="M6.5 7.8v8.4M17.5 16.2V10c0-2-1-3-3-3h-3M13.5 4.5 11 7l2.5 2.5"/>'
}

/** Per ogni bot: un disegno a quadretti ricavato dal nome, sempre lo stesso per lo stesso nome. */
export function disegnoDalNome(nome) {
  let h = 2166136261
  for (const c of String(nome).toLowerCase()) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0
  // Cinque righe per tre colonne, specchiate: quindici bit del nome. La colonna di mezzo non resta mai vuota.
  const celle = []
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      const acceso = (h >>> (r * 3 + c)) & 1 || (c === 2 && (r === 1 || r === 3) && !((h >>> 20) & 1))
      if (!acceso) continue
      celle.push(`M${2 + c * 4} ${2 + r * 4}h4v4h-4z`)
      if (c < 2) celle.push(`M${2 + (4 - c) * 4} ${2 + r * 4}h4v4h-4z`)
    }
  }
  return `<path class="p" d="${celle.join('')}"/>`
}

// Solo i nodi fissi (col nome che comincia per «·») hanno un disegno loro: un bot non può prenderne il posto.
const disegnoDi = (nome) => (String(nome).startsWith('·') && DISEGNI[nome]) || disegnoDalNome(nome)
/**
 * Con che chiave si sceglie l'icona di un bot: la cartella della sua casa, che non cambia quando il bot
 * cambia nome o prende un'emoji. Senza casa nota, il nome.
 */
export const chiaveIcona = (b) => b.casa || b.nome
/** L'immagine caricata di un bot, con l'id a cui chiederla al worker. Null: non ne ha. */
const suaDi = (b) => (b.fotoSua ? { ...b.fotoSua, bot: b.id } : null)
/** L'icona di un bot (dalla sua chiave: la casa, o il nome) o di un nodo fisso (col nome che comincia per «·») come SVG. */
export const icona = (nome, attributi = '') => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"${attributi}>${disegnoDi(nome)}</svg>`

// ---------- foto profilo: quella che il bot ha in Orca, o un volto ricavato dal nome ----------
// La foto di un bot è quella scritta nel suo bot.json, la stessa della barra laterale di Orca: una
// mascotte (letta dal worker dentro l'Orca di questa macchina), l'immagine caricata o un'emoji.
// Chi non ne ha una (un bot senza avatar, un agente in un terminale) non resta senza faccia.
const haFoto = (id) => Boolean(id) && MASCOTTE.includes(id)

function impronta(testo, seme) {
  let h = seme >>> 0
  for (const c of String(testo).toLowerCase()) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Il volto di un agente: una creatura a quadretti su una griglia 7×7 specchiata, ricavata dal nome.
 * Stesso nome, stesso volto. Dal nome vengono l'altezza e la distanza degli occhi, la bocca, quanto è
 * pieno il corpo e quali antenne, braccia e zampe spuntano (in un menta più scuro). Non è il logo di nessuno.
 */
export function voltoDalNome(nome) {
  const a = impronta(nome, 2166136261), b = impronta(nome, 0x9e3779b9)
  const rigaOcchi = 2 + (a & 1), colOcchi = 1 + ((a >>> 1) & 1)
  const bocca = (a >>> 2) & 1 ? rigaOcchi + 2 : -1
  const corpo = [], fuori = []
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c
      const dentro = r >= 1 && r <= 5 && c >= 1
      const occhio = r === rigaOcchi && c === colOcchi
      // Attorno agli occhi il volto è sempre pieno, così si leggono.
      const viso = dentro && Math.abs(r - rigaOcchi) <= 1
      // Il corpo è pieno tre volte su quattro, quello che spunta una su tre.
      const acceso = viso || (dentro ? ((a >>> (i + 3)) & 1) | ((b >>> i) & 1) | (c === 3 ? 1 : 0) : ((b >>> i) & 1) & ((a >>> (i + 3)) & 1) | (((b >>> (i + 7)) % 7 === 0) ? 1 : 0))
      if (occhio || (r === bocca && c === 3) || !acceso) continue
      ;(dentro ? corpo : fuori).push(`M${c * 4} ${r * 4}h4v4h-4z${c < 3 ? `M${(6 - c) * 4} ${r * 4}h4v4h-4z` : ''}`)
    }
  }
  return `<path class="p" d="${corpo.join('')}"/>${fuori.length ? `<path class="p o" d="${fuori.join('')}"/>` : ''}`
}

/**
 * La foto profilo in cornice, col cartellino sotto. La cornice prende il colore di stato di chi la porta.
 * Un bot porta la foto che ha in Orca; il worker ne manda una sola di queste, da bot.json:
 *   - l'immagine caricata (`sua`, l'avatar.png nella sua casa) o la sua mascotte di Orca: a colori su
 *     fondo scuro. Qui c'è solo il posto: l'immagine la mette regia.js quando arriva dal worker (data-sua è
 *     l'id del bot, data-impronta dice quale file). Finché non c'è, si vede l'icona disegnata;
 *   - un'emoji (`emoji`), com'è, su fondo scuro;
 *   - niente: l'icona disegnata, quella della sua casa (`ico`) o una ricavata dal nome.
 * Un agente porta il volto ricavato dal nome.
 */
/** Il cartellino di un agente: il simbolo del suo fornitore (che respira se lavora), o la parola se non si riconosce. */
const cartDi = (a) => {
  const id = fornitoreDi(a)
  if (id === 'altri') return { cart: a.bot ? T.bot.tag : (a.agente || '').split(' ')[0].toLowerCase() }
  return { marca: marchio(id, { vivo: a.stato === 'al lavoro' }) }
}
export function ritratto({ nome, ico = nome, bot = false, foto = null, sua = null, emoji = null, cart = '', marca = '' }) {
  // `marca`: il simbolo del fornitore (HTML di `marchio`) al posto della parola nel cartellino.
  const cartellino = marca ? `<span class="cart marca">${marca}</span>` : cart ? `<span class="cart">${e(cart)}</span>` : ''
  if (bot && !sua && emoji && !haFoto(foto)) return `<span class="pfp faccina" aria-hidden="true"><span class="vetro"><span class="emoji">${e(emoji)}</span></span>${cartellino}</span>`
  if (bot && sua) return `<span class="pfp sua${sua.intera ? ' intera' : ''} rotta"${datiSua(sua)} aria-hidden="true"><span class="vetro"><img alt="" decoding="async">${icona(ico)}</span>${cartellino}</span>`
  const mascotte = bot && haFoto(foto)
  const dentro = bot ? `${mascotte ? `<img src="./pfp/${foto}.svg" alt="" decoding="async">` : ''}${icona(ico)}` : `<svg class="volto" viewBox="-3 -3 34 34" aria-hidden="true">${voltoDalNome(nome)}</svg>`
  return `<span class="pfp${mascotte ? ' foto' : ''}"${mascotte ? ' data-foto' : ''} aria-hidden="true"><span class="vetro">${dentro}</span>${cartellino}</span>`
}
const datiSua = (sua) => ` data-sua="${e(sua.bot)}" data-impronta="${e(sua.impronta)}"`

/**
 * La stessa foto dentro il diagramma: piccola, col bordo del colore di stato. Senza foto resta l'icona.
 * La foto sua sta su un fondo scuro: una figura (`intera`) si vede tutta, con un filo di margine; una foto
 * piena riempie il riquadro e si ritaglia ai lati. In nessun caso viene deformata.
 */
const ritrattoSvg = (nome, foto, x, y, s, id, sua = null, emoji = null) => {
  const ico = icona(nome, ` x="${x + 3}" y="${y + 3}" width="${s - 6}" height="${s - 6}"`), cornice = `<rect class="cornice" x="${x}" y="${y}" width="${s}" height="${s}"/>`
  if (!sua && emoji && !haFoto(foto)) return `<g class="ritratto faccina"><rect class="fondo" x="${x}" y="${y}" width="${s}" height="${s}"/><text class="emoji" x="${x + s / 2}" y="${y + s / 2}" text-anchor="middle" dominant-baseline="central">${e(emoji)}</text>${cornice}</g>`
  if (sua) {
    const m = sua.intera ? 2 : 0
    return `<g class="ritratto sua rotta"${datiSua(sua)}><rect class="fondo" x="${x}" y="${y}" width="${s}" height="${s}"/><image x="${x + m}" y="${y + m}" width="${s - 2 * m}" height="${s - 2 * m}" preserveAspectRatio="xMidYMid ${sua.intera ? 'meet' : 'slice'}"/>${ico}${cornice}</g>`
  }
  return haFoto(foto) ? `<g class="ritratto" data-foto><image href="./pfp/${foto}.svg" x="${x}" y="${y}" width="${s}" height="${s}" filter="url(#bic-${id})"/>${ico}${cornice}</g>` : icona(nome, ` x="${x}" y="${y}" width="${s}" height="${s}"`)
}
// Grigi, un po' più di contrasto, poi tutto nel menta del tema: la stessa bicromia delle foto nelle schede.
const bicromia = (id) => `<filter id="bic-${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".127 .427 .043 0 -.05  .231 .778 .079 0 -.091  .196 .66 .067 0 -.077  0 0 0 1 0"/></filter>`

// ---------- le statistiche di un agente: righe da terminale, col valore a destra ----------
const SFORZI = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }
/** Token in breve: 120k, 1M, 1,2M. */
export const gettoni = (n) => (n >= 1e6 ? String(+(n / 1e6).toFixed(1)).replace('.', ',') + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)))
/** Il conto alla rovescia della cache: 59:56, oppure 1:02:03. */
export const conto = (s) => {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${h ? `${h}:${due(m)}` : m}:${due(s % 60)}`
}
const MANCA = `<span class="manca" title="${T.stat.noData}">${T.stat.missing}</span>`
const rigaStat = (classe, nome, valore) => `<span class="r ${classe}${valore ? '' : ' vuota'}"><span class="k">${nome}</span><span class="v">${valore || MANCA}</span></span>`
/** Un agente di cui non si sa niente: tutte le righe risultano mancanti. */
const SCONOSCIUTO = { modello: '', sforzo: '', contesto: null, finestra: null, contestoPct: null, cacheScade: null, subAttivi: 0, subConclusi: null }

/**
 * Modello, sforzo, contesto, cache e sub-agenti. Lo sforzo a segmenti (▮▮▮▯▯), il contesto come barra
 * col vuoto tratteggiato e «37% di 1M» (ambra dal 60%, rosso dall'80%), la cache come conto alla
 * rovescia. Un dato che manca si vede come mancante. `prima` sono righe in più, da mettere in testa.
 */
export function statistiche(a, ora, prima = '') {
  a = a || SCONOSCIUTO
  const pieni = SFORZI[a.sforzo]
  const sforzo = a.sforzo ? `${pieni ? `<span class="seg" aria-hidden="true"><b>${'▮'.repeat(pieni)}</b>${'▯'.repeat(5 - pieni)}</span> ` : ''}${e(a.sforzo)}` : ''
  const pct = a.contestoPct
  const tono = pct >= 80 ? 'c-errore' : pct >= 60 ? 'c-aspetta' : 'c-menta'
  const finestra = a.finestra ? gettoni(a.finestra) : ''
  const contesto =
    pct === null
      ? `<span class="r ctx vuota"><span class="k">${T.stat.context}</span><span class="v">${MANCA}${finestra ? ` <span class="muto">${T.stat.of(finestra)}</span>` : ''}</span></span>`
      : `<span class="r ctx" title="${T.stat.contextUsed(e(gettoni(a.contesto)), e(finestra))}"><span class="k">${T.stat.context}</span>${barra(pct, tono)}<span class="v${pct >= 60 ? ` ${tono} vivo` : ''}"><b class="num">${pct}%</b> ${T.stat.of(e(finestra))}</span></span>`
  const resta = a.cacheScade === null ? null : (a.cacheScade - ora) / 1000
  const cache = resta === null ? '' : resta > 0 ? `<span class="muto lungo">${T.stat.expiresIn}</span><span class="conto num" data-scade="${a.cacheScade}">${conto(resta)}</span>` : `<span class="fredda">${T.stat.cold}</span><span class="muto lungo">${T.tempo.forDur(durata(-resta))}</span>`
  const sub = a.subConclusi === null && !a.subAttivi ? '' : `${a.subAttivi ? `<span class="c-lavoro vivo">${a.subAttivi} ${T.stato.working}</span>` : `0 ${T.stato.working}`}${a.subConclusi === null ? '' : ` · ${a.subConclusi} ${T.stato.done}`}`
  const mancano = [[T.stat.model, a.modello], [T.stat.effort, sforzo], [T.stat.context, pct !== null], [T.stat.cache, cache], [T.stat.subAgents, sub]].filter(([, c]) => !c).map(([n]) => n)
  // File di stato fermo: i valori sono gli ultimi che portava. Restano, spenti, con «not updated since 10:53».
  const vecchia = a.vecchio !== undefined
  return `<span class="stat${vecchia ? ' vecchia' : ''}">${vecchia ? nonAggiornato(a.vecchio) : ''}${prima}${rigaStat('modello', T.stat.model, e(a.modello))}${rigaStat('sforzo', T.stat.effort, sforzo)}${contesto}${rigaStat('cache', T.stat.cache, cache)}${rigaStat(`sub${a.subAttivi || a.subConclusi ? '' : ' zero'}`, T.stat.subAgents, sub)}${mancano.length ? `<span class="mancanti">${T.stat.missingList(mancano.join(', '))}</span>` : ''}</span>`
}

// ---------- lo stato di un bot, uguale nel diagramma e nelle tabelle ----------
function statoBot(b) {
  const aspetta = b.item.filter((i) => i.stato === 'needs_you').length
  if (b.inPausa) return ['fermo', T.stato.paused]
  if (aspetta) return ['aspetta', `${aspetta} ${T.stato.waitingOnYou}`]
  if (b.sessione && b.sessione.stato === 'al lavoro') return ['lavoro', T.stato.working]
  if (b.worker.some((w) => w.agenti.some((g) => g.stato === 'al lavoro'))) return ['lavoro', T.stato.workersBusy]
  return ['fermo', T.stato.listening]
}

// ---------- il diagramma dei flussi ----------
const RECENTE_MS = 15 * 60_000
const controlli = (pr) => (!pr ? '' : /fail|error|red/i.test(pr.controlli) ? 'errore' : /pass|success|green/i.test(pr.controlli) ? 'finito' : pr.controlli ? 'lavoro' : 'fermo')

/** I numeri del diagramma, ricavati dal quadro: chi passa lavoro a chi, e quanti messaggi oggi. */
export function flusso(q, ora) {
  const oggi = new Date(ora).toDateString()
  const diOggi = q.messaggi.filter((m) => m.quando && new Date(m.quando).toDateString() === oggi)
  const tra = (x, y) => diOggi.filter((m) => (m.da.nome === x && m.a.nome === y) || (m.da.nome === y && m.a.nome === x))
  const recente = (lista) => lista.some((m) => ora - m.quando < RECENTE_MS)
  // Chi sta al centro: il bot che tiene la coda, se ne è stato scelto uno e c'è.
  const lead = (!q.coda.diTutti && q.bot.find((b) => b.nome === q.coda.bot)) || null
  // Senza un bot scelto al centro c'è la coda di tutti: un nodo che porta alla vista Queue.
  const snodo = q.coda.diTutti ? { nome: T.diagramma.queue, ico: '·coda', figli: [], foto: null, sua: null, emoji: null, chat: null, previsto: false, snodo: true, stato: [q.coda.aspettano ? 'aspetta' : 'fermo', q.coda.aspettano ? `${q.coda.aspettano} ${T.stato.waitingOnYou}` : `${q.coda.voci.length} ${T.stato.open}`], msg: 0, vivo: false, consegne: 0, inCorso: 0, msgWorker: 0, worker: [], fermi: 0, aspettano: q.coda.aspettano, inCoda: q.coda.voci.length } : null
  const diBot = (b) => {
    const consegne = b.item.flatMap((i) => i.consegne)
    const conWorker = diOggi.filter((m) => (m.da.nome === b.nome && m.a.ruolo === 'worker') || (m.a.nome === b.nome && m.da.ruolo === 'worker'))
    const vivi = b.worker.filter((w) => w.agenti.length)
    const conLead = lead && b !== lead ? tra(b.nome, lead.nome) : []
    return {
      nome: b.nome,
      aperti: b.item.length,
      ico: chiaveIcona(b),
      foto: b.foto,
      sua: suaDi(b),
      emoji: b.emoji ?? null,
      chat: chatDi(b),
      previsto: false,
      stato: statoBot(b),
      msg: conLead.length,
      vivo: recente(conLead),
      figli: b.figli || [],
      consegne: consegne.length,
      inCorso: consegne.filter((x) => x.stato === 'working').length,
      msgWorker: conWorker.length,
      worker: vivi.map((w) => ({ nome: w.nome, stato: w.agenti[0].stato, da: w.agenti[0].da, pr: w.pr ? { numero: w.pr.numero, controlli: controlli(w.pr) } : null, apri: { percorso: w.percorso, terminale: w.agenti[0].terminale } })),
      fermi: b.worker.length - vivi.length
    }
  }
  const pr = q.schede.filter((s) => s.pr)
  return {
    lead: snodo ? snodo.nome : q.coda.bot,
    diTutti: Boolean(snodo),
    orchestratore: lead ? { ...diBot(lead), aspettano: q.coda.aspettano, inCoda: q.coda.voci.length } : snodo,
    bot: [
      ...q.bot.filter((b) => b !== lead).map(diBot),
      ...q.botInArrivo.map((nome) => ({ nome, aperti: 0, ico: nome, foto: null, chat: null, previsto: true, stato: ['previsto', T.stato.comingSoon], figli: [], msg: 0, vivo: false, consegne: 0, inCorso: 0, msgWorker: 0, worker: [], fermi: 0 }))
    ],
    ufficio: contiTabellone(q),
    pr: { aperte: pr.length, rosse: pr.filter((s) => controlli(s.pr) === 'errore').length },
    messaggiOggi: diOggi.length
  }
}

const tronca = (t, n) => (String(t).length <= n ? String(t) : String(t).slice(0, Math.max(1, n - 1)) + '…')
/** Una riga di un nodo: se «N waiting on you» non ci sta, si dice in meno lettere («N for you») prima di troncare. */
const stringi = (t, n) => tronca(String(t).length > n ? String(t).replace(T.stato.waitingOnYou, T.stato.forYou) : t, n)
/** Dove passa un filo (solo M, L, H, V): il riquadro che lo contiene, quanto è lungo e il punto d'arrivo, tirato indietro di 3. */
function tracciato(d) {
  const punti = []
  let x = 0, y = 0
  for (const [, c, a] of d.matchAll(/([MLHV])\s*([\d.\s-]+)/g)) {
    const n = a.trim().split(/\s+/).map(Number)
    if (c === 'H') x = n[0]
    else if (c === 'V') y = n[0]
    else [x, y] = n
    punti.push([x, y])
  }
  const xs = punti.map((p) => p[0]), ys = punti.map((p) => p[1])
  const [fx, fy] = punti[punti.length - 1], [px, py] = punti[punti.length - 2] || [fx, fy - 1]
  const l = Math.hypot(fx - px, fy - py) || 1
  const r = (v) => Math.round(v * 10) / 10
  const lungo = punti.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - punti[i][0], p[1] - punti[i][1]), 0)
  return { x: r(Math.min(...xs) - 8), y: r(Math.min(...ys) - 8), w: r(Math.max(...xs) - Math.min(...xs) + 16), h: r(Math.max(...ys) - Math.min(...ys) + 16), lungo, capo: [r(fx - ((fx - px) / l) * 3), r(fy - ((fy - py) / l) * 3)] }
}
// Quanto corre e quanto brilla un filo acceso: cresce coi messaggi (o le attese) di oggi su quel filo.
export const passoDi = (n) => (n >= 10 ? 3 : n >= 3 ? 2 : 1)
// La luce è lunga 26 e ripassa ogni 118 (in unità del disegno) su ogni filo, corto o lungo: così va alla stessa
// velocità dappertutto. Il CSS ragiona in centesimi di giro, e `pathLength` fa la conversione.
const GIRO = 118
const ACCESI = ['vivo', 'aspetta', 'finito', 'errore']
// Una scritta accanto a un filo: con `extra` (azione e riquadro) si preme e risponde al mouse come il filo.
const scritta = (x, y, t, classe = '', ancora = 'middle', extra = '') => `<text class="arco-testo ${classe}${/data-(apri|vai|vista)=/.test(extra) ? ' clic' : ''}${extra ? ' sensibile' : ''}" x="${Math.round(x)}" y="${Math.round(y)}" text-anchor="${ancora}"${extra}${extra ? ' aria-hidden="true"' : ''}>${e(t)}</text>`
const STATO_WORKER = { 'al lavoro': 'lavoro', 'aspetta te': 'aspetta', finito: 'finito', errore: 'errore' }
const CONTROLLI = T.pr.state

/**
 * Un nodo: riquadro, icona e fino a tre righe. `k` è lo stato (dà il colore), `forma` è «riga»
 * (icona a sinistra) o «carta» (icona sopra). L'ultima riga, se `k` è acceso, prende il colore dello stato.
 * Con `foto` (la mascotte di un bot) o `sua` (la foto che il bot tiene nella sua casa) al posto dell'icona
 * c'è la foto profilo, un po' più grande. `azione` è cosa fa al clic, `dice` le righe del riquadro
 * al passaggio del mouse (l'ultima dice cosa fa il clic). `pillola` stacca l'ultima riga in un tasto a sé.
 */
/** Quante lettere del nome stanno in una carta larga `w` (col carattere grande, o piccolo sotto i 62 di altezza). */
const lettereNome = (w, grande = true) => Math.floor((w - 8) / (grande ? 7.6 : 6.1))
/**
 * Un nome su una riga o, se non ci sta, su due: si va a capo a uno spazio quando c'è, altrimenti dove
 * finisce la riga. Solo se non basta nemmeno la seconda riga si tronca, e lì.
 */
export function spezza(nome, n) {
  const t = String(nome)
  if (t.length <= n) return [t]
  const spazio = t.lastIndexOf(' ', n)
  const taglio = spazio >= Math.min(3, n) ? spazio : n
  return [t.slice(0, taglio).trimEnd(), tronca(t.slice(taglio).trimStart(), n)]
}

// ---------- gli agenti avviati da un bot: il bollino sul nodo e i nodini appesi sotto ----------
const STATO_FIGLIO = { lavoro: T.stato.working, aspetta: T.stato.waitingOnYou, finito: T.stato.done, errore: T.stato.failed, fermo: T.stato.idle }
const TIPO_FIGLIO = T.figlio.type
const ATTIVO = (f) => f.stato === 'lavoro' || f.stato === 'aspetta' || f.stato === 'errore'
/** Quanti figli per stato, in parole: «2 working, 1 waiting on you, 3 done». */
export function contaFigli(figli) {
  // Un sub-agente visto nell'ultimo file di stato, ora fermo, non si conta tra chi lavora: c'era allora.
  const freschi = figli.filter((f) => !f.vecchio), vecchi = figli.length - freschi.length
  const n = (s) => freschi.filter((f) => f.stato === s).length
  const fatti = n('finito') + n('fermo')
  return { attivi: freschi.filter(ATTIVO).length, fatti, vecchi, peggiore: n('aspetta') ? 'aspetta' : n('errore') ? 'errore' : n('lavoro') ? 'lavoro' : 'finito', parole: [[n('lavoro'), T.stato.working], [n('aspetta'), T.stato.waitingOnYou], [n('errore'), T.stato.failed], [fatti, T.stato.done], [vecchi, T.fermo.notUpdated]].filter(([x]) => x).map(([x, t]) => `${x} ${t}`).join(', ') }
}
/**
 * I figli di un nodo: un bollino col numero di quelli attivi, a cavallo dell'angolo in alto a sinistra, e
 * una fila di nodini appesi sotto, ognuno col suo filo. Un quadretto è un worker o un agente in un
 * terminale, un tondo un sub-agente. Chi lavora pulsa e ha i trattini che scorrono sul filo; chi aspetta è
 * ambra, chi è in errore rosso, chi ha finito resta spento. `nati` compaiono con un'animazione, `usciti`
 * (quelli che non ci sono più) si dissolvono, `spenti` hanno appena finito. Oltre `max` il resto è «+N».
 */
function figliSvg({ lista = [], usciti = [], nati = [], spenti = [], max = 5 }, sinistra, sotto, sopra, padre) {
  const tutti = [...lista.map((f) => ({ ...f, classe: nati.includes(f.chiave) ? ' nasce' : spenti.includes(f.chiave) ? ' spegne' : '' })), ...usciti.map((f) => ({ ...f, classe: ' esce' }))]
  if (!tutti.length) return { html: '', cassa: null }
  const c = contaFigli(lista)
  const mostrati = tutti.slice(0, tutti.length > max ? max - 1 : max), resto = tutti.length - mostrati.length
  const pip = (f, i) => {
    const px = sinistra + 9 + i * 15, py = sotto + 7
    const da = f.da ? T.tempo.forDur(durata((padre.ora - f.da) / 1000)) : ''
    const azione = f.classe === ' esce' ? '' : azApri(f.apri)
    const forma = f.tipo === 'sub' ? `<circle class="pip" cx="${px + 5}" cy="${py + 5}" r="5"/>` : `<rect class="pip" x="${px}" y="${py}" width="10" height="10"/>`
    return `<g class="figlio c-${f.vecchio ? 'fermo vecchio' : f.stato}${f.classe}${azione ? ' clic' : ''}"${azione}${info(T.figlio.kindOf(f.nome, TIPO_FIGLIO[f.tipo] || TIPO_FIGLIO.agente, padre.nome), f.classe === ' esce' ? T.figlio.gone : f.vecchio ? T.fermo.wasWorking : `${STATO_FIGLIO[f.stato] || f.stato}${da}`, f.agente, azione ? T.hover.itsTerminal : '')} aria-hidden="true"><path class="stelo" d="M${px + 5} ${sotto} V${py}"/>${forma}<rect class="presa" x="${px - 2.5}" y="${sotto}" width="15" height="19"/></g>`
  }
  const piu = resto ? `<text class="figli-piu" x="${sinistra + 9 + mostrati.length * 15}" y="${sotto + 16}"${info(T.figlio.moreStartedBy(plurale(resto, ...T.n.moreAgent), padre.nome), T.figlio.listedBelow)}>+${resto}</text>` : ''
  const lb = String(c.attivi).length * 5.6 + 8
  const bollo = c.attivi ? `<g class="figli-n c-${c.peggiore}"${info(T.figlio.startedBy(plurale(c.attivi, ...T.n.agent), padre.nome), c.parole)} aria-hidden="true"><rect x="${sinistra - 3}" y="${sopra - 6}" width="${lb}" height="12"/><text x="${sinistra - 3 + lb / 2}" y="${sopra + 3.2}" text-anchor="middle">${c.attivi}</text></g>` : ''
  return { html: `${bollo}<g class="figli">${mostrati.map(pip).join('')}${piu}</g>`, cassa: [sinistra + 4, sotto, sinistra + 14 + (mostrati.length + (resto ? 1.4 : 0)) * 15, sotto + 19] }
}

function nodo({ x, y, w, h, figli = null, ora = 0, k = 'fermo', forma = 'carta', ico, foto = null, sua = null, emoji = null, id = '', nome, righe = [], classe = '', azione = '', dice = [], pillola = null, aCapo = false, bollino = null }) {
  const conFoto = Boolean(sua) || haFoto(foto) || Boolean(emoji)
  const acceso = k === 'lavoro' || k === 'aspetta' || k === 'errore'
  const riquadro = `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"/>`
  let dentro, tasto = ''
  if (forma === 'riga') {
    const s = conFoto ? 30 : h >= 50 ? 24 : 20, ix = x - w / 2 + (conFoto ? 8 : 10), tx = ix + s + 9, larghi = Math.floor((w - (tx - (x - w / 2)) - 5) / 5.75)
    const y0 = y - (righe.length * 12) / 2 + 3, ultima = righe.length - 1
    const faccia = ritrattoSvg(ico, foto, ix, y - s / 2, s, id, sua, emoji)
    dentro = `${faccia}<text class="nome" x="${tx}" y="${y0}">${e(tronca(nome, Math.floor(larghi * 0.76)))}</text>${righe.map((r, i) => (pillola && i === ultima ? '' : `<text class="ruolo${i === ultima && righe.length > 1 ? ' st' : ''}" x="${tx}" y="${y0 + 12.5 * (i + 1)}">${e(stringi(r, larghi))}</text>`)).join('')}`
    if (pillola) {
      const t = stringi(righe[ultima], larghi - 3) + ' ›', yp = y0 + 12.5 * righe.length
      tasto = `<g class="pillola clic c-${k}"${pillola.azione}${info(pillola.dice)}${premibile(pillola.chiave, pillola.dice.join('. '))}><rect x="${tx - 4.5}" y="${yp - 10}" width="${Math.round(t.length * (id === 'l' ? 6.35 : 5.75) + 9)}" height="14"/><text class="ruolo" x="${tx}" y="${yp}">${e(t)}</text></g>`
    }
  } else {
    const s = conFoto ? 32 : h >= 62 ? 28 : 16, alto = y - h / 2, larghi = Math.floor((w - 8) / 5.75)
    const yn = alto + s + (conFoto ? 21 : h >= 62 ? 23 : 19)
    // Con `aCapo` il nome resta intero: se non sta su una riga va su due, e la carta è più alta di 13.
    const nomi = aCapo ? spezza(nome, lettereNome(w, h >= 62)) : [tronca(nome, lettereNome(w, h >= 62))]
    const giu = (nomi.length - 1) * 13
    // Il bollino: un conteggio in alto a destra, dentro la carta, quando la scritta sul filo non ci starebbe.
    // Dice «3 msg», non solo «3»: accanto al bollino dei figli (in alto a sinistra) un numero nudo si
    // leggerebbe come «tre agenti al lavoro».
    const scritto = bollino ? T.diagramma.msgBadge(bollino.n) : ''
    const lb = bollino ? scritto.length * 4.9 + 6 : 0
    const segno = bollino ? `<g class="bollino${bollino.vivo ? ' vivo' : ''}"><rect x="${x + w / 2 - lb - 4}" y="${alto + 4}" width="${lb}" height="12"/><text x="${x + w / 2 - 4 - lb / 2}" y="${alto + 13}" text-anchor="middle">${e(scritto)}</text></g>` : ''
    dentro = `${ritrattoSvg(ico, foto, x - s / 2, alto + 7, s, id, sua, emoji)}${nomi.map((t, i) => `<text class="nome${h >= 62 ? '' : ' piccolo'}" x="${x}" y="${yn + i * 13}" text-anchor="middle">${e(t)}</text>`).join('')}${righe.map((r, i) => `<text class="ruolo${i === righe.length - 1 ? ' st' : ''}" x="${x}" y="${yn + giu + 12.5 * (i + 1)}" text-anchor="middle">${e(tronca(r, larghi))}</text>`).join('')}${segno}`
  }
  const preme = azione ? premibile('nodo:' + nome, [nome, ...righe, bollino ? bollino.dice : '', dice[dice.length - 1] || ''].filter(Boolean).join(', ')) : ''
  const appesi = figli ? figliSvg(figli, x - w / 2, y + h / 2, y - h / 2, { nome, ora }).html : ''
  return `<g class="nodo c-${k}${acceso ? ' acceso' : ''}${azione ? ' clic' : ''} ${classe}"${azione}${dice.length ? info(dice) : ''}${preme}>${riquadro}${dentro}</g>${tasto}${appesi}`
}

function disegno(f, largo, vista = {}) {
  const id = largo ? 'l' : 's'
  const W = largo ? 900 : 340
  // Le misure dei due tagli: stretto (pannello laterale) e largo.
  const m = largo
    ? { tu: [450, 150], lead: [318, 210], uff: [600, 190], bot: 150, passoBot: 190, perRiga: 6, wk: 138, quanti: 6, pr: 210 }
    : { tu: [170, 128], lead: [88, 160], uff: [261, 146], bot: 104, passoBot: 999, perRiga: 3, wk: 104, quanti: 3, pr: 176 }
  // Le ordinate di worker e pull request scendono quando i bot stanno su più righe (vedi il punto 2).
  const Y = { tu: 29, lead: 116, bot: 242, wk: 362, pr: 444 }
  const A = { tu: 46, lead: 58, bot: 74, wk: 58, pr: 40 }
  const archi = [], scritte = [], nodi = []
  // I figli di un bot: quelli che ha adesso, più quelli appena spariti, che si dissolvono.
  const figliDi = (b) => {
    const usciti = (vista.usciti || []).filter((u) => u.bot === b.nome)
    return b.figli.length || usciti.length ? { lista: b.figli, usciti, nati: vista.nati || [], spenti: vista.spenti || [], max: largo ? 7 : 5 } : null
  }
  const dicePerFigli = (b) => (b.figli.length ? T.hover.startedAgents(plurale(b.figli.length, ...T.n.agent), contaFigli(b.figli).parole) : '')
  // I fili non hanno frecce: sono trattini che scorrono da chi passa il lavoro a chi lo riceve (il verso
  // in cui è scritto `d`). Su un filo acceso i trattini sono i buchi di una maschera che scorre, e sotto
  // passa una luce che li accende uno dopo l'altro, come il punto della prova 2; `n` (messaggi o attese
  // di oggi) dà il passo. Un filo fermo è tratteggiato e immobile, con un quadratino su chi riceve: lo
  // stesso quadratino compare sui fili accesi quando il CSS ferma tutto (prefers-reduced-motion).
  // Sopra ogni filo ce n'è uno invisibile e più largo, che prende il mouse: `extra` porta il riquadro
  // e, se c'è, l'azione. I fili si premono solo col mouse: da tastiera la stessa azione è sul nodo.
  let fili = 0
  const arco = (d, classe, n = 0, extra = '') => {
    const k = classe.split(' ')[0], t = tracciato(d)
    const capo = `<rect class="capo" x="${t.capo[0] - 2.5}" y="${t.capo[1] - 2.5}" width="5" height="5"/>`
    const tocco = extra ? `<path class="tocco${/data-(apri|vai|vista)=/.test(extra) ? ' clic' : ''}" d="${d}"${extra} aria-hidden="true"/>` : ''
    if (!ACCESI.includes(k)) return `<g class="flusso ${classe}"><path class="arco" d="${d}"/>${capo}</g>${tocco}`
    const m = `t-${id}-${fili++}`
    return `<g class="flusso mosso ${classe} v${k === 'vivo' || k === 'aspetta' ? passoDi(n) : 0}"><mask id="${m}" maskUnits="userSpaceOnUse" x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}"><path class="trattini" d="${d}"/></mask><g mask="url(#${m})"><path class="arco" d="${d}"/><path class="luce" d="${d}" pathLength="${Math.max(1, Math.round((t.lungo * 100) / GIRO))}"/></g>${capo}</g>${tocco}`
  }
  /** Mette in fila dei nodi larghi `w` attorno alle ascisse volute, senza sovrapporli e senza uscire. */
  const inFila = (volute, w) => {
    const xs = [...volute]
    // Il primo sta dentro il bordo sinistro prima di spingere gli altri: se lo si rimette dentro solo alla
    // fine (il worker del primo bot vuole stare a x = 0), finisce sopra il secondo.
    if (xs.length) xs[0] = Math.max(xs[0], 6 + w / 2)
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + w + 8)
    if (xs.length) xs[xs.length - 1] = Math.min(xs[xs.length - 1], W - 6 - w / 2)
    for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - w - 8)
    return xs.map((x) => Math.max(x, 6 + w / 2))
  }
  const messaggi = (n) => plurale(n, ...T.n.message)

  // 1. Tu in cima; sotto, il bot che tiene la coda (o la coda di tutti) e l'ufficio.
  const o = f.orchestratore
  const [xt, wt] = m.tu, [xh, wh] = m.lead, [xu, wu] = m.uff
  const yTu = Y.tu + A.tu / 2, yLead = Y.lead - A.lead / 2, yLeadGiu = Y.lead + A.lead / 2
  const chatLead = o ? (o.snodo ? azVai('coda') : azApri(o.chat, 'bot:' + o.nome)) : ''
  const clicChat = (b) => (b.snodo ? T.hover.queueView : T.hover.botChat(b.nome, b.chat))
  const codaDice = o ? [T.hover.toYou(o.nome), T.hover.tasksWaitingAnswer(plurale(o.aspettano, ...T.n.taskIs)), T.hover.inQueueOverall(o.inCoda), T.hover.queueView] : []
  if (o && o.aspettano) {
    const vaiCoda = azVai('coda') + info(codaDice)
    archi.push(arco(`M${xh + 22} ${yLead} L${xt - 22} ${yTu + 2}`, 'aspetta', o.aspettano, vaiCoda))
    scritte.push({ gruppo: 'alto', x: (xh + xt) / 2 - 8, y: (yLead + yTu) / 2 + 3, t: T.diagramma.nForYou(o.aspettano), classe: 'aspetta', ancora: 'end', extra: vaiCoda })
  } else archi.push(arco(`M${xt - 22} ${yTu} L${xh + 22} ${yLead - 2}`, o ? (o.stato[0] === 'lavoro' ? 'vivo' : 'fermo') : 'previsto tratto', 0, chatLead + info(T.hover.youTo(f.lead), o ? (o.snodo ? T.hover.nothingWaitingQueue : T.hover.nothingWaitingItsQueue) : T.hover.notOrcaBot, o ? clicChat(o) : '')))
  const u = f.ufficio
  if (u.aspettano) {
    const vaiUfficio = azVista('ufficio', 'aspetta te') + info(T.hover.officeToYou, T.hover.agentsWaitingTerminals(plurale(u.aspettano, ...T.n.agentIs)), T.hover.officeViewWaiting)
    archi.push(arco(`M${xu - 22} ${yLead} L${xt + 22} ${yTu + 2}`, 'aspetta', u.aspettano, vaiUfficio))
    scritte.push({ gruppo: 'alto', x: (xu + xt) / 2 + 8, y: (yLead + yTu) / 2 + 3, t: T.diagramma.nInTerminals(u.aspettano), classe: 'aspetta', ancora: 'start', extra: vaiUfficio })
  } else archi.push(arco(`M${xt + 22} ${yTu} L${xu - 22} ${yLead - 2}`, 'fermo', 0, azVista('ufficio', '') + info(T.hover.youToOffice, T.hover.agentsWorking(plurale(u.agenti, ...T.n.agent), u.lavoro), T.hover.noOneWaitingTerminals, T.hover.officeView)))
  // Un bot che tiene la coda tiene anche d'occhio l'ufficio; la coda di tutti no.
  if (!f.diTutti) archi.push(arco(`M${xh + wh / 2} ${Y.lead} L${xu - wu / 2 - 2} ${Y.lead}`, 'fermo tratto', 0, azVista('ufficio', '') + info(T.hover.leadOffice(f.lead), T.hover.leadWatches(f.lead), T.hover.officeView)))
  if (largo && !f.diTutti) scritte.push({ gruppo: 'alto', x: (xh + wh / 2 + xu - wu / 2) / 2, y: Y.lead - 6, t: T.diagramma.watches, classe: 'muto', ancora: 'middle', extra: '' })
  nodi.push({ x: xt, y: Y.tu, w: wt, h: A.tu, forma: 'riga', ico: '·tu', nome: T.diagramma.you, righe: [], classe: 'tu', dice: [T.diagramma.you, o ? (o.aspettano ? T.hover.tasksWaitingIn(plurale(o.aspettano, ...T.n.taskIs), o.snodo ? T.coda.theQueue : T.coda.botQueue(o.nome)) : T.hover.nothingWaitingIn(o.snodo ? T.coda.theQueue : T.coda.botQueue(o.nome))) : '', u.aspettano ? T.hover.agentsWaitingTerminals(plurale(u.aspettano, ...T.n.agentIs)) : T.hover.noAgentWaitingTerminals] })
  nodi.push(
    o
      ? { x: xh, y: Y.lead, w: wh, h: A.lead, k: o.stato[0], forma: 'riga', ico: o.ico, foto: o.foto, sua: o.sua, emoji: o.emoji, id, nome: o.nome, righe: [o.snodo ? T.diagramma.allBots : T.diagramma.orchestrator, o.stato[1]], azione: chatLead, figli: figliDi(o), ora: f.ora, dice: [o.snodo ? T.hover.queueNode : T.hover.orchestrator(o.nome), o.stato[1], dicePerFigli(o), T.hover.queueLine(o.aspettano, o.inCoda), o.consegne ? T.hover.handoffs(plurale(o.consegne, ...T.n.handoff), o.inCorso) : '', o.msgWorker ? T.hover.todayWithWorkers(messaggi(o.msgWorker)) : '', clicChat(o)], pillola: o.aspettano && o.stato[0] === 'aspetta' ? { azione: azVai('coda'), chiave: 'coda:' + o.nome, dice: [T.hover.tasksWaiting(plurale(o.aspettano, ...T.n.taskIs)), T.hover.queueView] } : null }
      : { x: xh, y: Y.lead, w: wh, h: A.lead, k: 'previsto', forma: 'riga', ico: f.lead, nome: f.lead, righe: [T.diagramma.orchestrator, T.diagramma.notBotYet], classe: 'previsto', dice: [T.hover.orchestrator(f.lead), T.hover.notOrcaBot, T.hover.checkSetting] }
  )
  const statoUfficio = u.aspettano ? `${u.aspettano} ${T.stato.waitingOnYou}` : u.errori ? `${u.errori} ${T.stato.failing}` : T.diagramma.noOneWaiting
  nodi.push({ x: xu, y: Y.lead, w: wu, h: A.lead, k: u.aspettano ? 'aspetta' : u.errori ? 'errore' : u.lavoro ? 'lavoro' : 'fermo', forma: 'riga', ico: '·ufficio', nome: T.diagramma.office, righe: [T.diagramma.ofWorking(u.lavoro, u.agenti), statoUfficio], azione: azVista('ufficio', ''), dice: [T.hover.officeNode, T.hover.agentsWorking(plurale(u.agenti, ...T.n.agent), u.lavoro), statoUfficio, u.incroci ? plurale(u.incroci, ...T.n.overlap) : '', T.hover.officeView] })

  // 2. I bot a cui passa il lavoro: quelli veri e quelli in arrivo, tratteggiati.
  // Fino a `perRiga` stanno su una riga, come sempre. Di più, vanno su più righe in una griglia, e il
  // diagramma si allunga: così le carte non si stringono e i nomi restano interi (al massimo su due righe).
  const n = f.bot.length, per = m.perRiga
  const piu = n > per
  const colonne = Math.max(1, Math.min(n, per)), spazio = piu ? 14 : 8
  // Tra una riga di bot e l'altra serve più posto quando qualcuno ha dei figli appesi sotto.
  const tra = [f.orchestratore, ...f.bot].some((b) => b && figliDi(b)) ? 34 : 24
  const wb = Math.min(m.bot, (W - 12 - (colonne - 1) * spazio) / colonne)
  const passo = piu ? wb + spazio : Math.min(m.passoBot, (W - 12) / Math.max(n, 1))
  const posto = (i) => ({ r: piu ? Math.floor(i / per) : 0, c: piu ? i % per : i })
  const xb = f.bot.map((_, i) => W / 2 + (posto(i).c - (colonne - 1) / 2) * passo)
  // Ogni riga è alta quanto serve al suo nome più lungo: 13 in più se uno va a capo.
  const maxNome = lettereNome(wb)
  const righeBot = Math.max(1, Math.ceil(n / per))
  const altaRiga = Array.from({ length: piu ? righeBot : 1 }, (_, r) => A.bot + (f.bot.some((b, i) => posto(i).r === r && spezza(b.nome, maxNome).length > 1) ? 13 : 0))
  const cima = [Y.bot - A.bot / 2]
  for (let r = 1; r < altaRiga.length; r++) cima.push(cima[r - 1] + altaRiga[r - 1] + tra)
  const ultima = altaRiga.length - 1
  const scende = cima[ultima] + altaRiga[ultima] - (Y.bot + A.bot / 2)
  Y.wk += scende
  Y.pr += scende
  // I canali: gli spazi tra una colonna e l'altra. Ci scendono i fili verso le righe sotto la prima (a
  // sinistra nel canale quelli che arrivano dal centro, a destra quelli che vanno ai worker), invece di passare
  // dietro le carte. I fili che fanno la stessa strada si sovrappongono e fanno da dorsale.
  const canale = (c) => W / 2 + (Math.min(c, colonne - 2) - (colonne - 1) / 2) * passo + passo / 2
  const arrivo = f.bot.map((_, i) => (posto(i).r ? canale(posto(i).c) - 3 : xb[i]))
  const mete = [...new Set(arrivo)].sort((x, y) => x - y)
  const lavoroDi = (b) => [b.consegne ? T.hover.handoffs(plurale(b.consegne, ...T.n.handoff), b.inCorso) : '', b.msgWorker ? T.hover.todayWithWorkers(messaggi(b.msgWorker)) : '']
  const filiBot = [], carteBot = []
  f.bot.forEach((b, i) => {
    const { r } = posto(i), x = xb[i], su = cima[r]
    // Dal centro parte un filo per ogni bot della prima riga e uno per ogni canale.
    const xa = xh + (mete.indexOf(arrivo[i]) - (mete.length - 1) / 2) * Math.min(26, (wh - 30) / Math.max(mete.length, 1))
    const chat = azApri(b.chat, 'bot:' + b.nome)
    const filo = chat + info(`${f.lead} ↔ ${b.nome}`, b.previsto ? T.hover.comingSoonNotBot : f.diTutti ? T.hover.openInQueue(plurale(b.aperti, ...T.n.openItem)) : T.hover.today(messaggi(b.msg)), b.vivo ? T.hover.active15 : '', clicChat(b))
    const via = r ? `M${xa} ${yLeadGiu} L${arrivo[i]} ${cima[0] - 12} V${su - 9} H${x} V${su - 2}` : `M${xa} ${yLeadGiu} L${x} ${su - 2}`
    // I fili accesi si disegnano dopo, sopra quelli fermi che fanno la stessa strada.
    filiBot.push([b.vivo && !b.previsto ? 1 : 0, arco(via, b.previsto ? 'previsto tratto' : b.vivo ? 'vivo' : 'fermo', b.msg, filo)])
    if (b.msg) scritte.push({ gruppo: 'bot', x: xa + (x - xa) * 0.6, y: yLeadGiu + (su - yLeadGiu) * 0.6 + 3, t: T.diagramma.msgToday(b.msg), classe: b.vivo ? 'vivo' : '', ancora: 'middle', extra: filo })
    // Con le carte strette lo stato si dice in meno lettere.
    const breve = wb < 96 ? b.stato[1].replace(T.stato.workersBusy, wb < 80 ? T.stato.working : T.stato.workersBusy).replace(T.stato.waitingOnYou, T.stato.forYou) : b.stato[1]
    carteBot.push({ x, y: su + altaRiga[r] / 2, w: wb, h: altaRiga[r], k: b.stato[0], ico: b.ico, foto: b.foto, sua: b.sua, emoji: b.emoji, id, nome: b.nome, aCapo: true, righe: [breve], classe: b.previsto ? 'previsto' : '', azione: chat, figli: figliDi(b), ora: f.ora, msg: b.msg ? { n: b.msg, vivo: b.vivo, dice: T.hover.todayWithLead(messaggi(b.msg), f.lead) } : null, dice: [T.hover.botKind(b.nome, b.previsto), b.previsto ? T.hover.notOrcaBotYet : b.stato[1], b.previsto ? '' : f.diTutti ? T.hover.openInQueue(plurale(b.aperti, ...T.n.openItem)) : T.hover.todayWithLead(messaggi(b.msg), f.lead), dicePerFigli(b), ...lavoroDi(b), clicChat(b)] })
  })
  archi.push(...filiBot.sort((x, y) => x[0] - y[0]).map((x) => x[1]))
  nodi.push(...carteBot)

  // 3. I worker con un agente dentro, sotto il bot che li ha mandati.
  const padroni = [...(o ? [{ b: o, x: xh, y: yLeadGiu, r: -1, c: 0 }] : []), ...f.bot.map((b, i) => ({ b, x: xb[i], y: cima[posto(i).r] + altaRiga[posto(i).r], ...posto(i) }))]
  const tutti = padroni.flatMap((p) => p.b.worker.map((w, j) => ({ ...w, padrone: p, voluta: p.b === o ? 0 : p.x + (j - (p.b.worker.length - 1) / 2) * (m.wk + 8) })))
  const mostrati = tutti.slice(0, tutti.length > m.quanti ? m.quanti - 1 : m.quanti)
  const resto = tutti.length - mostrati.length
  const ww = Math.min(m.wk, (W - 12 - (mostrati.length + (resto ? 1 : 0) - 1) * 8) / Math.max(mostrati.length + (resto ? 1 : 0), 1))
  const xw = inFila([...mostrati.map((w) => w.voluta), ...(resto ? [W] : [])], ww)
  const yWk = Y.wk - A.wk / 2, yWkGiu = Y.wk + A.wk / 2, yPr = Y.pr - A.pr / 2
  for (const p of padroni) {
    const b = p.b
    // Due righe accanto al filo che scende dal bot: le consegne, e i messaggi di oggi coi worker. Con i bot
    // su più righe non c'è posto: quei numeri restano nel riquadro che appare passando sopra il bot.
    const et = piu || b === o ? [] : [b.consegne ? T.hover.handoffs(plurale(b.consegne, ...T.n.handoff), b.inCorso) : '', b.msgWorker ? T.diagramma.msgToday(b.msgWorker) : ''].filter(Boolean)
    const aDestra = p.x + 12 + Math.max(0, ...et.map((t) => t.length)) * 5.8 < W - 4
    et.forEach((t, i) => scritte.push({ gruppo: 'lavoro', x: p.x + (aDestra ? 12 : -12), y: p.y + 15 + i * 12.5, t, classe: b.inCorso ? 'vivo' : '', ancora: aDestra ? 'start' : 'end', extra: info(`${b.nome} → ${T.diagramma.itsWorkers}`, ...lavoroDi(b)) }))
  }
  mostrati.forEach((w, i) => {
    const k = STATO_WORKER[w.stato] || 'fermo'
    const da = w.da ? ' ' + durata((f.ora - w.da) / 1000) : '', per = w.da ? T.tempo.forDur(durata((f.ora - w.da) / 1000)) : ''
    const p = w.padrone, capo = p.b
    const terminale = azApri(w.apri)
    const dice = [T.hover.workerOf(w.nome, capo.nome), `${dici(w.stato)}${per}`, w.pr ? T.hover.prChecks(w.pr.numero, CONTROLLI[w.pr.controlli] || T.pr.none) : T.hover.noPr, terminale ? T.hover.itsTerminal : '']
    // I worker del bot al centro stanno a sinistra: il loro filo gira attorno ai bot lungo il margine, invece di passarci dietro.
    // Quelli di un bot che ha altre righe di bot sotto scendono per il canale accanto alla sua colonna.
    const via = o && capo === o ? `M${xh - wh / 2} ${Y.lead} H3 V${yWk - 10} H${xw[i]} V${yWk - 2}` : p.r < ultima ? `M${p.x} ${p.y} V${p.y + 8} H${canale(p.c) + 3} V${yWk - 16} H${xw[i]} V${yWk - 2}` : `M${p.x} ${p.y} L${xw[i]} ${yWk - 2}`
    archi.push(arco(via, k === 'lavoro' ? 'vivo' : k === 'aspetta' ? 'aspetta' : k === 'finito' ? 'finito' : 'fermo', capo.msgWorker, terminale + info(`${capo.nome} → ${w.nome}`, `${dici(w.stato)}${per}`, ...lavoroDi(capo), terminale ? T.hover.workerTerminal : '')))
    if (w.pr) {
      const versoPr = info(T.hover.workerPrLine(w.nome, w.pr.numero), T.pr.checks(CONTROLLI[w.pr.controlli] || T.pr.none))
      archi.push(arco(`M${xw[i]} ${yWkGiu} L${m.tu[0] + (xw[i] - m.tu[0]) * 0.2} ${yPr - 2}`, w.pr.controlli === 'lavoro' ? 'vivo' : w.pr.controlli || 'fermo', 0, versoPr))
      scritte.push({ gruppo: 'pr', x: xw[i] + (m.tu[0] - xw[i]) * 0.4 + (xw[i] < m.tu[0] ? -8 : 8), y: yWkGiu + (yPr - yWkGiu) * 0.5 + 4, t: T.pr.num(w.pr.numero), classe: '', ancora: xw[i] < m.tu[0] ? 'end' : 'start', extra: versoPr })
    }
    nodi.push({ x: xw[i], y: Y.wk, w: ww, h: A.wk, k, ico: '·worker', nome: w.nome, righe: [dici(w.stato) + da], azione: terminale, dice })
  })
  if (resto) nodi.push({ x: xw[mostrati.length], y: Y.wk, w: ww, h: A.wk, k: 'previsto', ico: '·worker', nome: `+${resto}`, righe: [T.n.moreWorker[resto === 1 ? 0 : 1]], classe: 'previsto', azione: azVista('ufficio', ''), dice: [`${plurale(resto, ...T.n.moreWorker)}`, T.hover.noRoom, T.hover.officeView] })
  if (!tutti.length) {
    const fermi = padroni.reduce((s, p) => s + p.b.fermi, 0)
    nodi.push({ x: W / 2, y: Y.wk, w: Math.max(m.wk, 168), h: A.wk, k: 'previsto', ico: '·worker', nome: T.diagramma.workers, righe: [fermi ? T.diagramma.noneWorkingIdle(plurale(fermi, ...T.n.idleTab)) : T.diagramma.noneWorking], classe: 'previsto', dice: [T.diagramma.workers, T.hover.noWorkerAgent, fermi ? plurale(fermi, ...T.n.idleTab) : ''] })
  }
  // 4. Le pull request: ci arriva il lavoro dei worker.
  if (!mostrati.some((w) => w.pr)) archi.push(arco(`M${m.tu[0]} ${yWkGiu} L${m.tu[0]} ${yPr - 2}`, 'fermo tratto', 0, info(T.hover.workersToPr, T.hover.noWorkerPr)))
  const statoPr = f.pr.aperte ? `${f.pr.aperte} ${T.stato.open}${f.pr.rosse ? ` · ${f.pr.rosse} ${T.stato.failing}` : ''}` : T.diagramma.noneOpen
  nodi.push({ x: m.tu[0], y: Y.pr, w: m.pr, h: A.pr, k: f.pr.rosse ? 'errore' : 'fermo', forma: 'riga', ico: '·pr', nome: T.diagramma.pullRequests, righe: [statoPr], dice: [T.diagramma.pullRequests, statoPr, T.hover.prLands] })

  // 5. Le scritte accanto ai fili restano solo dove non toccano niente: né una carta né un'altra scritta.
  // Quelle in alto («2 per te») hanno sempre il loro posto. I messaggi di oggi tra il centro e i bot stanno sui
  // fili tutti insieme oppure, se anche una sola non ci sta (o i bot sono su più righe), diventano tutti
  // bollini sulle carte: mai metà e metà. Lo stesso per le consegne sotto i bot, che se non ci stanno si
  // leggono nel riquadro al passaggio del mouse; le PR una per una.
  const lc = largo ? 6.8 : 5.9
  const cassa = (l) => {
    const lungo = l.t.length * lc + 4, x0 = l.ancora === 'middle' ? l.x - lungo / 2 : l.ancora === 'end' ? l.x - lungo : l.x
    return [x0, l.y - 9, x0 + lungo, l.y + 2.5]
  }
  const tocca = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
  const pieno = nodi.map((d) => [d.x - d.w / 2 - 2, d.y - d.h / 2 - 2, d.x + d.w / 2 + 2, d.y + d.h / 2 + 2])
  // Anche i nodini appesi sotto un bot occupano posto: una scritta non ci passa sopra.
  for (const d of nodi) {
    const cassa = d.figli ? figliSvg(d.figli, d.x - d.w / 2, d.y + d.h / 2, d.y - d.h / 2, { nome: d.nome, ora: f.ora }).cassa : null
    if (cassa) pieno.push(cassa)
  }
  const libera = (l) => !(cassa(l)[0] < 2 || cassa(l)[2] > W - 2) && !pieno.some((r) => tocca(cassa(l), r))
  const tenute = scritte.filter((l) => l.gruppo === 'alto')
  for (const l of tenute) pieno.push(cassa(l))
  const provaTutte = (gruppo, vietate = false) => {
    const sue = scritte.filter((l) => l.gruppo === gruppo)
    const messe = []
    const stanno = !vietate && sue.every((l) => libera(l) && !messe.some((c) => tocca(cassa(l), c)) && messe.push(cassa(l)))
    if (stanno) {
      tenute.push(...sue)
      pieno.push(...messe)
    }
    return stanno
  }
  if (!provaTutte('bot', piu)) for (const d of carteBot) d.bollino = d.msg
  provaTutte('lavoro')
  for (const l of scritte.filter((x) => x.gruppo === 'pr')) {
    if (!libera(l)) continue
    tenute.push(l)
    pieno.push(cassa(l))
  }


  const etichetta = T.diagramma.ariaLabel(f.diTutti ? T.diagramma.ariaLabelQueueAll : T.diagramma.ariaLabelLead(f.lead), plurale(f.bot.length, ...T.n.otherBot), plurale(tutti.length, ...T.n.worker))
  return `<svg class="${largo ? 'largo' : 'stretto'}" viewBox="0 0 ${W} ${Y.pr + A.pr / 2 + 8}" role="group" aria-label="${e(etichetta)}"><defs>${bicromia(id)}</defs>${archi.join('')}${tenute.map((l) => scritta(l.x, l.y, l.t, l.classe, l.ancora, l.extra)).join('')}${nodi.map(nodo).join('')}</svg>`
}

/** Il diagramma nei due tagli (il CSS mostra quello adatto alla larghezza) con la sua legenda. */
export function diagramma(q, ora, vista = {}) {
  const f = { ...flusso(q, ora), ora }
  return `<figure class="diagramma">${disegno(f, false, vista)}${disegno(f, true, vista)}</figure>
    <div class="legenda fili">
      <span class="c-aspetta"><i class="filo spesso"></i>${T.diagramma.legend.waiting}</span>
      <span class="c-lavoro"><i class="filo spesso"></i>${T.diagramma.legend.active}</span>
      <span class="c-finito"><i class="filo medio"></i>${T.diagramma.legend.done}</span>
      <span class="c-filo"><i class="filo"></i>${T.diagramma.legend.quiet}</span>
      <span class="c-filo"><i class="filo tratto"></i>${T.diagramma.legend.soon}</span>
      <span class="c-lavoro"><i class="pip-l"></i>${T.diagramma.legend.agentStarted}</span>
      <span class="c-lavoro"><i class="pip-l tondo"></i>${T.diagramma.legend.subAgent}</span>
      <span class="muto">${plurale(f.messaggiOggi, ...T.n.messageToday)}</span>
    </div>
    ${comeSiLegge(T.diagramma.help(f.diTutti ? '' : T.diagramma.helpMsg(e(f.lead))))}`
}

// ---------- la coda: «Decidi adesso», i contatori, le corsie (per progetto, o per bot) ----------
// Pallino, progetto, testo e scadenza di ogni voce li ha già letti il worker dal titolo (src/norma.ts).
// Qui si disegna, in sola lettura: per rispondere si va nella chat del bot che ha l'item.
const LETTERE = 'ABCDEFG'
const PRIORITA = T.coda.priority
const STATO_BREVE = { needs_you: ['aspetta', T.stato.waitingOnYou], in_progress: ['lavoro', T.stato.inProgress], planned: ['previsto', T.stato.planned] }
const SENZA_PROGETTO = T.coda.noProject
const nomeCorsia = (p) => p || SENZA_PROGETTO

/** Il pallino della priorità: il colore, e una forma diversa per i due estremi (P0 con l'anello, P3 vuoto). */
const pallino = (v) => {
  const dice = v.conPallino ? T.coda.priorityLine(v.priorita, PRIORITA[v.priorita]) : T.coda.noPriority
  return `<span class="pal p${v.priorita}${v.conPallino || v.priorita < 3 ? '' : ' senza'}" role="img" aria-label="${dice}" title="${dice}"></span>`
}

const giorniTra = (a, b) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000)
/**
 * La scadenza a parole, in inglese come tutto il pannello: «today 17:00», «tomorrow», «in 2 days»,
 * «1 Dec», e «overdue…» quando è passata.
 * `tono`: scaduto, oggi, presto (entro la settimana) o poi. Null: la voce non ha scadenza.
 */
export function scadenzaUmana(v, ora) {
  if (!v.scadenza) return null
  const d = new Date(v.scadenza), adesso = new Date(ora), g = giorniTra(d, adesso)
  const hm = v.conOra ? `${d.getHours()}:${due(d.getMinutes())}` : ''
  if (v.scadenza < ora) return { tono: 'scaduto', testo: g === 0 ? (hm ? T.scad.overdueSince(hm) : T.scad.overdueToday) : g === -1 ? T.scad.overdueYesterday : T.scad.overdueBy(-g) }
  if (g === 0) return { tono: 'oggi', testo: hm ? T.scad.todayAt(hm) : T.scad.today }
  if (g === 1) return { tono: 'presto', testo: hm ? T.scad.tomorrowAt(hm) : T.scad.tomorrow }
  if (g <= 6) return { tono: 'presto', testo: T.scad.inDays(g) }
  return { tono: 'poi', testo: `${d.getDate()} ${MESI[d.getMonth()]}${d.getFullYear() === adesso.getFullYear() || g < 300 ? '' : ' ' + d.getFullYear()}` }
}
const scadenza = (v, ora) => {
  const s = scadenzaUmana(v, ora)
  return s ? `<span class="scad ${s.tono}" title="${T.scad.due(e(giornoOra(v.scadenza, ora).replace(/ ?23:59$/, '') || T.scad.today))}">${e(s.testo)}</span>` : ''
}
/** L'età di una voce: da quando è nata (o, se non si sa, dall'ultima attività). */
const eta = (v, ora) => (v.nato || v.da ? durata((ora - (v.nato || v.da)) / 1000) : '')

/**
 * La domanda aperta di una voce con le sue opzioni, da leggere e basta. Il contesto (l'ultimo commento)
 * si mostra solo quando una domanda non c'è. `tag`: span dentro un tasto, div fuori.
 */
function domanda(v, tag = 'div') {
  const d = v.domanda
  if (!d || !(d.chiede || d.contesto)) return `<${tag} class="chiede muto">${T.coda.noQuestion}</${tag}>`
  if (!d.chiede) return `<${tag} class="contesto">${e(d.contesto)}</${tag}>`
  const opzioni = d.opzioni.length
    ? `<${tag} class="opz" role="list">${d.opzioni.map((o, i) => `<span class="op${d.consigliata === i ? ' si' : ''}" role="listitem"><b class="lettera">${LETTERE[i] || '·'}</b><span>${e(o)}</span>${d.consigliata === i ? `<span class="consigliata">${T.coda.recommended}</span>` : ''}</span>`).join('')}</${tag}>`
    : ''
  const altre = d.altre ? ` <span class="muto">${T.coda.andMoreQuestions(plurale(d.altre, ...T.n.moreQuestion))}</span>` : ''
  return `<${tag} class="chiede">${e(d.chiede)}${altre}</${tag}>${opzioni}`
}

/** Dove si risponde a una voce: la chat del bot che ce l'ha. Se Orca non la trova (o non si sa dov'è), la sua scheda nella Panoramica. */
const versoChat = (q, v) => {
  const nome = (v && v.bot) || q.coda.bot
  const chat = chatDi(q.bot.find((b) => b.nome === nome))
  return { azione: azApri(chat, 'bot:' + nome), dice: chat ? T.coda.answerIn(nome) : T.coda.goCard(nome) }
}

/** Una decisione in cima: tutta la carta è un tasto che apre la chat del bot. Qui non si risponde. */
function decisione(v, ora, verso) {
  const da = eta(v, ora)
  return `<li class="dec p${v.priorita}"><button type="button" class="dec-tasto"${verso.azione} data-k="dec:${e(v.uid)}" title="${e(verso.dice)}">
    <span class="dec-testa">${pallino(v)}<span class="prog taglia">${e(nomeCorsia(v.progetto))}</span>${scadenza(v, ora)}</span>
    <span class="dec-cosa">${e(v.testo)}</span>
    ${domanda(v, 'span')}
    <span class="dec-piede">${da ? `<span class="muto num">${T.coda.open(da)}</span>` : ''}<span class="va">${e(verso.dice)} ›</span></span>
  </button></li>`
}

/** Una voce in corsia: pallino, testo senza il progetto, stato breve, età, scadenza. Un clic apre la domanda. */
function voceCorsia(v, ora, aperta, verso) {
  const [k, testo] = STATO_BREVE[v.stato] || [chiave((STATO_ITEM[v.stato] || ['fermo'])[0]), (STATO_ITEM[v.stato] || [0, v.stato])[1]]
  const da = eta(v, ora), id = `task-${v.numero}`
  return `<li class="voce p${v.priorita}${v.conPallino || v.priorita < 3 ? '' : ' grigia'}${aperta ? ' aperta' : ''}"><button type="button" class="voce-testa" data-voce="${e(v.uid)}" data-k="voce:${e(v.uid)}" aria-expanded="${aperta ? 'true' : 'false'}" aria-controls="${id}">${pallino(v)}<span class="cosa">${e(v.testo)}</span><span class="sotto"><span class="st c-${k}">${e(testo)}</span>${da ? `<span class="num">${T.coda.open(da)}</span>` : ''}${scadenza(v, ora)}</span></button>
    <div class="dettaglio" id="${id}"${aperta ? '' : ' hidden'}>${domanda(v)}${v.chi ? `<div class="muto">${e(v.chi)}</div>` : ''}<button type="button" class="collega"${verso.azione}>${e(verso.dice)} ›</button></div></li>`
}

const FILTRI = { oggi: (v) => v.oggi, decidere: (v) => v.stato === 'needs_you', corso: (v) => v.stato === 'in_progress' }
const NIENTE = T.coda.nothing

/**
 * Le corsie: le voci raggruppate per progetto, nell'ordine deciso dal worker, già in ordine di priorità.
 * `filtro` è «oggi», «decidere», «corso» o niente; `progetto` tiene una corsia sola (undefined: tutte).
 */
export function corsie(c, filtro = '', progetto = undefined) {
  const passa = FILTRI[filtro] || (() => true)
  return (c.progetti || [])
    .filter((p) => progetto === undefined || p === progetto)
    .map((p) => {
      const tutte = c.voci.filter((v) => v.progetto === p)
      return { progetto: p, nome: nomeCorsia(p), aperti: tutte.length, voci: tutte.filter(passa) }
    })
    .filter((x) => x.voci.length)
}

/** I tre contatori: oggi, da decidere, in corso. Si premono: filtrano le corsie. */
function contatori(c, filtro) {
  const uno = (id, n, nome, k) => `<button type="button" class="conto-coda c-${k}${n ? '' : ' zero'}" data-filtro-coda="${filtro === id ? '' : id}" data-k="conto:${id}" aria-pressed="${filtro === id}" title="${filtro === id ? T.coda.clearFilter : T.coda.showOnly}"><b class="num">${n}</b><span>${nome}</span></button>`
  return `<div class="conti" role="group" aria-label="${T.coda.threeNumbers}">${uno('oggi', c.oggi, T.coda.today, 'p0')}${uno('decidere', c.aspettano, T.coda.toDecide, 'aspetta')}${uno('corso', c.inCorso, T.stato.inProgress, 'lavoro')}</div>`
}

/**
 * La vista «Coda». Dall'alto: «Decidi adesso» (al massimo cinque), i tre contatori, i filtri, le corsie.
 * `vista`: filtro («oggi», «decidere», «corso»), progetto (una corsia sola), chiuse (le corsie richiuse,
 * ricordate nello storage del plugin), aperte (le voci con la domanda aperta).
 */
export function coda(q, ora, vista = {}) {
  const c = q.coda
  if (!c.presente) return `<p class="niente">${senzaCoda(q)}</p>`
  if (!c.voci.length) return `<div class="quieto"><b>${T.coda.empty}</b><span>${c.diTutti ? T.coda.noBotItem : T.coda.botNothingPending(e(c.bot))}</span></div>${fuoriCoda(q)}`
  const verso = (v) => versoChat(q, v)
  // Le corsie sono i progetti letti dai titoli, oppure i bot quando la coda è di tutti.
  const cosa = c.diTutti ? T.coda.bot : T.coda.project
  const perUid = new Map(c.voci.map((v) => [v.uid, v]))
  const prime = c.decidi.map((uid) => perUid.get(uid)).filter(Boolean)
  const filtro = vista.filtro in FILTRI ? vista.filtro : ''
  const progetto = typeof vista.progetto === 'string' && c.progetti.includes(vista.progetto) ? vista.progetto : undefined
  const chiuse = new Set(vista.chiuse || []), aperte = new Set(vista.aperte || [])
  const fila = corsie(c, filtro, progetto)
  const quante = fila.reduce((n, x) => n + x.voci.length, 0)

  const decidi = prime.length
    ? `<ol class="decidi">${prime.map((v) => decisione(v, ora, verso(v))).join('')}</ol>
      <p class="sola-lettura muto">${T.coda.readOnly(c.diTutti ? T.coda.theBot : e(c.bot))}${c.aspettano > prime.length ? T.coda.otherWait(c.aspettano - prime.length) : ''}</p>`
    : `<div class="quieto"><b>${T.coda.nothingToDecideToday}</b><span>${T.coda.whenChoice(c.diTutti ? T.coda.itShowsUp : T.coda.botPutsIt(e(c.bot)))}</span></div>`

  const tasto = (id, nome, n) => `<button type="button" data-filtro-coda="${id}" data-k="filtro:${id || 'tutto'}" aria-pressed="${filtro === id && (id || progetto === undefined)}">${nome} <b class="num">${n}</b></button>`
  const scelta = `<label class="scegli"><span class="suono">${c.diTutti ? T.coda.labelBot : T.coda.labelProject}</span><select data-filtro-progetto data-k="filtro:progetto"${progetto === undefined ? '' : ' class="scelto"'}><option value="·tutti"${progetto === undefined ? ' selected' : ''}>${T.coda.allOf(cosa)}</option>${c.progetti.map((p) => `<option value="${e(p)}"${p === progetto ? ' selected' : ''}>${e(nomeCorsia(p))} (${c.voci.filter((v) => v.progetto === p).length})</option>`).join('')}</select></label>`
  const filtri = `<div class="filtri-coda" role="group" aria-label="${T.coda.filtersLabel}">${tasto('', T.coda.all, c.voci.length)}${tasto('decidere', T.coda.toDecide, c.aspettano)}${scelta}</div>`

  const corsia = (x) => {
    const chiusa = chiuse.has(x.progetto) && progetto === undefined
    const urgenti = [0, 1].map((p) => [p, x.voci.filter((v) => v.priorita === p).length]).filter(([, n]) => n)
    const id = 'corsia-' + (c.progetti.indexOf(x.progetto) + 1)
    return `<section class="corsia${chiusa ? ' chiusa' : ''}"><h3><button type="button" class="corsia-testa" data-corsia="${e(x.progetto)}" data-k="corsia:${e(x.progetto)}" aria-expanded="${chiusa ? 'false' : 'true'}" aria-controls="${id}"><span class="apre" aria-hidden="true">${chiusa ? '▸' : '▾'}</span><span class="nome taglia">${e(x.nome)}</span>${urgenti.length ? `<span class="urgenti">${urgenti.map(([p, n]) => `<span class="u" title="${n} ${PRIORITA[p]}"><span class="pal p${p}" aria-hidden="true"></span><span class="num">${n}</span><span class="suono"> ${PRIORITA[p]}</span></span>`).join('')}</span>` : ''}<span class="quanti num" title="${plurale(x.aperti, ...T.n.openItem)}">${x.voci.length === x.aperti ? x.aperti : T.coda.nOf(x.voci.length, x.aperti)}</span></button></h3>
      <ol class="voci" id="${id}"${chiusa ? ' hidden' : ''}>${x.voci.map((v) => voceCorsia(v, ora, aperte.has(v.uid), verso(v))).join('')}</ol></section>`
  }
  const vuoto = `<div class="quieto"><b>${NIENTE[filtro]}${progetto === undefined ? '' : T.coda.inLane(e(nomeCorsia(progetto)))}</b><span><button type="button" class="collega" data-filtro-coda="">${T.coda.showWhole}</button></span></div>`

  return `<div class="vcoda">
    <section class="vc-decidi" id="decidi" tabindex="-1" aria-label="${T.coda.decideNow}">
      <h2>${T.coda.decideNow}${prime.length ? ` <small class="num">${c.aspettano > prime.length ? T.coda.nOf(prime.length, c.aspettano) : prime.length}</small>` : ''}</h2>
      ${decidi}
    </section>
    <section class="vc-tutto" aria-label="${T.coda.wholeBy(cosa)}">
      ${contatori(c, filtro)}
      <h2>${T.coda.by(cosa)} <small class="num">${filtro || progetto !== undefined ? T.coda.nOf(quante, c.voci.length) : `${c.voci.length} ${T.stato.open}`}</small></h2>
      ${filtri}
      <div class="corsie">${fila.map(corsia).join('') || vuoto}</div>
      <p class="legenda-p muto" aria-hidden="true">${PRIORITA.map((t, p) => `<span><span class="pal p${p}"></span>${t}</span>`).join('')}</p>
      ${fuoriCoda(q)}
    </section>
  </div>`
}

/** Perché la coda non si vede: il bot scelto non è tra i bot, non ci sono bot, oppure la CLI non risponde. */
const senzaCoda = (q) => (!q.fonti.cli.ok ? T.coda.noCli(laCoda(q.coda)) : q.coda.diTutti ? T.coda.noBots : T.coda.botNotFound(e(q.coda.bot)))

/** Quello che aspetta una risposta ma non sta in coda: si dice in una riga, senza metterlo in coda. */
function fuoriCoda(q) {
  const fuori = q.attese.filter((a) => !(a.origine === 'item' && (q.coda.diTutti || a.chi === q.coda.bot)))
  return fuori.length ? `<ul class="fuori">${fuori.map((a) => `<li class="c-aspetta">${segno('aspetta')}<span>${T.coda.outside(e(a.chi), e(a.dove))} ${e(a.domanda ? a.domanda.chiede || a.titolo : a.titolo)}${a.apri ? ` <button type="button" class="tasto"${apri(a.apri)}>${T.openInOrca}</button>` : ''}</span></li>`).join('')}</ul>` : ''
}

/**
 * La coda in breve, dentro la scheda del bot che la tiene (o in fondo alla Panoramica, se è di tutti): i tre numeri e i titoli di «Decidi adesso».
 * Tutto il resto è nella vista «Coda», a un clic.
 */
export function codaInBreve(q, ora) {
  const c = q.coda
  const apre = `<section class="coda c-${c.decidi.length ? 'aspetta' : 'quieto'}" id="coda" aria-label="${T.coda.inShort(laCoda(c))}"><h3 class="coda-testa"><span class="t">${laCoda(c).replace(/^t/, 'T')}</span></h3>`
  if (!c.presente) return `${apre}<p class="niente">${senzaCoda(q)}</p></section>`
  if (!c.voci.length) return `${apre}<p class="niente">${c.diTutti ? T.coda.noBotItemYet : T.coda.botNoTasks(e(c.bot))}</p></section>`
  const perUid = new Map(c.voci.map((v) => [v.uid, v]))
  const prime = c.decidi.map((uid) => perUid.get(uid)).filter(Boolean)
  const numero = (n, nome, k) => `<span class="c-${k}${n ? ' vivo' : ''}"><b class="num">${n}</b> ${nome}</span>`
  return `${apre}<p class="breve-numeri">${numero(c.oggi, T.coda.today, 'p0')}<span class="muto" aria-hidden="true">·</span>${numero(c.aspettano, T.coda.toDecide, 'aspetta')}<span class="muto" aria-hidden="true">·</span>${numero(c.inCorso, T.stato.inProgress, 'lavoro')}</p>
    ${prime.length ? `<ol class="breve">${prime.map((v) => `<li>${pallino(v)}<span class="cosa taglia">${v.progetto ? `<span class="prog">${e(v.progetto)}</span> ` : ''}${e(v.testo)}</span>${scadenza(v, ora)}</li>`).join('')}</ol>` : `<p class="muto breve-niente">${T.coda.briefNothing}</p>`}
    <button type="button" class="tasto apri-coda"${azVista('coda')}>${T.coda.openQueue}</button></section>`
}

/** Il titolo di un item senza pallino né sveglia, se è una voce della coda: «Progetto · cosa». */
const titoloPulito = (q, b, item) => {
  const v = q.coda.voci.find((x) => x.bot === b.nome && x.numero === item.numero)
  // Con la coda di tutti la corsia è il bot, e il progetto sta già nel testo.
  return v ? (q.coda.diTutti ? v.testo : `${v.progetto ? v.progetto + ' · ' : ''}${v.testo}`) : item.titolo
}

function tabellaBot(b, ora, n, q, vista) {
  const [k, testo] = statoBot(b)
  const testa = `<div class="bot-testa">${ritratto({ nome: b.nome, ico: chiaveIcona(b), bot: true, foto: b.foto, sua: suaDi(b), emoji: b.emoji ?? null })}<div class="bot-chi"><div class="bot-riga"><span class="bot-nome taglia">${e(b.nome)}</span><span class="stato ${k}">${segno(k)}${e(testo)}</span></div><p class="bot-cosa">${e(b.specialita)}</p>${chatDi(b) ? `<button type="button" class="collega chat"${azApri(chatDi(b))}>${T.bot.openChat}</button>` : ''}</div></div>`
  // La scheda personaggio: la sessione del bot come la vede il Motore (la sua casa è ~/.orca/bots/<nome>).
  const s = sessioneDi(q, b.nome)
  // Lo stato della sessione: quello del file di stato, se è fresco; altrimenti quello che dice Orca del bot.
  const ss = s && s.statoVecchio && b.sessione ? null : s
  const secondi = ss ? (ss.daSecondi ?? (ss.da ? (ora - ss.da) / 1000 : null)) : b.sessione && b.sessione.da ? (ora - b.sessione.da) / 1000 : null
  const statoSessione = ss ? ss.stato : b.sessione ? b.sessione.stato : ''
  const sessione = statoSessione ? `<span class="c-${chiave(statoSessione)} vivo">${e(dici(statoSessione))}</span>${secondi === null ? '' : T.tempo.forDur(durata(secondi))}${ss && ss.statoVecchio ? ` · ${T.fermo.notUpdated}` : ''}` : ''
  // Col file di stato fermo i suoi ultimi dati restano (segnati «not updated»): la riga serve solo se non ce ne sono.
  const perche = s && s.vecchio !== undefined ? '' : q.fonti.ufficioDa !== 'motore' ? T.bot.stateNotUpdated : s ? '' : T.bot.stateNoSession
  // Senza il file di stato facoltativo modello, sforzo, contesto e cache non esistono: si mostra solo la sessione.
  const prime = rigaStat('agente', T.stat.agent, e(s ? s.agente : b.agente || '')) + rigaStat('sessione', T.stat.session, sessione)
  const scheda = q.fonti.motore.spento ? `<span class="stat">${prime}</span>` : `${statistiche(s, ora, prime)}${perche ? `<p class="senza muto">${T.bot.cannotRead(perche)}</p>` : ''}`
  // La scheda del bot che tiene la coda la porta dentro: sotto la scheda nel pannello stretto, accanto in quello largo.
  const eLaCoda = !q.coda.diTutti && b.nome === q.coda.bot
  const chiude = (resto) => `<article class="bot box c-${k}${k === 'fermo' ? '' : ' acceso'}${eLaCoda ? ' con-coda' : ''}" data-bot="${e(b.nome)}" tabindex="-1"><span class="tag">${nn(n)} ${T.bot.tag}</span>${eLaCoda ? `<div class="bot-sx">${testa}${scheda}${resto}</div>${codaInBreve(q, ora)}` : `${testa}${scheda}${resto}`}</article>`
  if (b.soloMotore) return chiude(`<div class="blocco muto">${T.bot.cliDown}</div>`)
  // Una riga che direbbe solo «niente» (nessun agente avviato, nessuna automazione, niente di recente) non si scrive.
  const riga = (nome, valore, vuota = false) => (vuota ? '' : `<tr><th scope="row">${nome}</th><td>${valore}</td></tr>`)
  const chat = b.chat[0]

  // Adesso: il task attivo (una consegna in corso o un item in corso), poi l'ultima richiesta ricevuta.
  const consegna = b.item.flatMap((i) => i.consegne).find((x) => x.stato === 'working')
  const inCorso = b.item.find((i) => i.stato === 'in_progress')
  const attivo = consegna ? T.bot.followingWorker(e(consegna.titolo), consegna.inizio ? durata((ora - consegna.inizio) / 1000) : '') : inCorso ? T.bot.inProgressTitle(e(titoloPulito(q, b, inCorso))) : ''
  const richiesta = chat && chat.ultimaRichiesta ? `${T.bot.lastRequest(chat.ultimaAttivita ? fa(chat.ultimaAttivita, ora) : '')} ${e(chat.ultimaRichiesta)}` : ''
  const adesso = [b.sessione && b.sessione.stato === 'al lavoro' ? `<span class="c-lavoro vivo">${T.bot.answering(b.sessione.da ? durata((ora - b.sessione.da) / 1000) : '')}</span>` : '', attivo, richiesta].filter(Boolean).map((t) => `<span class="pezzo">${t}</span>`).join('') || `<span class="muto">${T.bot.listeningNoRequest}</span>`

  // Item aperti: i numeri; i titoli solo per chi non è l'orchestratore (i suoi sono la coda, nella stessa scheda).
  const conta = (s) => b.item.filter((i) => i.stato === s).length
  const numeri = [[conta('needs_you'), T.stato.waitingOnYou, T.stato.waitingOnYou, 'aspetta'], [conta('in_progress'), T.stato.inProgress, T.stato.inProgress, 'lavoro'], [conta('planned'), T.stato.planned, T.stato.planned, 'previsto']].filter(([x]) => x).map(([x, uno, molti, kk]) => `<span class="c-${kk} vivo">${x} ${x === 1 ? uno : molti}</span>`).join(', ')
  const titoli = eLaCoda ? '' : [...b.item].sort((x, y) => (y.stato === 'needs_you') - (x.stato === 'needs_you') || x.numero - y.numero).slice(0, 4).map((i) => {
    const [nome, t] = STATO_ITEM[i.stato] || ['fermo', i.stato]
    const fatte = i.consegne.filter((x) => x.stato === 'completed').length
    return `<li class="c-${chiave(nome)}"><span class="m" aria-hidden="true">${i.stato === 'needs_you' ? '◆' : '◇'}</span><span>${e(titoloPulito(q, b, i))} <span class="vivo">${e(t)}</span>${i.consegne.length ? ` <span class="muto">· ${T.bot.handoffsClosed(fatte, plurale(i.consegne.length, ...T.n.handoff))}</span>` : ''}</span></li>`
  }).join('')
  const item = b.item.length ? `<b class="num">${b.item.length}</b> ${T.stato.open}${numeri ? `: ${numeri}` : ''}${eLaCoda ? ` · <button type="button" class="collega"${azVai('coda')}>${T.bot.goQueue}</button>` : ''}${titoli ? `<ul class="righe">${titoli}${b.item.length > 4 ? `<li class="muto"><span></span><span>${T.bot.andMore(b.item.length - 4)}</span></li>` : ''}</ul>` : ''}` : `<span class="muto">${T.bot.noOpenItems}</span>`

  // Gli agenti che il bot ha avviato: worker, agenti nei suoi spazi di lavoro, sub-agenti. Quanti e in che
  // stato, poi uno per riga (i worker con la PR e i controlli); le schede ferme in un numero.
  const figli = b.figli || [], totali = contaFigli(figli)
  const fermi = b.worker.filter((w) => !w.agenti.length).length
  const SEGNO_FIGLIO = { lavoro: 'lavoro', aspetta: 'aspetta', finito: 'finito', errore: 'errore', fermo: 'fermo' }
  const righeFigli = figli.slice(0, 6).map((f) => {
    const kk = SEGNO_FIGLIO[f.stato] || 'fermo'
    const w = f.apri ? b.worker.find((x) => x.percorso === f.apri.percorso) : null
    const ctl = w ? controlli(w.pr) : ''
    const nome = f.apri ? `<button type="button" class="collega nome"${apri(f.apri)}>${e(f.nome)}</button>` : `<span class="nome-figlio">${e(f.nome)}</span>`
    if (f.vecchio) return `<li class="c-fermo vecchio">${segno('fermo')}<span>${nome} ${nonAggiornato(0)}<span class="etichette"><span class="etichetta">${TIPO_FIGLIO[f.tipo] || TIPO_FIGLIO.agente}</span></span></span></li>`
    return `<li class="c-${kk}">${segno(kk)}<span>${nome} <span class="vivo">${STATO_FIGLIO[f.stato] || e(f.stato)}${f.da ? T.tempo.forDur(durata((ora - f.da) / 1000)) : ''}</span>
      <span class="etichette"><span class="etichetta">${TIPO_FIGLIO[f.tipo] || TIPO_FIGLIO.agente}</span>${w && w.pr ? `<span class="etichetta">${T.pr.num(e(w.pr.numero))} ${e(w.pr.stato)}</span><span class="etichetta${ctl && ctl !== 'fermo' ? ` c-${ctl} vivo` : ''}">${T.pr.checks(e(w.pr.controlli || T.pr.none))}</span>` : ''}</span></span></li>`
  }).join('')
  const subFatti = b.subConclusi ? ` <span class="muto">· ${T.bot.subFinished(plurale(b.subConclusi, ...T.n.subAgent))}</span>` : ''
  const lavori = figli.length
    ? `<b class="num">${figli.length}</b> ${T.bot.started}: ${[['lavoro', T.stato.working, 'lavoro'], ['aspetta', T.stato.waitingOnYou, 'aspetta'], ['errore', T.stato.failed, 'errore']].map(([st, t, kk]) => [figli.filter((f) => f.stato === st && !f.vecchio).length, t, kk]).filter(([x]) => x).map(([x, t, kk]) => `<span class="c-${kk} vivo">${x} ${t}</span>`).concat(totali.fatti ? [`<span class="muto">${totali.fatti} ${T.stato.done}</span>`] : [], totali.vecchi ? [`<span class="non-agg">${totali.vecchi} ${T.fermo.notUpdated}</span>`] : []).join(', ')}${subFatti}<ul class="righe">${righeFigli}${figli.length > 6 ? `<li class="muto"><span></span><span>${T.bot.andMore(figli.length - 6)}</span></li>` : ''}</ul>${fermi ? `<span class="muto">${T.bot.andIdleTabs(plurale(fermi, ...T.n.idleTab))}</span>` : ''}`
    : `<span class="muto">${T.bot.noAgents}${fermi ? `, ${plurale(fermi, ...T.n.idleTab)}` : ''}</span>${subFatti}`

  const prossime = b.automazioni.filter((a) => a.attiva && a.prossima).sort((x, y) => x.prossima - y.prossima)
  const auto = prossime[0]
  const automazione = auto ? `${e(auto.nome)} <b class="num">${tra(auto.prossima, ora)}</b> <span class="muto">· ${e(regola(auto.regola))}${auto.controlloPrima ? ` · ${T.bot.runsOnlyIfNeeded}` : ''}${prossime.length > 1 ? ` · ${T.bot.andMore(prossime.length - 1)}` : ''}</span>` : `<span class="muto">${b.automazioni.length ? plurale(b.automazioni.length, ...T.n.automationOff) : T.bot.noAutomations}</span>`
  const detto = chat && chat.ultimoDetto ? `${e(chat.ultimoDetto)}${chat.ultimaAttivita ? ` <span class="muto">(${fa(chat.ultimaAttivita, ora)})</span>` : ''}` : `<span class="muto">${T.bot.nothingRecent}</span>`

  return chiude(`<table class="tab"><tbody>${riga(T.bot.rows.now, adesso)}${riga(T.bot.rows.items, item)}${riga(T.bot.rows.spawned, lavori, !figli.length && !b.subConclusi && !fermi)}${riga(T.bot.rows.next, automazione, !auto)}${riga(T.bot.rows.said, detto, !(chat && chat.ultimoDetto))}</tbody></table>`)
}

const previstoHtml = (nome, n = 0) => `<article class="bot previsto" data-bot="${e(nome)}" tabindex="-1"><span class="tag">${nn(n)} ${T.bot.comingSoonTag}</span>
    <div class="bot-testa">${ritratto({ nome, bot: true })}<div class="bot-chi"><div class="bot-riga"><span class="bot-nome taglia">${e(nome)}</span>${stato('previsto', T.stato.comingSoon)}</div></div></div>
    <div class="blocco muto">${T.bot.notBotYetLong}</div>
  </article>`

/** La sessione di un bot tra gli agenti dell'ufficio: se ce n'è più d'una, la più recente. */
const sessioneDi = (q, nome) =>
  q.progetti
    .flatMap((p) => p.agenti)
    .filter((a) => a.bot && a.nome.toLowerCase() === nome.toLowerCase())
    .sort((x, y) => (x.daSecondi ?? 1e12) - (y.daSecondi ?? 1e12))[0] || null

export function tabelle(q, ora, vista = {}) {
  // Chi tiene la coda per primo, poi gli altri nell'ordine di Orca.
  const ordinati = [...q.bot].sort((x, y) => (!q.coda.diTutti && y.nome === q.coda.bot) - (!q.coda.diTutti && x.nome === q.coda.bot))
  return `<h2>${T.bot.title} <small>${T.bot.nActive(q.bot.length)}${q.botInArrivo.length ? T.bot.nComing(q.botInArrivo.length) : ''}</small></h2>
    <div class="bots">${ordinati.map((b, i) => tabellaBot(b, ora, i, q, vista)).join('')}${q.botInArrivo.map((nome, i) => previstoHtml(nome, q.bot.length + i)).join('')}</div>
    ${q.bot.length + q.botInArrivo.length ? '' : `<p class="niente">${T.bot.noBots}</p>`}`
}

/** Dall'alto: il diagramma, poi le schede dei bot. La coda in breve sta nella scheda del bot che la tiene (se non c'è, o è di tutti, in fondo); intera, nella vista «Coda». */
export function panoramica(q, ora, vista = {}) {
  return `<h2>${T.who} <small>${T.panoramica.between(q.coda.diTutti ? '' : `${e(q.coda.bot)}, `)}</small></h2>
    ${diagramma(q, ora, vista)}
    ${tabelle(q, ora, vista)}
    ${!q.coda.diTutti && q.bot.some((b) => b.nome === q.coda.bot) ? '' : `<div class="coda-sola box c-quieto">${codaInBreve(q, ora)}</div>`}`
}

// ---------- Flussi ----------
export const TIPI = {
  handoff: [T.flussi.type.handoff, 'lavoro', '→'],
  question: [T.flussi.type.question, 'aspetta', '?'],
  status: [T.flussi.type.status, 'fermo', '·'],
  worker_done: [T.flussi.type.worker_done, 'finito', SEGNI.finito],
  escalation: [T.flussi.type.escalation, 'errore', SEGNI.errore]
}

export function flussi(q, ora, vista = {}) {
  const tipo = vista.tipo || ''
  const scelti = q.messaggi.filter((m) => !tipo || m.tipo === tipo)
  const mostrati = vista.tutti ? scelti : scelti.slice(0, 8)
  const riga = (m) => {
    const [nome, k, d] = TIPI[m.tipo] || [m.tipo, 'fermo', SEGNI.fermo]
    const oggetto = /^(Re: )?Question$/.test(m.oggetto) ? '' : m.oggetto
    return `<li><span class="segno c-${k}" role="img" aria-label="${e(nome)}" title="${e(nome)}">${d}</span>
      <span class="chi taglia c-${k}">${e(m.da.nome)}<span class="freccia">→</span>${e(m.a.nome)}</span><span class="ora">${giornoOra(m.quando, ora)}</span>
      <span class="testo">${oggetto ? `<b>${e(oggetto)}.</b> ` : ''}${e(m.primaRiga)}</span></li>`
  }
  const filtri = Object.keys(TIPI).map((t) => [t, q.messaggi.filter((m) => m.tipo === t).length]).filter(([, n]) => n)
  return `<h2>${T.who}</h2>
    ${diagramma(q, ora, vista)}
    <h2>${T.flussi.recent} <small class="num">${q.messaggi.length}</small></h2>
    ${q.messaggi.length ? `<div class="filtri legenda"><button type="button" data-filtro-tipo="" aria-pressed="${!tipo}"><i></i>${T.flussi.all} <b>${q.messaggi.length}</b></button>${filtri.map(([t, n]) => `<button type="button" class="c-${TIPI[t][1]}" data-filtro-tipo="${t}" aria-pressed="${tipo === t}"><i></i>${TIPI[t][0]} <b>${n}</b></button>`).join('')}</div>
    <ul class="posta">${mostrati.map(riga).join('')}</ul>
    ${scelti.length > 8 ? `<button class="piu tasto" type="button" data-tutti="${vista.tutti ? '' : '1'}">${vista.tutti ? T.flussi.showLast8 : T.flussi.showAll(scelti.length)}</button>` : ''}` : `<p class="niente">${q.fonti.cli.ok ? T.flussi.noMessages : T.flussi.cliSilent}</p>`}
    ${comeSiLegge(T.flussi.note)}`
}

// ---------- Ufficio ----------
const PESO = { 'aspetta te': 0, errore: 1, 'al lavoro': 2, finito: 3, fermo: 4 }
/** La scheda di un agente: foto profilo, chi è e cosa fa, poi le statistiche. Chi è fermo l'ha più stretta. */
function scrivania(a, ora, n = 0, fotoBot = new Map(), q = null) {
  const k = chiave(a.stato)
  const secondi = a.daSecondi ?? (a.da ? (ora - a.da) / 1000 : null)
  const da = (secondi === null ? dici(a.stato) : a.stato === 'al lavoro' ? T.ufficio.workingFor(durata(secondi)) : a.stato === 'aspetta te' ? T.ufficio.waitingFor(durata(secondi)) : T.ufficio.idleFor(durata(secondi))) + (a.statoVecchio ? ` · ${T.fermo.notUpdated}` : '')
  const viva = k === 'lavoro' || k === 'aspetta' || k === 'errore'
  // Il fornitore lo dice il segno nel cartellino; la parola resta solo per chi non si riconosce.
  const tipo = a.bot ? T.bot.tag : fornitoreDi(a) === 'altri' ? a.agente || T.ufficio.agent : T.ufficio.agent
  const altro = [a.scheda && a.scheda !== a.nome ? T.ufficio.tab(a.scheda) : '', a.inSfondo ? T.ufficio.inBackground : '', !a.inOrca && !a.bot ? T.ufficio.outsideOrca : ''].filter(Boolean)
  const fa = a.stato === 'aspetta te' && a.domanda ? a.domanda : a.dettaglio
  return `<li><button type="button" class="scrivania carta c-${k} ${k}${viva ? ' viva' : ' ferma'}${a.statoVecchio ? ' stato-vecchio' : ''}"${apri({ percorso: a.cartella, terminale: a.terminale })}>
    <span class="tag">${nn(n)} ${e(tipo)}${a.ruolo ? ` · ${e(a.ruolo)}` : ''}</span>
    <span class="chi">${ritratto({ nome: a.nome, bot: a.bot, ...fotoBot.get(a.nome.toLowerCase()), ...cartDi(a) })}
      <span class="nome taglia">${e(a.nome)}</span>
      <span class="s taglia">${segno(k)} <span class="da">${e(da)}</span></span>
      ${fa ? `<span class="fa">${e(fa)}</span>` : ''}</span>
    ${q && q.fonti.motore.spento ? '' : statistiche(a, ora)}
    ${altro.length ? `<span class="meta">${altro.map((t) => `<span>${e(t)}</span>`).join('')}</span>` : ''}
  </button></li>`
}

/**
 * L'Office. Di solito è la mappa dall'alto (una stanza per progetto, un avatar per agente); con
 * `vista.lista` torna l'elenco di schede di prima, con tutte le statistiche. I filtri per stato e per
 * fornitore valgono per tutte e due. `vista.scelto`: l'agente di cui è aperta la scheda sotto la mappa.
 */
export function ufficio(q, ora, vista = {}) {
  const filtro = vista.stato || ''
  // Dal tabellone si arriva anche filtrati per fornitore (Claude, OpenAI, Grok…).
  const fornitore = FORNITORI.some(([id]) => id === vista.fornitore) ? vista.fornitore : ''
  const nomeFornitore = fornitore ? FORNITORI.find(([id]) => id === fornitore)[1] : ''
  const tutti = q.progetti.flatMap((p) => p.agenti).filter((a) => !fornitore || fornitoreDi(a) === fornitore)
  const conta = (s) => tutti.filter((a) => a.stato === s).length
  const stati = ['al lavoro', 'aspetta te', 'errore', 'finito', 'fermo'].filter(conta)
  const ordine = (x, y) => (PESO[x.stato] ?? 9) - (PESO[y.stato] ?? 9) || (x.daSecondi ?? 0) - (y.daSecondi ?? 0)
  const piene = q.progetti
    .map((p) => ({ ...p, tutti: p.agenti.length, agenti: p.agenti.filter((a) => (!filtro || a.stato === filtro) && (!fornitore || fornitoreDi(a) === fornitore)).sort(ordine) }))
    .filter((p) => p.agenti.length)
    .sort((x, y) => ordine(x.agenti[0], y.agenti[0]))
  const vuote = q.progetti.filter((p) => !p.agenti.length)
  const fotoBot = new Map(q.bot.map((b) => [b.nome.toLowerCase(), { ico: chiaveIcona(b), foto: b.foto, sua: suaDi(b), emoji: b.emoji ?? null }]))
  const nota = q.fonti.motore.spento
    ? T.ufficio.notes.cliOff[q.fonti.ufficioDa] || ''
    : q.fonti.ufficioDa === 'cli' && q.fonti.motore.ultimi ? T.ufficio.notes.cliWithLast : T.ufficio.notes.full[q.fonti.ufficioDa]
  const filtri = `<div class="filtri legenda"><button type="button" data-filtro-stato="" aria-pressed="${!filtro}"><i></i>${T.coda.all} <b>${tutti.length}</b></button>${fornitore ? `<button type="button" class="c-menta" data-vista="ufficio" data-stato="${e(filtro)}" data-fornitore="" aria-pressed="true" aria-label="${e(T.ufficio.onlyAria(nomeFornitore))}">${marchio(fornitore)}${T.ufficio.only}</button>` : ''}${stati.map((s) => `<button type="button" class="c-${chiave(s)}" data-filtro-stato="${s}" aria-pressed="${filtro === s}"><i></i>${dici(s)} <b>${conta(s)}</b></button>`).join('')}</div>`
  const modo = `<div class="modo-ufficio" role="group" aria-label="${T.ufficio.howToShow}"><button type="button" data-ufficio-lista="" data-k="modo:mappa" aria-pressed="${!vista.lista}">${T.ufficio.map}</button><button type="button" data-ufficio-lista="1" data-k="modo:lista" aria-pressed="${Boolean(vista.lista)}">${T.ufficio.list}</button></div>`
  const vuoteHtml = `${vuote.length ? `<h2>${T.ufficio.emptyRooms} <small class="num">${vuote.length}</small></h2><div class="vuote">${vuote.map((p) => `<span class="etichetta">${e(p.nome)} · ${plurale(p.schede.length, ...T.n.tab)}</span>`).join('')}</div>` : ''}`
  if (vista.lista) {
    return `${filtri}${modo}
    <div class="uffici">${piene.map((p, i) => `<fieldset class="stanza"><legend><span class="t">${nn(i)} ${e(p.nome)}</span> <span>${plurale(p.tutti, ...T.n.agent)}, ${plurale(p.schede.length, ...T.n.tab)}</span></legend><ul class="scrivanie">${p.agenti.map((a, j) => scrivania(a, ora, j, fotoBot, q)).join('')}</ul></fieldset>`).join('') || `<p class="niente">${T.ufficio.noAgents}</p>`}</div>
    ${vuoteHtml}
    ${comeSiLegge(`${nota} ${T.ufficio.clickDesk}`)}`
  }
  const stanze = piene.map((p) => ({ nome: p.nome, schede: p.schede.length, agenti: p.agenti.map((a) => ({ ...a, chiave: chiaveAgente(a, p.nome) })) })).sort((x, y) => x.nome.localeCompare(y.nome))
  // Chi è appena uscito resta un attimo nella sua stanza, per andarsene con la sua animazione.
  for (const u of vista.partiti || []) {
    const stanza = stanze.find((x) => x.nome === u.progetto)
    if (stanza && !stanza.agenti.some((a) => a.chiave === u.chiave)) stanza.agenti.push({ ...u, esce: true })
  }
  if (!stanze.length) return `${filtri}${modo}<p class="niente">${T.ufficio.noAgents}</p>${vuoteHtml}`
  const scelto = vista.scelto ? stanze.flatMap((x) => x.agenti.map((a) => ({ a, stanza: x.nome }))).find((x) => x.a.chiave === vista.scelto && !x.a.esce) : null
  const dati = { q, ora, fotoBot, entrati: vista.entrati || [], scelto: scelto ? scelto.a.chiave : '' }
  return `${filtri}${modo}
    <figure class="mappa">${mappa(stanze, false, dati)}${mappa(stanze, true, dati)}</figure>
    <div class="legenda mappa-legenda">
      <span class="c-lavoro"><i class="pip-l"></i>${T.ufficio.legend.working}</span>
      <span class="c-aspetta"><i class="pip-l"></i>${T.ufficio.legend.waiting}</span>
      <span class="c-errore"><i class="pip-l"></i>${T.ufficio.legend.error}</span>
      <span class="c-quieto"><i class="pip-l vuoto"></i>${T.ufficio.legend.couch}</span>
      <span class="c-lavoro"><i class="pip-l tondo"></i>${T.diagramma.legend.subAgent}</span>
      <span class="c-lavoro"><i class="filo spesso"></i>${T.ufficio.legend.messages}</span>
    </div>
    ${scelto ? schedaAgente(scelto.a, scelto.stanza, dati) : `<p class="come muto">${T.ufficio.clickAvatar}</p>`}
    ${vuoteHtml}
    ${comeSiLegge(`${T.ufficio.mapHelp} ${nota}`)}`
}

// ---------- Office: la mappa dall'alto ----------
// Disegno originale, a mano, nello stile del pannello: stanze a bordo sottile col cartellino, pavimento a
// puntini, scrivanie e divano fatti di rettangoli. Tutto SVG, in due tagli come il diagramma.
/** Chi è un agente da un quadro all'altro: il suo terminale, oppure stanza, nome e cartella. */
export const chiaveAgente = (a, progetto) => a.terminale || `${progetto}/${a.nome}/${a.cartella || ''}`
const SVEGLIO = (a) => a.stato === 'al lavoro' || a.stato === 'aspetta te' || a.stato === 'errore'
const POSTO = { w: 50, h: 58, lato: 26 }, DIVANO = { w: 21, lato: 17 }

/**
 * Dove sta ogni cosa: le stanze in colonne (due nel pannello stretto, quattro in quello largo), ognuna
 * nella colonna più corta; dentro, in alto le scrivanie di chi è sveglio (lavora, aspetta, è in errore) e
 * in basso il divano di chi è fermo o ha finito. Funzione pura: serve anche alle prove.
 */
export function pianta(stanze, largo) {
  const W = largo ? 900 : 340, colonne = largo ? 4 : 2, spazio = 8
  const w = (W - spazio * (colonne + 1)) / colonne
  const perRiga = Math.max(1, Math.floor((w - 10) / POSTO.w)), perDivano = Math.max(1, Math.floor((w - 10) / DIVANO.w))
  const alte = Array.from({ length: colonne }, () => spazio)
  const messe = stanze.map((st) => {
    const svegli = st.agenti.filter(SVEGLIO), quieti = st.agenti.filter((a) => !SVEGLIO(a))
    const righe = Math.ceil(svegli.length / perRiga), sedute = Math.ceil(quieti.length / perDivano)
    const h = 22 + righe * POSTO.h + (righe && sedute ? 7 : 0) + sedute * DIVANO.w + 8
    const c = alte.indexOf(Math.min(...alte))
    const x = spazio + c * (w + spazio), y = alte[c]
    alte[c] += h + spazio
    const yDivano = y + 22 + righe * POSTO.h + (righe && sedute ? 7 : 0)
    const posti = [
      ...svegli.map((a, i) => ({ a, seduto: true, lato: POSTO.lato, sx: x + 5 + (i % perRiga) * POSTO.w, sy: y + 22 + Math.floor(i / perRiga) * POSTO.h })).map((p) => ({ ...p, x: p.sx + (POSTO.w - POSTO.lato) / 2, y: p.sy + 16 })),
      ...quieti.map((a, i) => ({ a, seduto: false, lato: DIVANO.lato, sx: x + 5 + (i % perDivano) * DIVANO.w, sy: yDivano + Math.floor(i / perDivano) * DIVANO.w })).map((p) => ({ ...p, x: p.sx + 2, y: p.sy + 2 }))
    ]
    return { nome: st.nome, schede: st.schede, x, y, w, h, yDivano: sedute ? yDivano : null, righeDivano: sedute, posti }
  })
  return { W, H: Math.max(...alte), stanze: messe }
}

/** Un avatar: la foto di Orca (o il volto dal nome) in un riquadro con l'anello del colore di stato. */
function avatar(p, stanza, id, dati) {
  const { a, x, y, lato: s } = p
  const k = chiave(a.stato), viva = SVEGLIO(a)
  const f = a.bot ? dati.fotoBot.get(a.nome.toLowerCase()) : null
  const faccia = a.bot
    ? ritrattoSvg(f ? f.ico : a.nome, f ? f.foto : null, x, y, s, id, f ? f.sua : null, f ? f.emoji : null)
    : `<svg class="volto" x="${x}" y="${y}" width="${s}" height="${s}" viewBox="-3 -3 34 34" aria-hidden="true">${voltoDalNome(a.nome)}</svg>`
  const cx = x + s / 2
  // Chi lavora ha la scrivania davanti: il piano, lo schermo e tre tasti che battono.
  const tavolo = p.seduto ? `<rect class="tavolo" x="${cx - 17}" y="${y - 13}" width="34" height="9"/><rect class="schermo" x="${cx - 7}" y="${y - 14.5}" width="14" height="3"/>${k === 'lavoro' ? [0, 1, 2].map((i) => `<rect class="batte b${i}" x="${cx - 6 + i * 5}" y="${y - 8.5}" width="2.5" height="2.5"/>`).join('') : ''}` : ''
  const nuvola = k === 'aspetta' || k === 'errore' ? `<g class="nuvola"><rect x="${x + s - 5}" y="${y - 9}" width="12" height="12"/><text x="${x + s + 1}" y="${y + 0.6}" text-anchor="middle">${k === 'aspetta' ? '?' : '!'}</text></g>` : ''
  const sub = a.subAttivi ? `<g class="subs${a.vecchio !== undefined ? ' vecchi' : ''}">${Array.from({ length: Math.min(a.subAttivi, 3) }, (_, i) => `<circle cx="${x - 5}" cy="${y + 4 + i * 8}" r="2.8"/>`).join('')}${a.subAttivi > 3 ? `<text x="${x - 5}" y="${y + 33}" text-anchor="middle">+${a.subAttivi - 3}</text>` : ''}</g>` : ''
  const nome = p.seduto ? `<text class="chi" x="${cx}" y="${y + s + 10}" text-anchor="middle">${e(tronca(a.nome, 9))}</text>` : ''
  const secondi = a.daSecondi ?? (a.da ? (dati.ora - a.da) / 1000 : null)
  const tipo = a.bot ? T.bot.tag : a.agente || T.ufficio.agent
  const dice = [`${a.nome} · ${tipo}`, a.esce ? T.figlio.gone : `${dici(a.stato)}${secondi === null ? '' : T.tempo.forDur(durata(secondi))}`, a.stato === 'aspetta te' && a.domanda ? a.domanda : a.dettaglio, a.subAttivi ? (a.vecchio !== undefined ? T.fermo.subsThen(plurale(a.subAttivi, ...T.n.subAgent)) : plurale(a.subAttivi, ...T.n.subAgentWorking)) : '', a.vecchio !== undefined && !a.esce ? T.fermo.avatar(Boolean(a.statoVecchio), oraDi(a.vecchio)) : '', a.esce ? '' : T.hover.itsCard]
  const mossa = a.esce ? ' esce' : dati.entrati.includes(a.chiave) ? ' entra' : ''
  const presa = `<rect class="presa" x="${x - 3}" y="${y - (p.seduto ? 15 : 2)}" width="${s + 6}" height="${s + (p.seduto ? 28 : 4)}"/>`
  return `<g class="avatar c-${k}${viva ? ' viva' : ' quieta'}${a.statoVecchio ? ' stato-vecchio' : ''}${mossa}${dati.scelto === a.chiave ? ' scelto' : ''}"${a.esce ? ' aria-hidden="true"' : ` data-scegli="${e(a.chiave)}"${premibile('av:' + a.chiave, T.ufficio.avatarAria(a.nome, tipo, dici(a.stato), stanza.nome))}`}${info(dice)}>${tavolo}<rect class="sfondo" x="${x}" y="${y}" width="${s}" height="${s}"/>${faccia}<rect class="anello" x="${x}" y="${y}" width="${s}" height="${s}"/>${nuvola}${sub}${nome}${presa}</g>`
}

/**
 * La mappa in uno dei due tagli. Sotto, le stanze: muri, cartellino, porta in basso, pavimento, divano.
 * In mezzo, gli impulsi dei messaggi: una luce che corre tra un bot e gli agenti con cui parla (il bot che tiene la coda e un
 * bot che si sono scritti negli ultimi 15 minuti, un bot e un suo worker al lavoro). Sopra, gli avatar.
 */
function mappa(stanze, largo, dati) {
  const id = largo ? 'ml' : 'ms'
  const pi = pianta(stanze, largo)
  const dove = new Map(), deiBot = new Map()
  for (const st of pi.stanze) {
    for (const p of st.posti) {
      if (p.a.esce) continue
      const centro = [Math.round((p.x + p.lato / 2) * 10) / 10, Math.round((p.y + p.lato / 2) * 10) / 10]
      dove.set(p.a.chiave, centro)
      if (p.a.bot && !deiBot.has(p.a.nome.toLowerCase())) deiBot.set(p.a.nome.toLowerCase(), centro)
    }
  }
  const f = flusso(dati.q, dati.ora)
  const fili = []
  const capo = f.diTutti ? null : deiBot.get(String(f.lead).toLowerCase())
  for (const b of f.bot) {
    const suo = deiBot.get(b.nome.toLowerCase())
    if (capo && suo && b.vivo) fili.push([capo, suo, 'vivo', `${f.lead} ↔ ${b.nome}`, T.ufficio.msgActive(plurale(b.msg, ...T.n.message))])
  }
  for (const b of dati.q.bot) {
    const suo = deiBot.get(b.nome.toLowerCase())
    for (const figlio of b.figli || []) {
      const lui = figlio.apri && figlio.apri.terminale ? dove.get(figlio.apri.terminale) : null
      if (suo && lui && (figlio.stato === 'lavoro' || figlio.stato === 'aspetta')) fili.push([suo, lui, figlio.stato === 'aspetta' ? 'aspetta' : 'vivo', `${b.nome} → ${figlio.nome}`, `${TIPO_FIGLIO[figlio.tipo] || T.ufficio.agent} ${STATO_FIGLIO[figlio.stato]}`])
    }
  }
  const impulsi = fili.map(([da, a, tono, chi, cosa]) => {
    const d = `M${da[0]} ${da[1]} L${a[0]} ${a[1]}`
    return `<g class="impulso ${tono}"${info(chi, cosa)} aria-hidden="true"><path class="scia" d="${d}"/><path class="luce-m" d="${d}" pathLength="100"/></g>`
  }).join('')
  const stanza = (st, n) => {
    const porta = st.x + st.w / 2
    const divano = st.yDivano === null ? '' : `<rect class="divano" x="${st.x + 3}" y="${st.yDivano - 1}" width="${st.w - 6}" height="${st.righeDivano * DIVANO.w + 3}"/>`
    return `<g class="stanza-m${st.posti.some((p) => SVEGLIO(p.a)) ? ' viva' : ''}" data-stanza="${e(st.nome)}"><rect class="muro" x="${st.x}" y="${st.y}" width="${st.w}" height="${st.h}"/><rect class="pavimento" x="${st.x + 1}" y="${st.y + 1}" width="${st.w - 2}" height="${st.h - 2}" fill="url(#pav-${id})"/><path class="porta" d="M${porta - 9} ${st.y + st.h} H${porta + 9}"/>${divano}<text class="nome-stanza" x="${st.x + 6}" y="${st.y + 13}">${e(tronca(`${nn(n)} ${st.nome}`, Math.floor((st.w - 30) / 6.9)))}</text><text class="conta-stanza" x="${st.x + st.w - 6}" y="${st.y + 13}" text-anchor="end">${st.posti.filter((p) => !p.a.esce).length}</text></g>`
  }
  const tutti = pi.stanze.flatMap((st) => st.posti.map((p) => avatar(p, st, id, dati)))
  const quanti = pi.stanze.reduce((n, st) => n + st.posti.filter((p) => !p.a.esce).length, 0)
  return `<svg class="${largo ? 'largo' : 'stretto'}" viewBox="0 0 ${pi.W} ${pi.H}" role="group" aria-label="${e(T.ufficio.mapAria(plurale(pi.stanze.length, ...T.n.room), plurale(quanti, ...T.n.agent)))}"><defs>${bicromia(id)}<pattern id="pav-${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect class="punto-p" x="3.5" y="3.5" width="1" height="1"/></pattern></defs>${pi.stanze.map(stanza).join('')}${impulsi}${tutti.join('')}</svg>`
}

/** La scheda dell'avatar scelto: chi è, cosa sta facendo, le sue statistiche, e il tasto per andare da lui. */
function schedaAgente(a, stanza, dati) {
  const k = chiave(a.stato)
  const bot = a.bot ? dati.q.bot.find((b) => b.nome.toLowerCase() === a.nome.toLowerCase()) : null
  const bersaglio = (bot && chatDi(bot)) || { percorso: a.cartella, terminale: a.terminale }
  const secondi = a.daSecondi ?? (a.da ? (dati.ora - a.da) / 1000 : null)
  const fa = a.stato === 'aspetta te' && a.domanda ? a.domanda : a.dettaglio
  const tipo = a.bot ? T.bot.tag : fornitoreDi(a) === 'altri' ? a.agente || T.ufficio.agent : T.ufficio.agent
  const figli = bot && (bot.figli || []).length ? `<p class="muto">${T.hover.startedAgents(plurale(bot.figli.length, ...T.n.agent), contaFigli(bot.figli).parole)}</p>` : ''
  const altro = [a.scheda && a.scheda !== a.nome ? T.ufficio.tab(a.scheda) : '', a.inSfondo ? T.ufficio.inBackground : '', !a.inOrca && !a.bot ? T.ufficio.outsideOrca : ''].filter(Boolean)
  const va = bersaglio.percorso || bersaglio.terminale ? `<button type="button" class="tasto"${azApri(bersaglio)}>${a.bot ? T.ufficio.openChat : a.terminale ? T.ufficio.openTerminal : T.ufficio.openInOrca} ›</button>` : `<span class="muto">${T.ufficio.noTab}</span>`
  return `<aside class="scheda-agente box c-${k}${SVEGLIO(a) ? ' acceso' : ''}" id="scheda-agente" aria-label="${e(a.nome)}"><span class="tag">${e(tipo)} · ${e(stanza)}</span><button type="button" class="chiudi" data-scegli="" data-k="scheda:chiudi" aria-label="${T.ufficio.closeCard}" title="${T.ufficio.close}">✕</button>
    <div class="chi">${ritratto({ nome: a.nome, bot: a.bot, ...dati.fotoBot.get(a.nome.toLowerCase()), ...cartDi(a) })}<div><div class="nome taglia">${e(a.nome)}</div><div class="s c-${k}">${segno(k)} ${e(dici(a.stato))}${secondi === null ? '' : T.tempo.forDur(durata(secondi))}${a.statoVecchio ? ` · ${T.fermo.notUpdated}` : ''}</div>${fa ? `<div class="fa">${e(fa)}</div>` : `<div class="fa muto">${T.ufficio.nothingToReport}</div>`}</div></div>
    ${statistiche(a, dati.ora)}${figli}${altro.length ? `<p class="meta">${altro.map((t) => `<span>${e(t)}</span>`).join('')}</p>` : ''}
    <p class="azioni">${va}</p></aside>`
}

// ---------- Incroci ----------
export function incroci(q) {
  if (!q.fonti.incrociDisponibili) {
    return `<div class="esito box acceso c-errore"><div><h3 class="t">${segno('errore')} ${T.incroci.unavailable}</h3>
      <p class="muto">${q.fonti.motore.spento ? T.incroci.needFile : T.incroci.notUpdated(q.fonti.motore.errore ? e(q.fonti.motore.errore) : '')}</p></div></div>`
  }
  const gettone = (a) => `<span class="gettone c-${chiave(a.stato)}"><i class="pallino"></i>${e(a.agente)}<span class="muto">${e(a.progetto)}</span></span>`
  const zona = (z) => `<div class="zona"><span class="mono">${e(z.percorso)}</span><div class="chi">${z.agenti.map(gettone).join('')}</div></div>`
  const condivise = q.zone.filter((z) => z.agenti.length > 1), soli = q.zone.filter((z) => z.agenti.length === 1)
  const n = q.incroci.length
  return `<div class="esito box ${n ? 'acceso c-aspetta' : 'tratt c-quieto'}">
      <div><h3 class="t">${n ? segno('aspetta') + ' ' : ''}${n ? T.incroci.rightNow(plurale(n, ...T.n.overlap)) : T.incroci.none}</h3>
      <p class="muto">${n ? T.incroci.decide : T.incroci.noneDetail}</p></div></div>
    ${n ? `<h2>${T.incroci.overlaps}</h2>${q.incroci.map((x) => `<div class="zona box acceso c-aspetta"><div><b class="t">${segno('aspetta')} ${e(x.tipo)}</b> <span class="mono">${e(x.percorso)}</span></div><div class="chi">${x.agenti.map((a) => `<span class="gettone c-aspetta"><i class="pallino"></i>${e(a)}</span>`).join('')}</div></div>`).join('')}` : ''}
    <h2>${T.incroci.shared} <small>${T.incroci.sharedHint}</small></h2>
    ${condivise.map(zona).join('') || `<p class="niente">${T.incroci.noShared}</p>`}
    <h2>${T.incroci.single} <small>${T.incroci.singleHint}</small></h2>
    ${soli.map(zona).join('') || `<p class="niente">${T.incroci.noOther}</p>`}
    ${comeSiLegge(T.incroci.rule)}`
}
