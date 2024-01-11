import { useEffect, useState } from 'react';
import { OpenAI } from 'openai';

export default function Main() {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    // console.log(window.api);
    (window.electron.ipcRenderer as any).on('shortcut-pressed', (args: any) => {
      setText(args.text);
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
      dangerouslyAllowBrowser: true
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
      setText(completion.choices[0].message.content as string);
    } catch (err) {
      setText('Error fetching data from OpenAI');
      console.error('OpenAI API Error:', err);
    }

    copyToClipboard();
  };

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => handleClick('Only fix mistakes in my text')}
        >
          Fix and copy
        </button>
        <button
          type="button"
          onClick={() =>
            handleClick(
              'Translate the text from English to Russian or opposite',
            )
          }
        >
          Fix and copy
        </button>
      </div>

      <pre style={{ whiteSpace: 'pre-wrap' }}>{text}</pre>
    </>
  );
}
