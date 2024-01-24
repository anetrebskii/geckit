import { useEffect, useState } from 'react';
import { OpenAI } from 'openai';
import { Box, Snackbar, TextField } from '@mui/material';
import { LoadingButton } from '@mui/lab';
import { CmdOrCtrl } from './services/os_helper';

export default function Workspace() {
  const [text, setText] = useState<string>('');
  const [newText, setNewText] = useState<string>('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [loading, setLoading] = useState('');

  useEffect(() => {
    window.electron.ipcRenderer.on('shortcut-pressed', (args: any) => {
      setText(args.text);
      setNewText('');
    });
  });

  const copyToClipboard = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleClick = async (btn: string, context: string) => {
    await setLoading(btn);
    const apiKey = window.localStorage.getItem('openApi') as string;

    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    let newTextTmp: string = '';
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: text },
        ],
        max_tokens: 1000,
        model: 'gpt-3.5-turbo',
      });
      newTextTmp = completion.choices[0].message.content as string;
    } catch (err) {
      newTextTmp = 'Error fetching data from OpenAI';
      console.error('OpenAI API Error:', err);
    }

    setNewText(newTextTmp);
    copyToClipboard(newTextTmp);
    await setLoading('');
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 2,
        p: 2,
        gridTemplateRows: '1fr auto 1fr',
      }}
    >
      <Box>
        <TextField
          multiline
          aria-label="maximum height"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          label={`Select text and press ${CmdOrCtrl}+C, ${CmdOrCtrl}+D`}
          sx={{ width: 1 }}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'left', gap: 1 }}>
        <LoadingButton
          type="button"
          loading={loading === 'correct'}
          disabled={!!loading}
          variant="contained"
          onClick={() => handleClick('correct', 'Only fix mistakes in my text')}
        >
          Correct
        </LoadingButton>

        <LoadingButton
          type="button"
          loading={loading === 'translate'}
          disabled={!!loading}
          variant="contained"
          onClick={() =>
            handleClick(
              'translate',
              `Translate the text from ${window.localStorage.getItem(
                'lang1',
              )} to ${window.localStorage.getItem('lang2')} or opposite`,
            )
          }
        >
          Traslate
        </LoadingButton>

        <LoadingButton
          type="button"
          loading={loading === 'explain'}
          disabled={!!loading}
          variant="contained"
          onClick={() => handleClick('explain', 'Explain')}
        >
          Explain
        </LoadingButton>
      </Box>
      <Box>
        <TextField
          multiline
          value={newText}
          sx={{ width: 1 }}
          rows={5}
          label="Updated text"
        />
      </Box>
      <Snackbar
        open={snackbarOpen}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message="Updated text copied"
      />
    </Box>
  );
}
