import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';

const languages = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Russian',
  'Chinese',
  'Japanese',
  'Korean',
  'Arabic',
  'Hindi',
  'Dutch',
  'Greek',
  'Swedish',
  'Turkish',
  'Vietnamese',
  'Polish',
  'Danish',
  'Finnish',
  'Hebrew',
  'Norwegian',
  'Romanian',
  'Hungarian',
  'Czech',
  'Thai',
  'Ukrainian',
  'Indonesian',
  'Malay',
  'Persian',
  'Swahili',
  'Amharic',
  'Zulu',
  'Icelandic',
  'Hawaiian',
  'Mongolian',
  'Yoruba',
  'Maori',
  'Samoan',
  'Sindhi',
  'Inuktitut',
];

export default function LanguageSelector({ label, onChange, value }: any) {
  const id = React.useId();
  return (
    <Autocomplete
      disablePortal
      id={`language-selector-${id}`}
      options={languages}
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
