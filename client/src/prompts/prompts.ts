import browserDesignChecks from '../../../skills/use-browser/references/design-checks.md?raw'
import browserTestBrowsers from '../../../skills/use-browser/references/test-browsers.md?raw'
import browserSection from '../../../profiles/browser-section.md?raw'
import buildApp from './build/app.md?raw'
import buildProvider from './build/provider.md?raw'
import correctAlone from './correct/alone.md?raw'
import correctCodex from './correct/codex.md?raw'
import correctExplain from './correct/explain.md?raw'
import correctGrammar from './correct/grammar.md?raw'
import correctImprove from './correct/improve.md?raw'
import correctRules from './correct/rules.md?raw'
import correctTranslate from './correct/translate.md?raw'
import findElements from './find-elements.md?raw'
import guideBrowsers from '../../../profiles/browsers.md?raw'
import guideClaude from '../../../profiles/claude.md?raw'
import guideCommand from '../../../profiles/command.md?raw'
import guideExample from '../../../skills/manage-conversations/references/conversations-example.json?raw'
import guideEmployees from '../../../profiles/employees.md?raw'
import guideExactForm from '../../../skills/manage-conversations/references/exact-form.md?raw'
import guideHeadless from '../../../profiles/headless.md?raw'
import guideManager from '../../../profiles/manager.md?raw'
import guideManagerWorkflows from '../../../profiles/manager-workflows.md?raw'
import guideOtherComputers from '../../../skills/manage-conversations/references/other-computers.md?raw'
import guideSendFile from '../../../skills/manage-conversations/references/send-file.md?raw'
import guideSendHeredoc from '../../../skills/manage-conversations/references/send-heredoc.md?raw'
import managerInstructions from './manager/instructions.md?raw'
import managerRole from './manager/role.md?raw'
import secretsSection from '../../../profiles/secrets-section.md?raw'
import sourceClaude from './source/claude.md?raw'
import sourceGuide from './source/guide.md?raw'

export const SKILL_TEMPLATES = import.meta.glob<string>('../../../skills/**/*.{md,json}', { query: '?raw', import: 'default', eager: true })

const browserSkill = SKILL_TEMPLATES['../../../skills/use-browser/SKILL.md'] ?? ''
const browserRules = browserSkill.slice(browserSkill.indexOf('## Browser boundary') + '## Browser boundary'.length, browserSkill.indexOf('## Purpose')).trim()
const browserHow = browserSkill.slice(browserSkill.indexOf('## Purpose'))
const secretsSkill = SKILL_TEMPLATES['../../../skills/use-secrets/SKILL.md'] ?? ''
const secretsHow = secretsSkill.slice(secretsSkill.indexOf('Never ask'))

export const PROMPTS = {
  browser: {
    how: browserHow.trim(), rules: browserRules.trim(), section: browserSection.trim(), skill: browserSkill.trim(),
    references: { 'test-browsers': browserTestBrowsers.trim(), 'design-checks': browserDesignChecks.trim() },
  },
  build: { app: buildApp.trim(), provider: buildProvider.trim() },
  correct: { alone: correctAlone.trim(), codex: correctCodex.trim(), explain: correctExplain.trim(), grammar: correctGrammar.trim(), improve: correctImprove.trim(), rules: correctRules.trim(), translate: correctTranslate.trim() },
  findElements: findElements.trim(),
  guide: {
    browsers: guideBrowsers.trim(), claude: guideClaude.trim(), command: guideCommand.trim(), example: guideExample.trim(), employees: guideEmployees.trim(), exactForm: guideExactForm.trim(),
    headless: guideHeadless.trim(), manager: guideManager.trim(), managerWorkflows: guideManagerWorkflows.trim(), otherComputers: guideOtherComputers.trim(), sendFile: guideSendFile.trim(), sendHeredoc: guideSendHeredoc.trim(),
  },
  manager: { instructions: managerInstructions.trim(), role: managerRole.trim() },
  secrets: { how: secretsHow.trim(), section: secretsSection.trim(), skill: secretsSkill.trim() },
  source: { claude: sourceClaude.trim(), guide: sourceGuide.trim() },
}

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (all, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`Prompt placeholder ${all} has no value.`)
    return value
  })
}
