// The plugin on a setup it has never seen: invented bots and projects (demo/demo.mjs), and nothing
// configured. These tests are about the generic parts: who holds the queue, how titles are read, the
// optional state file, the settings, and what the worker reads and launches.
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import { BOTS, HOME, demoCli, demoHomes } from '../demo/demo.mjs'
import { COMANDI, eseguibiliOrca, leggiMascotta, ORCA_APP, type Dipendenze } from './fonti'
import { componi, componiCoda, leggiTitolo, normaCli, orchestratoreTra, ordinaProgetti, testoAvviso, voceBarra } from './norma'
import { impostazioniDa, NEUTRE, NOME, type Opzioni } from './opzioni'
import { avvia, deactivate } from './worker'

const NOW = Date.UTC(2026, 5, 10, 12, 0, 0)
const con = (o: Partial<Opzioni>): Opzioni => ({ ...NEUTRE, ...o })

function parte() {
  const c = demoCli(NOW) as Record<string, any>
  const perBot: Record<string, any> = {}
  for (const b of Object.values(BOTS)) perBot[b.id] = { item: c[`bot item list --bot ${b.id}`], lavori: c[`bot work list --bot ${b.id}`], chat: c[`bot chats --bot ${b.id}`] }
  return normaCli({ bots: c['bot list'].bots, perBot, schede: c['worktree ps --limit 300'].worktrees, automazioni: c['automations list'].automations, posta: c['orchestration inbox --limit 40 --full'].messages }, HOME)
}
const quadro = (o: Partial<Opzioni> = {}, altro: Record<string, unknown> = {}) =>
  componi({ adesso: NOW, cli: { parte: parte(), quando: NOW, errore: null }, motore: { parte: null, errore: null }, motoreSpento: true, api: { workspaces: null }, botInArrivo: [], casa: HOME, opzioni: con(o), ...altro })

test('with nothing configured the queue is every bot\'s open items, grouped by bot', () => {
  const q = quadro()
  assert.equal(q.coda.diTutti, true)
  assert.equal(q.coda.bot, '')
  assert.equal(q.coda.presente, true)
  // Every open item of every bot is there, and each one says whose it is.
  const aperti = q.bot.reduce((n, b) => n + b.item.length, 0)
  assert.equal(q.coda.voci.length, aperti)
  assert.ok(q.coda.voci.every((v) => q.bot.some((b) => b.nome === v.bot)))
  // The lanes are the bots that have items, in the order Orca lists them.
  assert.deepEqual(q.coda.progetti, ['Atlas', 'Echo', 'Pixel', 'Nova', 'Sage', 'Bolt'])
  assert.ok(q.coda.voci.every((v) => v.progetto === v.bot))
  // Two bots can number their items alike: the key carries the bot too.
  assert.equal(new Set(q.coda.voci.map((v) => v.uid)).size, q.coda.voci.length)
  assert.ok(q.coda.voci.every((v) => v.uid.startsWith(q.bot.find((b) => b.nome === v.bot)!.id + ':')))
  // What waits on the person is counted across all bots.
  assert.equal(q.coda.aspettano, q.attese.filter((a) => a.origine === 'item').length)
})

test('nothing in the picture comes from anywhere but the data it was given', () => {
  const testo = JSON.stringify(quadro()) + JSON.stringify(quadro({ codaBot: 'Atlas' }))
  // Every bot named in the picture is one of the invented ones: the code brings no name of its own.
  const nomi = new Set(Object.values(BOTS).map((b) => b.name))
  for (const q of [quadro(), quadro({ codaBot: 'Atlas' })]) assert.ok(q.bot.every((b) => nomi.has(b.nome)) && q.coda.voci.every((v) => nomi.has(v.bot)))
  // No absolute home path of any system.
  assert.equal(/\/(Users|home)\//.test(testo), false)
  // The home folder is shortened, never spelled out.
  assert.equal(testo.includes(HOME), false)
})

test('the queue holder is found by id, by name without emoji or punctuation, or by home folder', () => {
  const bot = parte().bot
  const atlas = BOTS.atlas
  assert.equal(orchestratoreTra(bot, atlas.id)?.nome, 'Atlas')
  assert.equal(orchestratoreTra(bot, atlas.id.toUpperCase())?.nome, 'Atlas')
  assert.equal(orchestratoreTra(bot, 'atlas')?.nome, 'Atlas')
  assert.equal(orchestratoreTra(bot, '  ATLAS ')?.nome, 'Atlas')
  // A renamed bot keeps its queue: the name is compared without emoji or signs.
  const rinominato = bot.map((b) => (b.nome === 'Atlas' ? { ...b, nome: '👑 Atlas!' } : b))
  assert.equal(orchestratoreTra(rinominato, 'Atlas')?.nome, '👑 Atlas!')
  assert.equal(orchestratoreTra(rinominato, '👑 atlas')?.nome, '👑 Atlas!')
  // By home folder, when the name is something else entirely.
  const altroNome = bot.map((b) => (b.nome === 'Atlas' ? { ...b, nome: 'Conductor' } : b))
  assert.equal(orchestratoreTra(altroNome, 'atlas')?.nome, 'Conductor')
  // No choice, no holder: no bot is assumed.
  assert.equal(orchestratoreTra(bot, ''), undefined)
  assert.equal(orchestratoreTra(bot, '   '), undefined)
  assert.equal(orchestratoreTra(bot, 'Nobody'), undefined)
})

test('with a queue holder the queue is its items only, in project lanes', () => {
  const q = quadro({ codaBot: 'Atlas', corsie: ['Orbit API'] })
  assert.equal(q.coda.diTutti, false)
  assert.equal(q.coda.bot, 'Atlas')
  assert.equal(q.coda.voci.length, q.bot.find((b) => b.nome === 'Atlas')!.item.length)
  assert.ok(q.coda.voci.every((v) => v.bot === 'Atlas'))
  // The chosen lane first, the others in alphabetical order, items with no project last.
  assert.deepEqual(q.coda.progetti, ['Orbit API', 'Field Notes', 'Lumen Web', ''])
  // An item of another bot that waits is still a wait (for notifications), outside the queue.
  assert.ok(q.attese.some((a) => a.chi === 'Sage'))
})

test('a queue holder that does not exist gives an empty queue that says so, and never a made-up one', () => {
  const q = quadro({ codaBot: 'Nobody' })
  assert.deepEqual([q.coda.presente, q.coda.voci.length, q.coda.bot], [false, 0, 'Nobody'])
  // An id is not a name to show.
  assert.equal(quadro({ codaBot: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }).coda.bot, 'the chosen bot')
})

test('titles: the documented format is read, any other title is left as it is', () => {
  const t = leggiTitolo('🔴 Orbit API · Rotate the password · ⏰ 24/12 17:00', NOW, con({}))
  assert.deepEqual([t.priorita, t.conPallino, t.progetto, t.testo, t.conOra], [0, true, 'Orbit API', 'Rotate the password', true])
  const d = new Date(t.scadenza!)
  assert.deepEqual([d.getDate(), d.getMonth() + 1, d.getHours(), d.getMinutes()], [24, 12, 17, 0])
  // English words around the date are understood too.
  assert.ok(leggiTitolo('🟠 Docs · Write the guide · ⏰ by 24/12', NOW, con({})).scadenza)
  assert.ok(leggiTitolo('Invoice overdue since 02/06', NOW, con({})).scadenza)
  // The four dots.
  assert.deepEqual(['🔴', '🟠', '🟡', '⚪'].map((p) => leggiTitolo(`${p} X · y`, NOW, con({})).priorita), [0, 1, 2, 3])
  // A plain title: no priority, no project, the text untouched. No project name is known in advance.
  for (const titolo of ['Write the onboarding checklist', 'Website: new landing page', 'Fix bug #214 · urgent']) {
    const p = leggiTitolo(titolo, NOW, con({}))
    assert.deepEqual([p.priorita, p.conPallino, p.progetto, p.testo], [3, false, '', titolo], titolo)
  }
  // «Project: what» counts only for a project the person listed in the settings.
  assert.equal(leggiTitolo('Website: new landing page', NOW, con({ corsie: ['Website'] })).progetto, 'Website')
})

test('titles are never parsed when the setting is off', () => {
  const titolo = '🔴 Orbit API · Rotate the password · ⏰ 24/12 17:00'
  assert.deepEqual(leggiTitolo(titolo, NOW, con({ leggiTitoli: false })), { priorita: 3, conPallino: false, progetto: '', testo: titolo, scadenza: null, conOra: false })
  const q = quadro({ codaBot: 'Atlas', leggiTitoli: false })
  assert.deepEqual(q.coda.progetti, [''])
  assert.ok(q.coda.voci.every((v) => v.priorita === 3 && !v.scadenza && v.testo === v.titolo))
})

test('lanes are ordered by the setting, then alphabetically; the code has no list of its own', () => {
  assert.deepEqual(ordinaProgetti(['Zeta', '', 'alpha', 'Beta'], []), ['alpha', 'Beta', 'Zeta', ''])
  assert.deepEqual(ordinaProgetti(['Zeta', '', 'alpha', 'Beta'], ['Zeta']), ['Zeta', 'alpha', 'Beta', ''])
})

test('the status bar and the notifications carry the plugin\'s name and no one else\'s', () => {
  const tutti = voceBarra(quadro())
  assert.ok(tutti.text.startsWith(NOME + ' · '))
  assert.ok(tutti.tooltip.startsWith('Decide now\n'), tutti.tooltip)
  assert.ok(tutti.tooltip.length <= 256)
  assert.ok(voceBarra(quadro({ codaBot: 'Atlas' })).tooltip.startsWith('Decide now · Atlas\n'))
  const vuoto = voceBarra(componi({ adesso: NOW, cli: { parte: { ...parte(), bot: [] }, quando: NOW, errore: null }, motore: { parte: null, errore: null }, motoreSpento: true, api: { workspaces: null }, botInArrivo: [], opzioni: NEUTRE }))
  assert.deepEqual([vuoto.text, vuoto.tone], [NOME, 'neutral'])
  assert.ok(vuoto.tooltip.startsWith('Nothing to decide in the queue.'))
  assert.equal(testoAvviso(quadro().attese.slice(0, 1)).title, `${NOME}: something new is waiting on you`)
})

test('settings: the defaults assume nothing, and odd values fall back to them', () => {
  const d = impostazioniDa({})
  assert.deepEqual(d, { codaBot: '', leggiTitoli: true, corsie: [], alias: {}, secondi: 20, avvisi: true, botAttesi: [], fileStato: '', orca: '', server: null, animazioni: true })
  assert.deepEqual(impostazioniDa(null), d)
  const s = impostazioniDa({ queueBot: '  Atlas ', titleFormat: false, laneOrder: 'Web, API ,Web,, ', animations: 'off', refreshSeconds: 5, notifications: false, expectedBots: 'Quill', stateFile: ' ~/state.json ', orcaCli: '/opt/orca' })
  assert.deepEqual(s, { codaBot: 'Atlas', leggiTitoli: false, corsie: ['Web', 'API'], alias: {}, secondi: 10, avvisi: false, botAttesi: ['Quill'], fileStato: '~/state.json', orca: '/opt/orca', server: null, animazioni: false })
  // Paired servers: empty is every server Orca reports, names are only those, `local` is this machine only.
  assert.deepEqual(impostazioniDa({ servers: ' hub , lab,hub ' }).server, ['hub', 'lab'])
  assert.deepEqual([impostazioniDa({ servers: 'local' }).server, impostazioniDa({ servers: ' None ' }).server, impostazioniDa({ servers: 7 }).server], [[], [], null])
  assert.equal(impostazioniDa({ refreshSeconds: 9999 }).secondi, 300)
  assert.equal(impostazioniDa({ refreshSeconds: 'soon', queueBot: 7, laneOrder: null }).secondi, 20)
  assert.equal(impostazioniDa({ queueBot: 7 }).codaBot, '')
  assert.equal(impostazioniDa({ queueBot: 'x'.repeat(500) }).codaBot.length, 80)
})

// ---------- the worker, on a stand-in Orca and stand-in files ----------

type Finte = { dip: Dipendenze; lanci: string[][]; letti: string[]; guardati: string[]; timer: { ms: number; fn: () => void }[] }
function finte(file: Record<string, string> = {}): Finte {
  const cli = demoCli(NOW) as Record<string, unknown>
  const homes = demoHomes() as Record<string, unknown>
  const lanci: string[][] = [], letti: string[] = [], guardati: string[] = [], timer: { ms: number; fn: () => void }[] = []
  const dip: Dipendenze = {
    casa: HOME,
    adesso: () => NOW,
    lancia: async (_eseguibile, argomenti) => {
      lanci.push(argomenti)
      const chiave = argomenti.filter((a) => a !== '--json').join(' ')
      if (!(chiave in cli)) throw new Error('no such command in the demo: ' + chiave)
      return JSON.stringify({ ok: true, result: cli[chiave] })
    },
    leggiFile: async (percorso) => {
      letti.push(percorso)
      const casa = /\/\.orca\/bots\/([^/]+)\/bot\.json$/.exec(percorso)?.[1]
      if (casa && homes[casa]) return JSON.stringify(homes[casa])
      if (percorso in file) return file[percorso]
      throw new Error('ENOENT: ' + percorso)
    },
    elenca: async (cartella) => (cartella.endsWith('/.orca/bots') ? Object.keys(homes) : []),
    stato: async () => {
      throw new Error('ENOENT')
    },
    vero: async (percorso) => percorso,
    leggiByte: async () => {
      throw new Error('ENOENT')
    },
    dopo: (ms, fn) => {
      timer.push({ ms, fn })
      return { annulla() {} }
    },
    osserva: (cartella) => {
      guardati.push(cartella)
      return { chiudi() {} }
    }
  }
  return { dip, lanci, letti, guardati, timer }
}

let attivo: { deactivate(): Promise<void> | void } | undefined
afterEach(async () => {
  await attivo?.deactivate()
  attivo = undefined
})
async function monta(f: Finte, settings: Record<string, unknown> = {}) {
  const host = mockHost({
    results: { 'workspace.list': { workspaces: [], truncated: false }, 'terminal.focus': { focused: true }, 'workspace.open': { opened: true }, 'commands.run': { ran: true }, 'notifications.show': { delivered: true }, 'statusBar.update': { ok: true } },
    settings
  })
  const worker = await mountWorker({ default: (orca) => avvia(orca, f.dip), deactivate }, { host, events: ['agent.status.changed', 'workspace.changed', 'workspace.created', 'workspace.removed'], commands: ['show'] })
  attivo = worker
  return { host, worker }
}

test('worker, nothing configured: a full picture, no state file looked for, read-only commands only', async () => {
  const f = finte()
  const { host, worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.equal(q.fonti.cli.ok, true)
  assert.deepEqual(q.bot.map((b: { nome: string }) => b.nome), ['Atlas', 'Echo', 'Pixel', 'Nova', 'Sage', 'Bolt'])
  assert.equal(q.coda.diTutti, true)
  assert.equal(q.fermo, false)
  // The optional state file is off: not an error, and nothing outside the bot homes is read or watched.
  assert.deepEqual([q.fonti.motore.spento, q.fonti.motore.ok, q.fonti.motore.errore], [true, false, null])
  assert.ok(f.letti.every((p) => /\/\.orca\/bots\/[a-z]+\/bot\.json$/.test(p)), f.letti.join())
  assert.ok(f.guardati.every((c) => c.startsWith(HOME + '/.orca/bots')), f.guardati.join())
  // Only the fixed list of read commands, each with --json, and a bot only by its id.
  const ammessi = Object.values(COMANDI).map((c) => c.filter((a) => a !== '{bot}').join(' '))
  for (const argomenti of f.lanci) {
    assert.equal(argomenti.at(-1), '--json')
    const senzaBot = argomenti.filter((a) => a !== '--json' && !/^[0-9a-f-]{36}$/.test(a)).join(' ')
    assert.ok(ammessi.includes(senzaBot), argomenti.join(' '))
  }
  // Only these host methods: nothing that writes to a terminal, starts an agent or reads automations.
  const ammesse = new Set(['workspace.readContext', 'workspace.list', 'statusBar.update', 'notifications.show', 'storage.get', 'storage.set', 'settings.get'])
  assert.deepEqual(host.calls.map((c: { method: string }) => c.method).filter((m: string) => !ammesse.has(m)), [])
  assert.equal((host.callsOf('statusBar.update').at(-1) as { id: string }).id, 'status')
  assert.deepEqual(worker.refusals, [])
})

test('worker, with settings: the chosen bot holds the queue, animations off reaches the panel', async () => {
  const f = finte()
  const { worker } = await monta(f, { queueBot: '👑 atlas', animations: 'off', expectedBots: 'Quill, Atlas', laneOrder: 'Orbit API' })
  const q = await worker.request('regia.aggiorna')
  assert.deepEqual([q.coda.diTutti, q.coda.bot, q.coda.presente], [false, 'Atlas', true])
  assert.equal(q.coda.progetti[0], 'Orbit API')
  assert.equal(q.fermo, true)
  // A bot that exists is not "not there yet".
  assert.deepEqual(q.botInArrivo, ['Quill'])
})

test('worker, with a state file: only that file is read, and only its folder is watched', async () => {
  const stato = HOME + '/notes/state.json'
  const f = finte({ [stato]: JSON.stringify({ aggiornato: new Date(NOW - 2000).toISOString(), progetti: [], incroci: [], conteggi: {} }) })
  const { worker } = await monta(f, { stateFile: '~/notes/state.json' })
  const q = await worker.request('regia.aggiorna')
  assert.deepEqual([q.fonti.motore.spento, q.fonti.motore.ok], [false, true])
  assert.ok(f.letti.includes(stato))
  assert.ok(f.guardati.includes(HOME + '/notes'))
  assert.ok(f.letti.every((p) => p === stato || /\/\.orca\/bots\/[a-z]+\/bot\.json$/.test(p)), f.letti.join())
})

test('a bot\'s mascot is read from the Orca app on this machine, and only a plain, safe SVG is accepted', async () => {
  const cartella = '/Applications/Fake.app/assets'
  const svg = (dentro: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${dentro}</svg>`)
  const con = (nomi: Record<string, Uint8Array>, collegamento = false): Dipendenze => ({
    ...finte().dip,
    elenca: async (c) => (c === cartella ? Object.keys(nomi) : []),
    stato: async (p) => {
      const b = nomi[p.slice(cartella.length + 1)]
      if (!b) throw new Error('ENOENT')
      return { file: !collegamento, byte: b.length, modificato: 5 }
    },
    leggiByte: async (p) => nomi[p.slice(cartella.length + 1)]
  })
  const buono = svg('<path d="M0 0h8v8z"/>')
  const letta = await leggiMascotta(con({ 'N1-AbCdEf12.svg': buono, 'N1-cut-AbCdEf12.webp': buono }), 'N1', null, [cartella])
  assert.equal(letta?.url.startsWith('data:image/svg+xml;base64,'), true)
  assert.equal(letta?.impronta, `mascot:N1-AbCdEf12.svg:${buono.length}:5`)
  // The same file is not read twice.
  assert.equal(await leggiMascotta(con({ 'N1-AbCdEf12.svg': buono }), 'N1', letta, [cartella]), letta)
  // Not there, another id, an id that is not an id, a link, a script, an outside resource: no picture.
  assert.equal(await leggiMascotta(con({ 'B1-AbCdEf12.svg': buono }), 'N1', null, [cartella]), null)
  assert.equal(await leggiMascotta(con({ 'N1-AbCdEf12.svg': buono }), '../N1', null, [cartella]), null)
  assert.equal(await leggiMascotta(con({ 'N1-AbCdEf12.svg': buono }, true), 'N1', null, [cartella]), null)
  for (const cattivo of ['<script>1</script>', '<image href="' + 'https:' + '//example.org/x.png"/>', '<rect onload="x()"/>', '<foreignObject/>']) {
    assert.equal(await leggiMascotta(con({ 'N1-AbCdEf12.svg': svg(cattivo) }), 'N1', null, [cartella]), null, cattivo)
  }
  assert.equal(await leggiMascotta(con({}), 'N1', null, ['/no/such/folder']), null)
})

// ---------- client and server: this machine shows, a paired Orca server holds the bots ----------

test('the Orca CLI is looked for where each system puts it, and on Linux plain `orca` is never run', () => {
  const linux = eseguibiliOrca('', '/home/demo', { sistema: 'linux', risorse: '/opt/orca-app/resources', eseguibile: '/opt/orca-app/orca-ide' })
  assert.deepEqual(linux, ['/opt/orca-app/resources/bin/orca-ide', '/home/demo/.local/bin/orca-ide', 'orca-ide'])
  // `orca` on a Linux PATH is the GNOME screen reader.
  assert.equal(linux.some((e) => e === 'orca' || e.endsWith('/orca')), false)
  // The setting comes first, with the home folder spelled out.
  assert.equal(eseguibiliOrca(' ~/bin/my-orca ', '/home/demo', { sistema: 'linux' })[0], '/home/demo/bin/my-orca')
  const mac = eseguibiliOrca('', '/Users/demo', { sistema: 'darwin' })
  assert.deepEqual(mac, [ORCA_APP, 'orca', 'orca-ide'])
})

/** A stand-in CLI for a laptop paired with the server `hub`: the bots live there, one workspace lives here. */
function conServer(opzioni: { muto?: boolean } = {}): Finte & { eseguibili: string[] } {
  const f = finte()
  const cli = demoCli(NOW) as Record<string, any>
  const eseguibili: string[] = []
  const rifiuto = (messaggio: string, code = 'invalid_argument') => JSON.stringify({ ok: false, error: { code, message: messaggio } })
  f.dip.posto = { sistema: 'linux', risorse: '/opt/orca-app/resources' }
  f.dip.lancia = async (eseguibile, argomenti) => {
    eseguibili.push(eseguibile)
    f.lanci.push(argomenti)
    const i = argomenti.indexOf('--environment')
    const server = i >= 0 ? argomenti[i + 1] : ''
    const chiave = argomenti.filter((a, n) => a !== '--json' && (i < 0 || (n !== i && n !== i + 1))).join(' ')
    if (server) {
      if (server !== 'hub') return rifiuto('Unknown Orca server in --environment ' + server)
      if (opzioni.muto) throw new Error('Command failed: timed out')
      if (chiave === 'bot list') return JSON.stringify({ ok: true, result: cli[chiave] })
      if (chiave === 'orchestration worker-list') return JSON.stringify({ ok: true, result: { workers: [] } })
      return chiave in cli ? JSON.stringify({ ok: true, result: cli[chiave] }) : rifiuto('unknown command')
    }
    // This machine's Orca: it lists the server's bots, and says which server it left out of `worktree ps`.
    if (chiave === 'bot list') return JSON.stringify({ ok: true, result: { bots: cli[chiave].bots.map((b: any) => ({ ...b, server: { name: 'hub', on: 'hub' } })), unreachable: [] } })
    if (chiave === 'worktree ps --limit 300')
      return JSON.stringify({ ok: true, result: { worktrees: [{ workspaceKind: 'git', repo: 'Scratch', displayName: 'main', path: HOME + '/scratch', branch: 'refs/heads/main', status: 'inactive', agents: [] }], hostScope: { hostIds: ['local'], omittedHostSelectors: [{ hostId: 'runtime:hub-id', selector: '--environment hub' }] } } })
    if (chiave === 'automations list') return JSON.stringify({ ok: true, result: { automations: [] } })
    if (chiave === 'orchestration inbox --limit 40 --full') return JSON.stringify({ ok: true, result: { messages: [] } })
    if (chiave === 'orchestration worker-list') return JSON.stringify({ ok: true, result: { workers: [] } })
    return rifiuto('No bot named ' + argomenti[argomenti.indexOf('--bot') + 1])
  }
  return { ...f, eseguibili }
}
const alServer = (f: Finte): string[][] => f.lanci.filter((a) => a.includes('--environment'))

test('worker, with a paired server: its bots, workspaces, messages and automations are read from it and joined with this machine', async () => {
  const f = conServer()
  const { worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.equal(q.fonti.cli.ok, true)
  assert.deepEqual(q.fonti.cli.server, [{ nome: 'hub', ok: true }])
  // The bots come whole: items, chats and the agents they started, all asked of the server by bot id.
  const solo = await (async () => {
    const g = finte()
    const m = await monta(g)
    const r = await m.worker.request('regia.aggiorna')
    await m.worker.deactivate()
    return r
  })()
  attivo = worker
  assert.deepEqual(q.bot.map((b: any) => [b.nome, b.item.length, b.worker.length, b.chat.length]), solo.bot.map((b: any) => [b.nome, b.item.length, b.worker.length, b.chat.length]))
  assert.equal(q.coda.voci.length, solo.coda.voci.length)
  assert.equal(q.messaggi.length, solo.messaggi.length)
  assert.equal(q.automazioni.length, solo.automazioni.length)
  // The workspaces of both places, each one knowing where it lives.
  assert.equal(q.schede.length, solo.schede.length + 1)
  assert.deepEqual(q.schede.filter((s: any) => !s.server).map((s: any) => s.progetto), ['Scratch'])
  assert.ok(q.schede.filter((s: any) => s.server).every((s: any) => s.server === 'hub'))
  // Every command about a bot went to its server; only `bot list` and the four place commands went to this machine.
  const qui = f.lanci.filter((a) => !a.includes('--environment')).map((a) => a.filter((x) => x !== '--json').join(' '))
  assert.deepEqual([...new Set(qui)].sort(), ['automations list', 'bot list', 'orchestration inbox --limit 40 --full', 'orchestration worker-list', 'worktree ps --limit 300'])
  assert.ok(alServer(f).length > 0 && alServer(f).every((a) => a[a.indexOf('--environment') + 1] === 'hub' && a.at(-1) === '--json'))
  // Still only the fixed list of read commands, with the server's name as the only addition.
  const ammessi = Object.values(COMANDI).map((c) => c.filter((a) => a !== '{bot}').join(' '))
  for (const a of f.lanci) assert.ok(ammessi.includes(a.filter((x, n) => x !== '--json' && x !== '--environment' && a[n - 1] !== '--environment' && !/^[0-9a-f-]{36}$/.test(x)).join(' ')), a.join(' '))
  // On Linux the CLI is the Orca app's own `orca-ide`: nothing called plain `orca` was run.
  assert.ok(f.eseguibili.every((e) => e === '/opt/orca-app/resources/bin/orca-ide'), [...new Set(f.eseguibili)].join())
})

test('worker, paired servers switched off in the settings: this machine only, and nothing is asked of a server', async () => {
  const f = conServer()
  const { worker } = await monta(f, { servers: 'local' })
  const q = await worker.request('regia.aggiorna')
  assert.deepEqual(alServer(f), [])
  assert.deepEqual(q.fonti.cli.server, [])
  // The bots are still listed, as this machine's Orca lists them; a server that is not the chosen one is left alone too.
  assert.equal(q.bot.length, 6)
  const g = conServer()
  const altro = await monta(g, { servers: 'lab' })
  await altro.worker.request('regia.aggiorna')
  assert.deepEqual(alServer(g), [])
})

test('worker, a paired server that does not answer: it is said, this machine still shows, and the round does not wait on every command', async () => {
  const f = conServer({ muto: true })
  const { worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.equal(q.fonti.cli.ok, true)
  assert.deepEqual(q.fonti.cli.server, [{ nome: 'hub', ok: false }])
  assert.deepEqual(q.schede.map((s: any) => s.progetto), ['Scratch'])
  // One group of commands found it silent; the rest of the round did not try.
  assert.ok(alServer(f).length <= 6, String(alServer(f).length))
  const V = await import('../panel/viste.js')
  assert.ok(V.fonti(q, NOW).includes('Server hub is not answering'))
})

test('a click opens the workspace of the right place when this machine and the server have the same path', async () => {
  const f = conServer()
  const cli = demoCli(NOW) as Record<string, any>
  const remota = cli['worktree ps --limit 300'].worktrees.find((w: any) => w.repo !== 'Bots' && (w.agents ?? []).some((g: any) => typeof g.address === 'string'))
  const terminale = remota.agents.find((g: any) => typeof g.address === 'string').address
  const host = mockHost({
    results: {
      'workspace.list': { workspaces: [{ id: 'qui', kind: 'worktree', name: 'x', path: remota.path, branch: null, hostId: 'local' }, { id: 'sul-server', kind: 'worktree', name: 'x', path: remota.path, branch: null, hostId: 'runtime:hub-id' }], truncated: false },
      'terminal.focus': { focused: false }, 'workspace.open': { opened: true }, 'commands.run': { ran: true }, 'notifications.show': { delivered: true }, 'statusBar.update': { ok: true }
    },
    settings: {}
  })
  const worker = await mountWorker({ default: (orca) => avvia(orca, f.dip), deactivate }, { host, events: ['agent.status.changed', 'workspace.changed', 'workspace.created', 'workspace.removed'], commands: ['show'] })
  attivo = worker
  const q = await worker.request('regia.aggiorna')
  const scheda = q.schede.find((s: any) => s.agenti.some((g: any) => g.terminale === terminale))
  assert.equal(scheda.server, 'hub')
  assert.deepEqual(await worker.request('regia.apri', { percorso: scheda.percorso, terminale }), { aperto: true, come: 'scheda' })
  assert.deepEqual((host.callsOf('workspace.open').at(-1) as { workspaceId: string }), { workspaceId: 'sul-server' })
})

// ---------- the panel never trusts a text it shows ----------

test('hostile text in any field of the picture comes out escaped in every view', async () => {
  const V = await import('../panel/viste.js')
  const veleno = '"><img src=x onerror=alert(1)><script>alert(2)</script>\'`'
  // Every string of the picture becomes hostile, except the ones the views use as keys (states, kinds, ids of fixed sets).
  const chiavi = new Set(['stato', 'tipo', 'origine', 'ufficioDa', 'ruolo', 'uid', 'id', 'chiave', 'impronta'])
  const avvelena = (x: unknown, nome = ''): unknown => {
    if (typeof x === 'string') return chiavi.has(nome) ? x : x + veleno
    if (Array.isArray(x)) return x.map((y) => avvelena(y, nome))
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, avvelena(v, k)]))
    return x
  }
  for (const base of [quadro(), quadro({ codaBot: 'Atlas' }), quadro({ codaBot: 'Nobody' })]) {
    const q = avvelena(base) as any
    // The lanes are keyed by project name: keep the keys consistent after poisoning.
    const html = [V.fonti(q, NOW), V.piede(q), V.tabellone(q, {}), V.panoramica(q, NOW, {}), V.coda(q, NOW, { aperte: q.coda.voci.map((v: any) => v.uid) }), V.flussi(q, NOW, { tutti: true }), V.ufficio(q, NOW, {}), V.incroci(q), JSON.stringify(V.schede(q))].join('\n')
    assert.ok(html.length > 5000)
    for (const vivo of ['<img src=x', '<script>alert', 'onerror=alert(1)>']) assert.equal(html.includes(vivo), false, vivo)
    // It is there, escaped: the test would mean nothing if the text were simply dropped.
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  }
})
