const { initializeDatabase, getDb } = require('./db.js');

const SPRINT_NAME = "CNG Sprint 2026-09";
const COMPLETED_STATUSES = ['Done', 'Closed'];

const runQuery = async () => {
    try {
        await initializeDatabase();
        const db = getDb();

        const sprintDetailsStmt = db.prepare(`SELECT DISTINCT sprint_id, sprint_end_date FROM issue_sprints WHERE sprint_name = ?`);
        const sprintDetails = sprintDetailsStmt.getAsObject({1: SPRINT_NAME});
        sprintDetailsStmt.free();

        if (!sprintDetails.sprint_id) {
            console.log(`Sprint "${SPRINT_NAME}" not found.`);
            return;
        }

        const sprintId = sprintDetails.sprint_id;
        const sprintCompleteDate = sprintDetails.sprint_end_date || new Date().toISOString();
        
        console.log(`Querying classifications for Sprint: "${SPRINT_NAME}" (ID: ${sprintId})`);
        console.log(`Using completion date: ${sprintCompleteDate}`);

        const query = `
            WITH effective_resolution AS (
                SELECT 
                    i.key,
                    COALESCE(
                        i.resolutiondate,
                        (SELECT MAX(st.changed_at) 
                         FROM status_transitions st 
                         WHERE st.issue_key = i.key AND st.to_status IN (${COMPLETED_STATUSES.map(s => `'${s}'`).join(',')}))
                    ) AS effective_resolution_date
                FROM issues i
            )
            SELECT
                i.key,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM issue_sprints s
                        WHERE s.issue_key = i.key
                          AND s.sprint_id = ?
                          AND ? >= s.added_at
                          AND (s.removed_at IS NULL OR ? < s.removed_at)
                    )
                    THEN
                        CASE
                            WHEN
                                (i.status IN (${COMPLETED_STATUSES.map(s => `'${s}'`).join(',')}) AND er.effective_resolution_date <= ?)
                                OR (i.status = 'Rejected' AND er.effective_resolution_date IS NOT NULL AND er.effective_resolution_date <= ?)
                            THEN 'Completed'
                            ELSE 'Not Completed'
                        END
                    ELSE
                        CASE
                            WHEN i.status IN (${COMPLETED_STATUSES.map(s => `'${s}'`).join(',')}) OR (i.status = 'Rejected' AND er.effective_resolution_date IS NOT NULL)
                            THEN 'Completed Outside Sprint'
                            ELSE 'Removed From Sprint'
                        END
                END AS classification
            FROM
                issues i
            LEFT JOIN effective_resolution er ON i.key = er.key
            WHERE
                i.key IN (SELECT issue_key FROM issue_sprints WHERE sprint_id = ?);
        `;
        
        const results = db.exec(query, [sprintId, sprintCompleteDate, sprintCompleteDate, sprintCompleteDate, sprintCompleteDate, sprintId]);

        if (!results || results.length === 0) {
            console.log("Query returned no results.");
            return;
        }

        const classifications = {
            'Completed': null,
            'Not Completed': null,
            'Completed Outside Sprint': null,
            'Removed From Sprint': null
        };
        const allClassified = {};

        const resultValues = results[0].values;
        const resultColumns = results[0].columns;
        
        for (const rowArray of resultValues) {
            const row = {};
            resultColumns.forEach((col, i) => row[col] = rowArray[i]);

            if (!allClassified[row.classification]) {
                allClassified[row.classification] = [];
            }
            allClassified[row.classification].push(row.key);

            if (!classifications[row.classification]) {
                classifications[row.classification] = row.key;
            }
        }

        console.log("\n--- Classification Counts ---");
        for (const key in allClassified) {
            console.log(`${key}: ${allClassified[key].length}`);
        }

        console.log("\n--- Classification Examples ---");
        console.log(JSON.stringify(classifications, null, 2));

    } catch (err) {
        console.error('Error running query:', err);
    }
};

runQuery();
