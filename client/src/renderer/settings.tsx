import { Box, Button, FormControl, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import LanguageSelector from './language_selector';
import { getUserContext, setUserContext } from './services/user_context';
import ModelSelector from './model_selector';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [key, setKey] = useState(() => getUserContext().settings.openAiKey);
  const [model, setModel] = useState(
    () => getUserContext().settings.openAiModel,
  );
  const [lang1, setLang1] = useState(
    () => getUserContext().settings.nativateLanguage,
  );
  const [lang2, setLang2] = useState(
    () => getUserContext().settings.secondLanguage,
  );

  const textChangeHandler = (args: any) => {
    setKey(args.target.value);
  };

  const saveHandler = async () => {
    try {
      setUserContext({
        settings: {
          openAiKey: key,
          nativateLanguage: lang1,
          secondLanguage: lang2,
          openAiModel: model,
        },
      });
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
      <Box sx={{ gridRow: '1' }}>
        <ModelSelector
          label="Open AI model"
          value={model}
          onChange={(e: any) => setModel(e)}
        />
      </Box>
      <Box>
        <FormControl sx={{ width: 1 }} variant="outlined">
          <LanguageSelector
            label="Native Language"
            value={lang1}
            onChange={(e: any) => setLang1(e)}
          />
        </FormControl>
      </Box>
      <Box>
        <FormControl sx={{ width: 1 }} variant="outlined">
          <LanguageSelector
            label="Second Language"
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
