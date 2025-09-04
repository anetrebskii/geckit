import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';

const models = [
  'gpt-3.5-turbo',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4o-mini-search-preview',
  'gpt-4o-search-preview',
  'o1',
  'o1-mini',
  'o3',
  'o3-mini',
  'o3-pro',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5-mini',
  'gpt-5',
  'gpt-5-nano',
];

export default function ModelSelector({ label, onChange, value }: any) {
  const id = React.useId();
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
          onChange(v);
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
