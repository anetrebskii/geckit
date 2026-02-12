import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Popover from '@mui/material/Popover';
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
  // eslint-disable-next-line react/require-default-props
  size?: 'small' | 'medium';
  // eslint-disable-next-line react/require-default-props
  disablePortal?: boolean;
}

export default function ModelSelector({
  label,
  onChange,
  value,
  provider = 'openai',
  size = 'medium',
  disablePortal = true,
}: ModelSelectorProps) {
  const id = React.useId();
  const models = React.useMemo(
    () => getModelsForProvider(provider),
    [provider],
  );

  return (
    <Autocomplete
      disablePortal={disablePortal}
      id={`model-selector-${id}`}
      options={models}
      freeSolo
      size={size}
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
          size={size}
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
  // eslint-disable-next-line react/require-default-props
  compact?: boolean;
}

export function ModelProviderSelector({
  model,
  provider,
  onChange,
  compact = false,
}: ModelProviderSelectorProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  if (compact) {
    return (
      <>
        <Chip
          label={model || 'Select model'}
          size="small"
          variant="outlined"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ cursor: 'pointer', maxWidth: '100%' }}
        />
        <Popover
          open={!!anchorEl}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          slotProps={{ paper: { sx: { overflow: 'visible' } } }}
        >
          <Box sx={{ p: 1.5, width: 320, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
              size="small"
              disablePortal={false}
              onChange={(v) => onChange(v, provider)}
            />
          </Box>
        </Popover>
      </>
    );
  }

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
