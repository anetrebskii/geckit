import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useState, useEffect } from 'react';
import LanguageSelector from './language_selector';
import { getUserContext, setUserContext } from './services/user_context';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [tab, setTab] = useState(0);
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
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState(
    () => getUserContext().settings.microphoneDeviceId || '',
  );
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioInputDevices(inputs);
      localStorage.setItem(
        'geckit-audio-input-devices',
        JSON.stringify(inputs.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
      );
    });
  }, []);

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
          microphoneDeviceId: microphoneDeviceId || undefined,
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

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="API Keys" />
        <Tab label="Microphone" />
        <Tab label="Translation" />
      </Tabs>

      <Box sx={{ px: 2.5, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tab === 0 && (
          <>
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
          </>
        )}

        {tab === 1 && (
          <FormControl size="small" fullWidth>
            <InputLabel>Microphone</InputLabel>
            <Select
              value={microphoneDeviceId}
              label="Microphone"
              onChange={(e) => setMicrophoneDeviceId(e.target.value)}
            >
              <MenuItem value="">System Default</MenuItem>
              {audioInputDevices.map((device) => (
                <MenuItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone (${device.deviceId.slice(0, 8)}...)`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {tab === 2 && (
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
        )}
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
