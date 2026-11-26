// Invented data for screenshots and tests of the store version. Nothing here is real: the bots,
// projects, people, paths and ids are made up. It has the shape of what the Orca CLI prints
// (`bot list`, `bot item list`, `bot work list`, `bot chats`, `worktree ps`, `automations list`,
// `orchestration inbox`), keyed by the command without `--json`, so it goes through the plugin's
// real pipeline instead of a hand-made picture.
//
// No imports and no I/O: `demoCli(now)` returns plain JSON, with times relative to `now`.

export const HOME = '/home/demo'

/** The invented bots. Ids are UUID-shaped because the plugin only accepts those in a command. */
export const BOTS = {
  atlas: { id: 'a0000000-0000-4000-8000-000000000001', name: 'Atlas', home: 'atlas', avatar: 'mascot:N1', specialty: 'Keeps the queue and hands work to the other bots' },
  echo: { id: 'a0000000-0000-4000-8000-000000000002', name: 'Echo', home: 'echo', avatar: 'mascot:B1', specialty: 'Docs and release notes' },
  pixel: { id: 'a0000000-0000-4000-8000-000000000003', name: 'Pixel', home: 'pixel', avatar: 'mascot:E1', specialty: 'Mobile app' },
  nova: { id: 'a0000000-0000-4000-8000-000000000004', name: 'Nova', home: 'nova', avatar: 'mascot:G1', specialty: 'CI, deploys and backups' },
  sage: { id: 'a0000000-0000-4000-8000-000000000005', name: 'Sage', home: 'sage', avatar: 'mascot:K2', specialty: 'Code review and security checks' },
  bolt: { id: 'a0000000-0000-4000-8000-000000000006', name: 'Bolt', home: 'bolt', avatar: 'mascot:R3', specialty: 'Performance and load tests' }
}

/** What each bot's `bot.json` holds, by home folder under `~/.orca/bots`. */
export const demoHomes = () =>
  Object.fromEntries(Object.values(BOTS).map((b) => [b.home, { id: b.id, name: b.name, agent: 'claude', avatar: b.avatar }]))

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const two = (n) => String(n).padStart(2, '0')
/** `dd/mm hh:mm`, the deadline format of the queue titles. */
const due = (t) => {
  const d = new Date(t)
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function demoCli(now = Date.now()) {
  const item = (number, title, status, extra = {}) => ({
    uid: 'demo-' + number,
    number,
    title,
    status,
    question: null,
    links: [],
    lastActivityAt: now - number * 7 * MIN,
    createdAt: now - number * 5 * HOUR,
    ...extra
  })
  const ask = (eventId, prompt, options, recommended, context = '') => ({
    eventId,
    text: prompt,
    ask: { context, questions: [{ prompt, options: options.map((label) => ({ label })), recommended }] }
  })
  const link = (ref, title, state, startedMin, report = null) => ({
    kind: 'dispatch',
    ref,
    title,
    state,
    startedAt: now - startedMin * MIN,
    settledAt: state === 'working' ? null : now - (startedMin - 20) * MIN,
    report
  })
  const { atlas, echo: juno, pixel: pico, nova, sage, bolt } = BOTS
  const cmd = (name, bot) => `bot ${name} --bot ${bot.id}`

  return {
    'bot list': { bots: Object.values(BOTS).map((b) => ({ id: b.id, name: b.name, agent: 'claude', paused: false, specialty: b.specialty })) },

    // The queue: Atlas's items. Titles follow `<dot> <Project> · <what> · ⏰ <dd/mm hh:mm>`.
    [cmd('item list', atlas)]: {
      counts: {},
      items: [
        item(12, `🔴 Lumen Web · Approve the pricing page copy · ⏰ ${due(now + 3 * HOUR)}`, 'needs_you', {
          question: ask('ev-12', 'Ship the pricing page with the new copy?', ['Ship it', 'One more review round'], 0, 'Legal signed off this morning; marketing wants it live before the newsletter.')
        }),
        item(14, `🔴 Orbit API · Rotate the staging database password · ⏰ ${due(now + 6 * HOUR)}`, 'needs_you', {
          question: ask('ev-14', 'Rotate now or after tonight’s deploy?', ['Now', 'After the deploy'], 1)
        }),
        item(9, `🟠 Orbit API · Rate limits for the public endpoints · ⏰ ${due(now + 2 * DAY)}`, 'in_progress', {
          links: [link('ctx_demo_9', 'Rate limits: middleware and tests', 'working', 48)]
        }),
        item(11, `🟠 Field Notes · Offline sync for the mobile app · ⏰ ${due(now + 2 * DAY + 4 * HOUR)}`, 'in_progress', {
          links: [link('ctx_demo_11', 'Offline sync: conflict rules', 'working', 95)]
        }),
        item(15, '🟡 Lumen Web · Dark theme for the dashboard', 'needs_you', {
          question: ask('ev-15', 'Which palette for the dark theme?', ['Slate', 'Ink', 'Keep both behind a flag'], 0)
        }),
        item(7, `🟡 Field Notes · Release notes for 2.4 · ⏰ ${due(now + 5 * DAY)}`, 'in_progress', {
          links: [link('ctx_demo_7', 'Release notes 2.4', 'completed', 180, { subject: 'Draft ready for review', body: '' })]
        }),
        item(16, '🟡 Orbit API · Upgrade the test runner', 'planned'),
        item(5, '⚪ Lumen Web · Tidy the icon set', 'planned'),
        item(4, 'Write the onboarding checklist', 'planned')
      ]
    },
    [cmd('work list', atlas)]: { items: [], workspaces: [] },
    [cmd('chats', atlas)]: { chats: [{ id: 'chat-atlas', title: 'Home', lastActivityAt: now - 2 * MIN, lastSaid: 'Two items need a decision today; the rest is moving.', lastAsked: 'What is waiting on me?' }] },

    [cmd('item list', juno)]: {
      counts: {},
      items: [item(3, 'Release notes for Field Notes 2.4', 'in_progress', { links: [link('ctx_demo_j3', 'Release notes 2.4', 'completed', 180, { subject: 'Draft ready for review', body: '' })] })]
    },
    [cmd('work list', juno)]: { items: [], workspaces: [{ id: 'w-notes', name: 'release-notes' }] },
    [cmd('chats', juno)]: { chats: [{ id: 'chat-juno', title: 'Home', lastActivityAt: now - 25 * MIN, lastSaid: 'Draft of the 2.4 notes is up.', lastAsked: 'Draft the release notes for 2.4' }] },

    [cmd('item list', pico)]: {
      counts: {},
      items: [item(2, 'Offline sync for the mobile app', 'in_progress', { links: [link('ctx_demo_p2', 'Offline sync: conflict rules', 'working', 95)] })]
    },
    [cmd('work list', pico)]: { items: [], workspaces: [{ id: 'w-sync', name: 'offline-sync' }] },
    [cmd('chats', pico)]: { chats: [{ id: 'chat-pico', title: 'Home', lastActivityAt: now - 6 * MIN, lastSaid: 'Conflict rules are written; tests are running.', lastAsked: 'Start on offline sync' }] },

    [cmd('item list', nova)]: {
      counts: {},
      items: [item(1, 'Rate limits for the public endpoints', 'in_progress', { links: [link('ctx_demo_n1', 'Rate limits: middleware and tests', 'working', 48)] })]
    },
    [cmd('work list', nova)]: { items: [], workspaces: [{ id: 'w-rate', name: 'rate-limits' }] },
    [cmd('chats', nova)]: { chats: [{ id: 'chat-nova', title: 'Home', lastActivityAt: now - 11 * MIN, lastSaid: 'Nightly backup finished without errors.', lastAsked: 'Add rate limits to the public endpoints' }] },

    [cmd('item list', sage)]: {
      counts: {},
      items: [item(6, 'Review the rate limit pull request', 'needs_you', { question: ask('ev-s6', 'The limit is per key, not per IP. Accept it?', ['Accept', 'Ask for per-IP too'], 0) })]
    },
    [cmd('work list', sage)]: { items: [], workspaces: [] },
    [cmd('chats', sage)]: { chats: [{ id: 'chat-sage', title: 'Home', lastActivityAt: now - 18 * MIN, lastSaid: 'One question on the rate limit design before I approve.', lastAsked: 'Review pull request 214' }] },

    [cmd('item list', bolt)]: { counts: {}, items: [item(8, 'Load test for the sync endpoint', 'planned')] },
    [cmd('work list', bolt)]: { items: [], workspaces: [] },
    [cmd('chats', bolt)]: { chats: [{ id: 'chat-bolt', title: 'Home', lastActivityAt: now - 3 * HOUR, lastSaid: 'Ready when the sync branch is merged.', lastAsked: 'Plan a load test for sync' }] },

    'worktree ps --limit 300': {
      worktrees: [
        // The bots' own homes: this is how the plugin learns each bot's home folder and whether it is busy.
        ...Object.values(BOTS).map((b) => ({
          workspaceKind: 'folder-workspace',
          repo: 'Bots',
          displayName: b.name,
          path: `${HOME}/.orca/bots/${b.home}`,
          branch: '',
          status: b === atlas || b === pico ? 'working' : 'inactive',
          bot: b.name,
          agents: [{ address: `orca_session_id:chat-${b.home}`, state: b === atlas || b === pico ? 'working' : 'done', agentType: 'claude', conversationName: b.name, stateStartedAt: now - 4 * MIN }]
        })),
        {
          workspaceKind: 'git',
          repo: 'orbit-api',
          displayName: 'rate-limits',
          path: `${HOME}/code/orbit-api-rate-limits`,
          branch: 'refs/heads/rate-limits',
          status: 'working',
          bot: nova.name,
          liveTerminalCount: 1,
          lastActivityAt: now - MIN,
          linkedPR: { number: 214, title: 'Rate limits for public endpoints', state: 'open', checksStatus: 'pending' },
          agents: [{ address: 'term_demo_rate', state: 'working', agentType: 'claude', taskTitle: 'Rate limits: middleware and tests', programStatus: { message: 'Running the test suite' }, stateStartedAt: now - 9 * MIN }]
        },
        {
          workspaceKind: 'git',
          repo: 'field-notes',
          displayName: 'offline-sync',
          path: `${HOME}/code/field-notes-offline-sync`,
          branch: 'refs/heads/offline-sync',
          status: 'permission',
          bot: pico.name,
          liveTerminalCount: 1,
          lastActivityAt: now - 3 * MIN,
          linkedPR: null,
          agents: [{ address: 'term_demo_sync', state: 'waiting', agentType: 'codex', taskTitle: 'Offline sync: conflict rules', programStatus: { message: 'Asks to run the migration' }, stateStartedAt: now - 3 * MIN }]
        },
        {
          workspaceKind: 'git',
          repo: 'field-notes',
          displayName: 'release-notes',
          path: `${HOME}/code/field-notes-release-notes`,
          branch: 'refs/heads/release-notes-2.4',
          status: 'inactive',
          bot: juno.name,
          liveTerminalCount: 1,
          lastActivityAt: now - 40 * MIN,
          linkedPR: { number: 87, title: 'Release notes 2.4', state: 'open', checksStatus: 'passing' },
          agents: [{ address: 'term_demo_notes', state: 'done', agentType: 'claude', taskTitle: 'Release notes 2.4', stateStartedAt: now - 40 * MIN }]
        },
        {
          workspaceKind: 'git',
          repo: 'lumen-web',
          displayName: 'main',
          path: `${HOME}/code/lumen-web`,
          branch: 'refs/heads/main',
          status: 'working',
          bot: null,
          liveTerminalCount: 2,
          lastActivityAt: now - 2 * MIN,
          linkedPR: null,
          agents: [
            { address: 'term_demo_web1', state: 'working', agentType: 'claude', conversationName: 'Pricing page copy', programStatus: { message: 'Editing the pricing table' }, stateStartedAt: now - 14 * MIN },
            { address: 'term_demo_web2', state: 'done', agentType: 'gemini', conversationName: 'Icon audit', stateStartedAt: now - 2 * HOUR }
          ]
        }
      ]
    },

    'automations list': {
      automations: [
        { id: 'auto-demo-0001', name: 'Nightly backup', bot: { botId: nova.id }, rrule: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=0', enabled: true, nextRunAt: now + 9 * HOUR, lastRunAt: now - 15 * HOUR, precheck: null },
        { id: 'auto-demo-0002', name: 'Morning queue review', bot: { botId: atlas.id }, rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=30', enabled: true, nextRunAt: now + 15 * HOUR, lastRunAt: now - 9 * HOUR, precheck: null }
      ]
    },

    'orchestration inbox --limit 40 --full': {
      messages: [
        msg('m1', 'handoff', atlas, nova, 'Rate limits for the public endpoints', 'Please take the rate limits; the spec is in the issue.', now - 50 * MIN),
        msg('m2', 'status', nova, atlas, 'Re: Rate limits', 'Started; middleware first, then tests.', now - 47 * MIN),
        msg('m3', 'handoff', atlas, pico, 'Offline sync for the mobile app', 'Conflict rules first, UI later.', now - 96 * MIN),
        msg('m4', 'status', pico, atlas, 'Re: Offline sync', 'Rules written, tests running.', now - 6 * MIN),
        msg('m5', 'handoff', atlas, juno, 'Release notes for 2.4', 'Draft from the merged pull requests.', now - 3 * HOUR),
        msg('m6', 'status', juno, atlas, 'Re: Release notes', 'Draft ready for review.', now - 25 * MIN),
        msg('m9', 'handoff', atlas, sage, 'Review pull request 214', 'Rate limits are up for review.', now - 30 * MIN),
        msg('m10', 'question', sage, atlas, 'Per key or per IP?', 'The limit is per key. Is that what we want?', now - 18 * MIN),
        msg('m11', 'status', atlas, bolt, 'Load test after the merge', 'Hold until offline sync lands.', now - 3 * HOUR),
        { id: 'm7', type: 'worker_done', run_id: 'run_demo_j', from_handle: 'term_demo_notes', to_handle: 'run:run_demo_j', subject: 'Release notes drafted', body: 'Draft is in the pull request.', payload: '{"dispatchId":"ctx_demo_j3"}', created_at: new Date(now - 41 * MIN).toISOString() },
        { id: 'm8', type: 'question', run_id: 'run_demo_p', from_handle: 'term_demo_sync', to_handle: 'run:run_demo_p', subject: 'Question', body: 'May I run the migration on the test database?', payload: '{"dispatchId":"ctx_demo_p2"}', created_at: new Date(now - 3 * MIN).toISOString() }
      ]
    }
  }
}

function msg(id, type, from, to, subject, body, at) {
  return { id, type, run_id: null, from_handle: `orca_session_id:chat-${from.home}`, to_handle: `orca_session_id:chat-${to.home}`, subject, body, payload: null, created_at: new Date(at).toISOString() }
}

/**
 * An invented state file, in the shape the optional "State file" setting reads: model, effort, context,
 * cache and sub-agents for the same invented sessions the CLI lists above. `age` is how long ago it was
 * last written, in milliseconds: more than a minute, and the plugin treats it as stopped.
 */
export function demoState(now = Date.now(), age = 2000) {
  const agent = (nome, terminaleOrca, cartella, altro = {}) => ({ nome, stato: 'al lavoro', dettaglio: '', fermoDaSecondi: 60, modello: 'opus-5-5', sforzo: 'high', contesto: 220_000, finestra: 1_000_000, cacheScadeTraSecondi: 2400, tipo: 'interattiva', cartella, terminaleOrca, domanda: '', tocca: [], subAgentiAttivi: [], subAgentiConclusi: 0, ...altro })
  return {
    aggiornato: new Date(now - age).toISOString(),
    conteggi: {},
    incroci: [],
    progetti: [
      { nome: 'orbit-api', schede: ['rate-limits'], agenti: [agent('Rate limits: middleware and tests', 'term_demo_rate', `${HOME}/code/orbit-api-rate-limits`, { dettaglio: 'Running the test suite', fermoDaSecondi: 540, contesto: 410_000, subAgentiAttivi: ['Explore: the middleware', 'Plan: the tests'], subAgentiConclusi: 3 })] },
      { nome: 'field-notes', schede: ['release-notes'], agenti: [agent('Release notes 2.4', 'term_demo_notes', `${HOME}/code/field-notes-release-notes`, { stato: 'fermo', fermoDaSecondi: 2400, modello: 'sonnet-5-5', sforzo: 'medium', contesto: 90_000, cacheScadeTraSecondi: -600, subAgentiConclusi: 1 })] },
      { nome: 'lumen-web', schede: ['main'], agenti: [agent('Pricing page copy', 'term_demo_web1', `${HOME}/code/lumen-web`, { dettaglio: 'Editing the pricing table', fermoDaSecondi: 840, modello: 'fable-5-2', sforzo: 'medium', contesto: 650_000, subAgentiAttivi: ['Explore: the old copy'], subAgentiConclusi: 2 })] }
    ]
  }
}

/**
 * An invented audit sandbox (the status files a sandbox tool keeps in `~/orca/sandbox/attive/` while a
 * run goes, and the log it writes when the run ends). `attive`: what the worker would read, as
 * `{ nome, testo }`. `finita`: a run that ended a few minutes ago, with its `registro` text.
 */
export function demoSandbox(now = Date.now()) {
  const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z')
  const stamp = (t) => iso(t).replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const run = (name, pid, start, fields) => {
    const id = `${stamp(start)}-${name}-${pid}`
    return { id, pid, nome: name, inizio: iso(start), registro: `${HOME}/orca/sandbox/registri/${stamp(start)}-${name}.log`, ...fields }
  }
  const file = (r) => ({ nome: `${r.id}.json`, testo: JSON.stringify(r, null, 2) })
  // Run from the agent's terminal: the test suite of a package under review, with one domain open.
  const tests = run('left-pad-fork', 41213, now - 2 * MIN, { stato: 'in_corso', agente: 'claude', bot: null, terminale: 'term_demo_rate', worktree: null, workspace: null, scheda: null, cartella: '/tmp/audit/left-pad-fork', comando: 'npm test', rete: 'si', dominio: 'registry.npmjs.org', tempo_max: 300, cpu_max: 300, mem_max_mb: 2048, bloccati: 3, memoria_mb: 184, processi: 5, secondi: 118 })
  // Run from a bot's chat: no terminal, only the bot's name.
  const binary = run('csv-tool', 41377, now - 40 * 1000, { stato: 'in_corso', agente: 'claude', bot: 'Sage', terminale: null, worktree: null, workspace: null, scheda: null, cartella: '/tmp/audit/csv-tool', comando: './csv-tool --help', rete: 'no', dominio: null, tempo_max: 30, cpu_max: 30, mem_max_mb: 512, bloccati: 0, memoria_mb: 22, processi: 2, secondi: 38 })
  const ended = run('md-render', 40990, now - 11 * MIN, { stato: 'in_corso', agente: 'codex', bot: null, terminale: null, worktree: null, workspace: null, scheda: null, cartella: '/tmp/audit/md-render', comando: 'node install.js', rete: 'no', dominio: null, tempo_max: 120, cpu_max: 120, mem_max_mb: 1024, bloccati: 2, memoria_mb: 61, processi: 3, secondi: 21 })
  const log = [
    '# Sandbox: run log',
    `date:      ${iso(now - 11 * MIN + 21_000).replace('T', ' ').replace('Z', '')}`,
    'folder:    /tmp/audit/md-render (run on a copy)',
    'command:   node install.js',
    'limits:    time 120s, CPU 120s, memory 1024 MB',
    'network:   closed',
    'result:    exit code 1, ended by itself, 21s, peak memory 61 MB',
    '',
    '## Processes started',
    '  40995 node install.js',
    '  41002 sh -c curl -s stats.example.net/i',
    '',
    '## Attempts blocked by the sandbox',
    '   1   node deny(1) file-read-data ~/.npmrc',
    '   1   curl deny(1) network-outbound remote:*:443',
    '',
    '## Files written (inside the copy)',
    '  ./src/dist/render.js',
    '',
    '## Output (last lines)',
    '  | building md-render 0.3.1',
    '  | done in 1.8s',
    '',
    '## Errors (last lines)',
    '  ! curl: (7) Failed to connect to stats.example.net port 443'
  ].join('\n')
  return { attive: [file(tests), file(binary)], finita: { file: file(ended), registro: log } }
}
