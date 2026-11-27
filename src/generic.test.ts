// The plugin on a setup it has never seen: invented bots and projects (demo/demo.mjs), and nothing
// configured. These tests are about the generic parts: who holds the queue, how titles are read, the
// optional state file, the settings, and what the worker reads and launches.
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import { BOTS, HOME, demoCli, demoHomes, demoSandbox, demoState } from '../demo/demo.mjs'
import { cliDiWindows, COMANDI, envPerLaCli, leggiCliAGiri, leggiMascotta, leggiSandbox, memoriaCli, RIPROVA_BOT_MS, type Dipendenze } from './fonti'
import { componi, componiCoda, leggiTitolo, normaCli, normaMotore, normaSandbox, orchestratoreTra, ordinaProgetti, proveFinite, testoAvviso, voceBarra } from './norma'
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
  assert.deepEqual(d, { codaBot: '', leggiTitoli: true, corsie: [], alias: {}, secondi: 20, avvisi: true, botAttesi: [], fileStato: '', orca: '', animazioni: true })
  assert.deepEqual(impostazioniDa(null), d)
  const s = impostazioniDa({ queueBot: '  Atlas ', titleFormat: false, laneOrder: 'Web, API ,Web,, ', animations: 'off', refreshSeconds: 5, notifications: false, expectedBots: 'Quill', stateFile: ' ~/state.json ', orcaCli: '/opt/orca' })
  assert.deepEqual(s, { codaBot: 'Atlas', leggiTitoli: false, corsie: ['Web', 'API'], alias: {}, secondi: 10, avvisi: false, botAttesi: ['Quill'], fileStato: '~/state.json', orca: '/opt/orca', animazioni: false })
  assert.equal(impostazioniDa({ refreshSeconds: 9999 }).secondi, 300)
  assert.equal(impostazioniDa({ refreshSeconds: 'soon', queueBot: 7, laneOrder: null }).secondi, 20)
  assert.equal(impostazioniDa({ queueBot: 7 }).codaBot, '')
  assert.equal(impostazioniDa({ queueBot: 'x'.repeat(500) }).codaBot.length, 80)
})

// ---------- the worker, on a stand-in Orca and stand-in files ----------

type Finte = { dip: Dipendenze; lanci: string[][]; letti: string[]; guardati: string[]; timer: { ms: number; fn: () => void }[]; elencati: string[]; byte: string[]; invii: { argomenti: string[]; ingresso: string }[] }
const SB = HOME + '/orca/sandbox'
/** `sandbox`: files under ~/orca/sandbox by relative path (`attive/<id>.json`, `registri/<name>.log`); without it there is no sandbox. */
function finte(file: Record<string, string> = {}, sandbox?: Record<string, string>): Finte {
  const cli = demoCli(NOW) as Record<string, unknown>
  const homes = demoHomes() as Record<string, unknown>
  const lanci: string[][] = [], letti: string[] = [], guardati: string[] = [], timer: { ms: number; fn: () => void }[] = [], elencati: string[] = [], byte: string[] = []
  // The only commands that write (a choice sent to the bot of the «Send choices to» menu): arguments and standard input.
  const invii: { argomenti: string[]; ingresso: string }[] = []
  // `bot item show <n>`: the item as the demo lists it, with its owner, as Orca gives it.
  const item1 = (n: string) => {
    for (const b of Object.values(BOTS)) {
      const i = ((cli[`bot item list --bot ${b.id}`] as any)?.items ?? []).find((x: any) => String(x.number) === n)
      if (i) return { item: { ...i, owner: { botId: b.id, name: b.name } }, events: [] }
    }
    return undefined
  }
  const nelSb = (p: string) => (sandbox && p.startsWith(SB + '/') ? sandbox[p.slice(SB.length + 1)] : undefined)
  const dip: Dipendenze = {
    casa: HOME,
    vivo: () => true,
    adesso: () => NOW,
    lancia: async (_eseguibile, argomenti) => {
      lanci.push(argomenti)
      const chiave = argomenti.filter((a) => a !== '--json').join(' ')
      const uno = /^bot item show (\d+)$/.exec(chiave)
      if (uno && item1(uno[1])) return JSON.stringify({ ok: true, result: item1(uno[1]) })
      if (!(chiave in cli)) throw new Error('no such command in the demo: ' + chiave)
      return JSON.stringify({ ok: true, result: cli[chiave] })
    },
    lanciaCon: async (_eseguibile, argomenti, ingresso) => {
      invii.push({ argomenti, ingresso })
      return JSON.stringify({ ok: true, result: { messageId: 'msg_demo' } })
    },
    leggiFile: async (percorso) => {
      letti.push(percorso)
      const casa = /\/\.orca\/bots\/([^/]+)\/bot\.json$/.exec(percorso)?.[1]
      if (casa && homes[casa]) return JSON.stringify(homes[casa])
      if (percorso in file) return file[percorso]
      throw new Error('ENOENT: ' + percorso)
    },
    // Like readdir: a folder that does not exist is an error (there is no audit sandbox on this machine).
    elenca: async (cartella) => {
      elencati.push(cartella)
      if (cartella.endsWith('/.orca/bots')) return Object.keys(homes)
      if (sandbox && (cartella === SB || cartella.startsWith(SB + '/'))) {
        const sotto = cartella === SB ? '' : cartella.slice(SB.length + 1) + '/'
        return [...new Set(Object.keys(sandbox).filter((k) => k.startsWith(sotto)).map((k) => k.slice(sotto.length).split('/')[0]))]
      }
      if (cartella.includes('/.orca/bots/')) return []
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    stato: async (percorso) => {
      const s = nelSb(percorso)
      if (s === undefined) throw new Error('ENOENT')
      return { file: true, byte: new TextEncoder().encode(s).length, modificato: NOW }
    },
    vero: async (percorso) => percorso,
    leggiByte: async (percorso) => {
      byte.push(percorso)
      const s = nelSb(percorso)
      if (s === undefined) throw new Error('ENOENT')
      return new TextEncoder().encode(s)
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
  return { dip, lanci, letti, guardati, timer, elencati, byte, invii }
}

let attivo: { deactivate(): Promise<void> | void } | undefined
afterEach(async () => {
  await attivo?.deactivate()
  attivo = undefined
})
async function monta(f: Finte, settings: Record<string, unknown> = {}, storage: Record<string, any> = {}) {
  const host = mockHost({
    results: { 'workspace.list': { workspaces: [], truncated: false }, 'terminal.focus': { focused: true }, 'workspace.open': { opened: true }, 'commands.run': { ran: true }, 'notifications.show': { delivered: true }, 'statusBar.update': { ok: true } },
    settings,
    storage
  })
  const worker = await mountWorker({ default: (orca) => avvia(orca, f.dip), deactivate }, { host, events: ['agent.status.changed', 'workspace.changed', 'workspace.created', 'workspace.removed'], commands: ['show'] })
  attivo = worker
  return { host, worker }
}

test('the CLI is launched with an environment that has APPDATA on Windows, where the worker has none', () => {
  // Orca starts the worker with a reduced environment: on Windows there is no APPDATA, and the CLI
  // cannot find the runtime of Orca without it, so every command comes back `runtime_unavailable`.
  const win = envPerLaCli({ SystemRoot: 'C:\\Windows' }, 'C:\\Users\\pippo', 'win32')
  assert.equal(win.APPDATA, 'C:\\Users\\pippo\\AppData\\Roaming')
  assert.equal(win.LOCALAPPDATA, 'C:\\Users\\pippo\\AppData\\Local')
  // What the worker already has is left as it is.
  assert.equal(win.SystemRoot, 'C:\\Windows')
  assert.equal(envPerLaCli({ APPDATA: 'D:\\altro' }, 'C:\\Users\\pippo', 'win32').APPDATA, 'D:\\altro')
  // Anywhere else nothing changes.
  assert.deepEqual(envPerLaCli({ PATH: '/usr/bin' }, '/home/pippo', 'linux'), { PATH: '/usr/bin' })
})

test('on Windows the CLI is looked for by its full path, because the worker runs inside the app folder', () => {
  // Launched by name alone, the CLI looks for its command in the folder it sits in, and the worker
  // runs inside the app folder: from there the command is not there, and every call dies.
  const app = 'C:\\Users\\pippo\\AppData\\Local\\Programs\\orca'
  const cli = `${app}\\resources\\bin\\orca.exe`
  assert.deepEqual(cliDiWindows('win32', `${app}\\resources`, `${app}\\Orca.exe`, 'C:\\Users\\pippo'), [cli])
  // Without `resourcesPath` the folder comes from the executable that is running.
  assert.deepEqual(cliDiWindows('win32', '', `${app}\\Orca.exe`, 'C:\\Users\\pippo'), [cli])
  // With neither, the default install folder is tried.
  assert.deepEqual(cliDiWindows('win32', '', '', 'C:\\Users\\pippo'), [cli])
  // Anywhere else nothing is added: the CLI is where `ORCA_APP` says.
  assert.deepEqual(cliDiWindows('linux', '/opt/orca/resources', '/opt/orca/orca', '/home/pippo'), [])
})

/**
 * `bot list` as a hung paired server makes it: the CLI is killed by the deadline. Every command that also asks the paired
 * servers hangs the same way, `worktree ps --since …` (which carries `otherBots`) included: it is killed too. The bots of this
 * computer are then only in their homes (`~/.orca/bots/<home>/bot.json`), which the demo dip serves.
 */
function conListaCheNonRisponde(opzioni: { killed?: boolean } = { killed: true }) {
  const f = finte()
  const demo = f.dip.lancia
  const log: { eseguibile: string; comando: string; scadenza?: number }[] = []
  const stato = { lenta: true }
  f.dip.lancia = async (eseguibile, argomenti, scadenzaMs) => {
    const comando = argomenti.filter((a) => a !== '--json').join(' ')
    log.push({ eseguibile, comando, scadenza: scadenzaMs })
    if (comando === 'bot list' && stato.lenta) throw Object.assign(new Error('Command failed'), opzioni.killed ? { killed: true, signal: 'SIGTERM' } : { code: 'ENOENT' })
    if (comando.startsWith('worktree ps') && comando.includes('--since')) throw Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' })
    return demo(eseguibile, argomenti, scadenzaMs)
  }
  return { f, log, stato }
}
const botsLocali = () => (demoCli(NOW) as any)['bot list'].bots as any[]

test('a `bot list` that hangs does not take the panel down: this computer\'s bots show, the notice says why, the full list is retried a minute later', async () => {
  const { f, log, stato } = conListaCheNonRisponde()
  const mem = memoriaCli()
  let ora = NOW
  f.dip.adesso = () => ora
  // The first round: `bot list` is tried once, with its deadline, and killed.
  const uno = await leggiCliAGiri(f.dip, '', mem, { tutto: true, scadenzaBotMs: 3000 })
  assert.deepEqual(uno.bots.map((b: any) => b.id).sort(), botsLocali().map((b) => b.id).sort())
  assert.deepEqual(uno.parziale, { motivo: 'timeout', secondi: 3 })
  assert.deepEqual(log.filter((l) => l.comando === 'bot list').map((l) => l.scadenza), [3000])
  // The bots' own items, work and chats still come: the rest of the round ran.
  assert.ok(log.some((l) => l.comando.startsWith('bot item list --bot ')))
  // The bots come from a command that answers, and the plugin keeps using the CLI that answered.
  assert.ok(mem.buono)
  // The next rounds (every 4 s) do not pay the deadline again.
  const antes = log.filter((l) => l.comando === 'bot list').length
  ora += 4000
  const due = await leggiCliAGiri(f.dip, '', mem, { quanti: 1 })
  assert.equal(log.filter((l) => l.comando === 'bot list').length, antes)
  assert.deepEqual(due.parziale, { motivo: 'timeout', secondi: 3 })
  // A minute later the full list is asked for again IN THE BACKGROUND: the round does not wait for it (it would cost the deadline).
  ora += RIPROVA_BOT_MS
  stato.lenta = false
  const tre = await leggiCliAGiri(f.dip, '', mem, { quanti: 1 })
  assert.equal(log.filter((l) => l.comando === 'bot list').length, antes + 1)
  assert.deepEqual(tre.parziale, { motivo: 'timeout', secondi: 3 })
  // It answered: the next round has the full list and no notice.
  await mem.sonda
  ora += 4000
  const quattro = await leggiCliAGiri(f.dip, '', mem, { quanti: 1 })
  assert.equal(quattro.parziale, undefined)
  assert.equal(mem.lista, null)
  assert.equal(log.filter((l) => l.comando === 'bot list').length, antes + 1)
  // A background try that is killed again keeps the notice and waits another minute.
  stato.lenta = true
  const otra = conListaCheNonRisponde()
  const m2 = memoriaCli()
  let ora2 = NOW
  otra.f.dip.adesso = () => ora2
  await leggiCliAGiri(otra.f.dip, '', m2, { tutto: true })
  ora2 += RIPROVA_BOT_MS
  await leggiCliAGiri(otra.f.dip, '', m2, { quanti: 1 })
  await m2.sonda
  assert.equal(m2.piena, null)
  assert.equal(m2.lista?.quando, ora2)
})

test('the retry of a hung bot list never holds a round: the round returns while the retry is still pending', async () => {
  const { f } = conListaCheNonRisponde()
  const mem = memoriaCli()
  let ora = NOW
  f.dip.adesso = () => ora
  await leggiCliAGiri(f.dip, '', mem, { tutto: true })
  const real = f.dip.lancia
  // From now on bot list hangs for good (never answers); the rest answers.
  f.dip.lancia = (e, a, s) => (a.includes('list') && a[0] === 'bot' && a.length <= 3 ? new Promise<string>(() => {}) : real(e, a, s))
  ora += RIPROVA_BOT_MS
  const ronda = await Promise.race([leggiCliAGiri(f.dip, '', mem, { quanti: 1 }), new Promise<string>((r) => setTimeout(() => r('held'), 1500))])
  assert.notEqual(ronda, 'held')
  assert.ok(mem.sonda, 'the retry is running in the background')
})

test('a `bot list` killed by its deadline is not tried again with the next executable', async () => {
  const { f, log } = conListaCheNonRisponde()
  await leggiCliAGiri(f.dip, '/custom/orca', memoriaCli(), { tutto: true })
  // One executable answered the deadline: the others would only wait the same time again.
  assert.equal(new Set(log.filter((l) => l.comando === 'bot list').map((l) => l.eseguibile)).size, 1)
  assert.equal(log.find((l) => l.comando === 'bot list')?.eseguibile, '/custom/orca')
  // The rest of the round goes to that same executable.
  assert.equal(log.find((l) => l.comando === 'worktree ps --limit 300')?.eseguibile, '/custom/orca')
  // And nothing asks the paired servers again: no `--since`.
  assert.equal(log.some((l) => l.comando.includes('--since')), false)
  // An executable that is not there (not a deadline) does let the next one try.
  const falta = conListaCheNonRisponde({ killed: false })
  await leggiCliAGiri(falta.f.dip, '/custom/orca', memoriaCli(), { tutto: true })
  assert.ok(new Set(falta.log.filter((l) => l.comando === 'bot list').map((l) => l.eseguibile)).size > 1)
})

test('with no bot homes either, the failure is the failure of `bot list`, as before; and `bot list` is not retried inside every round', async () => {
  const { f, log } = conListaCheNonRisponde()
  f.dip.elenca = async () => {
    throw new Error('ENOENT')
  }
  const mem = memoriaCli()
  await assert.rejects(() => leggiCliAGiri(f.dip, '', mem, { tutto: true }))
  const una = log.filter((l) => l.comando === 'bot list').length
  // The next round (4 s later) does not wait the deadline again.
  await assert.rejects(() => leggiCliAGiri(f.dip, '', mem, { tutto: true }))
  assert.equal(log.filter((l) => l.comando === 'bot list').length, una)
  assert.equal(log.some((l) => l.comando.includes('--since')), false)
})

test('the bots of this computer come from their homes, whatever the paired servers do: ids, names and agents', async () => {
  const { f } = conListaCheNonRisponde()
  const g = await leggiCliAGiri(f.dip, '', memoriaCli(), { tutto: true })
  assert.deepEqual(g.bots.map((b: any) => b.id).sort(), botsLocali().map((b) => b.id).sort())
  assert.ok(g.bots.every((b: any) => b.name && b.agent === 'claude' && b.paused === false))
  assert.deepEqual(g.parziale, { motivo: 'timeout', secondi: 10 })
})

test('worker: a hung `bot list` shows the local bots and an amber notice, not the red banner or "data stalled"', async () => {
  const { f } = conListaCheNonRisponde()
  const { worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.equal(q.fonti.cli.ok, true)
  assert.equal(q.fonti.cli.parziale?.motivo, 'timeout')
  assert.ok(q.bot.length > 0)
  const V = await import('../panel/viste.js')
  const html = V.fonti(q, NOW)
  assert.ok(html.includes('class="fonte avviso"'), html)
  assert.ok(html.includes('only this computer'), html)
  assert.ok(!html.includes('guasto') && !html.includes('not answering'), html)
  assert.ok(!voceBarra(q).text.includes('stalled'))
})

test('"data stalled" only when no source is alive: the plugin API alone keeps the status bar from saying it', () => {
  const sinCli = (workspaces: any[] | null) => componi({ adesso: NOW, cli: { parte: null, quando: null, errore: 'no CLI' }, motore: { parte: null, errore: null }, motoreSpento: true, api: { workspaces }, botInArrivo: [], casa: HOME, opzioni: NEUTRE })
  // Nothing alive: stalled, in red.
  const muerto = voceBarra(sinCli(null))
  assert.deepEqual([muerto.text, muerto.tone], [`${NOME} · data stalled`, 'danger'])
  // The CLI is down but Orca's own window answers: a warning that says what is stale, not "stalled".
  const vivo = voceBarra(sinCli([{ id: 'w1', path: HOME + '/code/x', displayName: 'x', status: 'working' }]))
  assert.equal(vivo.tone, 'warning')
  assert.ok(!vivo.text.includes('stalled'), vivo.text)
  assert.ok(vivo.tooltip.includes('Orca window'), vivo.tooltip)
})

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

// ---------- the panel never trusts a text it shows ----------

// ---------- the optional state file, when it stops being written ----------

const MIN = 60_000
/** The picture with a state file set, last written `age` milliseconds ago. */
const conStato = (age: number, altro: Record<string, unknown> = {}) => {
  const p = parte()
  return quadro({}, { motore: { parte: normaMotore(demoState(NOW, age), p.bot, HOME), errore: null }, motoreSpento: false, ...altro })
}
const tutteLeViste = async (q: any, ora = NOW): Promise<string> => {
  const V = await import('../panel/viste.js')
  return [V.fonti(q, ora), V.piede(q), V.tabellone(q, { aperto: 'lavoro' }), V.panoramica(q, ora, {}), V.coda(q, ora, {}), V.flussi(q, ora, {}), V.ufficio(q, ora, {}), V.ufficio(q, ora, { lista: true }), V.incroci(q)].join('\n')
}
const ALLARMI = ['State file stopped', 'state file stopped', 'not updated', 'motore-fermo', 'non-agg', 'stato-vecchio', 'vecchia', 'Engine']

test('no state file set: nothing ever says that one stopped, in the panel or in the status bar', async () => {
  const V = await import('../panel/viste.js')
  const senzaCli = { cli: { parte: null, quando: null, errore: 'orca is not answering' } }
  // The default setup, then with a queue holder, then with the Orca CLI down, then hours later.
  for (const [nome, q, ora] of [['default', quadro(), NOW], ['queue holder', quadro({ codaBot: 'Atlas' }), NOW], ['CLI down', quadro({}, senzaCli), NOW], ['hours later', quadro(), NOW + 300 * MIN]] as const) {
    assert.equal(q.fonti.motore.spento, true, nome)
    assert.equal(q.fonti.motore.ultimi, undefined, nome)
    assert.equal(V.motoreFermo(q, ora), '', nome)
    const html = await tutteLeViste(q, ora)
    const barra = voceBarra(q)
    for (const allarme of ALLARMI) assert.equal(html.includes(allarme) || barra.text.includes(allarme) || barra.tooltip.includes(allarme), false, `${nome}: ${allarme}`)
    assert.equal(q.progetti.flatMap((p) => p.agenti).some((a) => a.vecchio !== undefined || a.statoVecchio), false, nome)
  }
  // With everything answering the header is silent, and the status bar is not red.
  assert.equal(V.fonti(quadro(), NOW), '')
  assert.notEqual(voceBarra(quadro()).tone, 'danger')
  assert.equal(voceBarra(quadro({}, senzaCli)).tooltip, 'The Orca CLI is not answering: the data may be stale.')
})

test('a state file that is set and fresh: its data shows, and nothing is marked', async () => {
  const q = conStato(2000)
  assert.deepEqual([q.fonti.motore.spento, q.fonti.motore.ok, q.fonti.motore.ultimi, q.fonti.ufficioDa], [false, true, undefined, 'motore'])
  const html = await tutteLeViste(q)
  for (const allarme of ALLARMI) assert.equal(html.includes(allarme) || voceBarra(q).text.includes(allarme), false, allarme)
  assert.ok(html.includes('<b class="num">41%</b>') && html.includes('opus-5-5'))
  // One minute is still fresh; a second more is not.
  assert.equal(conStato(MIN).fonti.motore.ok, true)
  assert.equal(conStato(MIN + 1000).fonti.motore.ok, false)
})

test('a state file that is set and stopped: a red band and a red status bar say so, and its last data stays, marked', async () => {
  const V = await import('../panel/viste.js')
  const q = conStato(12 * MIN)
  assert.deepEqual([q.fonti.motore.spento, q.fonti.motore.ok, q.fonti.motore.ultimi, q.fonti.ufficioDa], [false, false, true, 'cli'])
  const ora = V.oraDi(NOW - 12 * MIN)
  const fascia = V.motoreFermo(q, NOW)
  for (const pezzo of ['<div class="motore-fermo">', '<b>State file stopped</b>', `for 12 min · last data ${ora}`, 'marked “not updated”', 'States come from the Orca CLI', '“State file” setting']) assert.ok(fascia.includes(pezzo), pezzo)
  // The band is in the header, so it is on top of every view.
  assert.ok(V.fonti(q, NOW).startsWith(fascia))
  // States are the fresh ones of the CLI; model, context and sub-agents are the last ones, with their time.
  const agenti = q.progetti.flatMap((p) => p.agenti)
  const rate = agenti.find((a) => a.terminale === 'term_demo_rate')!
  assert.deepEqual([rate.stato, rate.modello, rate.contestoPct, rate.subAttivi, rate.vecchio, rate.statoVecchio], ['al lavoro', 'opus-5-5', 41, 2, NOW - 12 * MIN, undefined])
  // An agent the state file never knew has no such mark: its data is simply missing.
  assert.equal(agenti.find((a) => a.terminale === 'term_demo_sync')!.vecchio, undefined)
  const lista = V.ufficio(q, NOW, { lista: true })
  assert.equal((lista.match(/<span class="stat vecchia">/g) ?? []).length, 3)
  assert.ok(lista.includes(`not updated since ${ora}</span>`) && lista.includes('<b class="num">41%</b>'))
  // Overlaps are from then: they are not shown as if they held now.
  assert.deepEqual([q.fonti.incrociDisponibili, q.incroci.length], [false, 0])
  // The status bar: red, whatever is in the queue, inside the 256 characters Orca accepts.
  const barra = voceBarra(q)
  assert.deepEqual([barra.text.startsWith(`${NOME} · state file stopped`), barra.tone], [true, 'danger'])
  assert.ok(barra.tooltip.startsWith(`State file stopped since ${ora}: sub-agents, context and overlaps are not updated.`))
  assert.ok(barra.tooltip.length <= 256)
  // Set, but the file cannot be read at all: the band says so, with no time and nothing marked.
  const mai = quadro({}, { motore: { parte: null, errore: 'ENOENT' }, motoreSpento: false })
  const senza = V.motoreFermo(mai, NOW)
  assert.ok(senza.includes('it cannot be read') && senza.includes('are missing'))
  for (const brutto of ['undefined', 'NaN', 'null', 'style=']) assert.equal(fascia.includes(brutto) || senza.includes(brutto), false, brutto)
})

test('worker: the stopped state file reaches the status bar only when a state file is set', async () => {
  const stato = HOME + '/notes/state.json'
  const vecchio = JSON.stringify(demoState(NOW, 12 * MIN))
  // Set: the worker says it, in red.
  const con = finte({ [stato]: vecchio })
  const a = await monta(con, { stateFile: '~/notes/state.json' })
  const q = await a.worker.request('regia.aggiorna')
  assert.deepEqual([q.fonti.motore.spento, q.fonti.motore.ok, q.fonti.motore.ultimi], [false, false, true])
  const voce = a.host.callsOf('statusBar.update').at(-1) as { text: string; tone: string }
  assert.deepEqual([voce.text.includes('state file stopped'), voce.tone], [true, 'danger'])
  await a.worker.deactivate()
  // Not set: the same file is on disk and is never read, and nothing is said.
  const senza = finte({ [stato]: vecchio })
  const b = await monta(senza)
  const p = await b.worker.request('regia.aggiorna')
  assert.deepEqual([p.fonti.motore.spento, p.fonti.motore.ultimi], [true, undefined])
  assert.equal(senza.letti.includes(stato), false)
  for (const c of b.host.callsOf('statusBar.update') as { text: string; tooltip?: string; tone: string }[]) {
    assert.equal(c.text.includes('stopped') || String(c.tooltip ?? '').includes('stopped') || c.tone === 'danger', false, c.text)
  }
})

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
  const scelte = (q: any) => ({ ...q, invioScelte: { bot: 'Atlas' } })
  for (const base of [quadro(), quadro({ codaBot: 'Atlas' }), quadro({ codaBot: 'Nobody' }), conStato(12 * MIN), quadro({}, { sandbox: sandboxDemo() }), scelte(quadro({ codaBot: 'Atlas' })), { ...quadro(), invioScelte: { manca: 'Nobody' } }]) {
    const q = avvelena(base) as any
    // The lanes are keyed by project name: keep the keys consistent after poisoning.
    const html = [V.fonti(q, NOW), V.piede(q), V.tabellone(q, {}), V.tabellone(q, { aperto: 'lavoro' }), V.panoramica(q, NOW, {}), V.coda(q, NOW, { aperte: q.coda.voci.map((v: any) => v.uid) }), V.coda(q, NOW, { esiti: Object.fromEntries(q.coda.voci.filter((v: any) => v.domanda?.domande?.[0]?.opzioni?.length).flatMap((v: any) => [[`${v.uid}:${v.domanda.evento}:0`, { o: 0, stato: 'errore', motivo: veleno }]])) }), V.flussi(q, NOW, { tutti: true }), V.ufficio(q, NOW, {}), V.ufficio(q, NOW, { lista: true }), V.ufficio(q, NOW, { scelto: 'term_demo_rate' }), V.incroci(q), JSON.stringify(V.schede(q)), ...(q.sandbox ? q.sandbox.prove.map((p: any) => V.schedaProva(q, NOW, { prova: p.id, registro: { stato: 'pronto', nome: p.registro, testo: p.comando } })) : [])].join('\n')
    assert.ok(html.length > 5000)
    for (const vivo of ['<img src=x', '<script>alert', 'onerror=alert(1)>']) assert.equal(html.includes(vivo), false, vivo)
    // It is there, escaped: the test would mean nothing if the text were simply dropped.
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  }
})

// ---------- the audit sandbox: shown only where it exists ----------

/** The invented sandbox as the worker reads it: two runs going, and one that ended a few minutes ago. */
const sandboxDemo = () => {
  const s = demoSandbox(NOW)
  const vive = normaSandbox(s.attive, () => true, HOME)
  const finita = normaSandbox([s.finita.file], () => true, HOME)
  return { prove: [...vive, ...proveFinite(finita, vive, NOW - 4 * MIN)] }
}
const SEGNI_SANDBOX = ['lucch', 'recinto', 'in-sbx', 'tab-sbx', 'scheda-prova', 'prova-r', 'data-prova', 'data-blocchi', 'Sandbox', 'sandbox', 'blocked by', 'third-party code']

test('no sandbox on this machine: no room, no lock, no count, no error, in any view', async () => {
  const V = await import('../panel/viste.js')
  for (const [nome, q] of [['default', quadro()], ['queue holder', quadro({ codaBot: 'Atlas' })], ['state file', conStato(2000)], ['state file stopped', conStato(12 * MIN)]] as const) {
    assert.equal('sandbox' in q, false, nome)
    const html = (await tutteLeViste(q)) + V.ufficio(q, NOW, { scelto: 'term_demo_rate' }) + V.schedaProva(q, NOW, { prova: 'x' })
    for (const segno of SEGNI_SANDBOX) assert.equal(html.includes(segno), false, `${nome}: ${segno}`)
  }
  // A sandbox folder with nothing running shows nothing either.
  const vuota = quadro({}, { sandbox: { prove: [] } })
  const html = (await tutteLeViste(vuota)) + V.ufficio(vuota, NOW, { scelto: 'term_demo_rate' })
  for (const segno of SEGNI_SANDBOX) assert.equal(html.includes(segno), false, `empty: ${segno}`)
})

test('worker, no sandbox: the folder is looked for once a round and nothing in it is read or watched', async () => {
  const f = finte()
  const { worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.equal('sandbox' in q, false)
  assert.deepEqual(f.elencati.filter((c) => c.includes('/orca/sandbox')), [SB])
  assert.ok(!f.guardati.some((c) => c.includes('sandbox')) && !f.byte.some((c) => c.includes('sandbox')))
  assert.deepEqual(await worker.request('regia.registro', { prova: 'anything' }), { stato: 'sconosciuta', nome: '', testo: '' })
})

test('the sandbox, when it runs: a fenced room, a lock on who is inside, the counts, and the run card', async () => {
  const V = await import('../panel/viste.js')
  const sb = sandboxDemo()
  assert.deepEqual(sb.prove.map((p) => [p.nome, p.stato]), [['left-pad-fork', 'in_corso'], ['csv-tool', 'in_corso'], ['md-render', 'finita']])
  const q = quadro({}, { sandbox: sb })
  // The scoreboard: two in the sandbox, three attempts blocked.
  const tab = V.tabellone(q, {})
  assert.ok(tab.includes('class="tab-sbx"') && /<b class="num">2<\/b><span>in sandbox<\/span>/.test(tab) && /<b class="num">3<\/b><span>blocked<\/span>/.test(tab))
  // The Office: the fenced room first, with the agent of the terminal and the bot that ran one from its chat.
  const mappa = V.ufficio(q, NOW, {})
  assert.ok(mappa.includes('class="stanza-m recinto viva"') && mappa.includes('fenced room: running third-party code'))
  assert.equal((mappa.match(/class="lucch-m/g) || []).length, 4) // two runs, each drawn on the narrow and the wide map
  assert.ok(mappa.includes('✓ md-render · 2 blocked'))
  const lista = V.ufficio(q, NOW, { lista: true })
  assert.ok(lista.includes('<fieldset class="stanza recinto">') && lista.includes('left-pad-fork') && lista.includes('csv-tool') && lista.includes('md-render'))
  // Sage's card in the Overview carries the lock and the button to its run.
  const pan = V.panoramica(q, NOW, {})
  const sage = pan.slice(pan.indexOf('data-bot="Sage"'), pan.indexOf('</article>', pan.indexOf('data-bot="Sage"')))
  assert.ok(sage.includes('class="lucch"') && sage.includes('class="in-sbx"'))
  // The run card: live while it runs, the log once it ended.
  const viva = V.schedaProva(q, NOW, { prova: sb.prove[0].id })
  assert.ok(viva.includes('sandbox · live') && viva.includes('npm test') && viva.includes('registry.npmjs.org') && viva.includes('3 blocked') && viva.includes('The log is written when the run ends'))
  const finita = V.schedaProva(q, NOW, { prova: sb.prove[2].id, registro: { stato: 'pronto', nome: 'x.log', testo: demoSandbox(NOW).finita.registro } })
  assert.ok(finita.includes('sandbox · ended') && finita.includes('class="reg"') && finita.includes('<span class="no">   1   curl deny(1)'))
})

test('worker, with a sandbox: only its status files and, on request, a log of a run it knows', async () => {
  const s = demoSandbox(NOW)
  const files: Record<string, string> = { 'attive/notes.txt': 'not a status file', 'attive/half.json.tmp': '{' }
  for (const a of s.attive) files['attive/' + a.nome] = a.testo
  const nomeLog = JSON.parse(s.attive[0].testo).registro.split('/').pop()
  files['registri/' + nomeLog] = '# Sandbox: run log\n'
  const f = finte({}, files)
  const { worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.deepEqual(q.sandbox.prove.map((p: { nome: string }) => p.nome), ['left-pad-fork', 'csv-tool'])
  assert.ok(f.guardati.includes(SB + '/attive'))
  assert.ok(f.byte.every((p) => p.startsWith(SB + '/attive/') && p.endsWith('.json')), f.byte.join())
  assert.deepEqual(await worker.request('regia.registro', { prova: q.sandbox.prove[0].id }), { stato: 'pronto', nome: nomeLog, testo: '# Sandbox: run log\n' })
  assert.equal((await worker.request('regia.registro', { prova: q.sandbox.prove[1].id })).stato, 'manca')
  assert.equal((await worker.request('regia.registro', { prova: '../../etc/passwd' })).stato, 'sconosciuta')
  assert.equal((await leggiSandbox(f.dip))!.length, 2)
})

test('CLI marks: Codex and Grok CLI show their own mark; Claude Code and Gemini CLI keep a neutral shape with the name written', async () => {
  const V = await import('../panel/viste.js')
  assert.ok(V.marchio('openai').includes('<span class="segno-m" aria-hidden="true">&gt;_</span>') && V.marchio('openai').includes('aria-label="Codex"'))
  assert.ok(V.marchio('grok').includes('<img src="./marchi/grok-cli.svg"') && V.marchio('grok').includes('aria-label="Grok CLI"'))
  for (const [id, nome] of [['claude', 'Claude'], ['gemini', 'Gemini']]) {
    const m = V.marchio(id)
    assert.ok(m.includes('class="marchio neutro"') && m.includes(`<span class="nome-m">${nome}</span>`) && !m.includes('<img'), id)
  }
})

// ---------- a bot counts once (0.8.4) ----------
// Orca lists every chat a bot has ever had in its home, old and finished ones included. With about ten
// bots the Office showed 65 avatars in the bots' room and counted 74 agents. Here eight invented bots have
// eight chats each, one of them works in two projects that both have a workspace called «main», and the
// same bot comes back twice from `bot list`: each stays one, known by its id.

const idOf = (n: number): string => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`
function eightByEight() {
  const bots = Array.from({ length: 8 }, (_, i) => ({ id: idOf(i + 1), name: 'Bot' + (i + 1), agent: 'claude', paused: false, specialty: '' }))
  const chat = (n: number, k: number) => ({
    address: `orca_session_id:b${n}-c${k}`,
    state: n === 1 && k === 5 ? 'working' : n === 3 && k === 6 ? 'blocked' : 'done',
    agentType: 'claude',
    conversationName: k === 0 ? 'Bot' + n : `Bot${n}: chat ${k}`,
    stateStartedAt: NOW - (k + 1) * 60_000
  })
  const homes = bots.map((b, i) => ({
    workspaceKind: 'folder-workspace', worktreeId: 'folder:' + b.id, repo: 'Bots', displayName: b.name, path: `${HOME}/.orca/bots/bot${i + 1}`, branch: '', status: 'inactive', bot: b.name, botHome: true,
    agents: [...Array.from({ length: 8 }, (_, k) => chat(i + 1, k)), ...(i === 1 ? [{ address: 'term_wb2', state: 'working', agentType: 'codex', taskTitle: 'Deploy the bot', stateStartedAt: NOW - 5000 }] : [])]
  }))
  const projects = [
    { workspaceKind: 'git', worktreeId: 'repo-alpha::/work/alpha', repo: 'alpha', displayName: 'main', path: HOME + '/work/alpha', bot: 'Bot2', agents: [{ address: 'term_alpha', state: 'working', agentType: 'claude', taskTitle: 'Redo the page', stateStartedAt: NOW - 9000 }] },
    { workspaceKind: 'git', worktreeId: 'repo-beta::/work/beta', repo: 'beta', displayName: 'main', path: HOME + '/work/beta', bot: null, agents: [{ address: 'term_beta', state: 'done', agentType: 'claude', conversationName: 'beta', stateStartedAt: NOW - 90_000 }] }
  ]
  const perBot = Object.fromEntries(bots.map((b) => [b.id, { item: { items: [] }, chat: { chats: [] }, lavori: { workspaces: b.name === 'Bot2' ? [{ id: 'repo-alpha::/work/alpha', name: 'main' }] : [] } }]))
  return { bots, perBot, schede: [...homes, ...projects], automazioni: [], posta: [], operai: [] }
}
const eightQuadro = () => componi({ adesso: NOW, cli: { parte: normaCli(eightByEight(), HOME), quando: NOW, errore: null }, motore: { parte: null, errore: null }, motoreSpento: true, api: { workspaces: null }, botInArrivo: [], casa: HOME, opzioni: NEUTRE })

test('eight bots with eight chats each are eight avatars in the Office, and every count says the same', async () => {
  const V = await import('../panel/viste.js')
  const q = eightQuadro()
  const bots = q.progetti.flatMap((p) => p.agenti.filter((a) => a.bot).map((a) => ({ ...a, room: p.nome })))
  // One avatar per bot, named after the bot (not the chat), in the bots' room.
  assert.deepEqual(bots.map((a) => a.nome).sort(), ['Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5', 'Bot6', 'Bot7', 'Bot8'])
  assert.ok(bots.every((a) => a.room === 'Bots'))
  // The state is the one of its most active chat, and a click opens that chat; with all of them idle, the latest.
  const of = (n: string) => bots.find((a) => a.nome === n)!
  assert.deepEqual([of('Bot1').stato, of('Bot3').stato, of('Bot8').stato], ['al lavoro', 'aspetta te', 'fermo'])
  assert.deepEqual([of('Bot1').terminale, of('Bot8').terminale], ['orca_session_id:b1-c5', 'orca_session_id:b8-c0'])
  // A worker with a task in a bot's home stays an agent.
  assert.deepEqual(q.progetti.find((p) => p.nome === 'Bots')!.agenti.filter((a) => !a.bot).map((a) => [a.nome, a.ruolo]), [['Deploy the bot', 'worker']])
  // 8 bots, the worker in a home and the two project agents: 11, on the Office tab, in the scoreboard, at the bottom.
  const tabs = Object.fromEntries(V.schede(q).map(([id, , n]: [string, string, number]) => [id, n]))
  assert.deepEqual([tabs.panoramica, tabs.ufficio, q.conteggi.agenti, q.conteggi.lavoro, q.conteggi.aspettano], [8, 11, 11, 3, 1])
  const c = V.contiTabellone(q)
  assert.deepEqual([c.agenti, c.lavoro, c.aspettano], [11, 3, 1])
  assert.ok(V.ufficio(q, NOW, {}).includes('Office map: 3 rooms, 11 agents.'))
  // No question is lost: the waiting chat of Bot3 is still among what waits on the person.
  assert.deepEqual(q.attese.filter((a) => a.origine === 'agente').map((a) => a.chi), ['Bot3'])
})

test('a bot working in two projects gets only its own workspace, found by id, not every workspace with the same name', () => {
  const q = eightQuadro()
  const bot2 = q.bot.find((b) => b.nome === 'Bot2')!
  assert.deepEqual(bot2.worker.map((s) => s.progetto), ['alpha'])
  assert.deepEqual(bot2.figli?.map((f) => f.nome), ['Redo the page'])
  assert.deepEqual(q.progetti.find((p) => p.nome === 'beta')!.agenti.map((a) => [a.nome, a.bot]), [['beta', false]])
})

test('the same bot twice in `bot list` (same id, once from a paired server) is one bot', () => {
  const g = eightByEight()
  const twice = { ...g, bots: [{ ...g.bots[0], server: { name: 'home-mac', on: 'home-mac' } }, ...g.bots] }
  const bots = normaCli(twice, HOME).bot
  assert.equal(bots.length, 8)
  // The copy from this computer stays, even when the server's copy comes first.
  assert.equal(bots.filter((b) => b.id === idOf(1)).length, 1)
})

test('with a state file: an agent that touched a bot\'s files from a project stays an agent, and many sessions of a bot are one avatar', () => {
  const s = (nome: string, cartella: string, stato: string, tocca: string[] = [], terminale: string | null = null) => ({ nome, stato, dettaglio: '', fermoDaSecondi: 30, modello: 'opus', sforzo: 'high', contesto: 1000, finestra: 1_000_000, cacheScadeTraSecondi: 100, tipo: 'interattiva', cartella, terminaleOrca: terminale, domanda: '', tocca, subAgentiAttivi: stato === 'al lavoro' ? ['Explore: x'] : [], subAgentiConclusi: 1 })
  const state = { aggiornato: new Date(NOW - 2000).toISOString(), conteggi: {}, coda: [], incroci: [], progetti: [
    { nome: 'alpha', schede: ['x'], agenti: [s('alpha-x', '~/work/alpha', 'al lavoro', ['~/.orca/bots/bot2/SOUL.md'], 'term_x')] },
    { nome: 'Bots', schede: ['Bot1'], agenti: [s('Home', '~/.orca/bots/bot1', 'fermo'), s('Chat 2', '~/.orca/bots/bot1', 'al lavoro'), s('Chat 3', '~/.orca/bots/bot1', 'errore')] }
  ] }
  const known = [{ nome: 'Bot1', casa: 'bot1' }, { nome: 'Bot2', casa: 'bot2' }]
  const motore = normaMotore(state, known, HOME)
  assert.deepEqual(motore.progetti.flatMap((p) => p.agenti).map((a) => [a.nome, a.bot]), [['alpha-x', false], ['Bot1', true], ['Bot1', true], ['Bot1', true]])
  const q = componi({ adesso: NOW, cli: { parte: null, quando: null, errore: 'no CLI' }, motore: { parte: motore, errore: null }, api: { workspaces: null }, botInArrivo: [], casa: HOME, opzioni: NEUTRE })
  // Without the CLI the bots come from the state file: Bot1 once, not once per session.
  assert.deepEqual(q.bot.map((b) => b.nome), ['Bot1'])
  // One avatar, working (the working chat counts more than an old one in error), with the sub-agents of all its sessions.
  assert.deepEqual(q.progetti.flatMap((p) => p.agenti.filter((a) => a.bot)).map((a) => [a.nome, a.stato, a.subAttivi, a.subConclusi]), [['Bot1', 'al lavoro', 1, 3]])
  assert.equal(q.conteggi.agenti, 2)
})

// ---------- the queue's options are buttons; a click sends a choice only to a bot the person picked ----------

const ATLAS = BOTS.atlas.id
/** Atlas's item 12, as the queue keys it when every bot's items are shown. */
const DODICI = { item: `${ATLAS}:demo-12`, evento: 'ev-12', q: 0, o: 1 }
/** The «Send choices to» menu set to a bot, as the plugin's storage keeps it. */
const scelto = (b: { id: string; name: string }) => ({ 'scelte.bot': { id: b.id, nome: b.name } })

test('the manifest adds nothing to what 0.8.4 contributed: same capabilities, execution, settings, commands, panels, events', async () => {
  // The bot that receives choices is picked in the panel and kept in the plugin's storage, not in a setting:
  // a new setting would count as more access, and Orca would ask everyone to approve the update again.
  const { readFileSync } = await import('node:fs')
  const m = JSON.parse(readFileSync(new URL('../orca-plugin.json', import.meta.url), 'utf8'))
  assert.equal(m.execution, 'trusted-worker')
  assert.deepEqual(m.capabilities.map((c: { kind: string }) => c.kind).sort(), ['agent:read', 'notifications:show', 'settings:own', 'storage:own', 'workspace:read', 'workspace:write'])
  assert.deepEqual(m.contributes.settings.map((x: { key: string }) => x.key), ['queueBot', 'titleFormat', 'laneOrder', 'animations', 'notifications', 'refreshSeconds', 'expectedBots', 'stateFile', 'orcaCli'])
  assert.deepEqual(Object.keys(m.contributes).sort(), ['commands', 'events', 'panels', 'settings', 'statusBarItems'])
})

test('choices, no bot picked: a click sends nothing; the panel copies the answer and opens the chat', async () => {
  const f = finte()
  const { worker } = await monta(f)
  const q = await worker.request('regia.aggiorna')
  assert.equal(q.invioScelte, null)
  assert.deepEqual(await worker.request('regia.scelta', DODICI), { stato: 'spento' })
  // Nothing was even read: no `bot item show`, and nothing written.
  assert.equal(f.lanci.some((a) => a[2] === 'show'), false)
  assert.equal(f.invii.length, 0)
  // The view: buttons that copy and open the chat of the bot that asked, and say so; the menu says nobody.
  const V = await import('../panel/viste.js')
  const html = V.coda(q, NOW)
  const tasti: string[] = html.match(/<button type="button" class="scelta[^>]*>/g) ?? []
  assert.ok(tasti.length >= 4, String(tasti.length))
  for (const t of tasti) assert.ok(t.includes('data-apri=') && t.includes('Nothing is sent from here: copies your answer and opens'), t)
  assert.ok(html.includes("Nothing is sent from here: a choice copies your answer and opens the bot's chat, where you answer."))
  assert.ok(html.includes('<select data-bot-scelte data-k="bot-scelte"><option value="" selected>Send choices to: nobody: copy and open the chat</option>'))
  assert.equal((html.match(/<option value="a0000000-[^"]*">Send choices to: /g) ?? []).length, 6)
  assert.equal(V.testoRisposta(q.coda.voci.find((v: any) => v.uid === DODICI.item), 0, 1), 'Item 12: One more review round')
})

test('the Send choices to menu: a bot of Orca or nobody, kept in the plugin\'s storage; picking one sends nothing', async () => {
  const f = finte()
  const { host, worker } = await monta(f)
  await worker.request('regia.aggiorna')
  assert.deepEqual(await worker.request('regia.botScelte', { bot: ATLAS }), { invioScelte: { bot: 'Atlas', id: ATLAS } })
  assert.deepEqual(host.data().storage['scelte.bot'], { id: ATLAS, nome: 'Atlas' })
  assert.deepEqual((await worker.request('regia.quadro')).invioScelte, { bot: 'Atlas', id: ATLAS })
  // Something that is not one of Orca's bots changes nothing.
  for (const male of [{ bot: 'a0000000-0000-4000-8000-000000000099' }, { bot: 'Atlas' }, { bot: '--to' }, { bot: 7 }, null, 'x']) {
    assert.ok('errore' in (await worker.request('regia.botScelte', male as any)), JSON.stringify(male))
  }
  assert.deepEqual(host.data().storage['scelte.bot'], { id: ATLAS, nome: 'Atlas' })
  // Nobody: back to copy and open.
  assert.deepEqual(await worker.request('regia.botScelte', { bot: '' }), { invioScelte: null })
  assert.equal(host.data().storage['scelte.bot'], null)
  assert.deepEqual(await worker.request('regia.scelta', DODICI), { stato: 'spento' })
  assert.equal(f.invii.length, 0)
  // The view with a bot picked: that bot selected, the line says where choices go.
  const V = await import('../panel/viste.js')
  const html = V.coda({ ...quadro(), invioScelte: { bot: 'Atlas', id: ATLAS } }, NOW)
  assert.ok(html.includes(`<select data-bot-scelte data-k="bot-scelte" class="scelto"><option value="">Send choices to: nobody: copy and open the chat</option><option value="${ATLAS}" selected>Send choices to: Atlas</option>`))
})

test('choices to the bot that owns the item: one status message in the item\'s chat, sent once', async () => {
  const f = finte()
  const { host, worker } = await monta(f, {}, scelto(BOTS.atlas))
  const q = await worker.request('regia.aggiorna')
  assert.deepEqual(q.invioScelte, { bot: 'Atlas', id: ATLAS })
  const [a, b] = await Promise.all([worker.request('regia.scelta', DODICI), worker.request('regia.scelta', DODICI)])
  assert.deepEqual(a, { stato: 'inviata', o: 1, quando: NOW })
  assert.deepEqual(b, a)
  assert.equal(f.invii.length, 1)
  assert.deepEqual(f.invii[0].argomenti, ['orchestration', 'send', '--from', 'regia', '--to', `bot:${ATLAS}`, '--item', '12', '--type', 'status', '--subject', 'Regia · choice · item 12', '--body-file', '-', '--json'])
  const righe = f.invii[0].ingresso.split('\n')
  for (const r of ['Your owner chose this with one click in the Regia queue: no typed text.', 'Question: Ship the pricing page with the new copy?', 'Choice: B · «One more review round»', "Please record it on item 12 as your owner's answer."]) assert.ok(righe.includes(r), r)
  assert.ok(righe.some((r) => r.startsWith('Item: 12 · ') && r.includes('Approve the pricing page copy')))
  // Another click on the same question sends nothing more; the picture and the plugin's storage remember it.
  assert.deepEqual(await worker.request('regia.scelta', { ...DODICI, o: 0 }), { stato: 'inviata', o: 1, quando: NOW, gia: true })
  assert.equal(f.invii.length, 1)
  assert.deepEqual((await worker.request('regia.quadro')).scelte, { [`${ATLAS}:demo-12:ev-12:0`]: { o: 1, quando: NOW } })
  assert.deepEqual(host.data().storage['scelte.inviate'], { [`${ATLAS}:demo-12:ev-12:0`]: { o: 1, quando: NOW } })
  // The view: buttons that send, and the line that says so.
  const V = await import('../panel/viste.js')
  const html = V.coda({ ...q, scelte: undefined }, NOW)
  for (const t of html.match(/<button type="button" class="scelta[^>]*>/g) ?? []) assert.ok(!t.includes('data-apri=') && t.includes('Sends your choice to Atlas.'), t)
  assert.ok(html.includes('A choice goes to Atlas as your answer, to record on the item. Nothing is sent without your click.'))
})

test('choices to a bot that does not own the item: its Home chat, with the owner named', async () => {
  const f = finte()
  const { worker } = await monta(f, {}, scelto(BOTS.atlas))
  await worker.request('regia.aggiorna')
  const esito = await worker.request('regia.scelta', { item: `${BOTS.sage.id}:demo-6`, evento: 'ev-s6', q: 0, o: 0 })
  assert.equal(esito.stato, 'inviata')
  assert.deepEqual(f.invii[0].argomenti, ['orchestration', 'send', '--from', 'regia', '--to', `bot:${ATLAS}`, '--type', 'status', '--subject', 'Regia · choice · item 6', '--body-file', '-', '--json'])
  assert.ok(f.invii[0].ingresso.split('\n').includes('Item of: Sage'))
})

test('choices to a picked bot that is gone: nothing is sent, and the panel says why', async () => {
  const f = finte()
  const { worker } = await monta(f, {}, { 'scelte.bot': { id: 'a0000000-0000-4000-8000-000000000099', nome: 'Quill' } })
  const q = await worker.request('regia.aggiorna')
  assert.deepEqual(q.invioScelte, { manca: 'Quill' })
  const esito = await worker.request('regia.scelta', DODICI)
  assert.equal(esito.stato, 'errore')
  assert.match(esito.motivo, /“Quill” \(Send choices to\) is no longer one of Orca's bots: nothing was sent\./)
  assert.equal(f.invii.length, 0)
  const V = await import('../panel/viste.js')
  const html = V.coda(q, NOW)
  assert.ok(html.includes("“Quill”, chosen in Send choices to, is no longer one of Orca's bots, so nothing is sent: a choice copies your answer and opens the chat."))
  for (const t of html.match(/<button type="button" class="scelta[^>]*>/g) ?? []) assert.ok(t.includes('data-apri='), t)
  // Garbage in the storage counts as nobody.
  for (const male of [{ id: 'Atlas', nome: 'Atlas' }, 'Atlas', 7, { nome: 'x' }]) {
    const g = finte()
    const m = await monta(g, {}, { 'scelte.bot': male })
    assert.equal((await m.worker.request('regia.aggiorna')).invioScelte, null, JSON.stringify(male))
    await attivo?.deactivate()
    attivo = undefined
  }
})

test('choices: a question that changed in Orca, or a request that is not well formed, sends nothing', async () => {
  const f = finte()
  const { worker } = await monta(f, {}, scelto(BOTS.atlas))
  await worker.request('regia.aggiorna')
  for (const chiesta of [{ ...DODICI, evento: 'ev-old' }, { ...DODICI, o: 5 }, { ...DODICI, item: `${ATLAS}:demo-404` }]) assert.equal((await worker.request('regia.scelta', chiesta)).stato, 'cambiata', JSON.stringify(chiesta))
  for (const chiesta of [null, 'x', { ...DODICI, item: '--to' }, { ...DODICI, q: '0' }, { ...DODICI, o: 1.5 }]) assert.equal((await worker.request('regia.scelta', chiesta as any)).stato, 'errore', JSON.stringify(chiesta))
  assert.equal(f.invii.length, 0)
})
