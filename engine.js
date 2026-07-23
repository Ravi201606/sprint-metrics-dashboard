document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const sprintSelect = document.getElementById('sprint-select');
    const monthSelect = document.getElementById('month-select');
    const sprintGroup = document.getElementById('sprint-filter-group');
    const monthGroup = document.getElementById('month-filter-group');
    const syncButton = document.getElementById('sync-button');
    
    const fpyValue = document.getElementById('fpy-value');
    const maintenanceTaxValue = document.getElementById('maintenance-tax-value');
    
    const devHoursBody = document.getElementById('developer-hours');
    const stagnantIssuesList = document.getElementById('stagnant-issues');
    const healthCheckList = document.getElementById('health-check');
    const storyProgressBar = document.getElementById('story-progress-bar');
    const storyProgressText = document.getElementById('story-progress-text');

    // Modal Elements
    const modal = document.getElementById('data-modal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const compliantList = document.getElementById('compliant-list');
    const nonCompliantList = document.getElementById('non-compliant-list');
    const modalBody = document.getElementById('modal-body');

    // Global Chart Instances to prevent overlap/leak
    let priorityChartInstance = null;

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

    // 1. Initial Data check
    const issues = (window.jiraStore && window.jiraStore.issues) ? window.jiraStore.issues : [];
    console.log('Successfully loaded JIRA Issues:', issues.length);

    // 2. Populate Filters (Sprints & Months)
    const sprintsMap = new Map();
    const monthsSet = new Set();

    try {
        issues.forEach(issue => {
            // Extract Months from issue created date
            if (issue.fields.created) {
                monthsSet.add(issue.fields.created.substring(0, 7)); // 'YYYY-MM'
            }

            // Extract Sprints from customfield_12041
            const sprintArr = issue.fields.customfield_12041;
            if (sprintArr && Array.isArray(sprintArr)) {
                sprintArr.forEach(sprintStr => {
                    const idMatch = sprintStr.match(/id=(\d+)/);
                    const nameMatch = sprintStr.match(/name=([^,\]]+)/);
                    const stateMatch = sprintStr.match(/state=([^,\]]+)/);
                    
                    if (idMatch && nameMatch) {
                        const id = idMatch[1];
                        const name = nameMatch[1];
                        const state = stateMatch ? stateMatch[1] : '';
                        sprintsMap.set(id, { id, name, state });
                    }
                });
            }
        });

        // Sort Sprints chronologically by ID (larger ID means newer sprint)
        const sortedSprints = Array.from(sprintsMap.values()).sort((a, b) => parseInt(b.id) - parseInt(a.id));
        sortedSprints.forEach(sprint => {
            const opt = document.createElement('option');
            opt.value = sprint.id;
            opt.textContent = `${sprint.name} (${sprint.state === 'ACTIVE' ? 'Active' : 'Closed'})`;
            sprintSelect.appendChild(opt);
        });

        // Sort Months in descending order
        const sortedMonths = Array.from(monthsSet).sort().reverse();
        sortedMonths.forEach(month => {
            const opt = document.createElement('option');
            opt.value = month;
            // Format YYYY-MM as readable Month YYYY (e.g. "July 2026")
            const [year, mNum] = month.split('-');
            const dateObj = new Date(parseInt(year), parseInt(mNum) - 1, 1);
            const mName = dateObj.toLocaleString('default', { month: 'long' });
            opt.textContent = `${mName} ${year}`;
            monthSelect.appendChild(opt);
        });

        // Set default selection to the active sprint, if one exists
        const activeSprint = sortedSprints.find(s => s.state === 'ACTIVE');
        if (activeSprint) {
            sprintSelect.value = activeSprint.id;
            // Disable the month selector to reflect the default sprint selection
            monthSelect.value = '';
            monthSelect.disabled = true;
            monthGroup.classList.add('disabled');
        }
    } catch (e) {
        console.error("Error populating filters:", e);
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
        updateDashboard();
    });

    monthSelect.addEventListener('change', () => {
        if (monthSelect.value) {
            sprintSelect.value = '';
            sprintSelect.disabled = true;
            sprintGroup.classList.add('disabled');
        } else {
            sprintSelect.disabled = false;
            sprintGroup.classList.remove('disabled');
        }
        updateDashboard();
    });

    // 4. Initiate Sync Click handler
    syncButton.addEventListener('click', () => {
        syncButton.disabled = true;
        syncButton.innerHTML = `
            <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" fill="none"/>
                <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor"/>
            </svg> Synchronizing...`;
            
        fetch('/sync')
            .then(res => {
                if (res.ok) {
                    alert('Sync successfully completed! Loading updated metrics dashboard.');
                    window.location.reload();
                } else {
                    throw new Error('Sync endpoint failed');
                }
            })
            .catch(error => {
                console.error('Sync failed:', error);
                alert('Jira data synchronization failed. Operating with cached data. See console logs.');
                syncButton.disabled = false;
                syncButton.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg> Initiate Sync`;
            });
    });

    // Style for CSS animation spin
    const style = document.createElement('style');
    style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);

    // 5. Main Dashboard Render Engine
    function updateDashboard() {
        const selectedSprintId = sprintSelect.value;
        const selectedMonth = monthSelect.value;
        
        let filteredIssues = issues;

        // Apply mutually exclusive filters
        if (selectedSprintId) {
            filteredIssues = issues.filter(issue => {
                const sprints = issue.fields.customfield_12041;
                if (!sprints || !Array.isArray(sprints)) return false;
                // CORRECTED: Check if any sprint in the issue's history matches the selected one
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

        // Sub-filter completed vs active issues
        const completedIssues = filteredIssues.filter(i => {
            const name = i.fields.status.name;
            return name === 'Done' || name === 'Closed';
        });
        const activeIssues = filteredIssues.filter(i => {
            const name = i.fields.status.name;
            return name !== 'Done' && name !== 'Closed' && !name.toLowerCase().includes('reject');
        });

        // --- RENDER WIDGET: First Pass Yield (FPY) % ---
        try {
            let fpyCompliantCount = 0;
            const completedStatuses = ['Done'];
            const completedStories = filteredIssues.filter(i => i.fields.issuetype.name === 'Story' && completedStatuses.includes(i.fields.status.name));

            const fpyRawData = { compliant: [], nonCompliant: [] }; // Using the same modal structure
            completedStories.forEach(story => {
                let hasLinkedBug = false;
                if (story.fields.issuelinks) {
                    story.fields.issuelinks.forEach(link => {
                        const linkedIssue = link.outwardIssue || link.inwardIssue;
                        if (linkedIssue && linkedIssue.fields.issuetype.name === 'Bug') hasLinkedBug = true;
                    });
                }
                if (hasLinkedBug) fpyRawData.nonCompliant.push(story); else fpyRawData.compliant.push(story);
            });
            
            fpyCompliantCount = fpyRawData.compliant.length;
            const fpyPercentage = completedStories.length > 0 ? Math.round((fpyCompliantCount / completedStories.length) * 100) : 0;
            fpyValue.textContent = `${fpyPercentage}%`;
            document.getElementById('fpy-sub').textContent = `${fpyCompliantCount} of ${completedStories.length} stories passed`;
            
            const fpyBtn = document.querySelector('button[data-metric="fpy"]');
            fpyBtn.onclick = () => showModal('First Pass Yield (Stories)', fpyRawData);

        } catch (e) {
            console.error("Error rendering FPY widget:", e);
            fpyValue.textContent = 'Error';
        }

        // --- RENDER WIDGET: Maintenance Tax % ---
        try {
            let totalSeconds = 0;
            let maintenanceSeconds = 0;
            const maintenanceRawData = { compliant: [], nonCompliant: [] }; // Re-using compliant for "included"
            
            filteredIssues.forEach(issue => {
                let issueSeconds = 0;
                if (issue.fields.worklog && issue.fields.worklog.worklogs) {
                    issue.fields.worklog.worklogs.forEach(w => { issueSeconds += w.timeSpentSeconds || 0; });
                }
                totalSeconds += issueSeconds;
                if (isMaintenanceTaxItem(issue)) {
                    maintenanceSeconds += issueSeconds;
                    maintenanceRawData.compliant.push({ key: issue.key, summary: issue.fields.summary });
                }
            });
            const maintenanceTaxPercentage = totalSeconds > 0 ? Math.round((maintenanceSeconds / totalSeconds) * 100) : 0;
            maintenanceTaxValue.textContent = `${maintenanceTaxPercentage}%`;
            document.getElementById('maintenance-tax-sub').textContent = `${Math.round(maintenanceSeconds/3600)} of ${Math.round(totalSeconds/3600)} total hours`;
            
            const maintenanceBtn = document.querySelector('button[data-metric="maintenance"]');
            maintenanceBtn.onclick = () => showModal('Maintenance Tax Items', maintenanceRawData, true);

        } catch(e) {
            console.error("Error rendering Maintenance Tax widget:", e);
            maintenanceTaxValue.textContent = 'Error';
        }


        // --- RENDER WIDGET: Stories Taken vs. Done ---
        try {
            const takenStories = filteredIssues.filter(i => i.fields.issuetype.name === 'Story');
            const doneStories = takenStories.filter(i => i.fields.status.name === 'Done' || i.fields.status.name === 'Closed');
            
            const doneCount = doneStories.length;
            const takenCount = takenStories.length;
            
            const percentage = takenCount > 0 ? (doneCount / takenCount) * 100 : 0;
            
            storyProgressBar.style.width = `${percentage}%`;
            storyProgressText.textContent = `${doneCount} of ${takenCount} stories done (${Math.round(percentage)}%)`;

        } catch (e) {
            console.error("Error rendering Stories Taken vs. Done widget:", e);
            storyProgressText.textContent = `Error rendering widget`;
        }

        // --- RENDER CHART: Issue Distribution by Priority ---
        try {
            const priorityCounts = { High: 0, Medium: 0, Low: 0 };
            filteredIssues.forEach(issue => {
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
                        backgroundColor: ['#ef4444', '#d97706', '#10b981'],
                        borderWidth: 2, borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '65%',
                    plugins: { legend: { position: 'right', labels: { color: '#475569', font: { size: 12, weight: '500' }, padding: 15 } } }
                }
            });
        } catch (e) {
            console.error("Error rendering priority chart:", e);
        }

        // --- RENDER TABLE: Developer Logged Hours ---
        try {
            const developerLoggedSeconds = {};
            filteredIssues.forEach(issue => {
                if (issue.fields.worklog && issue.fields.worklog.worklogs) {
                    issue.fields.worklog.worklogs.forEach(w => {
                        const devName = w.author ? w.author.displayName : 'Unknown Developer';
                        developerLoggedSeconds[devName] = (developerLoggedSeconds[devName] || 0) + (w.timeSpentSeconds || 0);
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
            const fpyPercentage = parseFloat(fpyValue.textContent) || 0;
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
    function showModal(title, data, isSingleList = false) {
        modalTitle.textContent = title;

        if (isSingleList) {
            modalBody.style.gridTemplateColumns = '1fr';
            nonCompliantList.parentElement.style.display = 'none';
            compliantList.parentElement.querySelector('h3').textContent = 'Included Items';
        } else {
            modalBody.style.gridTemplateColumns = '1fr 1fr';
            nonCompliantList.parentElement.style.display = 'block';
            compliantList.parentElement.querySelector('h3').innerHTML = `Compliant Issues (<span id="compliant-count">0</span>)`;
        }
        
        // Populate compliant list
        compliantList.innerHTML = '';
        data.compliant.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="https://jira.worldline-solutions.com/browse/${item.key}" target="_blank">${item.key}</a>: ${item.summary}`;
            compliantList.appendChild(li);
        });
        if (!isSingleList) document.getElementById('compliant-count').textContent = data.compliant.length;

        // Populate non-compliant list
        nonCompliantList.innerHTML = '';
        if (!isSingleList) {
            data.nonCompliant.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<a href="https://jira.worldline-solutions.com/browse/${item.key}" target="_blank">${item.key}</a>: ${item.summary}`;
                nonCompliantList.appendChild(li);
            });
            document.getElementById('non-compliant-count').textContent = data.nonCompliant.length;
        }

        modal.style.display = 'block';
    }

    modalCloseBtn.onclick = () => { modal.style.display = 'none'; };
    window.onclick = (event) => { if (event.target == modal) modal.style.display = 'none'; };

    // 6. Run on first load
    updateDashboard();
});