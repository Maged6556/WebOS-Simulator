// ======================== STATE & DOM ELEMENTS ========================
const DOM = {
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    loginError: document.getElementById('login-error'),
    bootScreen: document.getElementById('boot-screen'),
    desktopScreen: document.getElementById('d-screen'),
    windowContainer: document.getElementById('win-cont'),
    tbarApps: document.getElementById('tbar-apps'),
    clock: document.getElementById('clock'),
    startBtn: document.getElementById('start-btn'),
    startMenu: document.getElementById('s-menu'),
    userMenuBtn: document.getElementById('u-btn'),
    userMenu: document.getElementById('u-menu'),
    logoutBtn: document.getElementById('logout-btn'),
    calendarPopup: document.getElementById('cal-pop'),
    calMonthYear: document.getElementById('cal-month-year'),
    calDaysGrid: document.getElementById('cal-days-grid'),
    desktopCM: document.getElementById('desktop-cm'),
    cmNewFolder: document.getElementById('cm-new-folder'),
    cmNewFile: document.getElementById('cm-new-file'),
    cmDelete: document.getElementById('cm-delete'),
    dIcons: document.getElementById('d-icons')
};

// System constants
const TOTAL_RAM = 512; // MB

// Process state
let processes = [];
let nextPID = 1000;
let activeZIndex = 10;
let highestZIndex = 10;

// Virtual File System
const DEFAULT_VFS = {
    type: 'dir',
    children: {
        'home': {
            type: 'dir',
            children: {
                'admin': {
                    type: 'dir',
                    children: {
                        'Documents': { type: 'dir', children: {} },
                        'Pictures': { type: 'dir', children: {} },
                        'Desktop': { type: 'dir', children: {} },
                        'Downloads': { type: 'dir', children: {} },
                        'notes.txt': { type: 'file', content: 'Hello from WebOS!' }
                    }
                }
            }
        }
    }
};

let vfs = null;

function initVFS() {
    const saved = localStorage.getItem('webos_vfs');
    if (saved) {
        try { vfs = JSON.parse(saved); }
        catch (e) { vfs = JSON.parse(JSON.stringify(DEFAULT_VFS)); }
    } else {
        vfs = JSON.parse(JSON.stringify(DEFAULT_VFS));
    }
}

function saveVFS() {
    localStorage.setItem('webos_vfs', JSON.stringify(vfs));
    if (typeof updateAllFileManagers === 'function') updateAllFileManagers();
    // Sync desktop icons whenever VFS changes (terminal commands, file manager, etc.)
    if (typeof renderDesktopIcons === 'function') renderDesktopIcons();
}

const resolvePath = (curr, target) => {
    if (!target) return { node: null, path: null };
    const parts = (target.startsWith('/') ? target : curr + '/' + target).split('/').filter(p => p && p !== '.');
    const final = [];
    for (const p of parts) p === '..' ? final.pop() : final.push(p);
    let node = vfs;
    for (const p of final) { if (node.type !== 'dir' || !node.children[p]) return { node: null, path: null }; node = node.children[p]; }
    return { node, path: '/' + final.join('/') };
};

const resolveParentAndName = (curr, target) => {
    const parts = target?.split('/').filter(p => p) || [];
    if (!parts.length) return null;
    const name = parts.pop(), parentPath = target.startsWith('/') ? '/' + parts.join('/') : (parts.length ? parts.join('/') : '.');
    const res = resolvePath(curr, parentPath);
    return res.node?.type === 'dir' ? { parentNode: res.node, name } : null;
};

const APP_CONFIG = {
    filemanager: { title: 'File Manager', icon: '<i class="fa-solid fa-folder"></i>', template: 'app-filemanager', memRange: [20, 45] },
    terminal: { title: 'Terminal', icon: '<i class="fa-solid fa-terminal"></i>', template: 'app-terminal', memRange: [10, 25] },
    texteditor: { title: 'Text Editor', icon: '<i class="fa-solid fa-file-signature"></i>', template: 'app-texteditor', memRange: [15, 30] },
    sysmonitor: { title: 'System Monitor', icon: '<i class="fa-solid fa-chart-line"></i>', template: 'app-sysmonitor', memRange: [25, 40] },
};

// ======================== INITIALIZATION ========================
document.addEventListener('DOMContentLoaded', () => {
    initVFS();
    checkLoginState();
    startClock();
    setupEventHandlers();
});

// ======================== AUTHENTICATION ========================
function checkLoginState() {
    if (localStorage.getItem('webos_logged_in') === 'true') {
        // Simulate system restart on page reload
        playBootSequence();
    }
}

DOM.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = DOM.usernameInput.value;
    const pass = DOM.passwordInput.value;

    if (user === 'admin' && pass === '1234') {
        DOM.loginError.style.display = 'none';
        localStorage.setItem('webos_logged_in', 'true');
        playBootSequence();
    } else {
        DOM.loginError.style.display = 'block';
    }
});

DOM.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('webos_logged_in');

    // Kill all processes
    [...processes].forEach(p => killProcess(p.pid));

    DOM.desktopScreen.classList.remove('active');
    DOM.userMenu.classList.remove('active');
    DOM.loginScreen.classList.add('active');
    DOM.usernameInput.value = '';
    DOM.passwordInput.value = '';
});

function playBootSequence() {
    DOM.loginScreen.classList.remove('active');
    DOM.bootScreen.classList.add('active');

    setTimeout(() => {
        DOM.bootScreen.classList.remove('active');
        showDesktop();
    }, 2000);
}

function showDesktop() {
    DOM.loginScreen.classList.remove('active');
    DOM.desktopScreen.classList.add('active');
    renderDesktopIcons();
}

// ======================== EVENT HANDLERS ========================
function setupEventHandlers() {
    // Desktop icons double click (system apps - static icons)
    document.querySelectorAll('.d-icon[data-app]').forEach(icon => {
        icon.addEventListener('dblclick', () => {
            let appName = icon.getAttribute('data-app');
            if (appName === 'filemanager-docs') appName = 'filemanager';
            launchApp(appName);
        });
    });

    // Right-click context menu on desktop
    DOM.desktopScreen.addEventListener('contextmenu', (e) => {
        // Only show menu if clicked on blank desktop area or user icon
        if (e.target.closest('.window') || e.target.closest('.tbar') || e.target.closest('#desktop-cm')) return;
        e.preventDefault();

        const userIcon = e.target.closest('.d-icon.user-item');
        if (userIcon) {
            DOM.cmDelete.style.display = 'flex';
            DOM.cmNewFolder.style.display = 'none';
            DOM.cmNewFile.style.display = 'none';
            DOM.desktopCM.setAttribute('data-target-name', userIcon.getAttribute('data-name'));
        } else {
            DOM.cmDelete.style.display = 'none';
            DOM.cmNewFolder.style.display = 'flex';
            DOM.cmNewFile.style.display = 'flex';
        }

        DOM.desktopCM.style.display = 'block';
        DOM.desktopCM.style.left = e.clientX + 'px';
        DOM.desktopCM.style.top = e.clientY + 'px';
        DOM.startMenu.classList.remove('active');
        DOM.userMenu.classList.remove('active');
        DOM.calendarPopup.classList.remove('active');
    });

    // Hover effect for context menu items
    [DOM.cmNewFolder, DOM.cmNewFile, DOM.cmDelete].forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.08)');
        item.addEventListener('mouseleave', () => item.style.background = '');
    });

    // Delete from context menu
    DOM.cmDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.desktopCM.style.display = 'none';
        const name = DOM.desktopCM.getAttribute('data-target-name');
        if (name && confirm(`Are you sure you want to delete '${name}'?`)) {
            const deskRes = resolvePath('/', '/home/admin/Desktop');
            if (deskRes.node && deskRes.node.children[name]) {
                delete deskRes.node.children[name];
                // Also clean up position
                const pos = loadIconPositions();
                delete pos['user-' + name];
                localStorage.setItem('webos_icon_pos', JSON.stringify(pos));
                
                saveVFS();
                renderDesktopIcons();
            }
        }
    });

    // New Folder from context menu
    DOM.cmNewFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.desktopCM.style.display = 'none';
        const name = prompt('Enter folder name:');
        if (name && name.trim()) {
            const deskRes = resolvePath('/', '/home/admin/Desktop');
            if (deskRes.node && !deskRes.node.children[name.trim()]) {
                deskRes.node.children[name.trim()] = { type: 'dir', children: {} };
                saveVFS();
                renderDesktopIcons();
            } else {
                alert('Folder already exists!');
            }
        }
    });

    // New File from context menu
    DOM.cmNewFile.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.desktopCM.style.display = 'none';
        const name = prompt('Enter file name:');
        if (name && name.trim()) {
            const deskRes = resolvePath('/', '/home/admin/Desktop');
            if (deskRes.node && !deskRes.node.children[name.trim()]) {
                deskRes.node.children[name.trim()] = { type: 'file', content: '' };
                saveVFS();
                renderDesktopIcons();
            } else {
                alert('File already exists!');
            }
        }
    });

    // User Menu
    DOM.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.userMenu.classList.toggle('active');
        DOM.startMenu.classList.remove('active');
        DOM.calendarPopup.classList.remove('active');
    });

    // Start Menu
    DOM.startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.startMenu.classList.toggle('active');
        DOM.userMenu.classList.remove('active');
        DOM.calendarPopup.classList.remove('active');
    });

    // Start Menu items
    document.querySelectorAll('.s-item[data-app]').forEach(item => {
        item.addEventListener('click', () => {
            launchApp(item.getAttribute('data-app'));
            DOM.startMenu.classList.remove('active');
        });
    });

    // Calendar
    DOM.clock.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.calendarPopup.classList.toggle('active');
        DOM.startMenu.classList.remove('active');
        DOM.userMenu.classList.remove('active');
        if (DOM.calendarPopup.classList.contains('active')) {
            renderCalendar();
        }
    });

    // Close popups on outside click
    document.addEventListener('click', () => {
        DOM.startMenu.classList.remove('active');
        DOM.userMenu.classList.remove('active');
        DOM.calendarPopup.classList.remove('active');
        DOM.desktopCM.style.display = 'none';
    });

    // Start Clock update
    setInterval(startClock, 1000);
}

function startClock() {
    const now = new Date();
    DOM.clock.innerHTML = `
        <div class="time">${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
        <div class="date">${now.toLocaleDateString()}</div>
    `;
}

// Load/save icon positions from localStorage
function loadIconPositions() {
    try { return JSON.parse(localStorage.getItem('webos_icon_pos') || '{}'); }
    catch { return {}; }
}
function saveIconPosition(key, x, y) {
    const pos = loadIconPositions();
    pos[key] = { x, y };
    localStorage.setItem('webos_icon_pos', JSON.stringify(pos));
}

// Make a desktop icon draggable (free positioning within desktop)
function makeIconDraggable(el, key) {
    let startX, startY, startLeft, startTop, dragged = false;

    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        dragged = false;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = el.offsetLeft;
        startTop = el.offsetTop;

        const onMove = (e) => {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
            if (!dragged) return;

            // Clamp within desktop (above taskbar)
            const maxLeft = window.innerWidth - el.offsetWidth - 5;
            const maxTop = window.innerHeight - 50 - el.offsetHeight - 5;
            const newLeft = Math.max(5, Math.min(startLeft + dx, maxLeft));
            const newTop = Math.max(5, Math.min(startTop + dy, maxTop));

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (dragged) saveIconPosition(key, el.offsetLeft, el.offsetTop);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // Block dblclick from firing if icon was dragged
    el.addEventListener('dblclick', (e) => { if (dragged) e.stopImmediatePropagation(); });
}

// Renders ALL desktop icons (system apps + user VFS Desktop items)
function renderDesktopIcons() {
    const container = DOM.dIcons;
    container.innerHTML = '';
    const positions = loadIconPositions();

    const systemApps = [
        { key: 'app-filemanager', id: 'filemanager', title: 'Home',          icon: '<i class="fa-solid fa-folder"></i>' },
        { key: 'app-terminal',    id: 'terminal',    title: 'Terminal',       icon: '<i class="fa-solid fa-terminal"></i>' },
        { key: 'app-texteditor',  id: 'texteditor',  title: 'Text Editor',    icon: '<i class="fa-solid fa-file-signature"></i>' },
        { key: 'app-sysmonitor',  id: 'sysmonitor',  title: 'System Monitor', icon: '<i class="fa-solid fa-chart-line"></i>' },
    ];

    // Default grid positions for system icons
    const defaultPos = [
        { x: 20, y: 20 }, { x: 20, y: 120 }, { x: 20, y: 220 }, { x: 20, y: 320 }
    ];

    systemApps.forEach((app, i) => {
        const div = document.createElement('div');
        div.className = 'd-icon';
        div.setAttribute('data-app', app.id);
        div.innerHTML = `<div class="icon-img">${app.icon}</div><span>${app.title}</span>`;
        const pos = positions[app.key] || defaultPos[i];
        div.style.left = pos.x + 'px';
        div.style.top = pos.y + 'px';

        div.addEventListener('dblclick', () => { if (!div._dragged) launchApp(app.id); });
        makeIconDraggable(div, app.key);
        container.appendChild(div);
    });

    // User-created Desktop items from VFS
    const deskRes = resolvePath('/', '/home/admin/Desktop');
    if (!deskRes.node || deskRes.node.type !== 'dir') return;

    let userIndex = 0;
    Object.keys(deskRes.node.children).forEach(name => {
        const item = deskRes.node.children[name];
        const key = 'user-' + name;
        const div = document.createElement('div');
        div.className = 'd-icon user-item';
        div.setAttribute('data-name', name);

        const iconHtml = item.type === 'dir'
            ? '<i class="fa-solid fa-folder" style="color:#89b4fa; font-size:2rem;"></i>'
            : '<i class="fa-solid fa-file-lines" style="color:#cdd6f4; font-size:2rem;"></i>';

        div.innerHTML = `<div class="icon-img">${iconHtml}</div><span>${name}</span>`;

        // Default position: cascade from right side
        const defaultUserPos = { x: window.innerWidth - 110 - (Math.floor(userIndex / 6) * 100), y: 20 + (userIndex % 6) * 100 };
        const pos = positions[key] || defaultUserPos;
        div.style.left = pos.x + 'px';
        div.style.top = pos.y + 'px';
        userIndex++;

        div.addEventListener('dblclick', () => {
            if (item.type === 'dir') {
                launchApp('filemanager');
                setTimeout(() => {
                    const fm = processes[processes.length - 1];
                    if (fm && fm.appId === 'filemanager') {
                        fm.cwd = '/home/admin/Desktop/' + name;
                        renderFileManager(fm, fm.element);
                    }
                }, 150);
            } else {
                launchApp('texteditor');
                setTimeout(() => {
                    const te = processes[processes.length - 1];
                    if (te && te.appId === 'texteditor') {
                        const textarea = te.element.querySelector('.te-textarea');
                        textarea.value = item.content || '';
                        const saveBtn = te.element.querySelector('#te-save');
                        const status = te.element.querySelector('.te-status');
                        const newSaveBtn = saveBtn.cloneNode(true);
                        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
                        newSaveBtn.addEventListener('click', () => {
                            item.content = textarea.value;
                            saveVFS();
                            status.textContent = 'Saved!';
                            setTimeout(() => status.textContent = '', 2000);
                        });
                        te.element.querySelector('.win-title').textContent = `Text Editor - ${name}`;
                    }
                }, 150);
            }
        });

        makeIconDraggable(div, key);
        container.appendChild(div);
    });
}

function renderCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    DOM.calMonthYear.textContent = `${monthNames[month]} ${year}`;

    DOM.calDaysGrid.innerHTML = '';

    // Add headers
    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    days.forEach(d => {
        const div = document.createElement('div');
        div.className = 'cal-day header';
        div.textContent = d;
        DOM.calDaysGrid.appendChild(div);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty spots for first day
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        DOM.calDaysGrid.appendChild(div);
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
        const div = document.createElement('div');
        div.className = 'cal-day';
        if (i === today) {
            div.classList.add('today');
        }
        div.textContent = i;
        DOM.calDaysGrid.appendChild(div);
    }
}

// ======================== PROCESS & WINDOW MANAGEMENT ========================
function launchApp(appId) {
    const cfg = APP_CONFIG[appId];
    const used = processes.reduce((a, p) => a + p.mem, 0);
    const req = Math.floor(Math.random() * (cfg.memRange[1] - cfg.memRange[0])) + cfg.memRange[0];
    if (used + req > TOTAL_RAM) return alert("Out of Memory!");
    const p = { pid: nextPID++, appId, name: cfg.title, icon: cfg.icon, status: 'Running', mem: req, element: null, tbarElement: null };
    createWindow(p, cfg); createTaskbarIcon(p); processes.push(p); focusWindow(p); updateSystemMonitor();
}

function killProcess(pid) {
    const i = processes.findIndex(p => p.pid === pid);
    if (i > -1) {
        const p = processes[i];
        p.element?.remove(); p.tbarElement?.remove();
        processes.splice(i, 1); updateSystemMonitor();
    }
}

function createWindow(p, cfg) {
    const el = document.getElementById('window-template').content.cloneNode(true).querySelector('.window');
    el.querySelector('.win-body').appendChild(document.getElementById(cfg.template).content.cloneNode(true));
    el.querySelector('.win-title').textContent = cfg.title;
    const off = (processes.length % 5) * 30;
    Object.assign(el.style, { top: (50 + off) + 'px', left: (50 + off) + 'px' });
    el.addEventListener('mousedown', () => focusWindow(p));
    el.querySelector('.cls-btn').onclick = e => { e.stopPropagation(); killProcess(p.pid); };
    el.querySelector('.min-btn').onclick = e => { e.stopPropagation(); p.status = 'Waiting'; el.classList.add('minimized'); p.tbarElement.classList.remove('active'); updateSystemMonitor(); };

    const maxBtn = el.querySelector('.max-btn');
    let prev = null;
    maxBtn.onclick = e => {
        e.stopPropagation();
        if (el.classList.contains('maximized')) {
            el.classList.remove('maximized');
            if (prev) Object.assign(el.style, prev);
            maxBtn.querySelector('i').className = 'fa-solid fa-expand';
        } else {
            prev = { top: el.style.top, left: el.style.left, width: el.style.width, height: el.style.height };
            el.classList.add('maximized');
            maxBtn.querySelector('i').className = 'fa-solid fa-compress';
        }
    };
    el.querySelector('.win-hdr').ondblclick = () => maxBtn.click();
    makeDraggable(el, el.querySelector('.win-hdr')); makeResizable(el);
    DOM.windowContainer.appendChild(el); p.element = el;
    initAppLogic(p, el);
}

function createTaskbarIcon(p) {
    const icon = document.createElement('div');
    icon.className = 'tbar-app-icon active';
    icon.innerHTML = p.icon; icon.title = p.name;
    icon.onclick = () => {
        if (p.status === 'Waiting' || !p.element.classList.contains('active')) {
            p.status = 'Running'; p.element.classList.remove('minimized'); focusWindow(p);
        } else {
            p.status = 'Waiting'; p.element.classList.add('minimized'); icon.classList.remove('active');
        }
        updateSystemMonitor();
    };
    DOM.tbarApps.appendChild(icon); p.tbarElement = icon;
}

function focusWindow(p) {
    if (!p.element) return;
    p.element.style.zIndex = ++highestZIndex;
    p.status = 'Running';
    processes.forEach(proc => proc.tbarElement?.classList.remove('active'));
    if (!p.element.classList.contains('minimized')) p.tbarElement?.classList.add('active');
    if (p.appId === 'terminal') p.element.querySelector('.term-in')?.focus();
    updateSystemMonitor();
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;

        // Boundaries
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 50) newTop = window.innerHeight - 50;

        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function makeResizable(el) {
    const MIN_W = 300, MIN_H = 200;
    const handles = el.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            if (el.classList.contains('maximized')) return;
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX, startY = e.clientY;
            const startW = el.offsetWidth, startH = el.offsetHeight;
            const startL = el.offsetLeft, startT = el.offsetTop;
            const dir = Array.from(handle.classList).find(c => c.startsWith('resize-') && c !== 'resize-handle').replace('resize-', '');

            const onMove = (e) => {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const maxH = window.innerHeight - 50; // above taskbar

                if (dir.includes('e')) el.style.width = Math.max(MIN_W, startW + dx) + 'px';
                if (dir.includes('s')) {
                    const newH = Math.max(MIN_H, startH + dy);
                    el.style.height = Math.min(newH, maxH - startT) + 'px';
                }
                if (dir.includes('w')) {
                    const newW = Math.max(MIN_W, startW - dx);
                    el.style.left = (startL + startW - newW) + 'px';
                    el.style.width = newW + 'px';
                }
                if (dir.includes('n')) {
                    const newH = Math.max(MIN_H, startH - dy);
                    const newT = Math.max(0, startT + startH - newH);
                    el.style.top = newT + 'px';
                    el.style.height = newH + 'px';
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

// ======================== APPS LOGIC ========================

function initAppLogic(process, element) {
    if (process.appId === 'terminal') {
        initTerminal(process, element);
    } else if (process.appId === 'texteditor') {
        initTextEditor(element);
    } else if (process.appId === 'sysmonitor') {
        updateSystemMonitor();
    } else if (process.appId === 'filemanager') {
        initFileManager(process, element);
    }
}

// --- File Manager ---
function initFileManager(p, el) {
    p.cwd = '/home/admin'; p.selectedItem = null;
    el.querySelector('#fm-up').onclick = () => { if (p.cwd !== '/') { p.cwd = '/' + p.cwd.split('/').filter(x=>x).slice(0,-1).join('/'); renderFileManager(p, el); }};
    const add = (type) => {
        const n = prompt(`Enter ${type} name:`);
        if (n && !resolvePath(p.cwd, '.').node.children[n]) {
            resolvePath(p.cwd, '.').node.children[n] = type === 'dir' ? {type:'dir', children:{}} : {type:'file', content:''};
            saveVFS();
        }
    };
    el.querySelector('#fm-new-folder').onclick = () => add('dir');
    el.querySelector('#fm-new-file').onclick = () => add('file');
    el.querySelector('#fm-delete').onclick = () => {
        if (p.selectedItem && confirm(`Delete '${p.selectedItem}'?`)) {
            delete resolvePath(p.cwd, '.').node.children[p.selectedItem];
            p.selectedItem = null; saveVFS();
        }
    };
    renderFileManager(p, el);
}

function renderFileManager(p, el) {
    const grid = el.querySelector('.fm-grid'), res = resolvePath(p.cwd, '.');
    el.querySelector('.fm-bread').textContent = p.cwd;
    grid.innerHTML = ''; p.selectedItem = null;
    if (!res.node) return;
    Object.keys(res.node.children).forEach(name => {
        const item = res.node.children[name];
        const div = document.createElement('div'); div.className = 'fm-item';
        div.innerHTML = `<div class="fm-icon">${item.type==='dir'?'<i class="fa-solid fa-folder" style="color:#89b4fa"></i>':'<i class="fa-solid fa-file-lines" style="color:#cdd6f4"></i>'}</div><div class="fm-name">${name}</div>`;
        div.onclick = e => { e.stopPropagation(); [...grid.children].forEach(c=>c.classList.remove('selected')); div.classList.add('selected'); p.selectedItem = name; };
        div.ondblclick = e => {
            e.stopPropagation();
            if (item.type === 'dir') { p.cwd = (p.cwd === '/' ? '' : p.cwd) + '/' + name; renderFileManager(p, el); }
            else {
                launchApp('texteditor');
                setTimeout(() => {
                    const te = processes.findLast(proc => proc.appId === 'texteditor');
                    if (te) {
                        const ta = te.element.querySelector('.te-textarea'); ta.value = item.content || '';
                        const sb = te.element.querySelector('#te-save'), st = te.element.querySelector('.te-status'), nsb = sb.cloneNode(true);
                        sb.replaceWith(nsb);
                        nsb.onclick = () => { item.content = ta.value; saveVFS(); st.textContent = 'Saved!'; setTimeout(()=>st.textContent='', 2000); };
                        te.element.querySelector('.win-title').textContent = `Text Editor - ${name}`;
                    }
                }, 100);
            }
        };
        grid.appendChild(div);
    });
}

function updateAllFileManagers() { processes.forEach(p => p.appId === 'filemanager' && p.element && renderFileManager(p, p.element)); }

function initTerminal(p, el) {
    p.cwd = '/home/admin';
    const inp = el.querySelector('.term-in'), out = el.querySelector('.term-out'), pr = el.querySelector('.prompt');
    pr.textContent = `admin@webos:${p.cwd}$`;
    inp.onkeydown = e => {
        if (e.key === 'Enter' && inp.value.trim()) {
            appendTerminalLine(out, `admin@webos:${p.cwd}$ ${inp.value.trim()}`, '#cdd6f4');
            processCommand(inp.value.trim(), out, p, pr);
            inp.value = ''; out.scrollTop = out.scrollHeight;
        }
    };
}

function appendTerminalLine(out, text, col = '#a6adc8') {
    const div = document.createElement('div'); div.textContent = text; div.style.color = col; out.appendChild(div);
}

function processCommand(cmdLine, output, process, promptNode) {
    // Tilde expansion: ~ → /home/admin
    const expandedLine = cmdLine.replace(/(^|\s)~(\/|$|\s)/g, '$1/home/admin$2').trim();
    const args = expandedLine.split(/\s+/);
    const cmd = args[0].toLowerCase();
    const arg = args[1];

    const getRes = (target) => resolvePath(process.cwd, target);

    const modifyFs = (cmdName, actionMsg, callback) => {
        if (!arg) {
            appendTerminalLine(output, `${cmdName}: missing operand`, '#f38ba8');
            return;
        }
        const parsed = resolveParentAndName(process.cwd, arg);
        if (!parsed || !parsed.parentNode) {
            appendTerminalLine(output, `${cmdName}: cannot ${actionMsg} '${arg}': No such file or directory`, '#f38ba8');
            return;
        }
        callback(parsed.parentNode, parsed.name, parsed.parentNode.children[parsed.name]);
    };

    const cmds = {
        help: () => appendTerminalLine(output, "Available: help, clear, date, time, whoami, pwd, ls, cd, cat, echo, uname, ps, mkdir, touch, rm, rmdir, cp, mv, free, hostname, sudo, reboot, stat"),
        clear: () => output.innerHTML = '',
        date: () => appendTerminalLine(output, new Date().toString()),
        time: () => appendTerminalLine(output, new Date().toString()),
        whoami: () => appendTerminalLine(output, "admin"),
        pwd: () => appendTerminalLine(output, process.cwd),
        cd: () => {
            if (!args[1]) process.cwd = '/home/admin';
            else {
                const res = getRes(args[1]);
                if (res.node?.type === 'dir') process.cwd = res.path || '/';
                else return appendTerminalLine(output, `cd: ${args[1]}: No such directory`, '#f38ba8');
            }
            promptNode.textContent = `admin@webos:${process.cwd}$`;
        },
        ls: () => {
            const target = getRes(args[1] || '.');
            if (target.node?.type === 'dir') {
                const names = Object.keys(target.node.children);
                if (names.length) appendTerminalLine(output, names.join('  '), '#89b4fa');
            } else appendTerminalLine(output, `ls: cannot access '${args[1] || ''}': No such file or directory`, '#f38ba8');
        },
        cat: () => {
            if (!args[1]) return appendTerminalLine(output, `cat: missing operand`, '#f38ba8');
            const res = getRes(args[1]);
            if (res.node?.type === 'file') appendTerminalLine(output, res.node.content || '');
            else appendTerminalLine(output, `cat: ${args[1]}: ${res.node ? 'Is a directory' : 'No such file'}`, '#f38ba8');
        },
        mkdir: () => modifyFs('mkdir', 'create directory', (p, n, t) => t ? appendTerminalLine(output, `mkdir: cannot create '${arg}': exists`, '#f38ba8') : (p.children[n] = { type: 'dir', children: {} }, saveVFS())),
        touch: () => modifyFs('touch', 'touch', (p, n, t) => !t && (p.children[n] = { type: 'file', content: '' }, saveVFS())),
        rm: () => modifyFs('rm', 'remove', (p, n, t) => !t || t.type === 'dir' ? appendTerminalLine(output, `rm: cannot remove '${arg}': ${!t ? 'No such file' : 'Is a directory'}`, '#f38ba8') : (delete p.children[n], saveVFS())),
        rmdir: () => modifyFs('rmdir', 'remove', (p, n, t) => {
            if (!t || t.type !== 'dir') return appendTerminalLine(output, `rmdir: failed '${arg}': ${!t ? 'No such file' : 'Not a directory'}`, '#f38ba8');
            if (Object.keys(t.children).length) return appendTerminalLine(output, `rmdir: '${arg}': Not empty`, '#f38ba8');
            delete p.children[n]; saveVFS();
        }),
        echo: () => appendTerminalLine(output, args.slice(1).join(' ')),
        uname: () => appendTerminalLine(output, "WebOS Linux Simulator 1.0"),
        ps: () => {
            appendTerminalLine(output, "PID   NAME         STATUS", '#f9e2af');
            processes.forEach(p => appendTerminalLine(output, `${p.pid.toString().padEnd(5)} ${p.name.padEnd(12)} ${p.status}`));
        },
        free: () => {
            const used = processes.reduce((acc, p) => acc + p.mem, 0);
            appendTerminalLine(output, `              total        used        free`, '#89b4fa');
            appendTerminalLine(output, `Mem:          ${TOTAL_RAM}MB       ${used}MB        ${TOTAL_RAM - used}MB`);
        },
        hostname: () => appendTerminalLine(output, "webos"),
        sudo: () => appendTerminalLine(output, "admin is not in the sudoers file.", '#f38ba8'),
        reboot: () => { appendTerminalLine(output, "System is rebooting...", '#a6e3a1'); setTimeout(() => location.reload(), 1500); },
        stat: () => {
            if (!args[1]) return appendTerminalLine(output, `stat: missing operand`, '#f38ba8');
            const res = getRes(args[1]);
            if (!res.node) return appendTerminalLine(output, `stat: cannot stat '${args[1]}': No such file`, '#f38ba8');
            const size = res.node.type === 'dir' ? Object.keys(res.node.children).length * 4096 : (res.node.content || '').length;
            appendTerminalLine(output, `  File: ${args[1]}\n  Size: ${size} \tBlocks: 8 \tIO Block: 4096 \t${res.node.type === 'dir' ? 'directory' : 'regular file'}`);
            appendTerminalLine(output, `Access: (0644/-rw-r--r--)  Uid: (admin) Gid: (admin)`);
        },
        cp: () => {
            const [s, d] = [args[1], args[2]];
            if (!s || !d) return appendTerminalLine(output, 'cp: missing operand', '#f38ba8');
            const sr = getRes(s), dp = resolveParentAndName(process.cwd, d);
            if (!sr.node || !dp) return appendTerminalLine(output, `cp: cannot copy '${s}' to '${d}'`, '#f38ba8');
            if (dp.parentNode.children[dp.name]) return appendTerminalLine(output, `cp: '${d}': exists`, '#f38ba8');
            dp.parentNode.children[dp.name] = JSON.parse(JSON.stringify(sr.node)); saveVFS();
        },
        mv: () => {
            const [s, d] = [args[1], args[2]];
            if (!s || !d) return appendTerminalLine(output, 'mv: missing operand', '#f38ba8');
            const sp = resolveParentAndName(process.cwd, s), dp = resolveParentAndName(process.cwd, d);
            if (!sp?.parentNode.children[sp.name] || !dp) return appendTerminalLine(output, `mv: cannot move '${s}' to '${d}'`, '#f38ba8');
            if (dp.parentNode.children[dp.name]) return appendTerminalLine(output, `mv: '${d}': exists`, '#f38ba8');
            dp.parentNode.children[dp.name] = sp.parentNode.children[sp.name]; delete sp.parentNode.children[sp.name]; saveVFS();
        }
    };

    if (cmds[cmd]) cmds[cmd]();
    else appendTerminalLine(output, `bash: ${cmd}: command not found`, '#f38ba8');
}


// --- Text Editor ---
function initTextEditor(el) {
    const ta = el.querySelector('.te-textarea'), st = el.querySelector('.te-status');
    const saved = localStorage.getItem('webos_note'); if (saved) ta.value = saved;
    const btn = (sel, val, msg) => el.querySelector(sel).onclick = () => { if(val!==null)localStorage.setItem('webos_note', ta.value); else {ta.value=''; localStorage.removeItem('webos_note');} st.textContent=msg; setTimeout(()=>st.textContent='', 2000); };
    btn('#te-save', true, 'Saved!'); btn('#te-clear', null, 'Cleared!');
}

// --- System Monitor ---
function updateSystemMonitor() {
    const smP = processes.filter(p => p.appId === 'sysmonitor');
    if (!smP.length) return;
    const used = processes.reduce((a, p) => a + p.mem, 0), perc = (used / TOTAL_RAM) * 100;
    smP.forEach(sm => {
        const tb = sm.element.querySelector('#sm-tbody'), rt = sm.element.querySelector('#sm-ram-text'), rf = sm.element.querySelector('#sm-ram-fill');
        if (!tb) return; rt.textContent = `${used} / ${TOTAL_RAM} MB`; rf.style.width = `${Math.min(perc, 100)}%`;
        rf.style.background = perc > 80 ? 'linear-gradient(90deg, #f9e2af, #f38ba8)' : 'linear-gradient(90deg, #a6e3a1, #f9e2af)';
        tb.innerHTML = processes.map(p => `<tr><td>${p.pid}</td><td>${p.name}</td><td class="status-${p.status.toLowerCase()}">${p.status}</td><td>${p.mem} MB</td></tr>`).join('');
    });
}
