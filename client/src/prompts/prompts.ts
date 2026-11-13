import browserHow from './browser/how.md?raw'
import browserLoadSkill from './browser/load-skill.md?raw'
import browserDesignChecks from './browser/references/design-checks.md?raw'
import browserTestBrowsers from './browser/references/test-browsers.md?raw'
import browserRules from './browser/rules.md?raw'
import browserSection from './browser/section.md?raw'
import browserSkill from './browser/skill.md?raw'
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
import guideBrowsers from './guide/browsers.md?raw'
import guideClaude from './guide/claude.md?raw'
import guideCommand from './guide/command.md?raw'
import guideExample from './guide/conversations-example.json?raw'
import guideEmployees from './guide/employees.md?raw'
import guideExactForm from './guide/exact-form.md?raw'
import guideHeadless from './guide/headless.md?raw'
import guideManager from './guide/manager.md?raw'
import guideOtherComputers from './guide/other-computers.md?raw'
import guideSendFile from './guide/send-file.md?raw'
import guideSendHeredoc from './guide/send-heredoc.md?raw'
import managerInstructions from './manager/instructions.md?raw'
import managerRole from './manager/role.md?raw'
import secretsHow from './secrets/how.md?raw'
import secretsLoadSkill from './secrets/load-skill.md?raw'
import secretsSection from './secrets/section.md?raw'
import secretsSkill from './secrets/skill.md?raw'
import sourceClaude from './source/claude.md?raw'
import sourceGuide from './source/guide.md?raw'

export const PROMPTS = {
  browser: {
    how: browserHow.trim(), loadSkill: browserLoadSkill.trim(), rules: browserRules.trim(), section: browserSection.trim(), skill: browserSkill.trim(),
    references: { 'test-browsers': browserTestBrowsers.trim(), 'design-checks': browserDesignChecks.trim() },
  },
  build: { app: buildApp.trim(), provider: buildProvider.trim() },
  correct: { alone: correctAlone.trim(), codex: correctCodex.trim(), explain: correctExplain.trim(), grammar: correctGrammar.trim(), improve: correctImprove.trim(), rules: correctRules.trim(), translate: correctTranslate.trim() },
  findElements: findElements.trim(),
  guide: {
    browsers: guideBrowsers.trim(), claude: guideClaude.trim(), command: guideCommand.trim(), example: guideExample.trim(), employees: guideEmployees.trim(), exactForm: guideExactForm.trim(),
    headless: guideHeadless.trim(), manager: guideManager.trim(), otherComputers: guideOtherComputers.trim(), sendFile: guideSendFile.trim(), sendHeredoc: guideSendHeredoc.trim(),
  },
  manager: { instructions: managerInstructions.trim(), role: managerRole.trim() },
  secrets: { how: secretsHow.trim(), loadSkill: secretsLoadSkill.trim(), section: secretsSection.trim(), skill: secretsSkill.trim() },
  source: { claude: sourceClaude.trim(), guide: sourceGuide.trim() },
}

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (all, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`Prompt placeholder ${all} has no value.`)
    return value
  })
}
