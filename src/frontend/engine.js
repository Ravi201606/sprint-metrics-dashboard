document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const sprintSelect = document.getElementById('sprint-select');
    const monthSelect = document.getElementById('month-select');
    const sprintGroup = document.getElementById('sprint-filter-group');
    const monthGroup = document.getElementById('month-filter-group');
    const syncButton = document.getElementById('sync-button');
    const syncStatusText = document.getElementById('sync-status');
    const toastHost = document.getElementById('toast-host');
    const mainContent = document.querySelector('.main-content');
    const sprintTrigger = document.getElementById('sprintTrigger');
    const sprintMenu = document.getElementById('sprintMenu');
    const sprintValueLabel = sprintTrigger ? sprintTrigger.querySelector('.sprint-value') : null;
    
    const fpyValue = document.getElementById('fpy-value');
    const maintenanceTaxValue = document.getElementById('maintenance-tax-value');
    
    const devHoursBody = document.getElementById('developer-hours');
    const stagnantIssuesList = document.getElementById('stagnant-issues');
    const healthCheckList = document.getElementById('health-check');
    const sprintProgressValue = document.getElementById('sprint-progress-value');
    const sprintProgressSub = document.getElementById('sprint-progress-sub');

    // Modal Elements
    const modal = document.getElementById('data-modal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const compliantList = document.getElementById('compliant-list');
    const nonCompliantList = document.getElementById('non-compliant-list');
    const modalBody = document.getElementById('modal-body');

    // Global Chart Instances to prevent overlap/leak
    let priorityChartInstance = null;
    let workSplitChartInstance = null;

    // Sprint selector UI state
    let sprintMenuOptions = [];
    let visibleSprintOptionElements = [];
    let highlightedSprintIndex = -1;
    let sprintSearchQuery = '';
    let sprintSearchInput = null;
    let pendingSprintRenderFrame = null;

    function normalizeSprintState(state) {
        return (state || '').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'CLOSED';
    }

    function ensureSprintSelectorA11y() {
        if (!sprintTrigger || !sprintMenu) return;
        sprintTrigger.setAttribute('aria-haspopup', 'listbox');
        sprintTrigger.setAttribute('aria-expanded', 'false');
        sprintTrigger.setAttribute('aria-controls', 'sprintMenu');
        sprintMenu.setAttribute('role', 'listbox');
        sprintMenu.setAttribute('aria-label', 'Sprint options');
    }

    function buildSprintMenuOptions(sortedSprints) {
        sprintMenuOptions = sortedSprints.map(sprint => {
            const state = normalizeSprintState(sprint.state);
            return {
                id: sprint.id,
                name: sprint.name || `Sprint ${sprint.id}`,
                nameLower: (sprint.name || '').toLowerCase(),
                state,
                label: `${sprint.name} (${state === 'ACTIVE' ? 'Active' : 'Closed'})`
            };
        });
    }

    function updateSprintTriggerLabel() {
        if (!sprintValueLabel) return;
        const selectedOption = sprintSelect.options[sprintSelect.selectedIndex];
        const selectedText = selectedOption ? selectedOption.textContent : '';
        sprintValueLabel.textContent = selectedText && sprintSelect.value ? selectedText : 'Select Sprint';
    }

    function getGroupedSprintOptions() {
        const query = sprintSearchQuery.trim().toLowerCase();
        const filtered = query
            ? sprintMenuOptions.filter(sprint => sprint.nameLower.includes(query))
            : sprintMenuOptions;

        const activeSprint = filtered.find(sprint => sprint.state === 'ACTIVE') || null;
        const closedSprints = filtered.filter(sprint => sprint.state !== 'ACTIVE');

        return {
            current: activeSprint ? [activeSprint] : [],
            recent: closedSprints.slice(0, 5),
            older: closedSprints.slice(5)
        };
    }

    function createSprintSection(title, items, selectedSprintId, fragment) {
        if (!items.length) return;

        const titleNode = document.createElement('li');
        titleNode.className = 'sprint-section-title';
        titleNode.setAttribute('role', 'presentation');
        titleNode.textContent = title;
        fragment.appendChild(titleNode);

        items.forEach(sprint => {
            const option = document.createElement('li');
            option.className = 'sprint-option';
            option.dataset.value = sprint.id;
            option.id = `sprint-option-${sprint.id}`;
            option.setAttribute('role', 'option');
            option.setAttribute('tabindex', '-1');
            option.setAttribute('aria-selected', sprint.id === selectedSprintId ? 'true' : 'false');
            if (sprint.id === selectedSprintId) {
                option.classList.add('selected');
            }

            const label = document.createElement('span');
            label.textContent = sprint.name;

            const statusTag = document.createElement('span');
            statusTag.className = `sprint-tag ${sprint.state === 'ACTIVE' ? 'current' : ''}`.trim();
            statusTag.textContent = sprint.state === 'ACTIVE' ? 'Active' : 'Closed';

            option.appendChild(label);
            option.appendChild(statusTag);
            fragment.appendChild(option);
        });
    }

    function scheduleSprintMenuRender() {
        if (pendingSprintRenderFrame) {
            cancelAnimationFrame(pendingSprintRenderFrame);
        }
        pendingSprintRenderFrame = requestAnimationFrame(() => {
            pendingSprintRenderFrame = null;
            renderCustomSprintMenu();
        });
    }

    function setHighlightedSprintIndex(index, scrollIntoView = true) {
        if (highlightedSprintIndex >= 0 && visibleSprintOptionElements[highlightedSprintIndex]) {
            visibleSprintOptionElements[highlightedSprintIndex].classList.remove('is-focused');
        }

        if (index < 0 || index >= visibleSprintOptionElements.length) {
            highlightedSprintIndex = -1;
            sprintMenu.removeAttribute('aria-activedescendant');
            return;
        }

        highlightedSprintIndex = index;
        const option = visibleSprintOptionElements[highlightedSprintIndex];
        option.classList.add('is-focused');
        sprintMenu.setAttribute('aria-activedescendant', option.id);
        if (scrollIntoView) {
            option.scrollIntoView({ block: 'nearest' });
        }
    }

    function selectSprintValue(sprintId) {
        if (!sprintId) return;
        sprintSelect.value = sprintId;
        sprintSelect.dispatchEvent(new Event('change', { bubbles: true }));
        closeSprintMenu(true);
    }

    function closeSprintMenu(restoreFocus = false) {
        if (!sprintMenu || !sprintTrigger) return;
        sprintMenu.classList.remove('open');
        sprintTrigger.classList.remove('open');
        sprintTrigger.setAttribute('aria-expanded', 'false');
        sprintSearchQuery = '';
        setHighlightedSprintIndex(-1, false);
        if (restoreFocus) {
            sprintTrigger.focus();
        }
    }

    function openSprintMenu() {
        if (!sprintMenu || !sprintTrigger) return;
        if (sprintGroup.classList.contains('disabled') || sprintSelect.disabled) return;

        sprintSearchQuery = '';
        renderCustomSprintMenu();

        sprintMenu.classList.add('open');
        sprintTrigger.classList.add('open');
        sprintTrigger.setAttribute('aria-expanded', 'true');

        requestAnimationFrame(() => {
            if (sprintSearchInput) {
                sprintSearchInput.focus();
                sprintSearchInput.select();
            }
            const selectedIndex = visibleSprintOptionElements.findIndex(el => el.dataset.value === sprintSelect.value);
            setHighlightedSprintIndex(selectedIndex >= 0 ? selectedIndex : 0);
        });
    }

    function handleSprintMenuArrow(delta) {
        if (!visibleSprintOptionElements.length) return;
        const current = highlightedSprintIndex < 0 ? 0 : highlightedSprintIndex;
        const next = Math.min(
            visibleSprintOptionElements.length - 1,
            Math.max(0, current + delta)
        );
        setHighlightedSprintIndex(next);
    }

    function renderCustomSprintMenu() {
        if (!sprintMenu || !sprintSelect) return;

        sprintMenu.innerHTML = '';

        const searchWrap = document.createElement('li');
        searchWrap.className = 'sprint-menu-search';
        searchWrap.setAttribute('role', 'presentation');

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'sprint-search-input';
        searchInput.placeholder = 'Search sprint...';
        searchInput.value = sprintSearchQuery;
        searchInput.setAttribute('aria-label', 'Search sprints');
        searchWrap.appendChild(searchInput);
        sprintMenu.appendChild(searchWrap);

        const grouped = getGroupedSprintOptions();
        const selectedSprintId = sprintSelect.value;
        const fragment = document.createDocumentFragment();

        createSprintSection('Current Sprint', grouped.current, selectedSprintId, fragment);
        createSprintSection('Recent Sprints', grouped.recent, selectedSprintId, fragment);
        createSprintSection('Older Sprints', grouped.older, selectedSprintId, fragment);

        if (!fragment.childNodes.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'sprint-empty-state';
            emptyItem.setAttribute('role', 'presentation');
            emptyItem.textContent = 'No sprints match your search';
            fragment.appendChild(emptyItem);
        }

        sprintMenu.appendChild(fragment);

        sprintSearchInput = searchInput;
        visibleSprintOptionElements = Array.from(sprintMenu.querySelectorAll('.sprint-option[data-value]'));
        const selectedIndex = visibleSprintOptionElements.findIndex(el => el.dataset.value === selectedSprintId);
        setHighlightedSprintIndex(selectedIndex, false);

        sprintSearchInput.addEventListener('input', () => {
            sprintSearchQuery = sprintSearchInput.value;
            scheduleSprintMenuRender();
        });

        sprintSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                handleSprintMenuArrow(1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                handleSprintMenuArrow(-1);
            } else if (event.key === 'Enter') {
                if (highlightedSprintIndex >= 0 && visibleSprintOptionElements[highlightedSprintIndex]) {
                    event.preventDefault();
                    selectSprintValue(visibleSprintOptionElements[highlightedSprintIndex].dataset.value);
                }
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeSprintMenu(true);
            }
        });

        updateSprintTriggerLabel();
    }

    // Fixed Date reference as of Wednesday, July 22, 2026
    const REFERENCE_DATE = new Date('2026-07-22T00:00:00Z');

    function isMaintenanceTaxItem(issue) {
        const summary = (issue.fields.summary || '').toLowerCase();
        const type = issue.fields.issuetype.name;

        if (type === 'Irritant' && summary.includes('impediments')) return true;
        if (type === 'Support' && summary.includes('team support')) return true;
        if (type === 'Task' && summary.includes('project meetings')) return true;
        if (type === 'Task' && summary.includes('organization meeting')) return true;
        if (type === 'Enveloppe' && summary.includes('meetings')) return true;

        return false;
    }

    // 1. Data state and filter collections
    let issues = [];
    const sprintsMap = new Map();

    function setDashboardState(state, message = '') {
        if (!mainContent) return;

        mainContent.classList.remove('loading', 'error');
        mainContent.removeAttribute('data-status-text');
        if (state === 'loading' || state === 'error') {
            mainContent.classList.add(state);
            mainContent.setAttribute('data-status-text', message);
        }
    }

    function populateFiltersFromIssues() {
        const monthsSet = new Set();
        sprintsMap.clear();

        sprintSelect.innerHTML = '<option value="">Agile Sprints</option>';
        monthSelect.innerHTML = '<option value="">Calendar Months</option>';

        issues.forEach(issue => {
            if (issue.fields.created) {
                monthsSet.add(issue.fields.created.substring(0, 7));
            }

            const sprintArr = issue.fields.customfield_12041;
            if (sprintArr && Array.isArray(sprintArr)) {
                sprintArr.forEach(sprintStr => {
                    const idMatch = sprintStr.match(/id=(\d+)/);
                    const nameMatch = sprintStr.match(/name=(.*?)(,[\w]+=|])/);
                    const stateMatch = sprintStr.match(/state=([^,\]]+)/);
                    const startDateMatch = sprintStr.match(/startDate=([^,\]]+)/);
                    const endDateMatch = sprintStr.match(/endDate=([^,\]]+)/);

                    if (idMatch && nameMatch) {
                        const id = idMatch[1];
                        const name = nameMatch[1];
                        const state = stateMatch ? stateMatch[1] : '';
                        const startDate = startDateMatch ? startDateMatch[1] : null;
                        const endDate = endDateMatch ? endDateMatch[1] : null;
                        sprintsMap.set(id, { id, name, state, startDate, endDate });
                    }
                });
            }
        });

        const sortedSprints = Array.from(sprintsMap.values()).sort((a, b) => parseInt(b.id, 10) - parseInt(a.id, 10));
        buildSprintMenuOptions(sortedSprints);
        sortedSprints.forEach(sprint => {
            const opt = document.createElement('option');
            opt.value = sprint.id;
            opt.textContent = `${sprint.name} (${sprint.state === 'ACTIVE' ? 'Active' : 'Closed'})`;
            sprintSelect.appendChild(opt);
        });

        const sortedMonths = Array.from(monthsSet).sort().reverse();
        sortedMonths.forEach(month => {
            const opt = document.createElement('option');
            opt.value = month;
            const [year, mNum] = month.split('-');
            const dateObj = new Date(parseInt(year, 10), parseInt(mNum, 10) - 1, 1);
            const mName = dateObj.toLocaleString('default', { month: 'long' });
            opt.textContent = `${mName} ${year}`;
            monthSelect.appendChild(opt);
        });

        const activeSprint = sortedSprints.find(s => s.state === 'ACTIVE');
        if (activeSprint) {
            sprintSelect.value = activeSprint.id;
            monthSelect.value = '';
            monthSelect.disabled = true;
            monthGroup.classList.add('disabled');
        } else {
            monthSelect.disabled = false;
            monthGroup.classList.remove('disabled');
        }

        updateSprintTriggerLabel();
        renderCustomSprintMenu();
    }

    async function loadIssuesFromApi() {
        setDashboardState('loading', 'Loading issues from database...');
        try {
            const response = await fetch('/api/issues', { cache: 'no-store' });
            if (!response.ok) {
                let details = '';
                try {
                    const errorPayload = await response.json();
                    details = errorPayload && errorPayload.details ? ` ${errorPayload.details}` : '';
                } catch (parseError) {
                    details = '';
                }
                throw new Error(`Failed to fetch issues (${response.status}).${details}`);
            }

            const payload = await response.json();
            issues = Array.isArray(payload.issues) ? payload.issues : [];
            console.log('Successfully loaded JIRA Issues:', issues.length);

            populateFiltersFromIssues();
            updateDashboard();
            setDashboardState('ready');
        } catch (error) {
            console.error('Error loading issues from API:', error);
            setDashboardState('error', `Unable to load issues. ${error.message}`);
            showToast('Dashboard Load Failed', 'Could not load issues from database. See console for details.', 'error', 6500);
        }
    }

    if (sprintTrigger && sprintMenu) {
        ensureSprintSelectorA11y();

        sprintTrigger.addEventListener('click', () => {
            if (sprintMenu.classList.contains('open')) {
                closeSprintMenu();
            } else {
                openSprintMenu();
            }
        });

        sprintTrigger.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                event.preventDefault();
                openSprintMenu();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeSprintMenu(true);
            }
        });

        sprintMenu.addEventListener('click', (event) => {
            const option = event.target.closest('.sprint-option[data-value]');
            if (!option) return;
            selectSprintValue(option.dataset.value);
        });

        sprintMenu.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                handleSprintMenuArrow(1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                handleSprintMenuArrow(-1);
            } else if (event.key === 'Enter') {
                if (highlightedSprintIndex >= 0 && visibleSprintOptionElements[highlightedSprintIndex]) {
                    event.preventDefault();
                    selectSprintValue(visibleSprintOptionElements[highlightedSprintIndex].dataset.value);
                }
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeSprintMenu(true);
            }
        });

        document.addEventListener('click', (event) => {
            if (!sprintGroup.contains(event.target)) {
                closeSprintMenu();
            }
        });
    }

    // 3. Mutually Exclusive Filter States
    sprintSelect.addEventListener('change', () => {
        if (sprintSelect.value) {
            monthSelect.value = '';
            monthSelect.disabled = true;
            monthGroup.classList.add('disabled');
        } else {
            monthSelect.disabled = false;
            monthGroup.classList.remove('disabled');
        }
        updateSprintTriggerLabel();
        renderCustomSprintMenu();
        updateDashboard();
    });

    monthSelect.addEventListener('change', () => {
        if (monthSelect.value) {
            sprintSelect.value = '';
            sprintSelect.disabled = true;
            sprintGroup.classList.add('disabled');
            closeSprintMenu();
        } else {
            sprintSelect.disabled = false;
            sprintGroup.classList.remove('disabled');
        }
        updateSprintTriggerLabel();
        renderCustomSprintMenu();
        updateDashboard();
    });

    let syncPollHandle = null;
    let syncStartedAt = null;

    function formatSyncDuration(totalSeconds) {
        const safeSeconds = Math.max(0, totalSeconds || 0);
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const seconds = safeSeconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    function formatTimestamp(isoValue) {
        if (!isoValue) return 'unknown time';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return 'unknown time';
        return date.toLocaleString();
    }

    function setSyncStatus(message, tone = 'idle') {
        if (!syncStatusText) return;
        syncStatusText.textContent = message;
        syncStatusText.classList.remove('idle', 'running', 'success', 'error');
        syncStatusText.classList.add(tone);
    }

    function showToast(title, message, tone = 'info', timeoutMs = 4200) {
        if (!toastHost) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${tone}`;

        const heading = document.createElement('p');
        heading.className = 'toast-title';
        heading.textContent = title;

        const detail = document.createElement('p');
        detail.className = 'toast-message';
        detail.textContent = message;

        toast.appendChild(heading);
        toast.appendChild(detail);
        toastHost.appendChild(toast);

        window.setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-6px)';
            toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            window.setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 220);
        }, timeoutMs);
    }

    function resetSyncButton() {
        syncButton.disabled = false;
        syncButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>`;
        syncButton.title = 'Synchronize JIRA Data';
        syncButton.setAttribute('aria-label', 'Synchronize JIRA data');
    }

    function setSyncButtonProgress(secondsElapsed) {
        const timerLabel = formatSyncDuration(secondsElapsed);
        syncButton.innerHTML = `
            <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" fill="none"/>
                <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor"/>
            </svg>`;
        syncButton.title = `Synchronizing... ${timerLabel}`;
        syncButton.setAttribute('aria-label', `Synchronizing ${timerLabel}`);
        setSyncStatus(`Synchronizing ${timerLabel}`, 'running');
    }

    function applySyncStatus(status, currentElapsedSeconds = 0) {
        if (status && status.running) {
            syncButton.disabled = true;
            setSyncButtonProgress(Math.max(0, currentElapsedSeconds));
            return;
        }

        resetSyncButton();
        if (status && status.success === true) {
            const finishedLabel = formatTimestamp(status.finishedAt);
            setSyncStatus(`Last sync successful at ${finishedLabel}`, 'success');
            return;
        }

        if (status && status.success === false) {
            const finishedLabel = formatTimestamp(status.finishedAt);
            const reason = status.error ? ` (${status.error})` : '';
            setSyncStatus(`Last sync failed at ${finishedLabel}${reason}`, 'error');
            return;
        }

        setSyncStatus('Sync idle. Ready.', 'idle');
    }

    function ensureSyncPolling() {
        if (!syncPollHandle) {
            syncPollHandle = setInterval(pollSyncStatus, 3000);
        }
    }

    function stopSyncPolling() {
        if (syncPollHandle) {
            clearInterval(syncPollHandle);
            syncPollHandle = null;
        }
    }

    async function pollSyncStatus() {
        try {
            const response = await fetch('/sync/status', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Status endpoint failed with ${response.status}`);
            }
            const payload = await response.json();
            const status = payload.status || {};
            const elapsed = typeof status.durationSeconds === 'number'
                ? status.durationSeconds
                : (syncStartedAt ? Math.floor((Date.now() - syncStartedAt) / 1000) : 0);

            applySyncStatus(status, elapsed);

            if (status.running) {
                return;
            }

            stopSyncPolling();
            if (status.success) {
                showToast('Sync Complete', 'Jira data synchronized. Refreshing dashboard...', 'success', 2200);
                window.setTimeout(() => window.location.reload(), 900);
                return;
            }

            const detail = status.error ? `Reason: ${status.error}` : 'The harvester returned a non-zero exit.';
            showToast('Sync Failed', `${detail} Using cached data.`, 'error', 6200);
            resetSyncButton();
            applySyncStatus(status, elapsed);
        } catch (error) {
            console.error('Sync status polling failed:', error);
            stopSyncPolling();
            showToast('Status Check Failed', 'Unable to verify sync status. Please check logs and retry.', 'error', 6200);
            resetSyncButton();
            setSyncStatus('Unable to verify sync status.', 'error');
        }
    }

    async function refreshSyncStatusSnapshot() {
        try {
            const response = await fetch('/sync/status', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Status endpoint failed with ${response.status}`);
            }
            const payload = await response.json();
            const status = payload.status || {};
            const elapsed = typeof status.durationSeconds === 'number' ? status.durationSeconds : 0;
            applySyncStatus(status, elapsed);

            if (status.running) {
                syncStartedAt = status.startedAt ? Date.parse(status.startedAt) : Date.now();
                ensureSyncPolling();
            }
        } catch (error) {
            console.error('Initial sync status check failed:', error);
            setSyncStatus('Sync status unavailable.', 'error');
            showToast('Sync Status Unavailable', 'Could not reach /sync/status. Showing best known state.', 'info', 4200);
        }
    }

    // 4. Initiate Sync Click handler
    syncButton.addEventListener('click', async () => {
        syncButton.disabled = true;
        syncStartedAt = Date.now();
        setSyncButtonProgress(0);
        setSyncStatus('Starting sync...', 'running');

        try {
            const response = await fetch('/sync', { method: 'GET', cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Sync endpoint failed with ${response.status}`);
            }

            const payload = await response.json();
            if (payload && payload.status && payload.status.startedAt) {
                syncStartedAt = Date.parse(payload.status.startedAt);
            }

            await pollSyncStatus();
            ensureSyncPolling();
        } catch (error) {
            console.error('Sync failed to start:', error);
            stopSyncPolling();
            showToast('Sync Start Failed', 'Unable to start Jira sync. See console logs for details.', 'error', 6200);
            resetSyncButton();
            setSyncStatus('Sync start failed.', 'error');
        }
    });

    refreshSyncStatusSnapshot();

    // Style for CSS animation spin
    const style = document.createElement('style');
    style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);

    // Normalizes display names so "MOHAMED EL BOUTI" and "Sarath Subburaj" render
    // consistently, without mangling names that are already correctly cased.
    function formatDeveloperName(name) {
        if (!name) return name;
        const isShouty = name === name.toUpperCase() && /[A-Z]/.test(name);
        if (!isShouty) return name;
        return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    function getDeveloperForStory(issue) {
        if (!issue.changelog || !issue.changelog.histories) {
            return issue.fields.assignee ? formatDeveloperName(issue.fields.assignee.displayName) : null;
        }

        const allChanges = [];
        issue.changelog.histories.forEach(h => {
            h.items.forEach(item => {
                if (item.field === 'status' || item.field === 'assignee') {
                    allChanges.push({
                        field: item.field,
                        fromString: item.fromString,
                        toString: item.toString,
                        to: item.to,
                        created: new Date(h.created)
                    });
                }
            });
        });
        allChanges.sort((a, b) => a.created - b.created);

        let firstInProgressDate = null;
        for (const change of allChanges) {
            if (change.field === 'status' && change.toString.toLowerCase().includes('in progress')) {
                firstInProgressDate = change.created;
                break;
            }
        }

        if (firstInProgressDate) {
            let lastAssignee = null;
            for (const change of allChanges) {
                if (change.created > firstInProgressDate) break;
                if (change.field === 'assignee') {
                    lastAssignee = change.toString;
                }
            }
            if (lastAssignee) return lastAssignee;
        }

        // Fallback logic
        let firstDoneDate = null;
        for (const change of allChanges) {
            if (change.field === 'status' && change.toString.toLowerCase() === 'done') {
                firstDoneDate = change.created;
                break;
            }
        }

        if (firstDoneDate) {
            let lastAssigneeBeforeDone = null;
            for (const change of allChanges) {
                if (change.created > firstDoneDate) break;
                if (change.field === 'assignee') {
                    lastAssigneeBeforeDone = change.toString;
                }
            }
            if (lastAssigneeBeforeDone) return formatDeveloperName(lastAssigneeBeforeDone);
        }
        
        return issue.fields.assignee ? formatDeveloperName(issue.fields.assignee.displayName) : null;
    }

    // 5. Main Dashboard Render Engine
    // Returns the sprint ID immediately before the given one (by numeric ID order),
    // or null if there isn't one in the currently loaded sprint set.
    function getPreviousSprintId(selectedSprintId) {
        if (!selectedSprintId || !sprintsMap.has(selectedSprintId)) return null;
        const ids = Array.from(sprintsMap.keys()).map(id => parseInt(id, 10)).sort((a, b) => a - b);
        const idx = ids.indexOf(parseInt(selectedSprintId, 10));
        return idx > 0 ? String(ids[idx - 1]) : null;
    }

    // Persists the current sprint's value for a metric and, if the immediately
    // preceding sprint's value is known, renders a real % delta badge.
    // If there's no prior sprint to compare against, the badge is hidden rather
    // than showing a fabricated number.
    function applyTrend(metricKey, trendElId, currentValue, selectedSprintId, higherIsBetter = true) {
        const trendEl = document.getElementById(trendElId);
        if (!trendEl) return;
        const badgeEl = trendEl.querySelector('.trend-badge');

        if (!selectedSprintId || currentValue === null || currentValue === undefined || isNaN(currentValue)) {
            trendEl.style.visibility = 'hidden';
            return;
        }

        let store = {};
        try {
            store = JSON.parse(localStorage.getItem('sprintMetricHistory') || '{}');
        } catch (e) {
            store = {};
        }
        store[metricKey] = store[metricKey] || {};
        store[metricKey][selectedSprintId] = currentValue;
        localStorage.setItem('sprintMetricHistory', JSON.stringify(store));

        const prevSprintId = getPreviousSprintId(selectedSprintId);
        const prevValue = prevSprintId ? store[metricKey][prevSprintId] : undefined;

        if (prevValue === undefined || prevValue === null) {
            trendEl.style.visibility = 'hidden';
            return;
        }

        const delta = prevValue === 0
            ? (currentValue > 0 ? 100 : 0)
            : ((currentValue - prevValue) / Math.abs(prevValue)) * 100;

        const improved = higherIsBetter ? delta >= 0 : delta <= 0;
        trendEl.classList.toggle('trend-up', improved);
        trendEl.classList.toggle('trend-down', !improved);
        trendEl.style.visibility = 'visible';
        if (badgeEl) {
            const arrow = delta >= 0 ? '↑' : '↓';
            badgeEl.textContent = `${arrow} ${Math.abs(delta).toFixed(1)}%`;
        }
    }

    function updateDashboard() {
        const selectedSprintId = sprintSelect.value;
        const selectedMonth = monthSelect.value;
        const selectedSprint = sprintsMap.get(selectedSprintId);
        
        let filteredIssues = issues;

        // Apply mutually exclusive filters
        if (selectedSprintId) {
            filteredIssues = issues.filter(issue => {
                const sprints = issue.fields.customfield_12041;
                if (!sprints || !Array.isArray(sprints)) return false;
                return sprints.some(sprintStr => {
                    const match = sprintStr.match(/id=(\d+)/);
                    return match && match[1] === selectedSprintId;
                });
            });
        } else if (selectedMonth) {
            filteredIssues = issues.filter(issue => {
                return issue.fields.created && issue.fields.created.startsWith(selectedMonth);
            });
        }

        const maintenanceIssues = filteredIssues.filter(issue => {
            return issue.fields.labels && issue.fields.labels.includes('Maintenance') && issue.fields.issuetype.name !== 'Manual Test';
        });
        const otherIssues = filteredIssues.filter(issue => {
            return (!issue.fields.labels || !issue.fields.labels.includes('Maintenance')) && issue.fields.issuetype.name !== 'Manual Test';
        });

        // --- RENDER WIDGET: Maintenance Tax % ---
        try {
            let totalSeconds = 0;
            let maintenanceSeconds = 0;
            
            filteredIssues.forEach(issue => {
                if (issue.fields.worklog && issue.fields.worklog.worklogs) {
                    issue.fields.worklog.worklogs.forEach(w => {
                        totalSeconds += w.timeSpentSeconds || 0;
                    });
                }
            });

            maintenanceIssues.forEach(issue => {
                if (issue.fields.worklog && issue.fields.worklog.worklogs) {
                    issue.fields.worklog.worklogs.forEach(w => {
                        maintenanceSeconds += w.timeSpentSeconds || 0;
                    });
                }
            });

            const maintenanceTaxPercentage = totalSeconds > 0 ? Math.round((maintenanceSeconds / totalSeconds) * 100) : 0;
            document.getElementById('maintenance-tax-value').textContent = `${maintenanceTaxPercentage}%`;
            document.getElementById('maintenance-tax-sub').textContent = `${(maintenanceSeconds / 3600).toFixed(1)} of ${(totalSeconds / 3600).toFixed(1)} total hours`;
            applyTrend('maintenance', 'maintenance-trend', maintenanceTaxPercentage, selectedSprintId, false);

            const maintenanceBtn = document.querySelector('button[data-metric="maintenance"]');
            maintenanceBtn.onclick = () => {
                const maintenanceRawData = { compliant: maintenanceIssues };
                showModal('Maintenance Tax Items', maintenanceRawData, true);
            };

        } catch(e) {
            console.error("Error rendering Maintenance Tax widget:", e);
            document.getElementById('maintenance-tax-value').textContent = 'Error';
        }

        // Sub-filter completed vs active issues
        const completedIssues = otherIssues.filter(i => {
            const name = i.fields.status.name;
            return name === 'Done' || name === 'Closed';
        });
        const activeIssues = otherIssues.filter(i => {
            const name = i.fields.status.name;
            return name !== 'Done' && name !== 'Closed' && !name.toLowerCase().includes('reject');
        });

        // --- RENDER WIDGET: First Pass Yield (FPY) % ---
        try {
            const completedStories = completedIssues.filter(i => i.fields.issuetype.name === 'Story' && i.fields.status.name === 'Done');
            const fpyRawData = { compliant: [], nonCompliant: [] };
            completedStories.forEach(story => {
                let hasLinkedBug = false;
                if (story.fields.issuelinks) {
                    story.fields.issuelinks.forEach(link => {
                        const linkedIssue = link.outwardIssue || link.inwardIssue;
                        if (linkedIssue && linkedIssue.fields.issuetype.name === 'Bug') {
                            hasLinkedBug = true;
                        }
                    });
                }
                if (hasLinkedBug) {
                    fpyRawData.nonCompliant.push(story);
                } else {
                    fpyRawData.compliant.push(story);
                }
            });
            
            const fpyCompliantCount = fpyRawData.compliant.length;
            const fpyPercentage = completedStories.length > 0 ? Math.round((fpyCompliantCount / completedStories.length) * 100) : 0;
            document.getElementById('fpy-value').textContent = `${fpyPercentage}%`;
            document.getElementById('fpy-sub').textContent = `${fpyCompliantCount} of ${completedStories.length} stories passed`;
            applyTrend('fpy', 'fpy-trend', fpyPercentage, selectedSprintId, true);
            
            const fpyBtn = document.querySelector('button[data-metric="fpy"]');
            fpyBtn.onclick = () => showModal('First Pass Yield (Stories)', fpyRawData);

        } catch (e) {
            console.error("Error rendering FPY widget:", e);
            document.getElementById('fpy-value').textContent = 'Error';
        }

        // --- RENDER WIDGET: Defect Injection Rate (DIR) % ---
        try {
            let storiesWithBugs = 0;
            const completedStories = completedIssues.filter(i => i.fields.issuetype.name === 'Story' && (i.fields.status.name === 'Done' || i.fields.status.name === 'Closed'));
            const dirRawData = { compliant: [], nonCompliant: [] };
            completedStories.forEach(story => {
                let hasLinkedBug = false;
                if (story.fields.issuelinks) {
                    story.fields.issuelinks.forEach(link => {
                        const linkedIssue = link.outwardIssue || link.inwardIssue;
                        if (linkedIssue && linkedIssue.fields.issuetype.name === 'Bug') {
                            hasLinkedBug = true;
                        }
                    });
                }
                // Push the story once regardless of how many bugs are linked to it
                if (hasLinkedBug) {
                    dirRawData.nonCompliant.push(story);
                } else {
                    dirRawData.compliant.push(story);
                }
            });
            storiesWithBugs = dirRawData.nonCompliant.length;
            const dirPercentage = completedStories.length > 0 ? Math.round((storiesWithBugs / completedStories.length) * 100) : 0;
            document.getElementById('dir-value').textContent = `${dirPercentage}%`;
            document.getElementById('dir-sub').textContent = `${storiesWithBugs} of ${completedStories.length} stories with bugs`;
            applyTrend('dir', 'dir-trend', dirPercentage, selectedSprintId, false);
            
            const dirBtn = document.querySelector('button[data-metric="dir"]');
            dirBtn.onclick = () => showModal('Defect Injection Rate', dirRawData);
        } catch (e) {
            console.error("Error rendering DIR widget:", e);
            document.getElementById('dir-value').textContent = 'Error';
        }

        // --- RENDER WIDGET: Average Sprint Velocity ---
        try {
            let totalStoryPoints = 0;
            const completedStories = completedIssues.filter(i => i.fields.issuetype.name === 'Story' && (i.fields.status.name === 'Done' || i.fields.status.name === 'Closed'));
            completedStories.forEach(story => {
                totalStoryPoints += story.fields.customfield_10016 || 0;
            });
            document.getElementById('velocity-value').textContent = totalStoryPoints;
            applyTrend('velocity', 'velocity-trend', totalStoryPoints, selectedSprintId, true);
        } catch (e) {
            console.error("Error rendering Average Sprint Velocity widget:", e);
            document.getElementById('velocity-value').textContent = 'Error';
        }

        // --- RENDER WIDGET: Average Cycle Time ---
        try {
            let totalCycleTime = 0;
            let completedStoriesWithCycleTime = 0;
            const cycleTimeData = [];

            const completedStoriesForCycleTime = completedIssues.filter(i => i.fields.issuetype.name === 'Story');

            completedStoriesForCycleTime.forEach(issue => {
                let firstInProgressDate = null;
                let firstDoneDate = null;

                if (issue.changelog && issue.changelog.histories) {
                    const statusChanges = [];
                    issue.changelog.histories.forEach(h => {
                        h.items.forEach(item => {
                            if (item.field === 'status') {
                                statusChanges.push({
                                    toString: item.toString,
                                    created: new Date(h.created)
                                });
                            }
                        });
                    });

                    statusChanges.sort((a, b) => a.created - b.created);

                    for (const change of statusChanges) {
                        if (change.toString.toLowerCase().includes('in progress') && !firstInProgressDate) {
                            firstInProgressDate = change.created;
                        }
                        if (change.toString.toLowerCase() === 'done' && !firstDoneDate) {
                            firstDoneDate = change.created;
                        }
                    }
                }

                if (firstInProgressDate && firstDoneDate) {
                    const cycleTime = (firstDoneDate - firstInProgressDate) / (1000 * 60 * 60 * 24);
                    if (cycleTime >= 0) {
                        totalCycleTime += cycleTime;
                        completedStoriesWithCycleTime++;
                        cycleTimeData.push({ 
                            key: issue.key, 
                            summary: issue.fields.summary, 
                            inProgressDate: firstInProgressDate.toISOString().split('T')[0],
                            doneDate: firstDoneDate.toISOString().split('T')[0],
                            cycleTime: cycleTime.toFixed(2) 
                        });
                    }
                }
            });

            const avgCycleTime = completedStoriesWithCycleTime > 0 ? (totalCycleTime / completedStoriesWithCycleTime).toFixed(2) : 0;
            document.getElementById('cycle-time-value').textContent = `${avgCycleTime} days`;
            document.getElementById('cycle-time-sub').textContent = `Total: ${totalCycleTime.toFixed(0)}d / ${completedStoriesWithCycleTime} stories`;
            applyTrend('cycle-time', 'cycle-time-trend', avgCycleTime, selectedSprintId, false);

            const cycleTimeBtn = document.querySelector('button[data-metric="cycle-time"]');
            cycleTimeBtn.onclick = () => {
                modalTitle.textContent = 'Cycle Time per Story';
                modalBody.style.gridTemplateColumns = '1fr';
                nonCompliantList.parentElement.style.display = 'none';
                compliantList.parentElement.querySelector('h3').textContent = 'Completed Stories';
                
                let tableHtml = `<table class="dev-table"><thead><tr><th>Issue</th><th>In Progress Date</th><th>Done Date</th><th>Cycle Time (days)</th></tr></thead><tbody>`;
                cycleTimeData.forEach(item => {
                    const summary = item.summary ? (item.summary.length > 60 ? item.summary.substring(0, 57) + '...' : item.summary) : '';
                    tableHtml += `<tr>
                        <td><a href="https://jira.worldline-solutions.com/browse/${item.key}" target="_blank">${item.key}</a><br><small>${summary}</small></td>
                        <td>${item.inProgressDate}</td>
                        <td>${item.doneDate}</td>
                        <td><strong>${item.cycleTime}</strong></td>
                    </tr>`;
                });
                tableHtml += `</tbody></table>`;
                compliantList.innerHTML = tableHtml;

                modal.style.display = 'block';
            };

        } catch (e) {
            console.error("Error rendering Average Cycle Time widget:", e);
            document.getElementById('cycle-time-value').textContent = 'Error';
        }

        // --- RENDER WIDGET: Sprint Progress ---
        try {
            const takenStories = otherIssues.filter(i => i.fields.issuetype.name === 'Story');
            const doneStories = takenStories.filter(i => i.fields.status.name === 'Done' || i.fields.status.name === 'Closed');
            
            const doneCount = doneStories.length;
            const takenCount = takenStories.length;
            
            const percentage = takenCount > 0 ? Math.round((doneCount / takenCount) * 100) : 0;
            
            sprintProgressValue.textContent = `${percentage}%`;
            sprintProgressSub.textContent = `${doneCount} of ${takenCount} stories completed`;
            applyTrend('sprint-progress', 'sprint-progress-trend', percentage, selectedSprintId, true);

            const sprintProgressBtn = document.querySelector('button[data-metric="sprint-progress"]');
            sprintProgressBtn.onclick = () => {
                const notCompletedStories = takenStories.filter(story => !doneStories.includes(story));
                const sprintProgressData = { compliant: doneStories, nonCompliant: notCompletedStories };
                showModal('Sprint Progress (Stories)', sprintProgressData, false, 'Completed Stories', 'Not Completed Stories');
            };

        } catch (e) {
            console.error("Error rendering Sprint Progress widget:", e);
            sprintProgressValue.textContent = `Error`;
        }

        // --- RENDER CHART: Work Split by Developer (%) ---
        try {
            const devWork = {};
            const completedStories = completedIssues.filter(i => i.fields.issuetype.name === 'Story');

            completedStories.forEach(story => {
                const devName = getDeveloperForStory(story);
                if (!devName) return;

                if (!devWork[devName]) {
                    devWork[devName] = { storyPoints: 0, storyCount: 0, issues: [] };
                }
                devWork[devName].storyPoints += story.fields.customfield_10016 || 0;
                devWork[devName].storyCount++;
                devWork[devName].issues.push(story.key);
            });

            const totalStoryPoints = Object.values(devWork).reduce((sum, dev) => sum + dev.storyPoints, 0);
            const totalStories = completedStories.length;
            const useStoryPoints = totalStoryPoints > 0;

            const workSplitData = Object.entries(devWork).map(([developer, data]) => {
                const percentage = useStoryPoints 
                    ? (totalStoryPoints > 0 ? (data.storyPoints / totalStoryPoints) * 100 : 0)
                    : (totalStories > 0 ? (data.storyCount / totalStories) * 100 : 0);
                return { developer, ...data, percentage };
            });

            workSplitData.sort((a, b) => b.percentage - a.percentage);

            const insightEl = document.getElementById('work-split-insight');
            if (workSplitData.length > 0) {
                const topContributorPercentage = workSplitData[0].percentage;
                if (topContributorPercentage > 45) {
                    insightEl.textContent = 'High workload concentration on one developer.';
                } else if (topContributorPercentage > 30) {
                    insightEl.textContent = 'Moderate imbalance detected.';
                } else {
                    insightEl.textContent = 'Work distribution is balanced.';
                }
            } else {
                insightEl.textContent = 'No completed stories with assigned developers in this scope.';
            }

            if (workSplitChartInstance) workSplitChartInstance.destroy();
            const ctxWorkSplit = document.getElementById('work-split-chart').getContext('2d');
            workSplitChartInstance = new Chart(ctxWorkSplit, {
                type: 'bar',
                data: {
                    labels: workSplitData.map(d => d.developer),
                    datasets: [{
                        label: 'Work Split %',
                        data: workSplitData.map(d => d.percentage),
                        backgroundColor: '#10b981',
                        borderColor: '#064e3b',
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const devData = workSplitData[context.dataIndex];
                                    const value = useStoryPoints ? `${devData.storyPoints} SP` : `${devData.storyCount} stories`;
                                    return `${devData.percentage.toFixed(1)}% (${value})`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            // Scale to the largest share + 20% headroom (capped at 100) instead
                            // of always fixing the axis to 100%, so bars actually use the
                            // available chart width when work is spread across many developers.
                            max: Math.min(100, Math.ceil((Math.max(...workSplitData.map(d => d.percentage), 0) * 1.2) / 10) * 10 || 10),
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    }
                }
            });

            const workSplitBtn = document.querySelector('button[data-metric="work-split"]');
            workSplitBtn.onclick = () => {
                modalTitle.textContent = 'Work Split by Developer';
                modalBody.style.gridTemplateColumns = '1fr';
                nonCompliantList.parentElement.style.display = 'none';
                compliantList.parentElement.querySelector('h3').textContent = 'Sprint Contribution';

                let tableHtml = `<table class="dev-table"><thead><tr><th>Developer</th><th>Completed Stories</th>`;
                if (useStoryPoints) {
                    tableHtml += `<th>Story Points</th>`;
                }
                tableHtml += `<th>% of Work</th><th>Issue Keys</th></tr></thead><tbody>`;

                workSplitData.forEach(dev => {
                    tableHtml += `<tr>
                        <td><strong>${dev.developer}</strong></td>
                        <td>${dev.storyCount}</td>`;
                    if (useStoryPoints) {
                        tableHtml += `<td>${dev.storyPoints}</td>`;
                    }
                    tableHtml += `<td>${dev.percentage.toFixed(1)}%</td>
                        <td>${dev.issues.join(', ')}</td>
                    </tr>`;
                });
                tableHtml += `</tbody></table>`;
                compliantList.innerHTML = tableHtml;

                modal.style.display = 'block';
            };

        } catch (e) {
            console.error("Error rendering Work Split chart:", e);
        }

        // --- RENDER CHART: Issue Distribution by Priority ---
        try {
            const priorityCounts = { High: 0, Medium: 0, Low: 0 };
            otherIssues.forEach(issue => {
                const p = issue.fields.priority ? issue.fields.priority.name : '';
                if (p === 'P0' || p === 'P1' || p === 'P2') priorityCounts.High++;
                else if (p === 'P3' || p === 'P4') priorityCounts.Medium++;
                else priorityCounts.Low++;
            });
            if (priorityChartInstance) priorityChartInstance.destroy();
            const ctxPriority = document.getElementById('priority-chart').getContext('2d');
            priorityChartInstance = new Chart(ctxPriority, {
                type: 'doughnut',
                data: {
                    labels: ['High', 'Medium', 'Low'],
                    datasets: [{
                        data: [priorityCounts.High, priorityCounts.Medium, priorityCounts.Low],
                        backgroundColor: ['#dc2626', '#f59e0b', '#10b981'],
                        borderWidth: 2, borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: '#334155',
                                font: { size: 12, weight: '600' },
                                padding: 15,
                                // Include count + % in the legend text itself so priority
                                // isn't communicated by color alone (color-blind accessibility).
                                generateLabels: (chart) => {
                                    const data = chart.data.datasets[0].data;
                                    const total = data.reduce((a, b) => a + b, 0) || 1;
                                    return chart.data.labels.map((label, i) => ({
                                        text: `${label}: ${data[i]} (${Math.round((data[i] / total) * 100)}%)`,
                                        fillStyle: chart.data.datasets[0].backgroundColor[i],
                                        strokeStyle: chart.data.datasets[0].backgroundColor[i],
                                        index: i
                                    }));
                                }
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Error rendering priority chart:", e);
        }

        // --- RENDER TABLE: Developer Logged Hours ---
        try {
            const developerLoggedSeconds = {};
            otherIssues.forEach(issue => {
                if (issue.fields.worklog && issue.fields.worklog.worklogs) {
                    issue.fields.worklog.worklogs.forEach(w => {
                        if (selectedSprint && selectedSprint.startDate && selectedSprint.endDate) {
                            const worklogStarted = new Date(w.started);
                            const sprintStartDate = new Date(selectedSprint.startDate);
                            const sprintEndDate = new Date(selectedSprint.endDate);
                            if (worklogStarted >= sprintStartDate && worklogStarted <= sprintEndDate) {
                                const devName = w.author ? formatDeveloperName(w.author.displayName) : 'Unknown Developer';
                                developerLoggedSeconds[devName] = (developerLoggedSeconds[devName] || 0) + (w.timeSpentSeconds || 0);
                            }
                        } else {
                            const devName = w.author ? formatDeveloperName(w.author.displayName) : 'Unknown Developer';
                            developerLoggedSeconds[devName] = (developerLoggedSeconds[devName] || 0) + (w.timeSpentSeconds || 0);
                        }
                    });
                }
            });
            const sortedDevHoursList = Object.entries(developerLoggedSeconds).sort((a, b) => b[1] - a[1]);
            devHoursBody.innerHTML = '';
            if (sortedDevHoursList.length > 0) {
                sortedDevHoursList.forEach(([dev, seconds]) => {
                    const hours = (seconds / 3600).toFixed(1);
                    const row = document.createElement('tr');
                    row.innerHTML = `<td><strong>${dev}</strong></td><td>${hours} hrs</td>`;
                    devHoursBody.appendChild(row);
                });
            } else {
                devHoursBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#94a3b8; padding-top:20px;">No hours logged in scope</td></tr>`;
            }
        } catch (e) {
            console.error("Error rendering developer hours table:", e);
        }

        // --- RENDER LIST: Longest Active/Stagnant Issues ---
        try {
            const stagnantIssuesListArray = [];
            activeIssues.forEach(issue => {
                let lastChangeDate = new Date(issue.fields.created);
                if (issue.changelog && issue.changelog.histories) {
                    issue.changelog.histories.forEach(h => {
                        h.items.forEach(item => {
                            if (item.field === 'status') {
                                const hDate = new Date(h.created);
                                if (hDate > lastChangeDate) lastChangeDate = hDate;
                            }
                        });
                    });
                }
                const diffMs = REFERENCE_DATE - lastChangeDate;
                const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                stagnantIssuesListArray.push({
                    key: issue.key, summary: issue.fields.summary || 'No summary',
                    status: issue.fields.status.name, days: diffDays
                });
            });
            stagnantIssuesListArray.sort((a, b) => b.days - a.days);
            stagnantIssuesList.innerHTML = '';
            const topStagnantIssues = stagnantIssuesListArray.slice(0, 10);
            if (topStagnantIssues.length > 0) {
                topStagnantIssues.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'stagnant-item';
                    const isDanger = item.days > 30 ? 'danger' : '';
                    li.innerHTML = `<div class="stagnant-header"><span class="issue-key">${item.key}</span><span class="stagnant-days ${isDanger}">${item.days} days stagnant</span></div><div class="issue-summary" title="${item.summary}">${item.summary}</div><div class="issue-status">Status: <strong>${item.status}</strong></div>`;
                    stagnantIssuesList.appendChild(li);
                });
            } else {
                stagnantIssuesList.innerHTML = `<li style="text-align:center; color:#94a3b8; padding-top:20px;">No active issues in scope</li>`;
            }
        } catch (e) {
            console.error("Error rendering stagnant issues list:", e);
        }

        // --- RENDER LIST: Automated Agile Health Check ---
        try {
            const recommendations = [];
            
            // FPY check
            const fpyPercentage = parseFloat(document.getElementById('fpy-value').textContent) || 0;
            if (fpyPercentage < 80) {
                recommendations.push({ type: 'warning', icon: '⚠️', title: 'Low First Pass Yield', text: `First Pass Yield is low at ${fpyPercentage}%. Stories are failing QA and requiring re-work. Address core-developer quality handoff.` });
            } else {
                recommendations.push({ type: 'success', icon: '✅', title: 'Healthy Quality Flow', text: `Excellent First Pass Yield (${fpyPercentage}%)! The team is delivering highly compliant stories that clear testing on first pass.` });
            }
            
            const criticalStagnantCount = Array.from(stagnantIssuesList.children).filter(li => li.querySelector('.stagnant-days.danger')).length;
            if (criticalStagnantCount > 0) {
                recommendations.push({ type: 'warning', icon: '⚠️', title: 'Stagnant Tasks Alert', text: `There are ${criticalStagnantCount} active issues stagnating for over 30 days. Recommend review in the next standup to address resource blocks.` });
            }
            healthCheckList.innerHTML = '';
            if (recommendations.length > 0) {
                recommendations.forEach(r => {
                    const li = document.createElement('li');
                    li.className = `reco-item ${r.type}`;
                    li.innerHTML = `<span class="reco-icon">${r.icon}</span><div class="reco-text"><strong>${r.title}</strong>${r.text}</div>`;
                    healthCheckList.appendChild(li);
                });
            } else {
                 healthCheckList.innerHTML = `<li class="reco-item success"><span class="reco-icon">✅</span><div class="reco-text"><strong>System Healthy</strong>All metrics are within healthy operational parameters.</div></li>`;
            }
        } catch (e) {
            console.error("Error rendering health check list:", e);
        }
    }

    // --- MODAL LOGIC ---
    function showModal(title, data, isSingleList = false, compliantHeader = 'Compliant Issues', nonCompliantHeader = 'Non-Compliant Issues') {
        modalTitle.textContent = title;

        if (isSingleList) {
            modalBody.style.gridTemplateColumns = '1fr';
            nonCompliantList.parentElement.style.display = 'none';
            compliantList.parentElement.querySelector('h3').textContent = 'Included Items';
        } else {
            modalBody.style.gridTemplateColumns = '1fr 1fr';
            nonCompliantList.parentElement.style.display = 'block';
            compliantList.parentElement.querySelector('h3').innerHTML = `${compliantHeader} (<span id="compliant-count">0</span>)`;
            nonCompliantList.parentElement.querySelector('h3').innerHTML = `${nonCompliantHeader} (<span id="non-compliant-count">0</span>)`;
        }
        
        // Populate compliant list
        compliantList.innerHTML = '';
        data.compliant.forEach(item => {
            const li = document.createElement('li');
            const summary = item.fields.summary;
            let displayText = `<a href="https://jira.worldline-solutions.com/browse/${item.key}" target="_blank">${item.key}</a>`;
            if (summary) {
                const truncatedSummary = summary.length > 80 ? summary.substring(0, 77) + '...' : summary;
                displayText += ` — ${truncatedSummary}`;
            }
            li.innerHTML = displayText;
            compliantList.appendChild(li);
        });
        if (!isSingleList) document.getElementById('compliant-count').textContent = data.compliant.length;

        // Populate non-compliant list
        nonCompliantList.innerHTML = '';
        if (!isSingleList) {
            data.nonCompliant.forEach(item => {
                const li = document.createElement('li');
                const summary = item.fields.summary;
                let displayText = `<a href="https://jira.worldline-solutions.com/browse/${item.key}" target="_blank">${item.key}</a>`;
                if (summary) {
                    const truncatedSummary = summary.length > 80 ? summary.substring(0, 77) + '...' : summary;
                    displayText += ` — ${truncatedSummary}`;
                }
                li.innerHTML = displayText;
                nonCompliantList.appendChild(li);
            });
            document.getElementById('non-compliant-count').textContent = data.nonCompliant.length;
        }

        modal.style.display = 'block';
    }

    modalCloseBtn.onclick = () => { modal.style.display = 'none'; };
    window.onclick = (event) => { if (event.target == modal) modal.style.display = 'none'; };

    // 6. Run on first load
    loadIssuesFromApi();
});