import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Tooltip,
  LinearProgress,
  Modal,
  Fade,
  Snackbar,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { CmdOrCtrl } from '../../services/os_helper';
import { getUserContext } from '../../services/user_context';
import {
  sendChatMessage,
  getDefaultModelForProvider,
  getProviderDisplayName,
  AIProvider,
  AIConfig,
} from '../../services/ai_service';
import { ModelProviderSelector } from '../../model_selector';

interface CorrectViewProps {
  // eslint-disable-next-line react/require-default-props
  incomingText?: string;
  // eslint-disable-next-line react/require-default-props
  onIncomingTextConsumed?: () => void;
}

type ActionType = 'grammar' | 'improve' | 'translate' | 'explain' | 'custom';

export default function CorrectView({
  incomingText,
  onIncomingTextConsumed,
}: CorrectViewProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customActionOpen, setCustomActionOpen] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const customInstructionRef = useRef<HTMLInputElement>(null);

  // Per-view model/provider selection
  const [correctProvider, setCorrectProvider] = useState<AIProvider>(() => {
    try {
      const saved = localStorage.getItem('geckit-correct-model');
      if (saved) return JSON.parse(saved).provider;
    } catch {
      /* use default */
    }
    return getUserContext().settings.aiProvider || 'openai';
  });
  const [correctModel, setCorrectModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('geckit-correct-model');
      if (saved) return JSON.parse(saved).model;
    } catch {
      /* use default */
    }
    const provider = getUserContext().settings.aiProvider || 'openai';
    return getDefaultModelForProvider(provider);
  });

  // Persist correct model/provider to localStorage
  useEffect(() => {
    localStorage.setItem(
      'geckit-correct-model',
      JSON.stringify({ model: correctModel, provider: correctProvider }),
    );
  }, [correctModel, correctProvider]);

  // Handle incoming text from shortcut
  useEffect(() => {
    if (incomingText) {
      setText(incomingText);
      onIncomingTextConsumed?.();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [incomingText, onIncomingTextConsumed]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setSnackbarOpen(true);
  };

  const getPromptForAction = useCallback(
    (action: ActionType, custom?: string): string => {
      const userContext = getUserContext();
      switch (action) {
        case 'grammar':
          return '\n\n[Please correct any grammar and spelling mistakes in the text above. Provide only corrected message in the reply without quotas.]';
        case 'improve':
          return '\n\n[Please improve this text to make it sound more professional and native. Provide only corrected message in the reply without quotas.]';
        case 'translate':
          return `\n\n[Please translate this text from ${
            userContext.settings.nativateLanguage || 'English'
          } to ${
            userContext.settings.secondLanguage || 'Spanish'
          } or vice versa. Provide only translated message in the reply without quotas.]`;
        case 'explain':
          return '\n\n[Please explain what this text means and provide context. Provide only explained message in the reply without quotas.]';
        case 'custom':
          return `\n\n[${custom || ''}]`;
        default:
          return '';
      }
    },
    [],
  );

  const executeAction = useCallback(
    async (action: ActionType, custom?: string) => {
      if (!text.trim() || loading) return;

      const prompt = getPromptForAction(action, custom);
      const messageWithPrompt = `${text}${prompt}`;

      setLoading(true);
      setError('');

      try {
        const userContext = getUserContext();
        const aiConfig: AIConfig = {
          provider: correctProvider,
          openAiKey: userContext.settings.openAiKey,
          anthropicKey: userContext.settings.anthropicKey,
        };

        const responseText = await sendChatMessage(aiConfig, correctModel, [
          { role: 'user', content: messageWithPrompt },
        ]);

        const resultText = responseText || 'No response';
        setText(resultText);
        await copyToClipboard(resultText);
      } catch (err) {
        setError(
          `${getProviderDisplayName(correctProvider)} API Error: ${err}`,
        );
      }

      setLoading(false);
    },
    [text, loading, getPromptForAction, correctProvider, correctModel],
  );

  const handleCustomAction = useCallback(() => {
    if (!customInstruction.trim()) return;
    setCustomActionOpen(false);
    const instruction = customInstruction;
    setCustomInstruction('');
    executeAction('custom', instruction);
  }, [customInstruction, executeAction]);

  // Keyboard shortcuts for actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !text.trim() || loading) return;
      if (customActionOpen) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          executeAction('grammar');
          break;
        case '2':
          e.preventDefault();
          executeAction('improve');
          break;
        case '3':
          e.preventDefault();
          executeAction('translate');
          break;
        case '4':
          e.preventDefault();
          executeAction('explain');
          break;
        case '0':
          e.preventDefault();
          setCustomActionOpen(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, loading, customActionOpen, executeAction]);

  const actions: { key: ActionType; label: string; shortcut: string }[] = [
    { key: 'grammar', label: 'Grammar', shortcut: `${CmdOrCtrl}+1` },
    { key: 'improve', label: 'Improve', shortcut: `${CmdOrCtrl}+2` },
    { key: 'translate', label: 'Translate', shortcut: `${CmdOrCtrl}+3` },
    { key: 'explain', label: 'Explain', shortcut: `${CmdOrCtrl}+4` },
    { key: 'custom', label: 'Custom', shortcut: `${CmdOrCtrl}+0` },
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '94%',
        pb: 2,
        pt: 2,
        px: 1,
        overflow: 'hidden',
        gap: 1,
      }}
    >
      {/* Single text field: input and result */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          border: 1,
          borderColor: loading ? 'action.disabled' : 'grey.400',
          borderRadius: 1,
          overflow: 'hidden',
          '&:focus-within': {
            borderColor: 'primary.main',
            borderWidth: 2,
          },
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Paste or type text here... (${CmdOrCtrl}+C, ${CmdOrCtrl}+D from outside the app)`}
          disabled={loading}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '12px',
            fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
            fontSize: '1rem',
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: '0.00938em',
            boxSizing: 'border-box',
            backgroundColor: loading ? '#fafafa' : 'transparent',
          }}
        />
      </Box>
      {loading && <LinearProgress />}
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      {/* Action buttons */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexShrink: 0 }}>
        {actions.map((action) => (
          <Tooltip key={action.key} title={action.shortcut}>
            <span>
              <Button
                variant="outlined"
                size="small"
                disabled={loading || !text.trim()}
                onClick={() => {
                  if (action.key === 'custom') {
                    setCustomActionOpen(true);
                  } else {
                    executeAction(action.key);
                  }
                }}
              >
                {action.label}
              </Button>
            </span>
          </Tooltip>
        ))}
      </Box>

      {/* Model selector */}
      <Box sx={{ flexShrink: 0 }}>
        <ModelProviderSelector
          model={correctModel}
          provider={correctProvider}
          onChange={(model, provider) => {
            setCorrectModel(model);
            setCorrectProvider(provider);
          }}
        />
      </Box>

      {/* Custom Action Modal */}
      <Modal
        open={customActionOpen}
        onClose={() => {
          setCustomActionOpen(false);
          setCustomInstruction('');
        }}
        aria-labelledby="custom-action-modal"
        slotProps={{
          backdrop: {
            TransitionComponent: Fade,
          },
        }}
      >
        <Fade
          in={customActionOpen}
          onEntered={() => {
            customInstructionRef.current?.focus();
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 500,
              bgcolor: 'background.paper',
              border: '1px solid #000',
              boxShadow: 24,
              p: 3,
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              Custom Action
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Provide custom instructions for what you want to do with the text:
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="e.g., Rewrite this in a more casual tone, Fix any technical issues, Make this sound like a pirate..."
              variant="outlined"
              sx={{ mb: 3 }}
              inputRef={customInstructionRef}
              autoFocus
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleCustomAction();
                }
              }}
            />
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setCustomActionOpen(false);
                  setCustomInstruction('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleCustomAction}
                disabled={!customInstruction.trim() || loading}
                endIcon={<SendIcon />}
              >
                Send
              </Button>
            </Box>
          </Box>
        </Fade>
      </Modal>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={1500}
        onClose={() => setSnackbarOpen(false)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
