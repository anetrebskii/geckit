import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Modal,
  Fade,
  Tabs,
  Tab,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Chat as ChatIcon,
  CheckBox as TasksIcon,
  Mic as MicIcon,
  Spellcheck as SpellcheckIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import Settings from './settings';
import Workspace from './workspace';
import TasksView from './components/tasks/TasksView';
import TranscriptionsView from './components/transcriptions/TranscriptionsView';
import CorrectView from './components/correct/CorrectView';
import { getUserContext, setUserContext } from './services/user_context';
import { Welcome } from './welcome';

const modalStyle = {
  position: 'absolute' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 380,
  bgcolor: 'background.paper',
  borderRadius: 2,
  boxShadow: 24,
};

type TabValue = 'correct' | 'chat' | 'tasks' | 'transcriptions';

export default function Main() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('correct');
  const [incomingText, setIncomingText] = useState<string | undefined>();

  useEffect(() => {
    const userContext = getUserContext();
    if (userContext.firstLaunch) {
      setUserContext({ firstLaunch: false });
      setWelcomeOpen(true);
    }
  }, []);

  // Cache audio input devices for snap window
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      localStorage.setItem(
        'geckit-audio-input-devices',
        JSON.stringify(inputs.map((d) => ({ deviceId: d.deviceId, label: d.label }))),
      );
    });
  }, []);

  // Listen for shortcut-pressed from main process (Cmd+C+D)
  useEffect(() => {
    window.electron.ipcRenderer.on('shortcut-pressed', (args: any) => {
      setActiveTab('correct');
      setIncomingText(args.text);
    });
  }, []);

  const handleIncomingTextConsumed = useCallback(() => {
    setIncomingText(undefined);
  }, []);

  // Keyboard shortcuts for tab switching (Ctrl+number, distinct from Cmd+number)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.shiftKey) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          setActiveTab('correct');
          break;
        case '2':
          e.preventDefault();
          setActiveTab('chat');
          break;
        case '3':
          e.preventDefault();
          setActiveTab('tasks');
          break;
        case '4':
          e.preventDefault();
          setActiveTab('transcriptions');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
          WebkitAppRegion: 'drag',
          pl: 9,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{
            minHeight: 36,
            WebkitAppRegion: 'no-drag',
            '& .MuiTabs-indicator': {
              height: 2,
            },
            '& .MuiTab-root': {
              minHeight: 36,
              minWidth: 0,
              px: 1.5,
              py: 0,
              fontSize: '0.8rem',
              textTransform: 'none',
              color: 'text.secondary',
              '&.Mui-selected': {
                color: 'primary.main',
              },
            },
          }}
        >
          <Tooltip title="Ctrl+1">
            <Tab
              value="correct"
              icon={<SpellcheckIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              label="Correct"
              sx={{ gap: 0.5 }}
            />
          </Tooltip>
          <Tooltip title="Ctrl+2">
            <Tab
              value="chat"
              icon={<ChatIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              label="Chat"
              sx={{ gap: 0.5 }}
            />
          </Tooltip>
          <Tooltip title="Ctrl+3">
            <Tab
              value="tasks"
              icon={<TasksIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              label="Tasks"
              sx={{ gap: 0.5 }}
            />
          </Tooltip>
          <Tooltip title="Ctrl+4">
            <Tab
              value="transcriptions"
              icon={<MicIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              label="Transcribe"
              sx={{ gap: 0.5 }}
            />
          </Tooltip>
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Settings">
          <IconButton
            size="small"
            onClick={() => setSettingsOpen(true)}
            sx={{
              mr: 1,
              WebkitAppRegion: 'no-drag',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            <SettingsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Content area */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'correct' && (
          <CorrectView
            incomingText={incomingText}
            onIncomingTextConsumed={handleIncomingTextConsumed}
          />
        )}
        {activeTab === 'chat' && (
          <Workspace onOpenSettings={() => setSettingsOpen(true)} />
        )}
        {activeTab === 'tasks' && <TasksView />}
        {activeTab === 'transcriptions' && <TranscriptionsView />}
      </Box>

      {/* Welcome Modal */}
      <Modal
        open={welcomeOpen}
        disableAutoFocus={false}
        aria-labelledby="Welcome"
        slotProps={{
          backdrop: {
            TransitionComponent: Fade,
          },
        }}
      >
        <Fade in={welcomeOpen}>
          <Box sx={modalStyle}>
            <Welcome onClose={() => setWelcomeOpen(false)} />
          </Box>
        </Fade>
      </Modal>

      {/* Settings Modal */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        aria-labelledby="Settings"
        slotProps={{
          backdrop: {
            TransitionComponent: Fade,
          },
        }}
      >
        <Fade in={settingsOpen}>
          <Box sx={modalStyle}>
            <Settings onClose={() => setSettingsOpen(false)} />
          </Box>
        </Fade>
      </Modal>
    </Box>
  );
}
