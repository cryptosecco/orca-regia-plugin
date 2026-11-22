// The text table of the panel: every sentence, label, tooltip and status word a person reads lives
// here, in English. The views (viste.js) and the glue (regia.js) take all their text from this table.
// To add a language, provide another object with the same keys (strings, or functions that return
// strings when the text holds values) and pick it where `T` is imported.
// Plural pairs are `[one, many]`, used as `plurale(n, ...T.n.agent)`.

// The hover box marks the line that says what a click does with this prefix (regia.js styles it).
const CLICK = 'click: '

export const T = {
  click: CLICK,
  openInOrca: 'Open in Orca',
  who: 'Who hands work to whom',

  // Nouns with a singular and a plural form.
  n: {
    agent: ['agent', 'agents'],
    agentIs: ['agent is', 'agents are'],
    taskIs: ['task is', 'tasks are'],
    moreAgent: ['more agent', 'more agents'],
    moreWorker: ['more worker', 'more workers'],
    moreQuestion: ['more question', 'more questions'],
    overlap: ['overlap', 'overlaps'],
    handoff: ['handoff', 'handoffs'],
    message: ['message', 'messages'],
    messageToday: ['message today', 'messages today'],
    openItem: ['open item', 'open items'],
    idleTab: ['idle tab', 'idle tabs'],
    tab: ['tab', 'tabs'],
    subAgent: ['sub-agent', 'sub-agents'],
    otherBot: ['other bot', 'other bots'],
    worker: ['worker', 'workers'],
    automationOff: ['automation off', 'automations off'],
    providerAgent: (nome) => [`${nome} agent`, `${nome} agents`]
  },

  // Time.
  tempo: {
    unit: { s: ' s', min: ' min', h: ' h', d: ' d' },
    ago: (d) => `${d} ago`,
    in: (d) => `in ${d}`,
    late: 'late',
    forDur: (d) => ` for ${d}`,
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    everyDayAt: (hm) => `every day at ${hm}`,
    onDemand: 'on demand'
  },

  // Status words (the views keep the Italian keys; these are what is shown).
  stato: {
    working: 'working',
    waitingOnYou: 'waiting on you',
    forYou: 'for you',
    done: 'done',
    error: 'error',
    idle: 'idle',
    planned: 'planned',
    inProgress: 'in progress',
    closed: 'closed',
    blocked: 'blocked',
    snoozed: 'snoozed',
    paused: 'paused',
    listening: 'listening',
    workersBusy: 'workers busy',
    comingSoon: 'coming soon',
    failed: 'failed',
    failing: 'failing',
    open: 'open'
  },

  // Header: where the data comes from and how old it is.
  fonti: {
    botsCli: (ago) => `Bots: Orca CLI, ${ago}`,
    // With paired Orca servers: where the data was read, and a server that did not answer the last round.
    botsCliWith: (servers, ago) => `Bots: Orca CLI, this machine and ${servers}, ${ago}`,
    serverSilent: (server) => `Server ${server} is not answering: what it holds is the last data read`,
    botsCliStale: (ago) => `Bots: the CLI is not answering, data from ${ago}`,
    botsCliDown: 'Bots: the Orca CLI is not answering',
    botsCliOnlyState: 'Bots: the CLI is not answering, only what the state file knows',
    officeState: (ago) => `Office and overlaps: state file, ${ago}`,
    da: { cli: 'states from the CLI', api: 'states from Orca', motore: 'last data read', niente: 'no data' },
    stateStale: (since, da) => `State file not updated${since ? ' for ' + since : ''}: ${da}, no context or overlaps`,
    updated: (ago) => `updated ${ago}, live`,
    justNow: 'just now'
  },

  // The scoreboard on top of every view, and the line at the bottom.
  tabellone: {
    clearFilter: ' (click to clear the filter)',
    ofWorking: (n, di) => `${n} of ${di} working now`,
    working: 'working',
    waiting: 'waiting',
    errors: 'errors',
    areWaiting: (x) => `${x} waiting on you`,
    inError: (x) => `${x} in error`,
    other: 'other'
  },
  piede: {
    toDecide: (n) => `${n} to decide`,
    today: (n) => `${n} today`,
    nothing: 'nothing to decide',
    goTo: (laCoda) => `Go to ${laCoda}`,
    working: (n) => `${n} working`
  },
  schede: { overview: 'Overview', queue: 'Queue', flows: 'Flows', office: 'Office', overlaps: 'Overlaps' },

  // Agent statistics (model, effort, context, cache, sub-agents).
  stat: {
    noData: 'No data: nothing is made up',
    missing: '— missing',
    model: 'model',
    effort: 'effort',
    context: 'context',
    cache: 'cache',
    subAgents: 'sub-agents',
    agent: 'agent',
    session: 'session',
    of: (w) => `of ${w}`,
    contextUsed: (usati, finestra) => `Context used: ${usati} of ${finestra} tokens`,
    expiresIn: 'expires in ',
    cold: 'cold',
    missingList: (lista) => `missing: ${lista}`
  },

  // Hover box lines (the ones that start with CLICK say what a click does).
  hover: {
    itsTerminal: CLICK + 'its terminal in Orca',
    workerTerminal: CLICK + 'the worker\'s terminal in Orca',
    queueView: CLICK + 'the Queue view',
    officeView: CLICK + 'the Office view',
    officeViewWaiting: CLICK + 'the Office view, on who is waiting',
    botChat: (nome, chat) => `${CLICK}${nome}'s ${chat ? 'chat in Orca' : 'card'}`,
    toYou: (nome) => `${nome} → YOU`,
    tasksWaitingAnswer: (x) => `${x} waiting on your answer`,
    inQueueOverall: (n) => `${n} in the queue overall`,
    youTo: (lead) => `YOU → ${lead}`,
    nothingWaitingQueue: 'nothing is waiting on you in the queue',
    nothingWaitingItsQueue: 'nothing is waiting on you in its queue',
    notOrcaBot: 'not one of Orca\'s bots',
    officeToYou: 'Office → YOU',
    agentsWaitingTerminals: (x) => `${x} waiting on you in the terminals`,
    youToOffice: 'YOU → Office',
    agentsWorking: (x, n) => `${x}, ${n} working`,
    noOneWaitingTerminals: 'no one is waiting on you in the terminals',
    leadOffice: (lead) => `${lead} ⇢ Office`,
    leadWatches: (lead) => `${lead} keeps an eye on the agents in the terminals`,
    tasksWaitingIn: (x, dove) => `${x} waiting on you in ${dove}`,
    nothingWaitingIn: (dove) => `nothing is waiting on you in ${dove}`,
    noAgentWaitingTerminals: 'no agent is waiting on you in the terminals',
    queueNode: 'Queue · the open items of every bot',
    orchestrator: (nome) => `${nome} · orchestrator`,
    queueLine: (a, n) => `queue: ${a} waiting on you, ${n} open`,
    handoffs: (x, inCorso) => `${x}${inCorso ? `, ${inCorso} in progress` : ''}`,
    todayWithWorkers: (x) => `${x} today with workers`,
    tasksWaiting: (x) => `${x} waiting on you`,
    checkSetting: 'check the “Bot that holds the queue” setting',
    officeNode: 'Office · the agents in the terminals',
    comingSoonNotBot: 'coming soon: not an Orca bot yet',
    openInQueue: (x) => `${x} in the queue`,
    today: (x) => `${x} today`,
    active15: 'active in the last 15 minutes',
    todayWithLead: (x, lead) => `${x} today with ${lead}`,
    botKind: (nome, previsto) => `${nome} · ${previsto ? 'bot coming soon' : 'bot'}`,
    notOrcaBotYet: 'not an Orca bot yet',
    workerOf: (nome, capo) => `${nome} · ${capo}'s worker`,
    noPr: 'no PR',
    prChecks: (n, controlli) => `PR #${n}, checks: ${controlli}`,
    workerPrLine: (nome, n) => `${nome} → PR #${n}`,
    noRoom: 'no room here: they are all in the Office',
    noWorkerAgent: 'no worker has an agent inside',
    workersToPr: 'Workers → Pull requests',
    noWorkerPr: 'no worker above has a PR',
    prLands: 'where the workers\' work lands',
    startedAgents: (x, parole) => `started ${x}: ${parole}`
  },

  // The flow diagram.
  diagramma: {
    you: 'YOU',
    office: 'Office',
    queue: 'Queue',
    watches: 'watches',
    itsWorkers: 'its workers',
    nForYou: (n) => `${n} for you`,
    nInTerminals: (n) => `${n} in terminals`,
    msgBadge: (n) => `${n}${n > 9 ? '' : ' '}msg`,
    msgToday: (n) => `${n} msg today`,
    allBots: 'all bots',
    orchestrator: 'orchestrator',
    notBotYet: 'not a bot yet',
    noOneWaiting: 'no one waiting',
    ofWorking: (a, b) => `${a} of ${b} working`,
    noneWorking: 'none working',
    noneWorkingIdle: (x) => `none working, ${x}`,
    workers: 'Workers',
    pullRequests: 'Pull requests',
    noneOpen: 'none open',
    ariaLabelQueueAll: 'the queue of every bot',
    ariaLabelLead: (lead) => `${lead} orchestrating`,
    ariaLabel: (centro, bot, worker) => `Workflow: you, ${centro}, ${bot}, ${worker}, the pull requests. Nodes can be clicked.`,
    legend: {
      waiting: 'waiting on you',
      active: 'active now',
      done: 'done',
      quiet: 'quiet channel',
      soon: 'coming soon',
      agentStarted: 'agent started by a bot',
      subAgent: 'sub-agent'
    },
    help: (nota) => `Click a bot for its chat, a worker for its terminal, the Office for its view. Hover for the numbers: ${nota}the filled number at its top left counts the agents it started that are active now (working, waiting or failed). The small nodes hanging under a bot are those agents: they pulse while working and fade when done. Dashes flow toward whoever receives the work; on a quiet wire the small square marks the receiver.`,
    helpMsg: (lead) => `«N msg» at a bot's top right counts today's messages with ${lead}; `
  },

  // The agents a bot started (the badge and the small hanging nodes).
  figlio: {
    type: { worker: 'worker', agente: 'agent', sub: 'sub-agent' },
    kindOf: (nome, tipo, padre) => `${nome} · ${tipo} of ${padre}`,
    gone: 'gone',
    moreStartedBy: (x, padre) => `${x} started by ${padre}`,
    listedBelow: 'they are listed in its card below',
    startedBy: (x, padre) => `${x} started by ${padre}`
  },

  // The queue.
  coda: {
    theQueue: 'the queue',
    botQueue: (bot) => `${bot}'s queue`,
    priority: ['today or overdue', 'within 3 days', 'this week', 'whenever'],
    noProject: 'No project',
    priorityLine: (p, testo) => `P${p}: ${testo}`,
    noPriority: 'no priority in the title: counts as whenever',
    noQuestion: 'No written question: the details are in the chat.',
    recommended: 'recommended',
    andMoreQuestions: (x) => `and ${x}`,
    answerIn: (nome) => `answer in ${nome}'s chat`,
    goCard: (nome) => `go to ${nome}'s card`,
    open: (da) => `open ${da}`,
    nothing: { oggi: 'Nothing due today', decidere: 'Nothing to decide', corso: 'Nothing in progress right now', '': 'Nothing in the queue' },
    clearFilter: 'Clear the filter',
    showOnly: 'Show only these',
    threeNumbers: 'The queue in three numbers',
    today: 'today',
    toDecide: 'to decide',
    empty: 'The queue is empty',
    noBotItem: 'No bot has an open item.',
    botNothingPending: (bot) => `${bot} has nothing pending for you.`,
    bot: 'bot',
    project: 'project',
    labelBot: 'Bot',
    labelProject: 'Project',
    theBot: 'the bot',
    readOnly: (chi) => `Read-only here: a click opens ${chi}'s chat, where you answer.`,
    otherWait: (n) => ` The other ${n} wait in their lanes.`,
    nothingToDecideToday: 'Nothing to decide today',
    whenChoice: (dove) => `When a choice needs you, ${dove}.`,
    itShowsUp: 'it shows up here',
    botPutsIt: (bot) => `${bot} puts it here`,
    all: 'all',
    filtersLabel: 'Queue filters',
    allOf: (cosa) => `all ${cosa}s`,
    nOf: (a, b) => `${a} of ${b}`,
    inLane: (nome) => ` in ${nome}`,
    showWhole: 'show the whole queue',
    decideNow: 'Decide now',
    wholeBy: (cosa) => `The whole queue, by ${cosa}`,
    by: (cosa) => `By ${cosa}`,
    noCli: (laCoda) => `The Orca CLI is not answering: ${laCoda} comes back as soon as it does.`,
    noBots: 'Orca lists no bots yet: the queue fills in as soon as a bot has an open item.',
    botNotFound: (bot) => `“${bot}” is not one of Orca's bots: there is no queue. Check the “Bot that holds the queue” setting, or leave it empty to see every bot's items.`,
    outside: (chi, dove) => `Outside the queue: <b>${chi}</b> (${dove}) is waiting on you.`,
    inShort: (laCoda) => `${laCoda}, in short`,
    noBotItemYet: 'No bot has an open item yet.',
    botNoTasks: (bot) => `${bot} has no tasks in the queue yet.`,
    briefNothing: 'Nothing to decide today.',
    openQueue: 'open the queue ›'
  },

  // Due dates, in words.
  scad: {
    due: (x) => `Due: ${x}`,
    overdueSince: (hm) => `overdue since ${hm}`,
    overdueToday: 'overdue today',
    overdueYesterday: 'overdue since yesterday',
    overdueBy: (n) => `overdue by ${n} days`,
    todayAt: (hm) => `today ${hm}`,
    today: 'today',
    tomorrowAt: (hm) => `tomorrow ${hm}`,
    tomorrow: 'tomorrow',
    inDays: (n) => `in ${n} days`
  },

  // Pull requests and their checks.
  pr: {
    num: (n) => `PR #${n}`,
    checks: (x) => `checks: ${x}`,
    none: 'none',
    state: { errore: 'failing', finito: 'passed', lavoro: 'running', fermo: 'none' }
  },

  // The bot cards (Overview).
  bot: {
    tag: 'bot',
    openChat: 'open chat ›',
    stateNotUpdated: 'The state file is not being updated',
    stateNoSession: 'The state file has no session for this bot',
    cannotRead: (perche) => `${perche}: model, effort, context and cache cannot be read.`,
    cliDown: 'The Orca CLI is not answering: only this bot\'s session shows, as the state file reports it. Items, workers and automations come back as soon as the CLI answers.',
    rows: { now: 'now', items: 'items', spawned: 'spawned', next: 'next', said: 'said' },
    followingWorker: (titolo, dur) => `following worker «${titolo}»${dur ? `, for ${dur}` : ''}`,
    inProgressTitle: (titolo) => `in progress: ${titolo}`,
    lastRequest: (ago) => `<span class="muto">last request${ago ? ` (${ago})` : ''}:</span>`,
    answering: (dur) => `answering${dur ? ` for ${dur}` : ''}`,
    listeningNoRequest: 'listening, no recent request',
    handoffsClosed: (fatte, x) => `${fatte} of ${x} closed`,
    goQueue: 'go to the queue ›',
    andMore: (n) => `and ${n} more`,
    noOpenItems: 'no open items',
    started: 'started',
    subFinished: (x) => `${x} finished earlier`,
    andIdleTabs: (x) => `and ${x}`,
    noAgents: 'no agents running',
    runsOnlyIfNeeded: 'runs only if needed',
    noAutomations: 'no automations',
    nothingRecent: 'nothing recent',
    comingSoonTag: 'coming soon',
    notBotYetLong: 'Not an Orca bot yet. Once it is, what it is doing, its items, workers and automations show up here.',
    title: 'What the bots are doing',
    nActive: (n) => `${n} active`,
    nComing: (n) => `, ${n} coming soon`,
    noBots: 'No bots: the Orca CLI lists none.'
  },

  // Overview.
  panoramica: {
    between: (lead) => `between you, ${lead}the bots and the workers`
  },

  // Flows.
  flussi: {
    type: { handoff: 'handoff', question: 'question', status: 'status', worker_done: 'work done', escalation: 'blocker' },
    recent: 'Recent messages',
    all: 'all',
    showLast8: 'Show only the last 8',
    showAll: (n) => `Show all ${n}`,
    noMessages: 'No messages between bots, coordinators and workers.',
    cliSilent: 'Messages come from the Orca CLI, which is not answering right now.',
    note: 'Messages show subject and first line. Names are inferred: Orca\'s mail only records terminals and sessions.'
  },

  // Office.
  ufficio: {
    workingFor: (d) => `working · ${d}`,
    waitingFor: (d) => `waiting for ${d}`,
    idleFor: (d) => `idle for ${d}`,
    agent: 'agent',
    tab: (x) => `tab «${x}»`,
    inBackground: 'in background',
    outsideOrca: 'outside Orca',
    onlyProvider: (nome) => `${nome} only ✕`,
    clearProvider: 'Clear the provider filter',
    noAgents: 'No agents to show.',
    emptyRooms: 'Empty rooms',
    clickDesk: 'Clicking a desk takes Orca to that agent.',
    notes: {
      cliOff: {
        cli: 'States come from the Orca CLI. An agent’s face is derived from its name.',
        api: 'The Orca CLI is not answering: only tabs with something in progress show, as Orca reports them.',
        niente: 'No source is answering.'
      },
      full: {
        motore: 'The bar is the context used out of the model window; it turns amber at 60% and red at 80%. Cache is the time left before it expires. The state file carries model, effort, context and cache only for Claude Code sessions: for other agents they are missing. An agent’s face is derived from its name.',
        cli: 'The state file is not being updated: states come from the Orca CLI, and model, effort, context, cache and sub-agents are missing.',
        api: 'Neither the state file nor the CLI is answering: only tabs with something in progress show, as Orca reports them.',
        niente: 'No source is answering.'
      }
    }
  },

  // Overlaps.
  incroci: {
    unavailable: 'Overlaps unavailable',
    needFile: 'Overlaps need the optional state file, which says who touches which files. Set its path in the plugin’s settings.',
    notUpdated: (errore) => `Who touches which files comes from the state file, and it is not being updated right now${errore ? ` (${errore})` : ''}.`,
    rightNow: (x) => `${x} right now`,
    none: 'No overlaps right now',
    decide: 'Two agents have their hands on the same spot: decide who goes ahead.',
    noneDetail: 'In the last 20 minutes no file was touched by two agents, and no folder was changed by two agents together.',
    overlaps: 'Overlaps',
    shared: 'Shared areas',
    sharedHint: 'same folder, but read-only or at different times',
    noShared: 'No shared areas.',
    single: 'Single-agent areas',
    singleHint: 'last 20 minutes',
    noOther: 'No other files touched in the last 20 minutes.',
    rule: 'The rule comes with the state file: there is an overlap when two agents touch the same file and at least one changes it, or they change files in the same folder, within the same 20-minute window.'
  },

  // Messages of the glue (regia.js).
  pannello: {
    workerDown: (motivo) => `The plugin’s worker is not answering (${motivo}). Try Refresh.`,
    errorWord: 'error',
    workerDownStale: 'The worker is not answering: what you see is the last data read.',
    openChatFallback: 'Cannot open the chat in Orca: taking you to its card.',
    cannotOpen: 'Cannot open it in Orca.'
  }
}
