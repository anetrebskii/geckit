import {
  Box,
  Button,
  FormControl,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
} from '@mui/material';
import { useState } from 'react';
import LanguageSelector from './language_selector';
import { getUserContext, setUserContext } from './services/user_context';
import {
  AIProvider,
  getProviderDisplayName,
} from './services/ai_service';

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
  const [aiProvider, setAiProvider] = useState<AIProvider>(
    () => getUserContext().settings.aiProvider || 'openai',
  );
  const [lang1, setLang1] = useState(
    () => getUserContext().settings.nativateLanguage,
  );
  const [lang2, setLang2] = useState(
    () => getUserContext().settings.secondLanguage,
  );

  const handleProviderChange = (
    _event: React.MouseEvent<HTMLElement>,
    newProvider: AIProvider | null,
  ) => {
    if (newProvider !== null) {
      setAiProvider(newProvider);
    }
  };

  const saveHandler = async () => {
    try {
      setUserContext({
        settings: {
          openAiKey,
          anthropicKey,
          aiProvider,
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

      {/* AI Provider Selection */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
          AI Provider
        </Typography>
        <ToggleButtonGroup
          value={aiProvider}
          exclusive
          onChange={handleProviderChange}
          aria-label="AI Provider"
          fullWidth
          size="small"
        >
          <ToggleButton value="openai" aria-label="OpenAI">
            {getProviderDisplayName('openai')}
          </ToggleButton>
          <ToggleButton value="anthropic" aria-label="Anthropic">
            {getProviderDisplayName('anthropic')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* OpenAI API Key */}
      <Collapse in={aiProvider === 'openai'}>
        <Box>
          <TextField
            label="OpenAI API Key"
            type="password"
            value={openAiKey}
            sx={{ width: 1 }}
            onChange={(e) => setOpenAiKey(e.target.value)}
            placeholder="sk-..."
          />
        </Box>
      </Collapse>

      {/* Anthropic API Key */}
      <Collapse in={aiProvider === 'anthropic'}>
        <Box>
          <TextField
            label="Anthropic API Key"
            type="password"
            value={anthropicKey}
            sx={{ width: 1 }}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </Box>
      </Collapse>

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
