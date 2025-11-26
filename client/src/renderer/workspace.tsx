import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  Card,
  CardContent,
  Chip,
  Collapse,
  Menu,
  MenuItem,
  Tooltip,
  Modal,
  Fade,
} from '@mui/material';
import {
  Send as SendIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Menu as MenuIcon,
  Tune as TuneIcon,
  ArrowDropDown as ArrowDropDownIcon,
  AutoAwesome as AutoAwesomeIcon,
  ContentCopy as ContentCopyIcon,
  DeleteSweep as DeleteSweepIcon,
} from '@mui/icons-material';
import { CmdOrCtrl } from './services/os_helper';
import { getUserContext } from './services/user_context';
import ModelSelector from './model_selector';
import {
  sendChatMessage,
  getDefaultModelForProvider,
  getProviderDisplayName,
  AIProvider,
  AIConfig,
} from './services/ai_service';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  provider: AIProvider;
  createdAt: Date;
}

interface WorkspaceProps {
  onOpenSettings: () => void;
}

export default function Workspace({ onOpenSettings }: WorkspaceProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [quickActionsAnchorEl, setQuickActionsAnchorEl] =
    useState<null | HTMLElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [customActionOpen, setCustomActionOpen] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const customInstructionRef = useRef<HTMLInputElement>(null);
  const sidebarToggleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTogglingRef = useRef(false);
  const inputMessageRef = useRef<HTMLInputElement>(null);
  const userContext = getUserContext();

  // Function to scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Debounced sidebar toggle to prevent ResizeObserver loop
  const toggleSidebar = useCallback(() => {
    if (isTogglingRef.current) {
      return; // Prevent rapid consecutive toggles
    }

    if (sidebarToggleTimeoutRef.current) {
      clearTimeout(sidebarToggleTimeoutRef.current);
    }

    isTogglingRef.current = true;
    sidebarToggleTimeoutRef.current = setTimeout(() => {
      setSidebarCollapsed((prev) => !prev);
      // Reset the flag after the transition completes
      setTimeout(() => {
        isTogglingRef.current = false;
      }, 250); // Slightly longer than the transition duration
    }, 50); // Small delay to prevent rapid toggles
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (sidebarToggleTimeoutRef.current) {
        clearTimeout(sidebarToggleTimeoutRef.current);
      }
      isTogglingRef.current = false;
    };
  }, []);

  // Suppress ResizeObserver warnings in development
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (
        args[0] &&
        typeof args[0] === 'string' &&
        args[0].includes(
          'ResizeObserver loop completed with undelivered notifications',
        )
      ) {
        return; // Suppress this specific error
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  // Handle ResizeObserver errors globally
  useEffect(() => {
    const handleResizeObserverError = (event: ErrorEvent) => {
      if (
        event.message &&
        event.message.includes(
          'ResizeObserver loop completed with undelivered notifications',
        )
      ) {
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleResizeObserverError);
    return () => {
      window.removeEventListener('error', handleResizeObserverError);
    };
  }, []);

  // Get current provider from user context
  const currentProvider = userContext.settings.aiProvider || 'openai';

  // Track previous provider to detect changes
  const prevProviderRef = useRef(currentProvider);

  // Initialize or update selected model when provider changes
  useEffect(() => {
    const providerChanged = prevProviderRef.current !== currentProvider;
    
    if (!selectedModel || providerChanged) {
      setSelectedModel(getDefaultModelForProvider(currentProvider));
    }
    
    prevProviderRef.current = currentProvider;
  }, [currentProvider]);

  // Load chats from localStorage on component mount
  useEffect(() => {
    const savedChats = localStorage.getItem('geckit-chats');
    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        const loadedChats = parsedChats.map((chat: any) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          messages: chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        }));

        // Ensure at least one chat exists
        if (loadedChats.length === 0) {
          const newChat: Chat = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            model: selectedModel || getDefaultModelForProvider(currentProvider),
            provider: currentProvider,
            createdAt: new Date(),
          };
          setChats([newChat]);
          setCurrentChatId(newChat.id);
        } else {
          setChats(loadedChats);
        }
      } catch (err) {
        // Error loading chats from localStorage - create a default chat
        const newChat: Chat = {
          id: Date.now().toString(),
          title: 'New Chat',
          messages: [],
          model: selectedModel || getDefaultModelForProvider(currentProvider),
          provider: currentProvider,
          createdAt: new Date(),
        };
        setChats([newChat]);
        setCurrentChatId(newChat.id);
      }
    } else {
      // No saved chats - create a default chat
      const newChat: Chat = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        model: selectedModel || getDefaultModelForProvider(currentProvider),
        provider: currentProvider,
        createdAt: new Date(),
      };
      setChats([newChat]);
      setCurrentChatId(newChat.id);
    }
  }, [selectedModel, currentProvider]);

  // Save chats to localStorage whenever chats change
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('geckit-chats', JSON.stringify(chats));
    }
  }, [chats]);

  // Load and save sidebar collapse state
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('geckit-sidebar-collapsed');
    if (savedCollapsed) {
      setSidebarCollapsed(JSON.parse(savedCollapsed));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'geckit-sidebar-collapsed',
      JSON.stringify(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

  // Handle shortcut from main process
  useEffect(() => {
    window.electron.ipcRenderer.on('shortcut-pressed', (args: any) => {
      setInputMessage(args.text);
    });
  }, []);

  const getCurrentChat = () => {
    return chats.find((chat) => chat.id === currentChatId);
  };

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      model: selectedModel || getDefaultModelForProvider(currentProvider),
      provider: currentProvider,
      createdAt: new Date(),
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
  };

  const deleteChat = (chatId: string) => {
    setChats((prev) => {
      const filteredChats = prev.filter((chat) => chat.id !== chatId);

      // If this was the last chat, create a new empty one
      if (filteredChats.length === 0) {
        const newChat: Chat = {
          id: Date.now().toString(),
          title: 'New Chat',
          messages: [],
          model: selectedModel || getDefaultModelForProvider(currentProvider),
          provider: currentProvider,
          createdAt: new Date(),
        };
        setCurrentChatId(newChat.id);
        return [newChat];
      }

      return filteredChats;
    });

    if (currentChatId === chatId) {
      // If we deleted the current chat and there are other chats, select the first one
      setChats((prev) => {
        if (prev.length > 0) {
          setCurrentChatId(prev[0].id);
        }
        return prev;
      });
    }
  };

  const deleteCurrentChat = () => {
    if (currentChatId) {
      deleteChat(currentChatId);
    }
  };

  const clearCurrentChat = () => {
    if (currentChatId) {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChatId ? { ...chat, messages: [] } : chat,
        ),
      );
    }
  };

  const eraseAllChatHistory = () => {
    // Clear localStorage
    localStorage.removeItem('geckit-chats');

    // Create a new empty chat
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      model: selectedModel || getDefaultModelForProvider(currentProvider),
      provider: currentProvider,
      createdAt: new Date(),
    };

    // Replace all chats with just the new empty one
    setChats([newChat]);
    setCurrentChatId(newChat.id);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    let chatId = currentChatId;
    if (!chatId) {
      createNewChat();
      chatId = Date.now().toString();
      setCurrentChatId(chatId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    // Add user message immediately
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, userMessage],
              title:
                chat.messages.length === 0
                  ? `${inputMessage.slice(0, 30)}...`
                  : chat.title,
            }
          : chat,
      ),
    );

    setInputMessage('');
    setLoading(true);

    try {
      const aiConfig: AIConfig = {
        provider: currentProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
      };

      const currentChat = chats.find((c) => c.id === chatId);
      const messages = currentChat
        ? [...currentChat.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        selectedModel || getDefaultModelForProvider(currentProvider),
        messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText || 'No response',
        timestamp: new Date(),
      };

      // Add assistant message
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, assistantMessage] }
            : chat,
        ),
      );

      // Automatically copy AI response to clipboard
      await copyToClipboard(assistantMessage.content, assistantMessage.id);
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${getProviderDisplayName(currentProvider)} API Error: ${err}`,
        timestamp: new Date(),
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, errorMessage] }
            : chat,
        ),
      );
    }

    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Enter key no longer sends messages - only Cmd+Enter does
    // This allows for multi-line input without accidentally sending
  };

  const handleQuickActionsClick = (event: React.MouseEvent<HTMLElement>) => {
    setQuickActionsAnchorEl(event.currentTarget);
  };

  const handleQuickActionsClose = () => {
    setQuickActionsAnchorEl(null);
  };

  const copyToClipboard = async (text: string, messageId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (messageId) {
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      }
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (success && messageId) {
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      }
    }
  };

  const handleQuickAction = async (action: string) => {
    if (!inputMessage.trim() || loading) return;

    // Handle custom action differently - open popup
    if (action === 'custom') {
      handleQuickActionsClose();
      setCustomActionOpen(true);
      return;
    }

    let prompt = '';
    switch (action) {
      case 'grammar':
        prompt =
          '\n\n[Please correct any grammar and spelling mistakes in the text above. Provide only corrected message in the reply without quotas.]';
        break;
      case 'improve':
        prompt =
          '\n\n[Please improve this text to make it sound more professional and native. Provide only corrected message in the reply without quotas.]';
        break;
      case 'translate':
        prompt = `\n\n[Please translate this text from ${
          userContext.settings.nativateLanguage || 'English'
        } to ${
          userContext.settings.secondLanguage || 'Spanish'
        } or vice versa. Provide only translated message in the reply without quotas.]`;
        break;
      case 'explain':
        prompt =
          '\n\n[Please explain what this text means and provide context. Provide only explained message in the reply without quotas.]';
        break;
    }

    const messageWithPrompt = `${inputMessage}${prompt}`;
    handleQuickActionsClose();

    // Send the message immediately
    let chatId = currentChatId;
    if (!chatId) {
      createNewChat();
      chatId = Date.now().toString();
      setCurrentChatId(chatId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageWithPrompt,
      timestamp: new Date(),
    };

    // Add user message immediately
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, userMessage],
              title:
                chat.messages.length === 0
                  ? `${inputMessage.slice(0, 30)}...`
                  : chat.title,
            }
          : chat,
      ),
    );

    setInputMessage('');
    setLoading(true);

    try {
      const aiConfig: AIConfig = {
        provider: currentProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
      };

      const currentChat = chats.find((c) => c.id === chatId);
      const messages = currentChat
        ? [...currentChat.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        selectedModel || getDefaultModelForProvider(currentProvider),
        messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText || 'No response',
        timestamp: new Date(),
      };

      // Add assistant message
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, assistantMessage] }
            : chat,
        ),
      );

      // Automatically copy AI response to clipboard
      await copyToClipboard(assistantMessage.content, assistantMessage.id);
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${getProviderDisplayName(currentProvider)} API Error: ${err}`,
        timestamp: new Date(),
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, errorMessage] }
            : chat,
        ),
      );
    }

    setLoading(false);
  };

  const handleCustomAction = async () => {
    if (!inputMessage.trim() || !customInstruction.trim() || loading) return;

    const messageWithPrompt = `${inputMessage}\n\n[${customInstruction}]`;
    setCustomActionOpen(false);
    setCustomInstruction('');

    // Send the message immediately
    let chatId = currentChatId;
    if (!chatId) {
      createNewChat();
      chatId = Date.now().toString();
      setCurrentChatId(chatId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageWithPrompt,
      timestamp: new Date(),
    };

    // Add user message immediately
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, userMessage],
              title:
                chat.messages.length === 0
                  ? `${inputMessage.slice(0, 30)}...`
                  : chat.title,
            }
          : chat,
      ),
    );

    setInputMessage('');
    setLoading(true);

    try {
      const aiConfig: AIConfig = {
        provider: currentProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
      };

      const currentChat = chats.find((c) => c.id === chatId);
      const messages = currentChat
        ? [...currentChat.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        selectedModel || getDefaultModelForProvider(currentProvider),
        messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText || 'No response',
        timestamp: new Date(),
      };

      // Add assistant message
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, assistantMessage] }
            : chat,
        ),
      );

      // Automatically copy AI response to clipboard
      await copyToClipboard(assistantMessage.content, assistantMessage.id);
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${getProviderDisplayName(currentProvider)} API Error: ${err}`,
        timestamp: new Date(),
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, errorMessage] }
            : chat,
        ),
      );
    }

    setLoading(false);
  };

  // Auto-focus the input field when component mounts
  useEffect(() => {
    if (inputMessageRef.current) {
      inputMessageRef.current.focus();
    }
  }, []);

  // Global keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInInputField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // Quick Actions with Cmd/Ctrl + numbers (works from anywhere if there's text)
      if ((e.metaKey || e.ctrlKey) && inputMessage.trim() && !loading) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            handleQuickAction('grammar');
            return;
          case '2':
            e.preventDefault();
            handleQuickAction('improve');
            return;
          case '3':
            e.preventDefault();
            handleQuickAction('translate');
            return;
          case '4':
            e.preventDefault();
            handleQuickAction('explain');
            return;
          case '0':
            e.preventDefault();
            handleQuickAction('custom');
            return;
        }
      }

      // Send message with Cmd/Ctrl + Enter (works from anywhere)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
        return;
      }

      // Clear current chat with Cmd/Ctrl + L (works from anywhere)
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        clearCurrentChat();
        return;
      }

      // Prevent other shortcuts when typing in input fields
      if (isInInputField) {
        return;
      }

      // Toggle sidebar with Cmd/Ctrl + B
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }

      // Create new chat with Cmd/Ctrl + N
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createNewChat();
      }

      // Delete current chat with Cmd/Ctrl + Backspace
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        deleteCurrentChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputMessage, loading, currentChatId, toggleSidebar]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [chats, currentChatId]);

  const currentChat = getCurrentChat();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left sidebar - Chat history */}
      <Paper
        sx={{
          width: sidebarCollapsed ? 60 : 280,
          minWidth: sidebarCollapsed ? 60 : 280,
          maxWidth: sidebarCollapsed ? 60 : 280,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
        elevation={3}
      >
        {/* Toggle button at top of sidebar */}
        <Box
          sx={{
            p: 1,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Tooltip title={`Toggle sidebar (${CmdOrCtrl}+B)`}>
            <IconButton
              size="small"
              onClick={toggleSidebar}
              sx={{
                p: 0.5,
                bgcolor: 'background.paper',
                borderRadius: '4px',
                boxShadow: 1,
                '&:hover': { boxShadow: 2 },
              }}
            >
              {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
          {!sidebarCollapsed && (
            <>
              <Typography
                variant="h6"
                sx={{ fontWeight: 'bold', color: 'black' }}
              >
                GeckIt
              </Typography>
            </>
          )}
        </Box>

        {/* Sidebar content when collapsed */}
        {sidebarCollapsed && (
          <Box
            sx={{
              p: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Tooltip title={`New Chat (${CmdOrCtrl}+N)`}>
              <IconButton
                onClick={createNewChat}
                size="small"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton onClick={onOpenSettings} size="small">
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Model Selector">
              <IconButton
                onClick={() => setShowModelSelector(!showModelSelector)}
                size="small"
              >
                <TuneIcon />
              </IconButton>
            </Tooltip>
            {/* Mini chat list */}
            <Box
              sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
            >
              {chats.slice(0, 8).map((chat) => (
                <IconButton
                  key={chat.id}
                  size="small"
                  onClick={() => setCurrentChatId(chat.id)}
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor:
                      chat.id === currentChatId
                        ? 'primary.light'
                        : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <MenuIcon fontSize="small" />
                </IconButton>
              ))}
            </Box>
          </Box>
        )}
        {!sidebarCollapsed && (
          <>
            {/* Sidebar content when expanded */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Tooltip title={`New Chat (${CmdOrCtrl}+N)`}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={createNewChat}
                  sx={{ mb: 2, whiteSpace: 'nowrap' }}
                >
                  New Chat
                </Button>
              </Tooltip>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <Tooltip title="Settings">
                  <IconButton onClick={onOpenSettings} size="small">
                    <SettingsIcon />
                  </IconButton>
                </Tooltip>
                <Typography variant="caption" color="text.secondary">
                  Settings
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title="Model Selector">
                  <IconButton
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    size="small"
                  >
                    <TuneIcon />
                  </IconButton>
                </Tooltip>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Chip
                    label={getProviderDisplayName(currentProvider)}
                    size="small"
                    color="primary"
                    variant="filled"
                  />
                  <Chip
                    label={selectedModel || 'No model'}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Box>
              <Collapse in={showModelSelector}>
                <Box sx={{ mt: 2 }}>
                  <ModelSelector
                    label="Select Model"
                    value={selectedModel}
                    onChange={setSelectedModel}
                    provider={currentProvider}
                  />
                </Box>
              </Collapse>
            </Box>

            <List sx={{ flex: 1, overflow: 'auto' }}>
              {chats.map((chat) => (
                <ListItem
                  key={chat.id}
                  button
                  selected={chat.id === currentChatId}
                  onClick={() => setCurrentChatId(chat.id)}
                  sx={{
                    borderLeft: chat.id === currentChatId ? 3 : 0,
                    borderColor: 'primary.main',
                  }}
                >
                  <ListItemText
                    primary={chat.title}
                    secondary={`${chat.messages.length} messages`}
                    primaryTypographyProps={{
                      fontSize: '0.9rem',
                      noWrap: true,
                    }}
                    secondaryTypographyProps={{
                      fontSize: '0.75rem',
                    }}
                  />
                  <Tooltip title={`Delete chat (${CmdOrCtrl}+Backspace)`}>
                    <IconButton
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.id);
                      }}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Paper>

      {/* Center - Chat interface */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Chat header */}
        <Paper
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          elevation={1}
        >
          <Box>
            <Typography variant="h6">
              {currentChat?.title || 'Select or create a chat'}
            </Typography>
            {currentChat && (
              <Typography variant="caption" color="text.secondary">
                {getProviderDisplayName(currentProvider)} • {selectedModel || currentChat.model}
              </Typography>
            )}
          </Box>
          <Tooltip title="Erase all chat history">
            <span>
              <IconButton
                size="small"
                onClick={eraseAllChatHistory}
                disabled={
                  chats.length <= 1 &&
                  (!currentChat || currentChat.messages.length === 0)
                }
                sx={{
                  p: 0.5,
                  bgcolor: 'background.paper',
                  borderRadius: '4px',
                  boxShadow: 1,
                  '&:hover': { boxShadow: 2, bgcolor: 'error.light' },
                  '&:disabled': { opacity: 0.5 },
                }}
              >
                <DeleteSweepIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Paper>

        {/* Messages area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {currentChat?.messages.map((message) => (
            <Card
              key={message.id}
              sx={{
                mb: 2,
                ml: message.role === 'user' ? 4 : 0,
                mr: message.role === 'assistant' ? 4 : 0,
                bgcolor: message.role === 'user' ? 'primary.light' : 'grey.100',
                position: 'relative',
              }}
            >
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    mb: 1,
                  }}
                >
                  <Typography variant="caption" fontWeight="bold">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {message.timestamp.toLocaleTimeString()}
                    </Typography>
                    {copiedMessageId === message.id ? (
                      <Typography
                        variant="caption"
                        color="success.main"
                        sx={{ fontWeight: 'bold' }}
                      >
                        Copied!
                      </Typography>
                    ) : (
                      <IconButton
                        size="small"
                        onClick={() =>
                          copyToClipboard(message.content, message.id)
                        }
                        sx={{
                          p: 0.5,
                          opacity: 0.7,
                          '&:hover': { opacity: 1 },
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {message.content}
                </Typography>
              </CardContent>
            </Card>
          ))}
          {loading && (
            <Card sx={{ mb: 2, mr: 4, bgcolor: 'grey.100' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" fontWeight="bold">
                  Assistant
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Thinking...
                </Typography>
              </CardContent>
            </Card>
          )}
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input area */}
        <Paper
          sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}
          elevation={1}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Type your message... (${CmdOrCtrl}+C, ${CmdOrCtrl}+D to paste selected text)`}
              disabled={loading}
              variant="outlined"
              size="small"
              inputRef={inputMessageRef}
            />
            <Button
              variant="outlined"
              onClick={handleQuickActionsClick}
              disabled={loading || !inputMessage.trim()}
              endIcon={<ArrowDropDownIcon />}
              sx={{ minWidth: 'auto', px: 1.5, mr: 1 }}
            >
              <AutoAwesomeIcon />
            </Button>
            <Button
              variant="contained"
              onClick={sendMessage}
              disabled={loading || !inputMessage.trim()}
              sx={{ minWidth: 'auto', px: 2 }}
            >
              <SendIcon />
            </Button>
          </Box>

          <Menu
            anchorEl={quickActionsAnchorEl}
            open={Boolean(quickActionsAnchorEl)}
            onClose={handleQuickActionsClose}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={() => handleQuickAction('grammar')}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>Correct Grammar</span>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {CmdOrCtrl}+1
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem onClick={() => handleQuickAction('improve')}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>Improve Text</span>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {CmdOrCtrl}+2
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem onClick={() => handleQuickAction('translate')}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>Translate</span>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {CmdOrCtrl}+3
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem onClick={() => handleQuickAction('explain')}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>Explain</span>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {CmdOrCtrl}+4
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem onClick={() => handleQuickAction('custom')}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>Custom</span>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 2 }}
                >
                  {CmdOrCtrl}+0
                </Typography>
              </Box>
            </MenuItem>
          </Menu>

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
                // Focus the text field after the transition completes
                if (customInstructionRef.current) {
                  customInstructionRef.current.focus();
                }
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
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Provide custom instructions for what you want to do with the
                  text:
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
                <Box
                  sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}
                >
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
        </Paper>
      </Box>
    </Box>
  );
}
