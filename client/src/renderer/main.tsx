import { useEffect, useState } from 'react';
import { Box, Modal, Fade, Tabs, Tab, Paper } from '@mui/material';
import { Chat as ChatIcon, CheckBox as TasksIcon } from '@mui/icons-material';
import Settings from './settings';
import Workspace from './workspace';
import TasksView from './components/tasks/TasksView';
import { getUserContext, setUserContext } from './services/user_context';
import { Welcome } from './welcome';

const modalStyle = {
  position: 'absolute' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '1px solid #000',
  boxShadow: 24,
  p: 2,
};

type TabValue = 'chat' | 'tasks';

export default function Main() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('chat');

  useEffect(() => {
    const userContext = getUserContext();
    if (userContext.firstLaunch) {
      setUserContext({ firstLaunch: false });
      setWelcomeOpen(true);
    }
  }, []);

  // Keyboard shortcuts for tab switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + 1 - Switch to Chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '1') {
        e.preventDefault();
        setActiveTab('chat');
      }
      // Cmd/Ctrl + Shift + 2 - Switch to Tasks
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '2') {
        e.preventDefault();
        setActiveTab('tasks');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Tab bar */}
      <Paper
        elevation={1}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              py: 0,
              textTransform: 'none',
            },
          }}
        >
          <Tab
            value="chat"
            icon={<ChatIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Chat"
            sx={{ gap: 0.5 }}
          />
          <Tab
            value="tasks"
            icon={<TasksIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Tasks"
            sx={{ gap: 0.5 }}
          />
        </Tabs>
      </Paper>

      {/* Content area */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'chat' && (
          <Workspace onOpenSettings={() => setSettingsOpen(true)} />
        )}
        {activeTab === 'tasks' && <TasksView />}
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
