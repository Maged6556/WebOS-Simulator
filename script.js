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
    calDaysGrid: document.getElementById('cal-days-grid')
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
}

function resolvePath(currentPath, targetPath) {
    if (!targetPath) return { node: null, path: null };
    let parts = [];
    if (targetPath.startsWith('/')) {
        parts = targetPath.split('/').filter(p => p !== '');
    } else {
        parts = currentPath.split('/').filter(p => p !== '').concat(targetPath.split('/').filter(p => p !== ''));
    }

    let finalParts = [];
    for (let p of parts) {
        if (p === '.') continue;
        if (p === '..') { finalParts.pop(); } 
        else { finalParts.push(p); }
    }

    let currentNode = vfs;
    for (let p of finalParts) {
        if (currentNode.type !== 'dir' || !currentNode.children[p]) return { node: null, path: null };
        currentNode = currentNode.children[p];
    }
    return { node: currentNode, path: '/' + finalParts.join('/') };
}

function resolveParentAndName(currentPath, targetPath) {
    if(!targetPath) return null;
    let isAbsolute = targetPath.startsWith('/');
    let parts = targetPath.split('/').filter(p => p !== '');
    if(parts.length === 0) return null;
    const name = parts.pop();
    let parentPathStr = isAbsolute ? ('/' + parts.join('/')) : parts.join('/');
    const parentRes = resolvePath(currentPath, parentPathStr);
    if(parentRes.node && parentRes.node.type === 'dir') {
        return { parentNode: parentRes.node, name: name };
    }
    return null;
}

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
        showDesktop();
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
}

// ======================== EVENT HANDLERS ========================
function setupEventHandlers() {
    // Desktop icons double click
    document.querySelectorAll('.d-icon[data-app]').forEach(icon => {
        icon.addEventListener('dblclick', () => {
            let appName = icon.getAttribute('data-app');
            if(appName === 'filemanager-docs') appName = 'filemanager';
            launchApp(appName);
        });
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
    });

    // Start Clock update
    setInterval(startClock, 1000);
}

function startClock() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    DOM.clock.innerHTML = `
        <div class="time">${hours}:${minutes} ${ampm}</div>
        <div class="date">${month}/${day}/${year}</div>
    `;
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
    const config = APP_CONFIG[appId];
    if (!config) return;

    // Check memory
    const usedMem = processes.reduce((acc, p) => acc + p.mem, 0);
    const requiredMem = Math.floor(Math.random() * (config.memRange[1] - config.memRange[0])) + config.memRange[0];
    
    if (usedMem + requiredMem > TOTAL_RAM) {
        alert("Out of Memory! Close some apps.");
        return;
    }

    const pid = nextPID++;
    const process = {
        pid,
        appId,
        name: config.title,
        icon: config.icon,
        status: 'Running', // Running, Waiting
        mem: requiredMem,
        element: null,
        tbarElement: null
    };

    createWindow(process, config);
    createTaskbarIcon(process);
    
    processes.push(process);
    focusWindow(process);
    updateSystemMonitor();
}

function killProcess(pid) {
    const index = processes.findIndex(p => p.pid === pid);
    if (index > -1) {
        const process = processes[index];
        if (process.element) process.element.remove();
        if (process.tbarElement) process.tbarElement.remove();
        processes.splice(index, 1);
        updateSystemMonitor();
    }
}

function createWindow(process, config) {
    // Clone templates
    const winTemplate = document.getElementById('window-template').content.cloneNode(true);
    const windowEl = winTemplate.querySelector('.window');
    
    const appTemplate = document.getElementById(config.template).content.cloneNode(true);
    windowEl.querySelector('.win-body').appendChild(appTemplate);
    windowEl.querySelector('.win-title').textContent = config.title;

    // Set initial position (cascading)
    const offset = (processes.length % 5) * 30;
    windowEl.style.top = `${50 + offset}px`;
    windowEl.style.left = `${50 + offset}px`;

    // Event Listeners for window
    windowEl.addEventListener('mousedown', () => focusWindow(process));
    
    // Controls
    windowEl.querySelector('.cls-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        killProcess(process.pid);
    });

    windowEl.querySelector('.min-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        process.status = 'Waiting';
        windowEl.classList.add('minimized');
        process.tbarElement.classList.remove('active');
        updateSystemMonitor();
    });

    // Make Draggable
    makeDraggable(windowEl, windowEl.querySelector('.win-hdr'));

    DOM.windowContainer.appendChild(windowEl);
    process.element = windowEl;

    // App specific logic init
    initAppLogic(process, windowEl);
}

function createTaskbarIcon(process) {
    const icon = document.createElement('div');
    icon.className = 'tbar-app-icon active';
    icon.innerHTML = process.icon;
    icon.title = process.name;

    icon.addEventListener('click', () => {
        if (process.status === 'Waiting' || !process.element.classList.contains('active')) {
            process.status = 'Running';
            process.element.classList.remove('minimized');
            focusWindow(process);
        } else {
            // Minimize
            process.status = 'Waiting';
            process.element.classList.add('minimized');
            icon.classList.remove('active');
        }
        updateSystemMonitor();
    });

    DOM.tbarApps.appendChild(icon);
    process.tbarElement = icon;
}

function focusWindow(process) {
    if(!process.element) return;
    highestZIndex++;
    process.element.style.zIndex = highestZIndex;
    process.status = 'Running';
    
    // Update tbar visuals
    processes.forEach(p => {
        if(p.tbarElement) p.tbarElement.classList.remove('active');
    });
    if(process.tbarElement && !process.element.classList.contains('minimized')) {
        process.tbarElement.classList.add('active');
    }
    
    // Focus specific elements
    if (process.appId === 'terminal') {
        const input = process.element.querySelector('.term-in');
        if(input) input.focus();
    }
    
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
        if(newTop < 0) newTop = 0;
        if(newTop > window.innerHeight - 50) newTop = window.innerHeight - 50;
        
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
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
function initFileManager(process, element) {
    process.cwd = '/home/admin';
    process.selectedItem = null;
    
    const upBtn = element.querySelector('#fm-up');
    const newFolderBtn = element.querySelector('#fm-new-folder');
    const newFileBtn = element.querySelector('#fm-new-file');
    const deleteBtn = element.querySelector('#fm-delete');
    const grid = element.querySelector('.fm-grid');
    const breadcrumbs = element.querySelector('.fm-bread');

    upBtn.addEventListener('click', () => {
        if (process.cwd !== '/') {
            const parts = process.cwd.split('/').filter(p => p !== '');
            parts.pop();
            process.cwd = '/' + parts.join('/');
            renderFileManager(process, element);
        }
    });

    newFolderBtn.addEventListener('click', () => {
        const name = prompt("Enter folder name:");
        if (name) {
            const res = resolvePath(process.cwd, '.');
            if (res.node && !res.node.children[name]) {
                res.node.children[name] = { type: 'dir', children: {} };
                saveVFS();
            } else {
                alert("Folder already exists or invalid path.");
            }
        }
    });

    newFileBtn.addEventListener('click', () => {
        const name = prompt("Enter file name:");
        if (name) {
            const res = resolvePath(process.cwd, '.');
            if (res.node && !res.node.children[name]) {
                res.node.children[name] = { type: 'file', content: '' };
                saveVFS();
            } else {
                alert("File already exists or invalid path.");
            }
        }
    });

    deleteBtn.addEventListener('click', () => {
        if (process.selectedItem) {
            if (confirm(`Are you sure you want to delete '${process.selectedItem}'?`)) {
                const res = resolvePath(process.cwd, '.');
                if (res.node && res.node.children[process.selectedItem]) {
                    delete res.node.children[process.selectedItem];
                    process.selectedItem = null;
                    saveVFS();
                }
            }
        } else {
            alert("Please select an item to delete.");
        }
    });

    renderFileManager(process, element);
}

function renderFileManager(process, element) {
    const grid = element.querySelector('.fm-grid');
    const breadcrumbs = element.querySelector('.fm-bread');
    breadcrumbs.textContent = process.cwd;
    grid.innerHTML = '';
    process.selectedItem = null;

    const res = resolvePath(process.cwd, '.');
    if (!res.node || res.node.type !== 'dir') return;

    Object.keys(res.node.children).forEach(name => {
        const item = res.node.children[name];
        const div = document.createElement('div');
        div.className = 'fm-item';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'fm-icon';
        iconDiv.innerHTML = item.type === 'dir' ? '<i class="fa-solid fa-folder" style="color:#89b4fa"></i>' : '<i class="fa-solid fa-file-lines" style="color:#cdd6f4"></i>';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'fm-name';
        nameDiv.textContent = name;

        div.appendChild(iconDiv);
        div.appendChild(nameDiv);

        // Selection
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            Array.from(grid.children).forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            process.selectedItem = name;
        });

        // Double Click (Navigate or Open)
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (item.type === 'dir') {
                process.cwd = (process.cwd === '/' ? '/' : process.cwd + '/') + name;
                renderFileManager(process, element);
            } else {
                // Open text editor for file
                launchApp('texteditor');
                // Wait for it to open and load contents
                setTimeout(() => {
                    const teProcess = processes[processes.length - 1];
                    if (teProcess && teProcess.appId === 'texteditor') {
                        const textarea = teProcess.element.querySelector('.te-textarea');
                        textarea.value = item.content || '';
                        
                        const saveBtn = teProcess.element.querySelector('#te-save');
                        const status = teProcess.element.querySelector('.te-status');
                        
                        const newSaveBtn = saveBtn.cloneNode(true);
                        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
                        
                        newSaveBtn.addEventListener('click', () => {
                            item.content = textarea.value;
                            saveVFS();
                            status.textContent = 'Saved to VFS!';
                            setTimeout(() => status.textContent = '', 2000);
                        });
                        
                        teProcess.element.querySelector('.win-title').textContent = `Text Editor - ${name}`;
                    }
                }, 100);
            }
        });

        grid.appendChild(div);
    });
}

function updateAllFileManagers() {
    processes.forEach(p => {
        if (p.appId === 'filemanager' && p.element) {
            renderFileManager(p, p.element);
        }
    });
}

// --- Terminal ---
function initTerminal(process, element) {
    process.cwd = '/home/admin'; // Initial directory
    const input = element.querySelector('.term-in');
    const output = element.querySelector('.term-out');
    const promptNode = element.querySelector('.prompt');

    // Update initial prompt
    promptNode.textContent = `admin@webos:${process.cwd}$`;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            if (cmd) {
                appendTerminalLine(output, `admin@webos:${process.cwd}$ ${cmd}`, '#cdd6f4');
                processCommand(cmd, output, process, promptNode);
            }
            input.value = '';
            output.scrollTop = output.scrollHeight;
        }
    });
}

function appendTerminalLine(outputNode, text, color = '#a6adc8') {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = color;
    outputNode.appendChild(div);
}

function processCommand(cmdLine, output, process, promptNode) {
    const args = cmdLine.split(' ');
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

    switch(cmd) {
        case 'help':
            appendTerminalLine(output, "Available commands: help, clear, date, time, whoami, pwd, ls, cd, cat, echo, uname, ps, mkdir, touch, rm, rmdir");
            break;
        case 'clear':
            output.innerHTML = '';
            break;
        case 'date':
        case 'time':
            appendTerminalLine(output, new Date().toString());
            break;
        case 'whoami':
            appendTerminalLine(output, "admin");
            break;
        case 'pwd':
            appendTerminalLine(output, process.cwd);
            break;
        case 'cd':
            if (!args[1]) {
                process.cwd = '/home/admin';
            } else {
                const res = getRes(args[1]);
                if (res.node && res.node.type === 'dir') {
                    process.cwd = res.path === '' ? '/' : res.path;
                } else {
                    appendTerminalLine(output, `cd: ${args[1]}: No such directory`, '#f38ba8');
                }
            }
            promptNode.textContent = `admin@webos:${process.cwd}$`;
            break;
        case 'ls':
            const target = args[1] ? getRes(args[1]) : getRes('.');
            if (target.node && target.node.type === 'dir') {
                const names = Object.keys(target.node.children);
                if (names.length > 0) {
                    appendTerminalLine(output, names.join('  '), '#89b4fa');
                }
            } else {
                appendTerminalLine(output, `ls: cannot access '${args[1] || ''}': No such file or directory`, '#f38ba8');
            }
            break;
        case 'cat':
            if (args[1]) {
                const res = getRes(args[1]);
                if (res.node && res.node.type === 'file') {
                    appendTerminalLine(output, res.node.content || '');
                } else if (res.node && res.node.type === 'dir') {
                    appendTerminalLine(output, `cat: ${args[1]}: Is a directory`, '#f38ba8');
                } else {
                    appendTerminalLine(output, `cat: ${args[1]}: No such file or directory`, '#f38ba8');
                }
            } else {
                appendTerminalLine(output, `cat: missing operand`, '#f38ba8');
            }
            break;
        case 'mkdir':
            modifyFs('mkdir', 'create directory', (parent, name, target) => {
                if (target) appendTerminalLine(output, `mkdir: cannot create directory '${arg}': File exists`, '#f38ba8');
                else {
                    parent.children[name] = { type: 'dir', children: {} };
                    saveVFS();
                }
            });
            break;
        case 'touch':
            modifyFs('touch', 'touch', (parent, name, target) => {
                if (!target) {
                    parent.children[name] = { type: 'file', content: '' };
                    saveVFS();
                }
            });
            break;
        case 'rm':
            modifyFs('rm', 'remove', (parent, name, target) => {
                if (!target) appendTerminalLine(output, `rm: cannot remove '${arg}': No such file or directory`, '#f38ba8');
                else if (target.type === 'dir') appendTerminalLine(output, `rm: cannot remove '${arg}': Is a directory`, '#f38ba8');
                else {
                    delete parent.children[name];
                    saveVFS();
                }
            });
            break;
        case 'rmdir':
            modifyFs('rmdir', 'remove', (parent, name, target) => {
                if (!target) appendTerminalLine(output, `rmdir: failed to remove '${arg}': No such file or directory`, '#f38ba8');
                else if (target.type !== 'dir') appendTerminalLine(output, `rmdir: failed to remove '${arg}': Not a directory`, '#f38ba8');
                else if (Object.keys(target.children).length > 0) appendTerminalLine(output, `rmdir: failed to remove '${arg}': Directory not empty`, '#f38ba8');
                else {
                    delete parent.children[name];
                    saveVFS();
                }
            });
            break;
        case 'echo':
            appendTerminalLine(output, args.slice(1).join(' '));
            break;
        case 'uname':
            appendTerminalLine(output, "WebOS Linux Simulator 1.0");
            break;
        case 'ps':
            appendTerminalLine(output, "PID   NAME         STATUS", '#f9e2af');
            processes.forEach(p => {
                appendTerminalLine(output, `${p.pid.toString().padEnd(5)} ${p.name.padEnd(12)} ${p.status}`);
            });
            break;
        default:
            appendTerminalLine(output, `bash: ${cmd}: command not found`, '#f38ba8');
    }
}

// --- Text Editor ---
function initTextEditor(element) {
    const textarea = element.querySelector('.te-textarea');
    const saveBtn = element.querySelector('#te-save');
    const clearBtn = element.querySelector('#te-clear');
    const status = element.querySelector('.te-status');

    // Load
    const saved = localStorage.getItem('webos_note');
    if (saved) textarea.value = saved;

    saveBtn.addEventListener('click', () => {
        localStorage.setItem('webos_note', textarea.value);
        status.textContent = 'Saved!';
        setTimeout(() => status.textContent = '', 2000);
    });

    clearBtn.addEventListener('click', () => {
        textarea.value = '';
        localStorage.removeItem('webos_note');
        status.textContent = 'Cleared!';
        setTimeout(() => status.textContent = '', 2000);
    });
}

// --- System Monitor ---
function updateSystemMonitor() {
    // Find all open system monitors to update them
    const smProcesses = processes.filter(p => p.appId === 'sysmonitor');
    if (smProcesses.length === 0) return;

    const usedMem = processes.reduce((acc, p) => acc + p.mem, 0);
    const memPercent = (usedMem / TOTAL_RAM) * 100;

    smProcesses.forEach(sm => {
        const tbody = sm.element.querySelector('#sm-tbody');
        const ramText = sm.element.querySelector('#sm-ram-text');
        const ramFill = sm.element.querySelector('#sm-ram-fill');

        if (!tbody || !ramText || !ramFill) return;

        ramText.textContent = `${usedMem} / ${TOTAL_RAM} MB`;
        ramFill.style.width = `${Math.min(memPercent, 100)}%`;
        
        // Color transition based on usage
        if(memPercent > 80) ramFill.style.background = 'linear-gradient(90deg, #f9e2af, #f38ba8)';
        else ramFill.style.background = 'linear-gradient(90deg, #a6e3a1, #f9e2af)';

        tbody.innerHTML = '';
        processes.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.pid}</td>
                <td>${p.name}</td>
                <td class="${p.status === 'Running' ? 'status-running' : 'status-waiting'}">${p.status}</td>
                <td>${p.mem} MB</td>
            `;
            tbody.appendChild(tr);
        });
    });
}
