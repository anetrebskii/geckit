import {
  Box,
  Button,
  Divider,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import LanguageSelector from './language_selector';
import { getUserContext, setUserContext } from './services/user_context';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [openAiKey, setOpenAiKey] = useState(
    () => getUserContext().settings.openAiKey || '',
  );
  const [anthropicKey, setAnthropicKey] = useState(
    () => getUserContext().settings.anthropicKey || '',
  );
  const [openRouterKey, setOpenRouterKey] = useState(
    () => getUserContext().settings.openRouterKey || '',
  );
  const [lang1, setLang1] = useState(
    () => getUserContext().settings.nativateLanguage,
  );
  const [lang2, setLang2] = useState(
    () => getUserContext().settings.secondLanguage,
  );

  const saveHandler = async () => {
    try {
      const existing = getUserContext();
      setUserContext({
        settings: {
          ...existing.settings,
          openAiKey,
          anthropicKey,
          openRouterKey,
          nativateLanguage: lang1,
          secondLanguage: lang2,
        },
      });
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2.5, py: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold">
          Settings
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          API KEYS
        </Typography>
        <TextField
          label="OpenAI (required for transcription)"
          type="password"
          size="small"
          value={openAiKey}
          fullWidth
          onChange={(e) => setOpenAiKey(e.target.value)}
          placeholder="sk-..."
        />
        <TextField
          label="Anthropic"
          type="password"
          size="small"
          value={anthropicKey}
          fullWidth
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-..."
        />
        <TextField
          label="OpenRouter"
          type="password"
          size="small"
          value={openRouterKey}
          fullWidth
          onChange={(e) => setOpenRouterKey(e.target.value)}
          placeholder="sk-or-..."
        />
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          TRANSLATION
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <LanguageSelector
            label="Native Language"
            size="small"
            value={lang1}
            onChange={(e: any) => setLang1(e)}
          />
          <LanguageSelector
            label="Second Language"
            size="small"
            value={lang2}
            onChange={(e: any) => setLang2(e)}
          />
        </Box>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, py: 2 }}>
        <Button
          variant="contained"
          size="small"
          onClick={saveHandler}
          fullWidth
          disableElevation
        >
          Save and Close
        </Button>
      </Box>
    </Box>
  );
}
