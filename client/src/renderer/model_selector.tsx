import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import {
  AIProvider,
  getModelsForProvider,
  getDefaultModelForProvider,
  getProviderDisplayName,
} from './services/ai_service';

interface ModelSelectorProps {
  label: string;
  onChange?: (value: string) => void;
  value: string;
  provider?: AIProvider;
}

export default function ModelSelector({
  label,
  onChange,
  value,
  provider = 'openai',
}: ModelSelectorProps) {
  const id = React.useId();
  const models = React.useMemo(
    () => getModelsForProvider(provider),
    [provider],
  );

  return (
    <Autocomplete
      disablePortal
      id={`model-selector-${id}`}
      options={models}
      freeSolo
      value={value}
      onInputChange={(e, v) => {
        if (onChange) {
          onChange(v);
        }
      }}
      onChange={(e, v) => {
        if (onChange) {
          onChange(v || '');
        }
      }}
      sx={{ width: 1 }}
      renderInput={(params) => (
        <TextField
          // eslint-disable-next-line react/jsx-props-no-spreading
          {...params}
          label={label}
        />
      )}
    />
  );
}

const PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'openrouter'];

interface ModelProviderSelectorProps {
  model: string;
  provider: AIProvider;
  onChange: (model: string, provider: AIProvider) => void;
}

export function ModelProviderSelector({
  model,
  provider,
  onChange,
}: ModelProviderSelectorProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {PROVIDERS.map((p) => (
          <Chip
            key={p}
            label={getProviderDisplayName(p)}
            size="small"
            color={p === provider ? 'primary' : 'default'}
            variant={p === provider ? 'filled' : 'outlined'}
            onClick={() => {
              if (p !== provider) {
                onChange(getDefaultModelForProvider(p), p);
              }
            }}
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Box>
      <ModelSelector
        label="Model"
        value={model}
        provider={provider}
        onChange={(v) => onChange(v, provider)}
      />
    </Box>
  );
}
