import { Box, Button, Typography } from '@mui/material';
import icon from './assets/icon.png';

export interface WelcomeProps {
  onClose: () => void;
}

export function Welcome({ onClose }: WelcomeProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', width: 1, mb: 2 }}>
        <Box
          component="img"
          sx={{
            width: 100,
          }}
          src={icon}
        />
      </Box>
      <Typography id="spring-modal-title" variant="h6" component="h2">
        Hello there!
      </Typography>
      <Typography id="spring-modal-description" sx={{ mt: 2 }}>
        I'm Gecko, your nimble text assistant. Have you noticed how quick I am?
        I'm here to make sure you can keep up with me! With just a few clicks,
        you can swiftly correct or translate any text across all your
        applications. Let's speed through your edits together!
      </Typography>
      {/* <Box sx={{position: cen}}> */}
      <Button sx={{ width: 1, mt: 2 }} onClick={onClose}>
        Let's start
      </Button>
      {/* </Box> */}
    </Box>
  );
}
