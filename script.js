const quotes = [
    {
        text: 'I am rooted, but I flow.',
        author: 'Virginia Woolf',
    },
    {
        text: 'The art of being wise is knowing what to overlook.',
        author: 'William James',
    },
    {
        text: 'Pay attention. Be astonished. Tell about it.',
        author: 'Mary Oliver',
    },
    {
        text: 'Let everything happen to you: beauty and terror. Just keep going. No feeling is final.',
        author: 'Rainer Maria Rilke',
    },
    {
        text: 'The soul becomes dyed with the color of its thoughts.',
        author: 'Marcus Aurelius',
    },
    {
        text: 'I dwell in possibility.',
        author: 'Emily Dickinson',
    },
    {
        text: 'We are shaped and fashioned by what we love.',
        author: 'Johann Wolfgang von Goethe',
    },
    {
        text: 'Have patience with everything unresolved in your heart.',
        author: 'Rainer Maria Rilke',
    },
];

const greetingVariants = {
    night: [
        'The quiet hour is yours',
        'Night leaves room to think',
        'Move gently through the late hours',
        'The world is softer at this hour',
    ],
    morning: [
        'A fresh start looks good on you',
        'Take the morning slowly and clearly',
        'Make this morning deliberate',
        'There is still time to begin well',
    ],
    afternoon: [
        'Steady is enough for the middle of the day',
        'Keep the afternoon uncluttered',
        'Let the next task be the only task',
        'The day still has room for good work',
    ],
    evening: [
        'Ease into what matters tonight',
        'Let the evening narrow to what counts',
        'A calmer pace will do nicely',
        'The rest of the day can be simpler from here',
    ],
};

const defaultQuickLinks = [
    { label: 'Gmail', href: 'https://mail.google.com' },
    { label: 'Calendar', href: 'https://calendar.google.com' },
    { label: 'Drive', href: 'https://drive.google.com' },
    { label: 'GitHub', href: 'https://github.com' },
    { label: 'Notion', href: 'https://www.notion.so' },
    { label: 'YouTube', href: 'https://www.youtube.com' },
    { label: 'Maps', href: 'https://maps.google.com' },
];

const fallbackImages = [
    'assets/fallback-1.svg',
    'assets/fallback-2.svg',
    'assets/fallback-3.svg',
    'assets/fallback-4.svg',
    'assets/fallback-5.svg',
    'assets/fallback-6.svg',
];

const notesStorageKey = 'minimal-new-tab-notes';
const nicknameStorageKey = 'minimal-new-tab-nickname';
const linksStorageKey = 'minimal-new-tab-links';
const focusMinutesStorageKey = 'minimal-new-tab-focus-minutes';
const focusEndStorageKey = 'minimal-new-tab-focus-end';
const backgroundCacheStorageKey = 'minimal-new-tab-background-cache';
const backgroundCacheTtlMs = 8 * 60 * 60 * 1000;
const maxPinnedSites = 8;

const backgroundElement = document.querySelector('[data-background]');
const atmosphereElement = document.querySelector('[data-atmosphere]');
const clockElement = document.querySelector('[data-clock]');
const greetingElement = document.querySelector('[data-greeting]');
const quoteTextElement = document.querySelector('[data-quote-text]');
const quoteAuthorElement = document.querySelector('[data-quote-author]');
const notesElement = document.querySelector('[data-notes]');
const linksElement = document.querySelector('[data-links]');
const linkManagerElement = document.querySelector('[data-link-manager]');
const linkStatusElement = document.querySelector('[data-link-status]');
const nicknameInputElement = document.querySelector('[data-nickname-input]');
const linkLabelElement = document.querySelector('[data-link-label]');
const linkUrlElement = document.querySelector('[data-link-url]');
const nameFormElement = document.querySelector('[data-name-form]');
const linkFormElement = document.querySelector('[data-link-form]');
const menuElement = document.querySelector('[data-menu]');
const menuToggleElement = document.querySelector('[data-menu-toggle]');
const focusTimerElement = document.querySelector('[data-focus-timer]');
const timerFormElement = document.querySelector('[data-timer-form]');
const timerInputElement = document.querySelector('[data-timer-input]');
const timerDisplayElement = document.querySelector('[data-timer-display]');
const timerStartButtonElement = document.querySelector('[data-timer-start]');
const timerStopButtonElement = document.querySelector('[data-timer-stop]');
const timerDecreaseButtonElement = document.querySelector(
    '[data-timer-decrease]',
);
const timerIncreaseButtonElement = document.querySelector(
    '[data-timer-increase]',
);
const glassElements = [
    focusTimerElement,
    notesElement.closest('.notes-panel'),
    menuElement,
    menuToggleElement,
].filter(Boolean);

const state = {
    nickname: readStorage(nicknameStorageKey) || '',
    links: loadPinnedSites(),
    greetingKey: '',
    greetingText: '',
    timer: {
        intervalId: null,
        endTime: 0,
        minutes: loadFocusMinutes(),
        audioContext: null,
    },
};

const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
).matches;

let cachedGreeting = { key: null, text: '' };

function setState(updater) {
    const prev = {
        ...state,
        timer: { ...(state.timer || {}) },
    };

    const partial = typeof updater === 'function' ? updater(prev) : updater;
    if (!partial || typeof partial !== 'object') return;

    if (partial.timer && typeof partial.timer === 'object') {
        Object.assign(state.timer, partial.timer);
        delete partial.timer;
    }

    Object.assign(state, partial);

    render();
}

function render() {
    renderGreeting();
    renderPinnedSites();
    renderManagedSites();
    renderQuote();

    const isRunning = Boolean(state.timer && state.timer.intervalId);
    setTimerRunning(isRunning);

    const ms = state.timer && state.timer.endTime > Date.now()
        ? state.timer.endTime - Date.now()
        : state.timer.minutes * 60000;

    renderTimerDisplay(Math.max(0, ms));

    updateLinkStatus();
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        if (value === null) {
            localStorage.removeItem(key);
            return true;
        }

        localStorage.setItem(key, value);
        return true;
    } catch {
        // Keep the dashboard usable even if storage is unavailable.
        return false;
    }
}

function readBackgroundCache() {
    const cachedValue = readStorageJSON(backgroundCacheStorageKey);

    if (
        !cachedValue ||
        typeof cachedValue !== 'object' ||
        typeof cachedValue.dataUrl !== 'string' ||
        typeof cachedValue.expiresAt !== 'number'
    ) {
        return null;
    }

    return cachedValue;
}

function writeBackgroundCache(value) {
    return writeStorage(
        backgroundCacheStorageKey,
        value ? JSON.stringify(value) : null,
    );
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }

            reject(new Error('Background conversion failed.'));
        };

        reader.onerror = () => {
            reject(new Error('Background conversion failed.'));
        };

        reader.readAsDataURL(blob);
    });
}

async function compressImageBlobToDataUrl(blob, maxWidth = 1600, quality = 0.7) {
    try {
        const imgBitmap = await createImageBitmap(blob);

        const scale = Math.min(1, maxWidth / imgBitmap.width);
        const targetWidth = Math.max(1, Math.round(imgBitmap.width * scale));
        const targetHeight = Math.max(1, Math.round(imgBitmap.height * scale));

        if (typeof OffscreenCanvas !== 'undefined') {
            const off = new OffscreenCanvas(targetWidth, targetHeight);
            const ctx = off.getContext('2d');
            ctx.drawImage(imgBitmap, 0, 0, targetWidth, targetHeight);
            if (off.convertToBlob) {
                const outBlob = await off.convertToBlob({ type: 'image/jpeg', quality });
                return blobToDataUrl(outBlob);
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgBitmap, 0, 0, targetWidth, targetHeight);
        return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
        throw err;
    }
}

async function fetchBackgroundDataUrl(url) {
    const response = await fetch(url, {
        cache: 'no-store',
        mode: 'cors',
    });

    if (!response.ok) {
        throw new Error(`Background request failed with ${response.status}.`);
    }

    const blob = await response.blob();

    try {
        // Attempt lightweight compression/resizing to save storage and bandwidth
        return await compressImageBlobToDataUrl(blob, 1600, 0.7);
    } catch (err) {
        // Fallback to raw data URL if compression fails
        return blobToDataUrl(blob);
    }
}

function readStorageJSON(key) {
    const rawValue = readStorage(key);

    if (!rawValue) {
        return null;
    }

    try {
        return JSON.parse(rawValue);
    } catch {
        return null;
    }
}

function setBackground(url) {
    backgroundElement.style.backgroundImage = `url("${url}")`;
}

function normalizeUrl(value) {
    let urlValue = value.trim();

    if (!urlValue) {
        return null;
    }

    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(urlValue)) {
        urlValue = `https://${urlValue}`;
    }

    try {
        const url = new URL(urlValue);

        if (!['http:', 'https:'].includes(url.protocol)) {
            return null;
        }

        return url.href;
    } catch {
        return null;
    }
}

function createSiteLabel(label, href) {
    if (label.trim()) {
        return label.trim();
    }

    const hostname = new URL(href).hostname.replace(/^www\./, '');
    const firstChunk = hostname.split('.')[0] || hostname;
    return firstChunk.charAt(0).toUpperCase() + firstChunk.slice(1);
}

function sanitizePinnedSites(links) {
    if (!Array.isArray(links)) {
        return defaultQuickLinks.slice(0, maxPinnedSites);
    }

    const seen = new Set();

    return links
        .map((link) => {
            if (!link || typeof link !== 'object') {
                return null;
            }

            const href = normalizeUrl(String(link.href || ''));

            if (!href || seen.has(href)) {
                return null;
            }

            seen.add(href);

            return {
                label: createSiteLabel(String(link.label || ''), href),
                href,
            };
        })
        .filter(Boolean)
        .slice(0, maxPinnedSites);
}

function loadPinnedSites() {
    const storedLinks = readStorageJSON(linksStorageKey);
    const sourceLinks = storedLinks === null ? defaultQuickLinks : storedLinks;
    const sanitizedLinks = sanitizePinnedSites(sourceLinks);

    if (storedLinks === null) {
        return sanitizedLinks.length
            ? sanitizedLinks
            : sanitizePinnedSites(defaultQuickLinks);
    }

    return sanitizedLinks;
}

function savePinnedSites() {
    writeStorage(linksStorageKey, JSON.stringify(state.links));
}

function clampMinutes(value) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const clampedValue = Math.min(180, Math.max(5, value));
    return Math.round(clampedValue / 5) * 5;
}

function loadFocusMinutes() {
    const storedValue = Number(readStorage(focusMinutesStorageKey));
    return clampMinutes(storedValue) || 25;
}

function hashString(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
}

function faviconDataUrl(label, href) {
    const hostname = new URL(href).hostname.replace(/^www\./, '');
    const initial = (label.trim()[0] || hostname[0] || '?').toUpperCase();
    const hue = hashString(hostname) % 360;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="hsl(${hue} 28% 17%)"/>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="hsla(${hue} 70% 80% / 0.28)"/>
      <text
        x="32"
        y="38"
        text-anchor="middle"
        font-family="Inter, system-ui, sans-serif"
        font-size="28"
        font-weight="600"
        fill="hsla(${hue} 90% 94% / 0.94)"
      >${initial}</text>
    </svg>
  `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function faviconRemoteUrl(href) {
    const hostname = new URL(href).hostname.replace(/^www\./, '');
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}

function faviconCandidateUrls(href) {
    const url = new URL(href);
    const hostname = url.hostname.replace(/^www\./, '');
    const origin = url.origin;
    const specialCases = {
        'mail.google.com': [
            'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
            'https://mail.google.com/favicon.ico',
        ],
        'calendar.google.com': [
            'https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico',
            'https://calendar.google.com/favicon.ico',
        ],
        'drive.google.com': [
            'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png',
            'https://drive.google.com/favicon.ico',
        ],
        'github.com': [
            'https://github.githubassets.com/favicons/favicon.svg',
            'https://github.com/favicon.ico',
        ],
        'youtube.com': [
            'https://www.youtube.com/s/desktop/fe69d6d0/img/logos/favicon_32x32.png',
            'https://www.youtube.com/favicon.ico',
        ],
        'notion.so': ['https://www.notion.so/front-static/favicon.ico'],
        'maps.google.com': [
            'https://maps.gstatic.com/favicon3/poi_maps.ico',
            'https://maps.google.com/maps/favicon.ico',
            'https://maps.google.com/favicon.ico',
        ],
        'www.google.com': ['https://www.google.com/favicon.ico'],
        'google.com': ['https://www.google.com/favicon.ico'],
    };

    return [
        ...(specialCases[hostname] || []),
        `${origin}/favicon.ico`,
        `${origin}/apple-touch-icon.png`,
        faviconRemoteUrl(href),
    ];
}

function applyFavicon(imageElement, label, href) {
    const candidates = faviconCandidateUrls(href);
    let index = 0;

    const tryNext = () => {
        if (index >= candidates.length) {
            imageElement.onerror = null;
            imageElement.src = faviconDataUrl(label, href);
            return;
        }

        imageElement.src = candidates[index];
        index += 1;
    };

    imageElement.onerror = tryNext;
    tryNext();
}

function updateLinkStatus(message = `Up to ${maxPinnedSites} pinned sites.`) {
    linkStatusElement.textContent = message;
}

function updateClock() {
    const formatter = new Intl.DateTimeFormat([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    clockElement.textContent = formatter.format(new Date());
    renderGreeting();
}

function startClock() {
    updateClock();

    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    window.setTimeout(() => {
        updateClock();
        window.setInterval(updateClock, 60000);
    }, delay);
}

function getGreetingPeriod(date) {
    const hour = date.getHours();

    if (hour < 5) {
        return 'night';
    }

    if (hour < 12) {
        return 'morning';
    }

    if (hour < 17) {
        return 'afternoon';
    }

    return 'evening';
}

function renderGreeting() {
    const now = new Date();
    const period = getGreetingPeriod(now);
    const greetingKey = `${period}-${now.toDateString()}`;

    if (cachedGreeting.key !== greetingKey) {
        cachedGreeting.key = greetingKey;
        cachedGreeting.text = pickRandom(greetingVariants[period]);
    }

    const nickname = state.nickname.trim() || 'friend';
    greetingElement.textContent = `${cachedGreeting.text}, ${nickname}.`;
}

function renderQuote() {
    const quote = pickRandom(quotes);
    quoteTextElement.textContent = `"${quote.text}"`;
    quoteAuthorElement.textContent = quote.author;
}

function renderPinnedSites() {
    const fragment = document.createDocumentFragment();

    state.links.forEach(({ label, href }) => {
        const link = document.createElement('a');
        link.className = 'pinned-site';
        link.href = href;
        link.title = label;

        const favicon = document.createElement('span');
        favicon.className = 'pinned-site__favicon';

        const faviconImage = document.createElement('img');
        applyFavicon(faviconImage, label, href);
        faviconImage.alt = '';
        faviconImage.width = 18;
        faviconImage.height = 18;

        const text = document.createElement('span');
        text.className = 'pinned-site__label';
        text.textContent = label;

        favicon.appendChild(faviconImage);
        link.append(favicon, text);
        fragment.appendChild(link);
    });

    linksElement.replaceChildren(fragment);
}

function renderManagedSites() {
    if (!state.links.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'menu__empty';
        emptyState.textContent = 'No pinned sites yet.';
        linkManagerElement.replaceChildren(emptyState);
        return;
    }

    const fragment = document.createDocumentFragment();

    state.links.forEach(({ label, href }, index) => {
        const row = document.createElement('div');
        row.className = 'menu__site';

        const meta = document.createElement('div');
        meta.className = 'menu__site-meta';

        const favicon = document.createElement('span');
        favicon.className = 'pinned-site__favicon';

        const faviconImage = document.createElement('img');
        applyFavicon(faviconImage, label, href);
        faviconImage.alt = '';
        faviconImage.width = 18;
        faviconImage.height = 18;
        favicon.appendChild(faviconImage);

        const copy = document.createElement('div');

        const siteName = document.createElement('span');
        siteName.className = 'menu__site-name';
        siteName.textContent = label;

        const siteHost = document.createElement('span');
        siteHost.className = 'menu__site-host';
        siteHost.textContent = new URL(href).hostname.replace(/^www\./, '');

        copy.append(siteName, siteHost);

        const removeButton = document.createElement('button');
        removeButton.className = 'menu__remove';
        removeButton.type = 'button';
        removeButton.dataset.removeIndex = String(index);
        removeButton.textContent = 'Remove';

        meta.append(favicon, copy);
        row.append(meta, removeButton);
        fragment.appendChild(row);
    });

    linkManagerElement.replaceChildren(fragment);
}

function hydrateNotes() {
    notesElement.value = readStorage(notesStorageKey) || '';

    notesElement.addEventListener('input', () => {
        writeStorage(notesStorageKey, notesElement.value);
    });
}

function hydrateNickname() {
    nicknameInputElement.value = state.nickname;

    nameFormElement.addEventListener('submit', (event) => {
        event.preventDefault();
        const nickname = nicknameInputElement.value.trim();
        setState({ nickname });
        writeStorage(nicknameStorageKey, nickname || null);
    });
}

function setMenuOpen(isOpen) {
    menuElement.classList.toggle('is-open', isOpen);
    menuToggleElement.setAttribute('aria-expanded', String(isOpen));
    menuElement.setAttribute('aria-hidden', String(!isOpen));
}

function hydrateMenu() {
    menuToggleElement.addEventListener('click', () => {
        const isOpen =
            menuToggleElement.getAttribute('aria-expanded') !== 'true';
        setMenuOpen(isOpen);
    });

    document.addEventListener('click', (event) => {
        if (
            menuToggleElement.getAttribute('aria-expanded') === 'true' &&
            !menuElement.contains(event.target) &&
            !menuToggleElement.contains(event.target)
        ) {
            setMenuOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setMenuOpen(false);
            return;
        }

        // Toggle menu with '/' when not typing in an input
        if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const target = event.target;
            const tag = target && target.tagName && target.tagName.toLowerCase();
            const isEditable =
                target && (target.isContentEditable || tag === 'input' || tag === 'textarea');

            if (!isEditable) {
                event.preventDefault();
                const isOpen = menuToggleElement.getAttribute('aria-expanded') === 'true';
                setMenuOpen(!isOpen);
                menuToggleElement.focus();
            }
        }
    });
}

function hydratePinnedSites() {
    renderPinnedSites();
    renderManagedSites();
    updateLinkStatus();

    linkFormElement.addEventListener('submit', (event) => {
        event.preventDefault();

        if (state.links.length >= maxPinnedSites) {
            updateLinkStatus(
                'Pinned list is full. Remove one before adding another.',
            );
            return;
        }

        const href = normalizeUrl(linkUrlElement.value);

        if (!href) {
            updateLinkStatus('Enter a valid web address.');
            return;
        }

        if (state.links.some((link) => link.href === href)) {
            updateLinkStatus('That site is already pinned.');
            return;
        }

        const label = createSiteLabel(linkLabelElement.value, href);

        const newLinks = state.links.concat({ label, href });
        setState(() => ({ links: newLinks }));
        savePinnedSites();
        updateLinkStatus(`${label} is now pinned.`);

        linkLabelElement.value = '';
        linkUrlElement.value = '';
        linkUrlElement.focus();
    });

    linkManagerElement.addEventListener('click', (event) => {
        const removeButton = event.target.closest('[data-remove-index]');

        if (!removeButton) {
            return;
        }

        const index = Number(removeButton.dataset.removeIndex);

        if (!Number.isInteger(index)) {
            return;
        }

        const removedLink = state.links[index];
        const newLinks = state.links.slice(0, index).concat(state.links.slice(index + 1));
        setState(() => ({ links: newLinks }));
        savePinnedSites();
        updateLinkStatus(`${removedLink.label} was removed.`);
    });
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderTimerDisplay(milliseconds = state.timer.minutes * 60000) {
    timerDisplayElement.textContent = formatDuration(milliseconds);
}

function syncTimerInput(nextMinutes = Number(timerInputElement.value)) {
    const minutes = clampMinutes(nextMinutes) || state.timer.minutes;
    timerInputElement.value = String(minutes);
    writeStorage(focusMinutesStorageKey, String(minutes));
    setState(() => ({ timer: { minutes } }));
}

function stepTimerMinutes(direction) {
    const currentMinutes =
        clampMinutes(Number(timerInputElement.value)) || state.timer.minutes;
    const nextMinutes =
        clampMinutes(currentMinutes + direction * 5) || currentMinutes;
    syncTimerInput(nextMinutes);
}

function setTimerRunning(isRunning) {
    focusTimerElement.classList.toggle('is-running', isRunning);
    timerStartButtonElement.disabled = isRunning;
    timerStopButtonElement.disabled = !isRunning;
    timerInputElement.disabled = isRunning;
    timerDecreaseButtonElement.disabled = isRunning;
    timerIncreaseButtonElement.disabled = isRunning;
}

async function ensureAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextCtor) {
        return null;
    }

    if (!state.timer.audioContext) {
        const ctx = new AudioContextCtor();
        setState(() => ({ timer: { audioContext: ctx } }));
    }

    const audioCtx = state.timer.audioContext;

    if (audioCtx && audioCtx.state === 'suspended') {
        try {
            await audioCtx.resume();
        } catch {
            return audioCtx;
        }
    }

    return audioCtx;
}

async function playExpirySound() {
    const audioContext = await ensureAudioContext();

    if (!audioContext) {
        return;
    }

    const startTime = audioContext.currentTime + 0.02;
    const notes = [880, 740, 988];

    notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const noteStart = startTime + index * 0.22;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, noteStart);

        gainNode.gain.setValueAtTime(0.0001, noteStart);
        gainNode.gain.exponentialRampToValueAtTime(0.05, noteStart + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.19);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.2);
    });
}

function stopFocusTimer({ playSound = false } = {}) {
    if (state.timer.intervalId) {
        window.clearInterval(state.timer.intervalId);
    }

    setState(() => ({ timer: { endTime: 0, intervalId: null } }));
    writeStorage(focusEndStorageKey, null);

    if (playSound) {
        void playExpirySound();
    }
}

function tickFocusTimer() {
    const remainingMilliseconds = state.timer.endTime - Date.now();

    if (remainingMilliseconds <= 0) {
        renderTimerDisplay(0);
        stopFocusTimer({ playSound: true });
        return;
    }

    renderTimerDisplay(remainingMilliseconds);
}

function startFocusTimer(event) {
    event.preventDefault();

    if (state.timer.intervalId) {
        return;
    }

    syncTimerInput();
    void ensureAudioContext();

    const endTime = Date.now() + state.timer.minutes * 60000;

    tickFocusTimer();
    const id = window.setInterval(tickFocusTimer, 250);

    setState(() => ({ timer: { endTime, intervalId: id } }));
    writeStorage(focusEndStorageKey, String(endTime));
}

function hydrateFocusTimer() {
    syncTimerInput(state.timer.minutes);
    renderTimerDisplay();
    setTimerRunning(false);

    timerInputElement.addEventListener('change', syncTimerInput);
    timerInputElement.addEventListener('blur', syncTimerInput);
    timerDecreaseButtonElement.addEventListener('click', () => {
        stepTimerMinutes(-1);
    });
    timerIncreaseButtonElement.addEventListener('click', () => {
        stepTimerMinutes(1);
    });
    timerFormElement.addEventListener('submit', startFocusTimer);
    timerStopButtonElement.addEventListener('click', () => {
        stopFocusTimer();
    });

    // Resume persisted timer if present
    const storedEnd = Number(readStorage(focusEndStorageKey));
    if (Number.isFinite(storedEnd) && storedEnd > Date.now()) {
        if (!state.timer.intervalId) {
            tickFocusTimer();
            const id = window.setInterval(tickFocusTimer, 250);
            setState(() => ({ timer: { endTime: storedEnd, intervalId: id } }));
        }
    } else {
        writeStorage(focusEndStorageKey, null);
    }
}

function applyParticleStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
        element.style.setProperty(property, value);
    });
}

function hydrateGlassPointerGlow() {
    glassElements.forEach((element) => {
        element.style.setProperty('--pointer-x', '50%');
        element.style.setProperty('--pointer-y', '50%');
        element.style.setProperty('--pointer-alpha', '0');
        if (prefersReducedMotion) return;

        element.addEventListener('pointermove', (event) => {
            const bounds = element.getBoundingClientRect();
            const x = event.clientX - bounds.left;
            const y = event.clientY - bounds.top;

            element.style.setProperty('--pointer-x', `${x}px`);
            element.style.setProperty('--pointer-y', `${y}px`);
            element.style.setProperty('--pointer-alpha', '1');
        });

        element.addEventListener('pointerleave', () => {
            element.style.setProperty('--pointer-x', '50%');
            element.style.setProperty('--pointer-y', '50%');
            element.style.setProperty('--pointer-alpha', '0');
        });
    });
}

function renderAtmosphere() {
    if (prefersReducedMotion) {
        atmosphereElement.replaceChildren();
        return;
    }
    const fragment = document.createDocumentFragment();
    const layers = [
        { type: 'haze', count: 4 },
        { type: 'streak', count: 6 },
        { type: 'firefly', count: 10 },
    ];

    layers.forEach(({ type, count }) => {
        for (let index = 0; index < count; index += 1) {
            const particle = document.createElement('span');
            particle.className = `atmosphere__particle atmosphere__particle--${type}`;

            if (type === 'firefly') {
                applyParticleStyles(particle, {
                    '--left': `${randomBetween(4, 96).toFixed(2)}%`,
                    '--top': `${randomBetween(8, 88).toFixed(2)}%`,
                    '--size': `${randomBetween(0.18, 0.42).toFixed(2)}rem`,
                    '--duration': `${randomBetween(9, 18).toFixed(2)}s`,
                    '--delay': `${randomBetween(-16, 0).toFixed(2)}s`,
                    '--drift-x': `${randomBetween(-2.2, 2.2).toFixed(2)}rem`,
                    '--drift-y': `${randomBetween(-3.5, 3.5).toFixed(2)}rem`,
                    '--opacity': `${randomBetween(0.2, 0.44).toFixed(2)}`,
                });
            } else if (type === 'streak') {
                applyParticleStyles(particle, {
                    '--left': `${randomBetween(-8, 88).toFixed(2)}%`,
                    '--top': `${randomBetween(10, 80).toFixed(2)}%`,
                    '--width': `${randomBetween(12, 24).toFixed(2)}rem`,
                    '--duration': `${randomBetween(18, 30).toFixed(2)}s`,
                    '--delay': `${randomBetween(-24, 0).toFixed(2)}s`,
                    '--angle': `${randomBetween(-18, 18).toFixed(2)}deg`,
                    '--opacity': `${randomBetween(0.08, 0.18).toFixed(2)}`,
                });
            } else {
                applyParticleStyles(particle, {
                    '--left': `${randomBetween(0, 82).toFixed(2)}%`,
                    '--top': `${randomBetween(0, 72).toFixed(2)}%`,
                    '--size': `${randomBetween(12, 28).toFixed(2)}rem`,
                    '--duration': `${randomBetween(18, 34).toFixed(2)}s`,
                    '--delay': `${randomBetween(-30, 0).toFixed(2)}s`,
                    '--drift-x': `${randomBetween(-4, 4).toFixed(2)}rem`,
                    '--drift-y': `${randomBetween(-3, 3).toFixed(2)}rem`,
                    '--opacity': `${randomBetween(0.06, 0.12).toFixed(2)}`,
                });
            }

            fragment.appendChild(particle);
        }
    });

    atmosphereElement.replaceChildren(fragment);
}

function loadBackground() {
    const localFallback = pickRandom(fallbackImages);
    const cachedBackground = readBackgroundCache();
    const now = Date.now();

    if (cachedBackground && cachedBackground.expiresAt > now) {
        setBackground(cachedBackground.dataUrl);
        return;
    }

    const remoteBackground = `https://picsum.photos/1600/900?random=${Date.now()}`;
    const fallbackBackground =
        cachedBackground && typeof cachedBackground.dataUrl === 'string'
            ? cachedBackground.dataUrl
            : localFallback;

    setBackground(fallbackBackground);

    window.setTimeout(async () => {
        try {
            const dataUrl = await fetchBackgroundDataUrl(remoteBackground);
            setBackground(dataUrl);
            const ok = writeBackgroundCache({
                dataUrl,
                expiresAt: now + backgroundCacheTtlMs,
            });

            if (!ok) {
                // Caching failed (quota or storage failure) — fail silently.
            }
        } catch {
            setBackground(fallbackBackground);
        }
    }, 0);
}

startClock();
render();
renderAtmosphere();
hydrateNotes();
hydrateNickname();
hydrateMenu();
hydratePinnedSites();
hydrateFocusTimer();
hydrateGlassPointerGlow();
loadBackground();
