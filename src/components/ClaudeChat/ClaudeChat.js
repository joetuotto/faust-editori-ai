/**
 * ClaudeChat - Reaaliaikainen chat-komponentti FAUSTille
 * Tukee streaming-vastauksia ja extended thinking -tilaa
 */
(function (window) {
  'use strict';

  // This file loads as a plain script in <head>, before the bundle that assigns
  // window.FaustIcons: the icon set is read when an icon is drawn, never here at load.
  function icon(name, size) {
    const set = window.FaustIcons;
    return set && set[name] ? set[name]({ size }) : null;
  }

  // Key hints are built for the platform here: this file cannot import shortcut().
  const SHIFT = /Mac/i.test(navigator.platform) ? '⇧' : 'Shift+';
  const HINT = `Enter lähettää · ${SHIFT}Enter vaihtaa riviä · Esc sulkee`;

  // Helper: Build context from project and chapter
  function buildContext(project, activeChapter) {
    if (!project) return '';

    const parts = [];

    // Project metadata
    parts.push(`PROJEKTI: ${project.title || 'Nimetön'}`);
    if (project.genre) parts.push(`Genre: ${project.genre}`);
    if (project.targets) {
      parts.push(
        `Edistyminen: ${project.targets.currentTotal || 0}/${project.targets.totalWords || 80000} sanaa`
      );
    }

    // Characters summary
    if (project.characters && project.characters.length > 0) {
      const charNames = project.characters
        .slice(0, 5)
        .map((c) => c.basicInfo?.name || c.name || 'Tuntematon')
        .join(', ');
      parts.push(`Hahmot: ${charNames}`);
    }

    // Active chapter info
    if (activeChapter) {
      parts.push(`\nAKTIIVINEN LUKU: ${activeChapter.title || 'Nimetön luku'}`);
      if (activeChapter.synopsis) {
        parts.push(`Synopsis: ${activeChapter.synopsis}`);
      }
      if (activeChapter.content) {
        // Include last 500 chars of content for context
        const contentPreview = activeChapter.content.slice(-500);
        parts.push(`\nViimeisin sisältö:\n...${contentPreview}`);
      }
    }

    return parts.join('\n');
  }

  // System prompt for writing assistance
  const SYSTEM_PROMPT = `Olet FAUST-kirjoitusassistentti. Autat käyttäjää romaanin kirjoittamisessa suomeksi.

Tehtäväsi on:
- Auttaa tarinan kehittämisessä ja ideoinnissa
- Ehdottaa dialogia ja kuvauksia
- Analysoida tarinan rakennetta ja jatkuvuutta
- Kirjoittaa uutta sisältöä käyttäjän ohjeiden mukaan

Ole luova mutta noudata käyttäjän tyyliä. Vastaa aina suomeksi ellei toisin pyydetä.`;

  function ClaudeChat({ project, activeChapter, onInsertText, isOpen, onClose }) {
    const [messages, setMessages] = React.useState([]);
    const [input, setInput] = React.useState('');
    const [isStreaming, setIsStreaming] = React.useState(false);
    const [isThinking, setIsThinking] = React.useState(false);
    const [thinkingContent, setThinkingContent] = React.useState('');
    const [useExtendedThinking, setUseExtendedThinking] = React.useState(false);
    const [error, setError] = React.useState(null);
    const messagesEndRef = React.useRef(null);
    const streamingTextRef = React.useRef('');
    const inputRef = React.useRef(null);

    // Auto-scroll to bottom
    React.useEffect(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, [messages, thinkingContent]);

    // Focus input when opened
    React.useEffect(() => {
      if (isOpen && inputRef.current) {
        inputRef.current.focus();
      }
    }, [isOpen]);

    // Send message
    const sendMessage = async () => {
      if (!input.trim() || isStreaming) return;

      const userMessage = { role: 'user', content: input };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setError(null);
      setIsStreaming(true);
      streamingTextRef.current = '';

      try {
        const context = buildContext(project, activeChapter);
        const fullPrompt = context
          ? `${context}\n\n---\n\nKäyttäjä: ${input}`
          : input;

        if (useExtendedThinking) {
          // Extended thinking mode
          setIsThinking(true);
          setThinkingContent('');

          const result = await window.electronAPI.claudeAPIThinking({
            prompt: fullPrompt,
            budgetTokens: 10000,
            maxTokens: 16000,
            stream: true,
            onChunk: (chunk) => {
              if (chunk.type === 'thinking') {
                setThinkingContent((prev) => prev + chunk.text);
              } else if (chunk.type === 'text') {
                streamingTextRef.current += chunk.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  if (lastMsg?.role === 'assistant') {
                    lastMsg.content = streamingTextRef.current;
                    return [...updated];
                  } else {
                    return [...updated, { role: 'assistant', content: streamingTextRef.current }];
                  }
                });
              }
            },
          });

          setIsThinking(false);

          if (!result.success) {
            throw new Error(result.error);
          }
        } else {
          // Normal streaming mode
          const result = await window.electronAPI.claudeAPIStream({
            prompt: fullPrompt,
            system: SYSTEM_PROMPT,
            maxTokens: 4096,
            onChunk: (chunk) => {
              if (chunk.type === 'text') {
                streamingTextRef.current += chunk.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastMsg = updated[updated.length - 1];
                  if (lastMsg?.role === 'assistant') {
                    lastMsg.content = streamingTextRef.current;
                    return [...updated];
                  } else {
                    return [...updated, { role: 'assistant', content: streamingTextRef.current }];
                  }
                });
              }
            },
          });

          if (!result.success) {
            throw new Error(result.error);
          }
        }
      } catch (err) {
        console.error('Claude chat error:', err);
        // One sentence: the reason loses its own full stop before the template adds one
        const reason = String((err && err.message) || 'tuntematon virhe').trim().replace(/\.+$/, '');
        const failure = `Viestin lähetys epäonnistui: ${reason}.`;
        setError(failure);
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: failure },
        ]);
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
      }
    };

    // Handle keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      if (e.key === 'Escape') {
        // Esc closes this box only, not the layers under it
        e.stopPropagation();
        onClose && onClose();
      }
    };

    // Insert text into editor
    const handleInsertText = (text) => {
      if (onInsertText) {
        onInsertText(text);
      }
    };

    // Clear chat
    const clearChat = () => {
      setMessages([]);
      setThinkingContent('');
      setError(null);
    };

    if (!isOpen) return null;

    return React.createElement(
      'div',
      { className: 'claude-chat-container' },
      // Header
      React.createElement(
        'div',
        { className: 'claude-chat-header' },
        React.createElement(
          'div',
          { className: 'claude-chat-title' },
          React.createElement('span', { className: 'claude-icon' }, icon('star8', 14)),
          'Liminal Engine – keskustelu'
        ),
        React.createElement(
          'div',
          { className: 'claude-chat-controls' },
          React.createElement(
            'label',
            {
              className: 'thinking-toggle',
              title: 'Tekoäly pohtii vastausta tavallista pidempään. Hitaampi ja kalliimpi; sopii juonen ja rakenteen arviointiin.',
            },
            React.createElement('input', {
              type: 'checkbox',
              checked: useExtendedThinking,
              onChange: (e) => setUseExtendedThinking(e.target.checked),
              disabled: isStreaming,
            }),
            React.createElement('span', null, 'Perusteellinen vastaus')
          ),
          React.createElement(
            'button',
            {
              className: 'clear-btn faust-btn faust-btn--quiet faust-btn--sm',
              onClick: clearChat,
              disabled: isStreaming,
              title: 'Tyhjennä keskustelu',
            },
            'Tyhjennä'
          ),
          React.createElement(
            'button',
            {
              className: 'close-btn faust-btn faust-btn--icon faust-btn--sm',
              onClick: onClose,
              'aria-label': 'Sulje',
              title: 'Sulje (Esc)',
            },
            icon('close', 14)
          )
        )
      ),

      // Messages area
      React.createElement(
        'div',
        { className: 'claude-chat-messages' },
        messages.length === 0 &&
          !isStreaming &&
          React.createElement(
            'div',
            { className: 'faust-empty' },
            React.createElement('span', { className: 'faust-empty__icon' }, icon('star8', 40)),
            React.createElement(
              'div',
              { className: 'faust-empty__title' },
              'Kysy juonesta tai hahmoista, tai pyydä luonnos kohtauksesta.'
            )
          ),
        messages.map((msg, i) =>
          React.createElement(
            'div',
            {
              key: i,
              className: `chat-message ${msg.role}`,
            },
            msg.role === 'user' &&
              React.createElement('div', { className: 'message-role' }, 'Sinä'),
            msg.role === 'assistant' &&
              React.createElement('div', { className: 'message-role' }, 'Tekoäly'),
            msg.role === 'error' &&
              React.createElement('div', { className: 'message-role error' }, 'Virhe'),
            React.createElement(
              'div',
              { className: 'message-content' },
              msg.content
            ),
            msg.role === 'assistant' &&
              React.createElement(
                'button',
                {
                  className: 'insert-btn faust-btn faust-btn--sm',
                  onClick: () => handleInsertText(msg.content),
                  title: 'Lisää vastaus avoimen luvun loppuun',
                },
                icon('insert', 12),
                'Lisää luvun loppuun'
              )
          )
        ),

        // Thinking indicator
        isThinking &&
          thinkingContent &&
          React.createElement(
            'div',
            { className: 'chat-message thinking' },
            React.createElement('div', { className: 'message-role' }, 'Tekoäly pohtii…'),
            React.createElement(
              'div',
              { className: 'thinking-content' },
              thinkingContent
            )
          ),

        // Streaming indicator
        isStreaming &&
          !isThinking &&
          streamingTextRef.current === '' &&
          React.createElement(
            'div',
            { className: 'streaming-indicator' },
            React.createElement('span', { className: 'dot' }),
            React.createElement('span', { className: 'dot' }),
            React.createElement('span', { className: 'dot' })
          ),

        React.createElement('div', { ref: messagesEndRef })
      ),

      // Error display
      error &&
        React.createElement(
          'div',
          { className: 'claude-chat-error' },
          error
        ),

      // Input area
      React.createElement(
        'div',
        { className: 'claude-chat-input' },
        React.createElement('textarea', {
          ref: inputRef,
          value: input,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: handleKeyDown,
          placeholder: 'Kirjoita viesti…',
          disabled: isStreaming,
          rows: 3,
        }),
        React.createElement(
          'button',
          {
            className: 'send-btn faust-btn faust-btn--primary',
            onClick: sendMessage,
            disabled: isStreaming || !input.trim(),
            'aria-busy': isStreaming,
            title: 'Lähetä (Enter)',
          },
          isStreaming && React.createElement('span', { className: 'faust-spinner faust-spinner--sm' }),
          isStreaming ? 'Lähetetään…' : 'Lähetä'
        )
      ),

      // Key hint under the field
      React.createElement(
        'div',
        { className: 'faust-meta', style: { padding: '0 var(--sp-3) var(--sp-2)' } },
        HINT
      )
    );
  }

  // Export to window
  window.ClaudeChat = ClaudeChat;
})(window);
