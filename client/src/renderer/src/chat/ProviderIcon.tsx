import { memo } from 'react'
import { providerOf } from '../../../shared/api'
import type { ClaudeTransport } from '../../../shared/api'
import { llmProviderInfo } from '../../../shared/providers'
import { Icon } from '../ui/Icon'

export const ProviderIcon = memo(function ProviderIcon({ id, transport }: { readonly id: string; readonly transport?: ClaudeTransport | undefined }): React.JSX.Element {
  const provider = llmProviderInfo(providerOf(id), transport)
  return <span className="provider-icon" role="img" aria-label={provider.name} title={provider.name}><Icon name={provider.icon} size={12} /></span>
})
