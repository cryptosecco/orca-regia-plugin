// The marks of the coding CLIs an agent runs, shown instead of a neutral shape where the vendor's rules
// allow it. Which ones, and why the others stay neutral, is in the README («CLI marks») and in NOTICE.
//   `file`: an image in this folder, shown as it is (never recoloured or stretched).
//   `testo`: the mark is made of characters, written as the CLI writes them.
// A provider that is not here keeps its neutral shape with its name written next to it:
//   - Claude Code: Anthropic's trademark guidelines allow its marks only as specifically permitted, in
//     materials approved beforehand (and Claude Code's legal page: any use beyond a plain-text mention
//     needs written permission). Clawd is not here.
//   - Gemini CLI: Google licenses its brand features only after it approves a permission request. Its
//     icon is not here.
export const MARCHI = {
  // Codex CLI has no mascot or icon of its own: its mark is the «>_» of its start screen, two plain characters.
  openai: { nome: 'Codex', cosa: 'the Codex CLI prompt', testo: '>_' },
  // Grok CLI has no mascot: the mark its start screen draws in braille characters, dot by dot.
  grok: { nome: 'Grok CLI', cosa: 'the Grok CLI mark', file: 'grok-cli.svg' }
}
