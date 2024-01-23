import '@testing-library/jest-dom';
import 'openai/shims/node';
import { render } from '@testing-library/react';
import App from '../renderer/App';
// import { MyIpcRenderer } from '../main/preload';

describe('App', () => {
  it('should render', () => {
    const mockIpcRenderer = {
      on: jest.fn(),
      sendMessage: jest.fn(),
      once: jest.fn(),
    };

    window.electron = {
      ipcRenderer: mockIpcRenderer,
    };

    expect(render(<App />)).toBeTruthy();
  });
});
