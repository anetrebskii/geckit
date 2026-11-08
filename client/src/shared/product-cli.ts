export type ProductAuthority = 'operator' | 'manager'

export const PRODUCT_COMMANDS = [
  'capabilities',
  'speech status|fetch', 'browser-config status|fetch-model|delete-model', 'browser-config start-test|delete-test --name <test-name>',
  'settings schema|show|manager', 'settings manager-edit --instructions <text> --expected-instructions <last-read-text>', 'settings edit --patch <JSON> [--expected <JSON>]',
  'providers list', 'providers enable|disable --provider <id> --expected <enabled-provider-JSON-array>',
  'providers models|account --provider <enabled-id>', 'providers install --url <library> (installed disabled)', 'providers reinstall|uninstall|update --id <library-id>', 'providers check-updates|failures',
  'projects list', 'projects add|create --path <absolute-folder>', 'projects provider --project <root> [--provider <enabled-id|none> --expected <JSON-provider-or-null>]', 'projects remove --project <registered-root>',
  'hosts list|known', 'hosts add --draft <nonsecret-JSON>', 'hosts edit --id <id> --draft <nonsecret-JSON> --expected <JSON>', 'hosts remove|install|forget|running|working|conversations --id <id>', 'hosts connect|reconnect|disconnect --id <id>', 'hosts folders --id <id> [--path <folder>]',
  'hosts add-folder --id <id> --path <folder>',
  'employees <existing employee/shortcut commands>', 'shortcuts list|save|remove|run (save --draft JSON --expected JSON-or-null)', 'sessions list|show|search|hidden|status|plans|start|prepare|schedule|send|stop|retry|steer|proceed|rename|mark|hide|delete|bring|read|release|assign|mode|transport|keep|export|copy|continue|unqueue|requeue|reorder|delegate|inject-queued|stop-task|clear-task|task-output|background|links|waiting|draft|save-draft|mcp|browsers|answer (questions only)', 'channels list|check-updates', 'channels install --url <library>', 'channels configure --id <id> --patch <nonsecret-JSON> --expected <JSON>', 'channels remove --id <id>',
  'manager view|pause|resume|retry|restart|voice-memos', 'manager inspect|receipt --id <id>', 'manager history --thread <id> --action clear|delete [--session <id>] [--revision <last-read-revision>]', 'manager configure --patch <JSON> --expected <JSON>', 'manager send --text <request>', 'computers list|forget <id>', 'devices list|revoke <id>', 'access status|disable',
] as const

export const productCommand = (args: readonly string[]): boolean => ['capabilities', 'providers', 'projects', 'hosts', 'channels', 'manager', 'shortcuts', 'speech', 'browser-config'].includes(args[0] ?? '') || args[0] === 'sessions' && args[1] !== undefined && !args[1].startsWith('-')
