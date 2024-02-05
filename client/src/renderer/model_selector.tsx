import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';

const models = ['gpt-3.5-turbo', 'gpt-4-turbo-preview', 'gpt-4-0125-preview'];

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
