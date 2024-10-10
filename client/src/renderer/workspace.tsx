import { useEffect, useState } from 'react';
import { OpenAI } from 'openai';
import { Box, Snackbar, TextField } from '@mui/material';
import { LoadingButton } from '@mui/lab';
import { CmdOrCtrl } from './services/os_helper';
import { getUserContext } from './services/user_context';

export default function Workspace() {
  const [text, setText] = useState<string>('');
  const [newText, setNewText] = useState<string>('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const userContext = getUserContext();

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

    const openai = new OpenAI({
      apiKey: userContext.settings.openAiKey,
      dangerouslyAllowBrowser: true,
    });

    let newTextTmp: string = '';
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: `Text: ${text}` },
        ],
        max_tokens: 3000,
        model: userContext.settings.openAiModel,
      });
      newTextTmp = completion.choices[0].message.content as string;
    } catch (err) {
      newTextTmp = `OpenAI API Error: ${err}`;
      console.error(newTextTmp);
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
          onClick={() =>
            handleClick(
              'correct',
              'Only fix mistakes in my text and provide a correct version',
            )
          }
        >
          Correct
        </LoadingButton>

        <LoadingButton
          type="button"
          loading={loading === 'improve'}
          disabled={!!loading}
          variant="contained"
          onClick={() =>
            handleClick('improve', 'Correct it and make it sounds better')
          }
        >
          Improve
        </LoadingButton>

        <LoadingButton
          type="button"
          loading={loading === 'translate'}
          disabled={!!loading}
          variant="contained"
          onClick={() =>
            handleClick(
              'translate',
              `Translate the text from ${userContext.settings.nativateLanguage} to ${userContext.settings.secondLanguage} or opposite. Return only translated version.`,
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
          onClick={() =>
            handleClick('explain', 'Explain what was meant in the text')
          }
        >
          Explain
        </LoadingButton>

        <LoadingButton
          type="button"
          loading={loading === 'chat'}
          disabled={!!loading}
          variant="contained"
          onClick={() => handleClick('chat', 'You are helpful assistant')}
        >
          Chat
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
