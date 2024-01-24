import { Routes, Route, HashRouter } from 'react-router-dom';
import { ThemeProvider } from '@emotion/react';
import { createTheme } from '@mui/material';
import Main from './main';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './App.css';

export default function App() {
  const theme = createTheme({
    palette: {
      primary: {
        main: '#33b746',
        contrastText: '#FFF',
      },
    },
    shape: {
      borderRadius: 10,
    },
  });
  return (
    <ThemeProvider theme={theme}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Main />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
