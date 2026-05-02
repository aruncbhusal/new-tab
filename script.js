/**
 * script.js — Minimal New Tab page behaviour.
 *
 * Responsibilities:
 *  - clock & greeting
 *  - pinned sites and favicons
 *  - notes persistence
 *  - focus timer with expiry sound
 *  - background image loading and caching
 */
const TICK_RATE = 1000;

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

// Local fallback images used while a remote background is fetched.
const fallbackImages = [
    'assets/fallback-1.svg',
    'assets/fallback-2.svg',
    'assets/fallback-3.svg',
    'assets/fallback-4.svg',
];

const notesStorageKey = 'minimal-new-tab-notes';
const nicknameStorageKey = 'minimal-new-tab-nickname';
const linksStorageKey = 'minimal-new-tab-links';
const focusMinutesStorageKey = 'minimal-new-tab-focus-minutes';
const focusEndStorageKey = 'minimal-new-tab-focus-end';
const backgroundCacheStorageKey = 'minimal-new-tab-background-cache';
const backgroundCacheTtlMs = 8 * 60 * 60 * 1000;
const maxPinnedSites = 8;
const hour12StorageKey = 'minimal-new-tab-hour12';
const $ = (q) => document.querySelector(q);

// Lightweight wrapper for localStorage.
// - Serialises values as JSON.
// - Returns a sensible fallback on parse errors.
// - Passing `null`/`undefined` removes the key.
const store = {
    get: (k, f = null) => {
        try {
            const v = localStorage.getItem(k);
            return v === null ? f : JSON.parse(v);
        } catch {
            return f;
        }
    },
    set: (k, v) => {
        try {
            v === null || v === undefined
                ? localStorage.removeItem(k)
                : localStorage.setItem(k, JSON.stringify(v));
        } catch {}
    },
};

const create = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);

    Object.assign(el, props);

    for (const child of children.flat()) {
        if (child == null) continue;
        el.append(child);
    }

    return el;
};

let use12Hour = Boolean(store.get(hour12StorageKey, false));

const el = {
    bg: $('[data-background]'),
    clock: $('[data-clock]'),
    greeting: $('[data-greeting]'),
    quoteText: $('[data-quote-text]'),
    quoteAuthor: $('[data-quote-author]'),
    notes: $('[data-notes]'),
    links: $('[data-links]'),
    linkManager: $('[data-link-manager]'),
    linkStatus: $('[data-link-status]'),
    nicknameInput: $('[data-nickname-input]'),
    linkLabel: $('[data-link-label]'),
    linkUrl: $('[data-link-url]'),
    nameForm: $('[data-name-form]'),
    linkForm: $('[data-link-form]'),
    menu: $('[data-menu]'),
    menuToggle: $('[data-menu-toggle]'),
    timer: $('[data-focus-timer]'),
    timerInput: $('[data-timer-input]'),
    timerDisplay: $('[data-timer-display]'),
    timerStart: $('[data-timer-start]'),
    timerStop: $('[data-timer-stop]'),
    timerDec: $('[data-timer-decrease]'),
    timerInc: $('[data-timer-increase]'),
    notesPanel: $('[data-notes-panel]'),
};
const glassElements = [el.timer, el.notesPanel, el.menu, el.menuToggle].filter(
    Boolean,
);

const state = {
    nickname: store.get(nicknameStorageKey, ''),
    links: loadPinnedSites(),
    timer: {
        intervalId: null,
        endTime: 0,
        minutes: loadFocusMinutes(),
    },
};

const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
).matches;

let cachedGreeting = { key: null, text: '' };

// Global AudioContext used for expiry sounds.
// Kept at module scope to avoid creating multiple contexts.
let audioCtx = null;

function initRender() {
    renderGreeting();
    renderQuote();
    renderTimerDisplay();
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function readBackgroundCache() {
    const cachedValue = store.get(backgroundCacheStorageKey, null);

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

function setBackground(url) {
    if (!el.bg) return;
    el.bg.style.backgroundImage = `url("${url}")`;
}

function normalizeUrl(value) {
    let urlValue = value.trim();

    if (!urlValue) return null;

    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(urlValue)) {
        urlValue = `https://${urlValue}`;
    }

    const url = safeUrl(urlValue);
    if (!url) return null;

    if (!['http:', 'https:'].includes(url.protocol)) {
        return null;
    }

    return url.href;
}

function safeUrl(href) {
    try {
        return new URL(href);
    } catch {
        return null;
    }
}

function createSiteLabel(label, href) {
    if (label.trim()) {
        return label.trim();
    }

    const url = safeUrl(href);
    const hostname = url ? url.hostname.replace(/^www\./, '') : 'site';
    const firstChunk = hostname.split('.')[0] || hostname;
    return firstChunk.charAt(0).toUpperCase() + firstChunk.slice(1);
}

function sanitizePinnedSites(links) {
    if (!Array.isArray(links)) {
        // Stored value is not an array — fail safely by returning an empty list.
        return [];
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

function clampMinutes(value, fallback = 25) {
    if (!Number.isFinite(value)) return fallback;
    return Math.round(Math.min(180, Math.max(5, value)) / 5) * 5;
}

function loadFocusMinutes() {
    const raw = store.get(focusMinutesStorageKey, null);
    return raw === null ? 25 : clampMinutes(Number(raw));
}

function loadPinnedSites() {
    return sanitizePinnedSites(store.get(linksStorageKey, []));
}

function hashString(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
}

function faviconDataUrl(label, href) {
    const url = safeUrl(href);
    const hostname = url ? url.hostname.replace(/^www\./, '') : 'site';

    const initial = (label.trim()[0] || hostname[0] || '?').toUpperCase();
    const hue = hashString(hostname) % 360;

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="18" fill="hsl(${hue} 28% 17%)"/>
  <rect x="2" y="2" width="60" height="60" rx="16"
        fill="none" stroke="hsla(${hue} 70% 80% / 0.28)"/>
  <text x="32" y="38"
        text-anchor="middle"
        font-family="system-ui, sans-serif"
        font-size="28"
        font-weight="600"
        fill="hsla(${hue} 90% 94% / 0.94)">
    ${initial}
  </text>
</svg>
`.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function faviconRemoteUrl(href) {
    const url = safeUrl(href);
    const hostname = url ? url.hostname.replace(/^www\./, '') : 'site';
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}

/**
 * Site-specific favicon overrides.
 * Useful when automatic favicon lookup returns generic or incorrect icons.
 */
function getDomainOverrides(hostname) {
    const map = {
        'mail.google.com':
            'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
        'calendar.google.com':
            'https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico',
        'drive.google.com':
            'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png',
        'maps.google.com': 'https://maps.gstatic.com/favicon3/poi_maps.ico',
        'github.com': 'https://github.githubassets.com/favicons/favicon.svg',
        'youtube.com':
            'https://www.youtube.com/s/desktop/fe69d6d0/img/favicon_32x32.png',
        'notion.so': 'https://www.notion.so/images/favicon.ico',
    };

    return map[hostname] || null;
}

function faviconCandidateUrls(href) {
    const url = safeUrl(href);
    const hostname = url ? url.hostname.replace(/^www\./, '') : null;
    const origin = url ? url.origin : null;

    const candidates = [];

    if (!hostname || !origin) {
        return [faviconRemoteUrl(href)];
    }

    const override = getDomainOverrides(hostname);

    if (override) candidates.push(override);

    if (!hostname.endsWith('google.com')) {
        candidates.push(
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
        );
    }

    candidates.push(faviconRemoteUrl(href));

    candidates.push(
        `${origin}/favicon.ico`,
        `${origin}/favicon.png`,
        `${origin}/favicon.svg`,
        `${origin}/apple-touch-icon.png`,
    );

    return candidates;
}

function applyFavicon(imageElement, label, href) {
    imageElement.decoding = 'async';
    imageElement.loading = 'lazy';

    const candidates = faviconCandidateUrls(href);
    let index = 0;

    // Stop attempting further candidates and clear event handlers.
    const cleanup = () => {
        imageElement.onload = null;
        imageElement.onerror = null;
    };

    const tryNext = () => {
        if (index >= candidates.length) {
            cleanup();
            imageElement.src = faviconDataUrl(label, href);
            return;
        }

        imageElement.src = candidates[index++];
    };

    imageElement.onload = () => {
        if (imageElement.naturalWidth > 0) {
            cleanup();
            return;
        }
        tryNext();
    };

    imageElement.onerror = tryNext;

    tryNext();
}

function updateLinkStatus() {
    if (!el.linkStatus) return;

    const count = state.links.length;
    el.linkStatus.textContent =
        count >= maxPinnedSites
            ? `Limit reached (${maxPinnedSites})`
            : `${count}/${maxPinnedSites} pinned sites`;
}

function updateClock() {
    if (!el.clock) return;
    const formatter = new Intl.DateTimeFormat([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: use12Hour,
    });
    el.clock.textContent = formatter.format(new Date());
    renderGreeting();
}

let clockInterval = null;

function startClock() {
    updateClock();

    const now = new Date();
    const delay = (60 - now.getSeconds()) * TICK_RATE - now.getMilliseconds();

    window.setTimeout(() => {
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 60000);
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

    if (cachedGreeting.key !== period) {
        cachedGreeting.key = period;
        cachedGreeting.text = pickRandom(greetingVariants[period]);
    }

    const nickname = state.nickname.trim() || 'friend';
    if (el.greeting)
        el.greeting.textContent = `${cachedGreeting.text}, ${nickname}.`;
}

let currentQuote = null;

function renderQuote() {
    if (!currentQuote) {
        currentQuote = pickRandom(quotes);
    }

    if (el.quoteText) el.quoteText.textContent = `"${currentQuote.text}"`;
    if (el.quoteAuthor) el.quoteAuthor.textContent = currentQuote.author;
}

function renderLinks() {
    const pins = document.createDocumentFragment();
    const manager = document.createDocumentFragment();

    state.links.forEach(({ label, href }, i) => {
        const createFaviconImg = () => {
            const img = create('img', { width: 18, height: 18, alt: '' });
            applyFavicon(img, label, href);
            return img;
        };

        // pinned
        if (el.links) {
            pins.appendChild(
                create(
                    'a',
                    { className: 'pinned-site', href, title: label },
                    create(
                        'span',
                        { className: 'pinned-site__favicon' },
                        createFaviconImg(),
                    ),
                    create('span', {
                        className: 'pinned-site__label',
                        textContent: label,
                    }),
                ),
            );
        }

        // manager
        if (el.linkManager) {
            const url = safeUrl(href);
            const hostname = url ? url.hostname.replace(/^www\./, '') : href;

            manager.appendChild(
                create(
                    'div',
                    { className: 'menu__site' },
                    create(
                        'div',
                        { className: 'menu__site-meta' },
                        create(
                            'span',
                            { className: 'pinned-site__favicon' },
                            createFaviconImg(),
                        ),
                        create(
                            'div',
                            {},
                            create('span', {
                                className: 'menu__site-name',
                                textContent: label,
                            }),
                            create('span', {
                                className: 'menu__site-host',
                                textContent: hostname,
                            }),
                        ),
                    ),
                    (() => {
                        const btn = create('button', {
                            className: 'menu__remove',
                            textContent: 'Remove',
                        });
                        btn.dataset.removeIndex = i;
                        return btn;
                    })(),
                ),
            );
        }
    });

    el.links?.replaceChildren(pins);

    el.linkManager?.replaceChildren(
        state.links.length
            ? manager
            : create('p', {
                  className: 'menu__empty',
                  textContent: 'No pinned sites yet.',
              }),
    );

    updateLinkStatus();
}

const Notes = {
    init() {
        const { notes } = el;
        if (!notes) return;

        notes.value = store.get(notesStorageKey, '');
        let timeout;
        notes.oninput = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                store.set(notesStorageKey, notes.value);
            }, 200);
        };
    },
};

const Nickname = {
    init() {
        const input = el.nicknameInput;
        const form = el.nameForm;
        if (!input || !form) return;

        input.value = state.nickname;

        form.onsubmit = (e) => {
            e.preventDefault();
            state.nickname = input.value.trim();
            store.set(nicknameStorageKey, state.nickname || null);
            renderGreeting();
        };
    },
};

function setMenuOpen(isOpen) {
    if (!el.menu || !el.menuToggle) return;
    el.menu.classList.toggle('is-open', isOpen);
    el.menuToggle.setAttribute('aria-expanded', String(isOpen));
    el.menu.setAttribute('aria-hidden', String(!isOpen));
}

function hydrateMenu() {
    if (!el.menu || !el.menuToggle) return;

    el.menuToggle.addEventListener('click', () => {
        const isOpen = el.menuToggle.getAttribute('aria-expanded') !== 'true';
        setMenuOpen(isOpen);
    });

    document.addEventListener('click', (event) => {
        if (
            el.menuToggle.getAttribute('aria-expanded') === 'true' &&
            !el.menu.contains(event.target) &&
            !el.menuToggle.contains(event.target)
        ) {
            setMenuOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setMenuOpen(false);
            return;
        }

        // Quick toggle: press '/' to open/close the menu when focus is not in an input.
        if (
            event.key === '/' &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
        ) {
            const target = event.target;
            const tag =
                target && target.tagName && target.tagName.toLowerCase();
            const isEditable =
                target &&
                (target.isContentEditable ||
                    tag === 'input' ||
                    tag === 'textarea');

            if (!isEditable) {
                event.preventDefault();
                const isOpen =
                    el.menuToggle.getAttribute('aria-expanded') === 'true';
                setMenuOpen(!isOpen);
                el.menuToggle.focus();
            }
        }
    });
}

const PinnedSites = {
    init() {
        const form = el.linkForm;
        const list = el.linkManager;

        this.render();

        if (!form || !list) return;

        form.onsubmit = (e) => {
            e.preventDefault();
            if (state.links.length >= maxPinnedSites) return;

            const href = normalizeUrl(el.linkUrl.value);
            if (!href) {
                el.linkStatus &&
                    (el.linkStatus.textContent = 'Enter a valid URL.');
                return;
            }
            if (state.links.some((l) => l.href === href)) {
                el.linkStatus &&
                    (el.linkStatus.textContent = 'Already pinned.');
                return;
            }

            const label = createSiteLabel(el.linkLabel.value, href);

            state.links = sanitizePinnedSites([
                ...state.links,
                { label, href },
            ]);

            store.set(linksStorageKey, state.links);
            el.linkLabel.value = '';
            el.linkUrl.value = '';
            el.linkUrl.focus();
            this.render();
        };

        list.onclick = (e) => {
            const btn = e.target.closest('[data-remove-index]');
            if (!btn) return;

            const i = Number(btn.dataset.removeIndex);
            state.links.splice(i, 1);

            store.set(linksStorageKey, state.links);
            this.render();
        };
    },

    render() {
        renderLinks();
    },
};

function formatDuration(milliseconds) {
    const totalSeconds = Math.ceil(Math.max(0, milliseconds) / TICK_RATE);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderTimerDisplay(ms = state.timer.minutes * 60000) {
    if (!el.timerDisplay) return;
    el.timerDisplay.textContent = formatDuration(ms);
}

function syncTimerInput(nextMinutes) {
    if (!el.timerInput) return;

    const minutes = clampMinutes(nextMinutes ?? Number(el.timerInput.value));

    el.timerInput.value = String(minutes);
    state.timer.minutes = minutes;
    store.set(focusMinutesStorageKey, minutes);

    renderTimerDisplay(minutes * 60000);
}

function stepTimerMinutes(direction) {
    const current = clampMinutes(
        Number(el.timerInput.value || state.timer.minutes),
    );
    const next = clampMinutes(current + direction * 5);
    syncTimerInput(next);
}

function setTimerRunning(isRunning) {
    el.timer?.classList.toggle('is-running', isRunning);
    el.timerStart && (el.timerStart.disabled = isRunning);
    el.timerStop && (el.timerStop.disabled = !isRunning);
    el.timerInput && (el.timerInput.disabled = isRunning);
    el.timerDec && (el.timerDec.disabled = isRunning);
    el.timerInc && (el.timerInc.disabled = isRunning);
}

async function ensureAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextCtor) return null;

    if (!audioCtx) {
        audioCtx = new AudioContextCtor();
    }

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

    state.timer.intervalId = null;
    state.timer.endTime = 0;
    store.set(focusEndStorageKey, null);

    setTimerRunning(false);

    renderTimerDisplay();

    if (playSound) void playExpirySound();
}

function tickFocusTimer() {
    const remainingMilliseconds = state.timer.endTime - Date.now();

    if (remainingMilliseconds <= 0) {
        renderTimerDisplay();
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
    state.timer.endTime = endTime;
    state.timer.intervalId = window.setInterval(tickFocusTimer, TICK_RATE);
    store.set(focusEndStorageKey, endTime);
    setTimerRunning(true);
    tickFocusTimer();
}

const Timer = {
    init() {
        // Make UI reflect the currently configured timer minutes.
        syncTimerInput(state.timer.minutes);

        if (el.timerInput) {
            el.timerInput.addEventListener('change', () => syncTimerInput());
            el.timerInput.addEventListener('blur', () => syncTimerInput());
        }

        if (el.timerDec) {
            el.timerDec.addEventListener('click', () => {
                stepTimerMinutes(-1);
            });
        }

        if (el.timerInc) {
            el.timerInc.addEventListener('click', () => {
                stepTimerMinutes(1);
            });
        }

        if (el.timer) el.timer.addEventListener('submit', startFocusTimer);
        if (el.timerStop)
            el.timerStop.addEventListener('click', () => {
                stopFocusTimer();
            });

        // Restore an in-progress timer from storage if it hasn't expired.
        const storedEnd = Number(store.get(focusEndStorageKey, null));
        if (
            Number.isFinite(storedEnd) &&
            storedEnd > Date.now() &&
            !state.timer.intervalId
        ) {
            setTimerRunning(true);
            state.timer.endTime = storedEnd;
            state.timer.intervalId = window.setInterval(
                tickFocusTimer,
                TICK_RATE,
            );
            tickFocusTimer();
        } else {
            store.set(focusEndStorageKey, null);
        }
    },
};

function hydrateGlassPointerGlow() {
    // Subtle pointer-following glow on glass UI elements.
    glassElements.forEach((element) => {
        if (!element) return;
        element.style.setProperty('--pointer-x', '50%');
        element.style.setProperty('--pointer-y', '50%');
        element.style.setProperty('--pointer-alpha', '0');
        if (prefersReducedMotion) return;

        const onPointerMove = (event) => {
            const bounds = element.getBoundingClientRect();
            element.style.setProperty(
                '--pointer-x',
                `${event.clientX - bounds.left}px`,
            );
            element.style.setProperty(
                '--pointer-y',
                `${event.clientY - bounds.top}px`,
            );
            element.style.setProperty('--pointer-alpha', '1');
        };

        const onPointerLeave = () => {
            element.style.setProperty('--pointer-x', '50%');
            element.style.setProperty('--pointer-y', '50%');
            element.style.setProperty('--pointer-alpha', '0');
        };

        element.addEventListener('pointermove', onPointerMove, {
            passive: true,
        });
        element.addEventListener('pointerleave', onPointerLeave);
    });
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

    const fallbackBackground = cachedBackground?.dataUrl || localFallback;

    setBackground(fallbackBackground);

    (async () => {
        try {
            const res = await fetch(remoteBackground, {
                cache: 'no-store',
                mode: 'cors',
            });

            if (!res.ok) return;

            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);

            const scale = Math.min(1, 1600 / bitmap.width);
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));

            let dataUrl;
            if (typeof OffscreenCanvas !== 'undefined') {
                const off = new OffscreenCanvas(w, h);
                off.getContext('2d').drawImage(bitmap, 0, 0, w, h);
                const outBlob = await off.convertToBlob({
                    type: 'image/jpeg',
                    quality: 0.7,
                });
                dataUrl = await new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onloadend = () => res(r.result);
                    r.onerror = rej;
                    r.readAsDataURL(outBlob);
                });
            } else {
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                c.getContext('2d').drawImage(bitmap, 0, 0, w, h);
                dataUrl = c.toDataURL('image/jpeg', 0.7);
            }

            setBackground(dataUrl);
            const fetchedAt = Date.now();

            store.set(backgroundCacheStorageKey, {
                dataUrl,
                expiresAt: fetchedAt + backgroundCacheTtlMs,
            });
        } catch {
            // If fetching or processing the remote image fails, keep the current fallback.
        }
    })();
}

initRender();

Notes.init();
Nickname.init();
hydrateMenu();
PinnedSites.init();
Timer.init();
hydrateGlassPointerGlow();

loadBackground();
startClock();

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!state.timer.intervalId) return;

    // When tab becomes visible again intervals can be out of sync.
    // Force a single tick to correct the display and handle expiry.
    tickFocusTimer();
});

// Clock click toggles 12h / 24h display; preference is persisted.
if (el.clock) {
    // Make it clear the clock is interactive.
    el.clock.title = 'Toggle 12h / 24h format';
    el.clock.style.cursor = 'pointer';
    el.clock.addEventListener('click', () => {
        use12Hour = !use12Hour;
        store.set(hour12StorageKey, use12Hour);
        updateClock();
    });
}
