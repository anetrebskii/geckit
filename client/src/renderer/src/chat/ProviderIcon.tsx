import { memo } from 'react'
import { providerOf } from '../../../shared/api'
import { Icon } from '../ui/Icon'

export const ProviderIcon = memo(function ProviderIcon({ id }: { readonly id: string }): React.JSX.Element {
  const provider = providerOf(id)
  const name = provider === 'codex' ? 'Codex' : 'Claude Code'
  return <span className="provider-icon" role="img" aria-label={name} title={name}><Icon name={provider} size={12} /></span>
})
