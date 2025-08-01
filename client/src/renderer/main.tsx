import { useEffect, useState } from 'react';
import { Box, IconButton, Modal, AppBar, Toolbar, Fade } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import Settings from './settings';
import Workspace from './workspace';
import { getUserContext, setUserContext } from './services/user_context';
import { Welcome } from './welcome';

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '1px solid #000',
  boxShadow: 24,
  p: 2,
};

export default function Main() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    const userContext = getUserContext();
    if (userContext.firstLaunch) {
      setUserContext({ firstLaunch: false });
      setWelcomeOpen(true);
    }
  }, []);

  return (
    <>
      <Workspace 
        onOpenSettings={() => setSettingsOpen(true)}
      />

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
          <Box sx={style}>
            <Welcome onClose={() => setWelcomeOpen(false)} />
          </Box>
        </Fade>
      </Modal>

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
          <Box sx={style}>
            <Settings onClose={() => setSettingsOpen(false)} />
          </Box>
        </Fade>
      </Modal>
    </>
  );
}
