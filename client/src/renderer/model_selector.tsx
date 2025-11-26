import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import { AIProvider, getModelsForProvider } from './services/ai_service';

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
