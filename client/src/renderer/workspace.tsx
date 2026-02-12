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
  Mic as MicIcon,
  Stop as StopIcon,
  AudioFile as AudioFileIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { CmdOrCtrl } from './services/os_helper';
import { getUserContext } from './services/user_context';
import { ModelProviderSelector } from './model_selector';
import {
  sendChatMessage,
  transcribeAudio,
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
  source?: 'transcription';
  sourceLabel?: string; // e.g., "Mic recording" or the audio file name
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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingCancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const chatsRef = useRef(chats);
  const currentChatIdRef = useRef(currentChatId);
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

  // Keep refs in sync for use in async callbacks (avoids stale closures)
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

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

  // Global provider from settings - used only for newly created chats
  const currentProvider = userContext.settings.aiProvider || 'openai';

  // Sync selectedModel from the current chat when switching chats
  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (chat) {
      setSelectedModel(chat.model);
    }
  }, [currentChatId, chats]);

  // Get the current chat's provider (falls back to global for safety)
  const chatProvider: AIProvider =
    chats.find((c) => c.id === currentChatId)?.provider || currentProvider;

  // Update current chat's model and provider
  const updateChatModel = (model: string, provider: AIProvider) => {
    setSelectedModel(model);
    if (currentChatId) {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChatId ? { ...chat, model, provider } : chat,
        ),
      );
    }
  };

  // Load chats from localStorage on component mount
  useEffect(() => {
    const provider = userContext.settings.aiProvider || 'openai';
    const defaultModel = getDefaultModelForProvider(provider);

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
            model: defaultModel,
            provider,
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
          model: defaultModel,
          provider,
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
        model: defaultModel,
        provider,
        createdAt: new Date(),
      };
      setChats([newChat]);
      setCurrentChatId(newChat.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const ACCEPTED_AUDIO_EXTENSIONS = [
    '.mp3',
    '.mp4',
    '.mpeg',
    '.mpga',
    '.m4a',
    '.wav',
    '.webm',
    '.ogg',
  ];

  const isAudioFile = (file: File) => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return (
      file.type.startsWith('audio/') || ACCEPTED_AUDIO_EXTENSIONS.includes(ext)
    );
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const sendTranscribedMessage = async (text: string, sourceLabel: string) => {
    // Use refs to get current values (avoids stale closures from async callbacks)
    let chatId = currentChatIdRef.current;
    if (!chatId) {
      const newId = Date.now().toString();
      const newChat: Chat = {
        id: newId,
        title: 'New Chat',
        messages: [],
        model: selectedModel || getDefaultModelForProvider(currentProvider),
        provider: currentProvider,
        createdAt: new Date(),
      };
      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(newId);
      chatId = newId;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      source: 'transcription',
      sourceLabel,
    };

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, userMessage],
              title:
                chat.messages.length === 0
                  ? `${text.slice(0, 30)}...`
                  : chat.title,
            }
          : chat,
      ),
    );

    setLoading(true);

    try {
      // Use chatsRef for current state in async context
      const currentChatData = chatsRef.current.find((c) => c.id === chatId);
      const usedProvider = currentChatData?.provider || currentProvider;
      const usedModel =
        currentChatData?.model ||
        selectedModel ||
        getDefaultModelForProvider(usedProvider);

      const aiConfig: AIConfig = {
        provider: usedProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
        openRouterKey: userContext.settings.openRouterKey,
      };

      const messages = currentChatData
        ? [...currentChatData.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        usedModel,
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

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, assistantMessage] }
            : chat,
        ),
      );

      await copyToClipboard(assistantMessage.content, assistantMessage.id);
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${getProviderDisplayName(chatProvider)} API Error: ${err}`,
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

  const addErrorMessage = (content: string) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    const msg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, msg] }
          : chat,
      ),
    );
  };

  const handleTranscribeAndSend = async (
    audioBlob: Blob,
    fileName: string,
    sourceLabel: string,
  ) => {
    setIsTranscribing(true);

    try {
      const aiConfig: AIConfig = {
        provider: chatProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
        openRouterKey: userContext.settings.openRouterKey,
      };

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          // Strip the data URL prefix to get raw base64
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const text = await transcribeAudio(aiConfig, base64, fileName);

      if (text.trim()) {
        await sendTranscribedMessage(text, sourceLabel);
      } else {
        addErrorMessage('No speech detected in the audio. Please try again.');
      }
    } catch (err) {
      addErrorMessage(`Transcription Error: ${err}`);
    }

    setIsTranscribing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    if (loading || isTranscribing || isRecording) return;

    const { files } = e.dataTransfer;
    if (files.length === 0) return;

    const file = files[0];
    if (isAudioFile(file)) {
      handleTranscribeAndSend(file, file.name, file.name);
    }
  };

  const stopVolumeMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const startVolumeMonitoring = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      // Normalize to 0-1 range (max byte value is 255)
      setAudioLevel(Math.min(rms / 128, 1));
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  const cancelRecording = () => {
    recordingCancelledRef.current = true;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    stopVolumeMonitoring();
    setIsRecording(false);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording and send
      recordingCancelledRef.current = false;
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      stopVolumeMonitoring();
      setIsRecording(false);
      return;
    }

    // Start recording
    try {
      recordingCancelledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      startVolumeMonitoring(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop());
        if (recordingCancelledRef.current) {
          recordingCancelledRef.current = false;
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        handleTranscribeAndSend(audioBlob, 'recording.webm', 'Mic recording');
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      // Show mic permission error
      let chatId = currentChatId;
      if (!chatId) {
        createNewChat();
        chatId = Date.now().toString();
        setCurrentChatId(chatId);
      }

      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Microphone Error: Could not access microphone. Please grant microphone permission. (${err})`,
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
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    handleTranscribeAndSend(file, file.name, file.name);

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
        provider: chatProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
        openRouterKey: userContext.settings.openRouterKey,
      };

      const currentChat = chats.find((c) => c.id === chatId);
      const messages = currentChat
        ? [...currentChat.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        selectedModel || getDefaultModelForProvider(chatProvider),
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
        content: `${getProviderDisplayName(chatProvider)} API Error: ${err}`,
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
        provider: chatProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
        openRouterKey: userContext.settings.openRouterKey,
      };

      const currentChat = chats.find((c) => c.id === chatId);
      const messages = currentChat
        ? [...currentChat.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        selectedModel || getDefaultModelForProvider(chatProvider),
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
        content: `${getProviderDisplayName(chatProvider)} API Error: ${err}`,
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
        provider: chatProvider,
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
        openRouterKey: userContext.settings.openRouterKey,
      };

      const currentChat = chats.find((c) => c.id === chatId);
      const messages = currentChat
        ? [...currentChat.messages, userMessage]
        : [userMessage];

      const responseText = await sendChatMessage(
        aiConfig,
        selectedModel || getDefaultModelForProvider(chatProvider),
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
        content: `${getProviderDisplayName(chatProvider)} API Error: ${err}`,
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
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
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
            <Typography
              variant="h6"
              sx={{ fontWeight: 'bold', color: 'black' }}
            >
              GeckIt
            </Typography>
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
                <Box
                  sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
                >
                  <Chip
                    label={getProviderDisplayName(chatProvider)}
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
                  <ModelProviderSelector
                    model={selectedModel}
                    provider={chatProvider}
                    onChange={updateChatModel}
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
                {getProviderDisplayName(currentChat.provider || chatProvider)} •{' '}
                {currentChat.model || selectedModel}
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
        <Box
          sx={{ flex: 1, overflow: 'auto', p: 2, position: 'relative' }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drop zone overlay */}
          {isDragOver && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                bgcolor: 'rgba(25, 118, 210, 0.08)',
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <AudioFileIcon
                  sx={{ fontSize: 48, color: 'primary.main', mb: 1 }}
                />
                <Typography variant="h6" color="primary.main">
                  Drop audio file to transcribe
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Supports mp3, mp4, wav, webm, ogg, m4a
                </Typography>
              </Box>
            </Box>
          )}
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
                {message.source === 'transcription' && (
                  <Chip
                    icon={<MicIcon sx={{ fontSize: 14 }} />}
                    label={message.sourceLabel || 'Transcribed'}
                    size="small"
                    variant="outlined"
                    color="secondary"
                    sx={{
                      mb: 0.5,
                      height: 22,
                      '& .MuiChip-label': { fontSize: '0.7rem' },
                    }}
                  />
                )}
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
            {isRecording ? (
              <>
                <Tooltip title="Cancel recording">
                  <IconButton
                    onClick={cancelRecording}
                    size="small"
                    sx={{ color: 'action.active' }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Stop and send">
                  <IconButton
                    onClick={toggleRecording}
                    size="small"
                    sx={{ color: 'error.main' }}
                  >
                    <StopIcon />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip title="Record audio (Whisper transcription)">
                <span>
                  <IconButton
                    onClick={toggleRecording}
                    disabled={loading || isTranscribing}
                    size="small"
                  >
                    <MicIcon />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {isRecording && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '2px',
                  height: 24,
                  px: 0.5,
                }}
              >
                {[0, 1, 2, 3, 4].map((i) => {
                  const barLevel = Math.max(
                    0.15,
                    audioLevel *
                      (0.5 + Math.sin(Date.now() / 150 + i * 1.2) * 0.5),
                  );
                  return (
                    <Box
                      key={i}
                      sx={{
                        width: 3,
                        borderRadius: 1,
                        bgcolor: 'error.main',
                        height: `${barLevel * 100}%`,
                        minHeight: 3,
                        transition: 'height 0.1s ease',
                      }}
                    />
                  );
                })}
              </Box>
            )}
            <Tooltip title="Upload audio file (Whisper transcription)">
              <span>
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || isTranscribing || isRecording}
                  size="small"
                >
                  <AudioFileIcon />
                </IconButton>
              </span>
            </Tooltip>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg"
              style={{ display: 'none' }}
            />
            <TextField
              fullWidth
              multiline
              maxRows={4}
              value={isTranscribing ? 'Transcribing audio...' : inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Type your message... (${CmdOrCtrl}+C, ${CmdOrCtrl}+D to paste selected text)`}
              disabled={loading || isTranscribing}
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
