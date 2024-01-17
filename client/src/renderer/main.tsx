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

  const copyToClipboard = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
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
      <Box>
        <TextField
          multiline
          aria-label="maximum height"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          sx={{ width: 1 }}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'left', gap: 1 }}>
        <Button
          type="button"
          variant="contained"
          onClick={() => handleClick('Only fix mistakes in my text')}
        >
          Correct
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
          Traslate
        </Button>

        <Button
          type="button"
          variant="contained"
          onClick={() => handleClick('Explain')}
        >
          Explain
        </Button>
      </Box>
      <Box>
        <TextField multiline value={newText} sx={{ width: 1 }} rows={5} />
      </Box>
    </Box>
  );
}
