import { useState } from 'react';

export default function SettingsPage() {
  const [key, setKey] = useState(() => {
    console.log("Loaded "+ window.localStorage.getItem('openApi'));
    return window.localStorage.getItem('openApi') as string;
  });

  const textChangeHandler = (args: any) => {
    setKey(args.target.value);
  };

  const saveHandler = async () => {
    try {
      await window.localStorage.setItem('openApi', key);
    } catch (error) {
      console.error('Failed to save OpenAI API:', error);
    }
  };

  return (
    <>
      <input type="text" value={key} onChange={textChangeHandler} />
      <button type="button" onClick={saveHandler}>
        Save
      </button>
    </>
  );
}
