import { MemoryRouter as Router, Routes, Route, HashRouter } from 'react-router-dom';
import './App.css';
import Main from './main';
import SettingsPage from './SettingsPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Main />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </HashRouter>
  );
}
