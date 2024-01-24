import { useState } from 'react';
import { Box, IconButton, Modal, AppBar, Toolbar } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import Settings from './settings';
import Workspace from './workspace';

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 2,
};

export default function Main() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <AppBar
        position="fixed"
        color="transparent"
        sx={{ top: 'auto', bottom: 0 }}
      >
        <Toolbar variant="dense">
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Workspace />
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        aria-labelledby="settings-modal-title"
        aria-describedby="settings-modal-description"
      >
        <Box sx={style}>
          <Settings onClose={() => setSettingsOpen(false)} />
        </Box>
      </Modal>
    </>
  );
}
