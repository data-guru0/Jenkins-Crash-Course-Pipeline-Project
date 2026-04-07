const messagesWrap = document.getElementById('messages-wrap');
const userInput    = document.getElementById('user-input');
const sendBtn      = document.getElementById('send-btn');
const openaiInput  = document.getElementById('openai-key');
const tavilyInput  = document.getElementById('tavily-key');
const openaiStatus = document.getElementById('openai-status');
const tavilyStatus = document.getElementById('tavily-status');

let isLoading = false;

// ── Key status indicators ─────────────────────────────────────────────────────
function updateKeyStatus(input, statusEl) {
    const val = input.value.trim();
    statusEl.className = 'key-status';
    if (!val) {
        statusEl.querySelector('.label').textContent = 'Not set';
        return;
    }
    statusEl.classList.add('valid');
    statusEl.querySelector('.label').textContent = 'Configured';
}

openaiInput.addEventListener('input', () => updateKeyStatus(openaiInput, openaiStatus));
tavilyInput.addEventListener('input', () => updateKeyStatus(tavilyInput, tavilyStatus));

// ── Textarea auto-resize ──────────────────────────────────────────────────────
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// ── Send on Enter (Shift+Enter = newline) ─────────────────────────────────────
userInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

// ── Suggestion chips ──────────────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        userInput.value = chip.textContent.trim();
        userInput.dispatchEvent(new Event('input'));
        userInput.focus();
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function scrollToBottom() {
    messagesWrap.scrollTo({ top: messagesWrap.scrollHeight, behavior: 'smooth' });
}

function removeWelcome() {
    const welcome = document.getElementById('welcome-card');
    if (welcome) welcome.remove();
}

function setLoading(state) {
    isLoading = state;
    sendBtn.disabled = state;
    userInput.disabled = state;
}

// ── Safe response renderer ────────────────────────────────────────────────────
// Strategy: extract ALL links first → escape the rest → restore links → format text.
// This prevents HTML anchor tags returned by the LLM from being broken by escaping.
function renderResponse(text) {
    const saved = [];   // { href, label } objects, restored via %%L0%%, %%L1%%, …

    function saveLink(href, label) {
        // Clean up href — strip any stray quotes or angle brackets
        href = href.replace(/['"<>]/g, '').trim();
        // Clean up label — strip inner HTML tags to get plain text
        label = label.replace(/<[^>]+>/g, '').trim() || href;
        const idx = saved.length;
        saved.push({ href, label });
        return `%%L${idx}%%`;
    }

    // 1) Extract full <a href="...">...</a> HTML tags the LLM may return
    text = text.replace(/<a\s[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_, href, label) => saveLink(href, label));

    // 2) Extract markdown-style [label](url) links
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        (_, label, href) => saveLink(href, label));

    // 3) Now safe to escape remaining HTML
    text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 4) Extract raw bare URLs (strict — stops at quotes, brackets, whitespace)
    text = text.replace(/(https?:\/\/[^\s"'<>)\]]+)/g,
        (href) => saveLink(href, href));

    // 5) Apply text formatting (bold, italic, code, headings, bullets)
    text = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
        .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // 6) Restore all saved links as proper, safe anchor tags
    saved.forEach(({ href, label }, idx) => {
        const safeHref  = href.replace(/"/g, '&quot;');
        const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        text = text.split(`%%L${idx}%%`).join(
            `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="chat-link">${safeLabel}</a>`
        );
    });

    return text;
}

function appendMessage(role, content) {
    removeWelcome();

    const isUser  = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = isUser ? '🧑' : '✈️';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = isUser ? 'You' : 'Travel Agent';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (isUser) {
        bubble.textContent = content;
    } else {
        bubble.innerHTML = `<p>${renderResponse(content)}</p>`;
    }

    contentDiv.append(sender, bubble);
    wrapper.append(avatar, contentDiv);
    messagesWrap.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
}

function appendTyping() {
    removeWelcome();

    const wrapper = document.createElement('div');
    wrapper.className = 'message bot';
    wrapper.id = 'typing-msg';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '✈️';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = 'Travel Agent';

    const bubble = document.createElement('div');
    bubble.className = 'bubble typing-indicator';
    bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    contentDiv.append(sender, bubble);
    wrapper.append(avatar, contentDiv);
    messagesWrap.appendChild(wrapper);
    scrollToBottom();
}

function removeTyping() {
    const el = document.getElementById('typing-msg');
    if (el) el.remove();
}

function appendError(msg) {
    removeWelcome();
    const div = document.createElement('div');
    div.className = 'error-message';
    div.innerHTML = `<span>⚠️</span><span>${msg}</span>`;
    messagesWrap.appendChild(div);
    scrollToBottom();
}

// ── Main send function ────────────────────────────────────────────────────────
async function sendMessage() {
    if (isLoading) return;

    const message    = userInput.value.trim();
    const openaiKey  = openaiInput.value.trim();
    const tavilyKey  = tavilyInput.value.trim();

    if (!message) return;

    if (!openaiKey || !tavilyKey) {
        appendError('Please enter both API keys in the sidebar before chatting.');
        return;
    }

    appendMessage('user', message);
    userInput.value = '';
    userInput.style.height = 'auto';

    setLoading(true);
    appendTyping();

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                openai_key: openaiKey,
                tavily_key: tavilyKey
            })
        });

        const data = await res.json();
        removeTyping();

        if (!res.ok || data.error) {
            appendError(data.error || `Server error (${res.status})`);
        } else {
            appendMessage('bot', data.response);
        }
    } catch (err) {
        removeTyping();
        appendError('Network error — please check your connection and try again.');
    } finally {
        setLoading(false);
        userInput.focus();
    }
}
