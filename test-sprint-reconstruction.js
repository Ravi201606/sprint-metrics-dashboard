const assert = require('assert');
const fs = require('fs');

// The sprint reconstruction logic, extracted and adapted from harvester.js
function reconstructSprintHistory(issue, sprintNameMap) {
    const issueSprints = [];

    if (!issue.changelog || !issue.changelog.histories) {
        return issueSprints;
    }

    const sprintEvents = [];
    issue.changelog.histories.forEach(h => {
        h.items.forEach(item => {
            if (item.field === 'Sprint') {
                sprintEvents.push({
                    created: new Date(h.created),
                    from: item.from,
                    to: item.to,
                    fromString: item.fromString,
                    toString: item.toString
                });
            }
        });
    });

    sprintEvents.sort((a, b) => a.created - b.created);

    for (const event of sprintEvents) {
        const oldIds = event.from ? event.from.split(',').map(s => s.trim()) : [];
        const newIds = event.to ? event.to.split(',').map(s => s.trim()) : [];

        const addedIds = newIds.filter(id => !oldIds.includes(id));
        const removedIds = oldIds.filter(id => !newIds.includes(id));

        for (const removedId of removedIds) {
            const sprint = issueSprints.reverse().find(s => s.sprint_id === removedId && !s.removed_at);
            if (sprint) {
                sprint.removed_at = event.created.toISOString();
            }
            issueSprints.reverse(); // reverse back
        }
        
        for (const addedId of addedIds) {
            const sprintName = sprintNameMap[addedId] ? sprintNameMap[addedId].name : '';

            issueSprints.push({
                issue_key: issue.key,
                sprint_id: addedId,
                sprint_name: sprintName,
                added_at: event.created.toISOString(),
                removed_at: null
            });
        }
    }
    
    // Handle fallback case where sprint was assigned on creation
    const changelogSprintIds = new Set(issueSprints.map(s => s.sprint_id));
    if (issue.fields.customfield_12041) {
        issue.fields.customfield_12041.forEach(sprintString => {
            const idMatch = sprintString.match(/id=(\d+)/);
            if (idMatch) {
                const sprintId = idMatch[1];
                if (!changelogSprintIds.has(sprintId)) {
                    const sprintName = sprintNameMap[sprintId] ? sprintNameMap[sprintId].name : '';
                    if (issue.key && issue.fields.created) {
                        issueSprints.push({
                            issue_key: issue.key,
                            sprint_id: sprintId,
                            sprint_name: sprintName,
                            added_at: new Date(issue.fields.created).toISOString(),
                            removed_at: null
                        });
                    }
                }
            }
        });
    }
    return issueSprints;
}


function buildGlobalSprintMap(allIssues) {
    const sprintNameMap = {};
    const sprintNameRegex = /name=([^,]+)/;
    const sprintIdRegex = /id=(\d+)/;
    const sprintEndDateRegex = /endDate=([^,\]]+)/;
    const sprintStartDateRegex = /startDate=([^,\]]+)/;
    const sprintCompleteDateRegex = /completeDate=([^,\]]+)/;
    const sprintStateRegex = /state=([^,\]]+)/;

    for (const issue of allIssues) {
        if (issue && issue.fields && issue.fields.customfield_12041) {
            issue.fields.customfield_12041.forEach(sprintString => {
                const idMatch = sprintString.match(sprintIdRegex);
                const nameMatch = sprintString.match(sprintNameRegex);
                const endDateMatch = sprintString.match(sprintEndDateRegex);
                const startDateMatch = sprintString.match(sprintStartDateRegex);
                const completeDateMatch = sprintString.match(sprintCompleteDateRegex);
                const stateMatch = sprintString.match(sprintStateRegex);
                if (idMatch && nameMatch) {
                    sprintNameMap[idMatch[1]] = {
                        name: nameMatch[1],
                        endDate: endDateMatch ? endDateMatch[1] : null,
                        startDate: startDateMatch ? startDateMatch[1] : null,
                        completeDate: completeDateMatch ? completeDateMatch[1] : null,
                        state: stateMatch ? stateMatch[1] : null,
                    };
                }
            });
        }
    }
    return sprintNameMap;
}

function runTests() {
    const issues = JSON.parse(fs.readFileSync('test-fixtures/sample-issues.json', 'utf-8'));
    const results = {};
    const sprintNameMap = buildGlobalSprintMap(issues);

    for (const issue of issues) {
        if (!issue || !issue.key) continue;
        results[issue.key] = reconstructSprintHistory(issue, sprintNameMap);
    }

    // --- Assertions for ODCNG-47783 ---
    const odcn_47783_sprints = results['ODCNG-47783'];

    console.log('--- Testing ODCNG-47783 ---');

    // Assertion 1: Check for 3 distinct sprint intervals
    try {
        assert.strictEqual(odcn_47783_sprints.length, 3, 'Should have 3 sprint intervals');
        console.log('PASS: Correct number of sprint intervals found.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }

    // Assertion 2: Check for 06-10 removal
    const removal_06_10 = odcn_47783_sprints.find(s => s.sprint_id === '71616');
     try {
        assert.ok(removal_06_10, 'Should find the sprint interval for sprint 71616');
        assert.strictEqual(new Date(removal_06_10.added_at).toISOString().startsWith('2026-06-10'), true, 'Should have an added date on 06-10');
        console.log('PASS: Correct add on 06-10 found.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }

    // Assertion 3: Check for 06-23 re-add
    const readd_06_23 = odcn_47783_sprints.find(s => s.sprint_id === '71617' && new Date(s.added_at).toISOString().startsWith('2026-06-23'));
    try {
        assert.ok(readd_06_23, 'Should find the re-added sprint interval for sprint 71617');
        console.log('PASS: Correct re-add on 06-23 found.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }


    // Assertion 4: Check for 07-15 add to Sprint 10
    const add_07_15 = odcn_47783_sprints.find(s => s.sprint_id === '71618' && new Date(s.added_at).toISOString().startsWith('2026-07-15'));
     try {
        assert.ok(add_07_15, 'Should find the sprint interval for sprint 71618 added on 07-15');
        assert.strictEqual(add_07_15.sprint_name, 'CNG Sprint 2026-10', 'Should be added to "CNG Sprint 2026-10"');
        console.log('PASS: Correct add to Sprint 10 on 07-15 found.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }

    // --- Assertions for ODCNG-49190 ---
    const odcn_49190_sprints = results['ODCNG-49190'];
    console.log('--- Testing ODCNG-49190 ---');
    const sprint_71618 = odcn_49190_sprints.find(s => s.sprint_id === '71618');
    try {
        assert.ok(sprint_71618, 'Should find the sprint interval for sprint 71618');
        assert.strictEqual(sprint_71618.sprint_name, 'CNG Sprint 2026-10', 'Should have sprint_name "CNG Sprint 2026-10"');
        assert.strictEqual(new Date(sprint_71618.added_at).toISOString().startsWith('2026-07-15'), true, 'Should have an added date on 07-15');
        assert.strictEqual(new Date(sprint_71618.removed_at).toISOString().startsWith('2026-07-23'), true, 'Should have a removal date on 07-23');
        console.log('PASS: Correct sprint name, added_at, and removed_at for sprint 71618.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }

    // --- Assertions for ODCNG-48715 ---
    const odcn_48715_sprints = results['ODCNG-48715'];
    console.log('--- Testing ODCNG-48715 ---');
    try {
        assert.strictEqual(odcn_48715_sprints.length, 0, 'Should have 0 sprint intervals');
        console.log('PASS: Correct number of sprint intervals found.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }

    // --- Assertions for ODCNG-32882 ---
    const odcn_32882_sprints = results['ODCNG-32882'];
    console.log('--- Testing ODCNG-32882 ---');
    try {
        assert.strictEqual(odcn_32882_sprints.length, 7, 'Should have 7 sprint intervals');
        console.log('PASS: Correct number of sprint intervals found.');
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
    }
}

runTests();