import { Box, Button, FormControl, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import LanguageSelector from './language_selector';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [key, setKey] = useState(() => {
    return window.localStorage.getItem('openApi') as string;
  });
  const [lang1, setLang1] = useState(() => {
    return window.localStorage.getItem('lang1') as string;
  });
  const [lang2, setLang2] = useState(() => {
    return window.localStorage.getItem('lang2') as string;
  });

  const textChangeHandler = (args: any) => {
    setKey(args.target.value);
  };

  const saveHandler = async () => {
    try {
      await window.localStorage.setItem('openApi', key);
      await window.localStorage.setItem('lang1', lang1);
      await window.localStorage.setItem('lang2', lang2);
      onClose();
    } catch (error) {
      console.error('Failed to save OpenAI API:', error);
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Typography id="transition-modal-title" variant="h6" component="h2">
        Settings
      </Typography>
      <Box sx={{ gridRow: '1' }}>
        <TextField
          label="Open AI Key"
          type="password"
          value={key}
          sx={{ width: 1 }}
          onChange={textChangeHandler}
        />
      </Box>
      <Box>
        <FormControl sx={{ width: 1 }} variant="outlined">
          <LanguageSelector
            label="Language 1"
            value={lang1}
            onChange={(e: any) => setLang1(e)}
          />
        </FormControl>
      </Box>
      <Box>
        <FormControl sx={{ width: 1 }} variant="outlined">
          <LanguageSelector
            label="Language 2"
            value={lang2}
            onChange={(e: any) => setLang2(e)}
          />
        </FormControl>
      </Box>
      <Box>
        <Button
          variant="contained"
          type="button"
          onClick={saveHandler}
          sx={{ width: 1 }}
        >
          Save and Close
        </Button>
      </Box>
    </Box>
  );
}
