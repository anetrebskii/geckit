import { useEffect, useState } from 'react';
import { OpenAI } from 'openai';
import Button from '@mui/material/Button';
import { Box, TextField } from '@mui/material';

export default function Main() {
  const [text, setText] = useState<string>('');
  const [newText, setNewText] = useState<string>('');

  useEffect(() => {
    // console.log(window.api);
    (window.electron.ipcRenderer as any).on('shortcut-pressed', (args: any) => {
      setText(args.text);
      setNewText('');
    });
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text);
      // alert("Text copied to clipboard!");
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleClick = async (context: string) => {
    const apiKey = window.localStorage.getItem('openApi') as string;

    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: 'system', content: context },
          { role: 'user', content: text },
        ],
        max_tokens: 1000,
        model: 'gpt-3.5-turbo',
      });
      setNewText(completion.choices[0].message.content as string);
    } catch (err) {
      setText('Error fetching data from OpenAI');
      console.error('OpenAI API Error:', err);
    }

    copyToClipboard();
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 1,
        gridTemplateRows: '1fr auto 1fr',
      }}
    >
      <Box sx={{ gridColumn: '1', gridRow: '1' }}>
        <TextField
          multiline
          aria-label="maximum height"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          sx={{ width: 1 }}
        />
      </Box>
      <Box sx={{ gridColumn: '1', gridRow: '2' }}>
        <Button
          type="button"
          variant="contained"
          onClick={() => handleClick('Only fix mistakes in my text')}
        >
          Fix and copy
        </Button>
        <Button
          type="button"
          variant="contained"
          onClick={() =>
            handleClick(
              `Translate the text from ${window.localStorage.getItem(
                'lang1',
              )} to ${window.localStorage.getItem('lang2')} or opposite`,
            )
          }
        >
          Traslate and copy
        </Button>
      </Box>
      <Box sx={{ gridColumn: '1', gridRow: '3' }}>
        <TextField multiline value={newText} sx={{ width: 1 }} rows={5} />
      </Box>
    </Box>
  );
}
