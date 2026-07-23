# Sprint Metrics & Definitions Knowledge Base

This document serves as the official reference and knowledge base for the metrics calculated by the Integrale Sprint Metrics Dashboard.

---

## 1. Velocity
*   **Definition (Standard Scrum):** The sum of story points for all backlog items **successfully completed** (delivered and accepted as meeting the Definition of Done) during a sprint.
*   **Agile Significance:** Velocity is a measure of delivered value. In Scrum, incomplete, rejected, or carried-over tasks are **never** counted towards Velocity. This prevents double-counting effort, avoids artificial velocity inflation, and ensures predictability for release planning.
*   **Our Dashboard Implementation:**
    *   **Scrum Velocity (Delivered):** Sum of story points for issues in a `done` category or final statuses (`Ready For Release`, `Test Passed`).
        $$\text{Scrum Velocity (Delivered)} = \sum (\text{Story Points of Completed Issues})$$
    *   **Attempted Story Points (Gross):** Sum of story points for all issues assigned to the sprint, regardless of completion status. This helps visualize the gap between planned vs. delivered points.
        $$\text{Attempted Velocity (Gross)} = \sum (\text{Story Points of All Assigned Issues})$$

---

## 2. Throughput
*   **Definition:** The absolute count of user stories, defects, and tasks successfully completed during the sprint.
*   **Throughput by Priority / Severity:** Completed issues are segmented by their priority to help visualize the impact and urgency of delivered work:
    *   **Blocker:** Absolute count of completed issues with `Blocker` priority.
    *   **Critical:** Absolute count of completed issues with `Critical` priority.
    *   **Major:** Absolute count of completed issues with `Major` or `High` priority.
    *   **Medium:** Absolute count of completed issues with `Medium` priority.
    *   **Minor:** Absolute count of completed issues with `Low`, `Trivial`, `Minor`, or undefined priority.
*   **Agile Significance:** While Velocity measures the size/complexity of delivered work (via Story Points), Throughput measures the volume of work items closed. Comparing Throughput and Velocity helps identify if the team is completing many small items or a few large items. Segmenting by priority allows teams to understand if they are delivering high-priority value or focusing on lower-importance tasks.

---

## 3. Defect Injection Rate (DIR)
*   **Definition:** The percentage of completed stories that have one or more linked `Bug` issues.
*   **Formula:**
    $$\text{DIR} = \left( \frac{\text{Number of Completed Stories with Linked Defects}}{\text{Total Number of Completed Stories}} \right) \times 100$$
*   **Agile Significance:** DIR measures the quality of incoming work and development quality. A high Defect Injection Rate suggests that either pre-sprint analysis was weak, or code quality in development is introducing significant instability.

### Environmental Defect Injection Rates
To provide deeper quality visibility, defects are automatically classified into three distinct gates based on parent task metadata, summaries, and reporter rules:

1.  **Production Defects:** Any defect whose summary or parent task summary contains the word `"production"`.
2.  **System Test (ST) Defects:** Any non-production defect that has the "affects versions" field populated, or was raised by a known ST QA resource (reporter name contains `"sapna"` or `"chatta"`).
3.  **User Acceptance Testing (UAT) Defects:** Any non-production, non-ST defect raised by a UAT resource (reporter name contains `"craig"`, `"swapnil"`, or `"rashmi"`), or whose summary or parent task summary contains `"uat"`.

From these categories, environmental injection rates are calculated:
*   **ST Defect Injection Rate (ST-DIR):**
    $$\text{ST-DIR} = \left( \frac{\text{Number of ST Defects in Sprint}}{\text{Total Number of Issues in Sprint}} \right) \times 100$$
*   **UAT Defect Injection Rate (UAT-DIR):**
    $$\text{UAT-DIR} = \left( \frac{\text{Number of UAT Defects in Sprint}}{\text{Total Number of Issues in Sprint}} \right) \times 100$$
*   **Production Defect Injection Rate (Prod-DIR):**
    $$\text{Prod-DIR} = \left( \frac{\text{Number of Production Defects in Sprint}}{\text{Total Number of Issues in Sprint}} \right) \times 100$$

*   **Agile Significance of Environmental DIR:** Segmenting defect injection rates by environment helps identify where quality gates are failing. A high ST-DIR is expected as QA verifies code, but a high UAT-DIR indicates that quality is leaking past System Test, and a high Prod-DIR indicates critical quality escape to live production systems.

---

## 4. First Pass Yield (FPY)
*   **Definition (Proxy Implementation):** The percentage of completed stories that have no linked `Bug` issues. This serves as a proxy for the true FPY, which would require tracking testing rework hours.
*   **Formula:**
    $$\text{FPY (Proxy)} = \left( \frac{\text{Completed Stories without Linked Defects}}{\text{Total Completed Stories}} \right) \times 100$$
*   **Dashboard Presentation:** Displays the overall FPY percentage, along with the total count of completed stories.
*   **Agile Significance:** FPY is a primary indicator of engineering quality. A low FPY suggests that stories are often delivered with defects, which wastes capacity and increases cycle time.

---

## 5. Average Cycle Time
*   **Definition:** The average time (in days) it takes for an issue to go from active development to completion.
*   **Formula:**
    $$\text{Avg Cycle Time} = \frac{\sum (\text{Done Timestamp} - \text{First In-Progress Timestamp})}{\text{Number of Completed Issues}}$$
*   **Agile Significance:** Cycle time measures process efficiency. Shorter cycle times mean the team is delivering value faster and responding quickly to feedback.

---

## 6. Rework Rate
*   **NOTE: This metric is not currently implemented in the dashboard.**
*   **Definition:** The percentage of total sprint effort hours spent fixing bugs or performing rework, rather than writing new features.
*   **Formula:**
    $$\text{Rework Rate} = \left( \frac{\text{Dev Rework} + \text{Testing Rework} + \text{Change Rework}}{\text{Total Hours Booked}} \right) \times 100$$
    *Where Total Hours Booked includes Dev Effort, Testing Effort, Dev Review, Test Review, Intake, and Total Rework.*
*   **Agile Significance:** This measures waste in your process. High rework rates (typically $> 15\%$) mean the team is spending significant capacity on correcting errors instead of delivering new value.
*   **Implementation Note:** This metric cannot be implemented with the current data from Jira, as it requires worklogs to be categorized by effort type (e.g., "Dev Rework", "Testing Rework").

---

## 7. Advanced Process Efficiency Metrics

### A. Internal First Pass Yield
*   **Definition:** The percentage of sprint defects that successfully passed code review on the first attempt without being returned for developer rework.
*   **Formula:**
    $$\text{Internal First Pass Yield} = \left( \frac{\text{Total Sprint Defects} - \text{Defects that Failed Review}}{\text{Total Sprint Defects}} \right) \times 100$$
    *Where "Defects that Failed Review" is the count of unique defects that transitioned from 'Awaiting Review' back to 'In Progress'.*
*   **Dashboard Presentation:** Displays the Internal FPY percentage, with the total number of unique defects that failed review (the review failure/ping-pong count) displayed below.
*   **Agile Significance:** High Internal FPY indicates strong pre-review alignment, robust peer review processes, and high-quality initial coding. Low Internal FPY suggests requirement misalignment, lack of development self-testing, or developer-reviewer friction, indicating pipeline waste.

### B. Average Review Latency
*   **Definition:** The average duration (in days) that issues spend in the `Awaiting Review` status.
*   **Formula:**
    $$\text{Avg Review Latency} = \frac{\sum (\text{Exit Awaiting Review Timestamp} - \text{Enter Awaiting Review Timestamp})}{\text{Number of Reviewed Issues}}$$
    *If an issue is currently in 'Awaiting Review', its latency is calculated as the time elapsed from entering the status to the current timestamp.*
*   **Agile Significance:** Long review latency represents a bottleneck where work is stalled waiting for peer review or approval. This increases overall cycle time and delays the feedback loop.

### C. Status Stagnation
*   **Definition:** The duration (in days) that an active, non-completed/non-rejected task has remained unchanged in its current status.
*   **Formula:**
    $$\text{Stagnation Days} = \text{Current Timestamp} - \text{Last Status Change Timestamp}$$
    *Only calculated for active tasks (statuses other than Done, Ready For Release, Test Passed, or containing 'reject').*
*   **Agile Significance:** Status stagnation identifies stuck or orphaned tasks. High stagnation suggests blockers, resource constraints, or lack of momentum, and prompts immediate Scrum standup attention.

---

## 8. Capacity & Booking Efficiency Metrics

*   **Definition:** Metrics that track the alignment between the team's planned work availability (capacity) and the actual recorded effort (booked hours) during a sprint.

### A. Available Capacity Hours
*   **Definition:** The total number of productive hours available to the team during the sprint, calculated based on the team's capacity in man-days and standard daily working hours.
*   **Formula:**
    $$\text{Available Capacity Hours} = \text{Sprint Capacity (Man-Days)} \times \text{Working Hours Per Day}$$
    *Where standard Working Hours Per Day defaults to 7.4 if not explicitly set in the sprint capacity details.*

### B. Capacity Variance
*   **Definition:** The variance between actual recorded work effort (hours booked) and planned capacity. It indicates whether the team was under-booked (shortfall) or over-booked relative to their available time.
*   **Formula:**
    $$\text{Capacity Variance} = \text{Total Hours Booked} - \text{Available Capacity Hours}$$
*   **Agile Significance & Dashboard Interpretation:**
    *   **Negative Variance (Shortfall):** Indicates that the team booked fewer hours than their available capacity, highlighting a shortfall in tracked or productive hours (colored in red).
    *   **Positive Variance:** Indicates that the team logged more hours than their baseline available capacity, which may suggest overtime, under-estimated capacity, or intensive crunch periods (colored in green).

### C. Booking Efficiency
*   **Definition:** The ratio of actual recorded sprint effort hours to the total available capacity hours, expressed as a percentage.
*   **Formula:**
    $$\text{Booking Efficiency} = \left( \frac{\text{Total Hours Booked}}{\text{Available Capacity Hours}} \right) \times 100$$
*   **Agile Significance:** Booking Efficiency measures capacity utilization. If booking efficiency is too low ($< 80\%$), it suggests that either team member attendance was lower than planned, work was not fully tracked, or sprint tasks were blocked. If booking efficiency is extremely high ($> 110\%$), it indicates capacity over-utilization, which is unsustainable and leads to team burnout.

---

## 9. Invisible Effort (Ad-Hoc Overhead Ratio)

*   **Definition:** The proportion of total recorded sprint effort spent on administrative, process, or ad-hoc activities rather than direct development or testing of specific Jira project feature tasks.
*   **Formula:**
    $$\text{Invisible Effort Ratio} = \left( \frac{\text{Total Invisible / Ad-Hoc Effort Hours}}{\text{Total Hours Booked}} \right) \times 100$$
*   **Categories of Invisible Effort:**
    To enable high-fidelity auditing, invisible effort is classified into 5 main categories (aligned with the subtasks of the main tracking task `MTSOINTTIM-7286`) plus a fallback category:
    1.  **Meetings / Syncs:** Standups, sprint planning, backlog grooming, demos, retrospectives, alignments, and other synchronous team calls.
    2.  **Ad-hoc Support:** Dealing with live production incidents, hotfixes, manual UAT queries, or unplanned user-facing issues.
    3.  **Downtime & Infra:** Work delays due to testing environment outages, database/hardware issues, server/CI pipeline downtime, or internal tooling bugs.
    4.  **Dependencies & Handoffs:** Blockers and delays waiting on cross-team dependency handoffs, architectural approvals, or third-party integrations.
    5.  **Deployment & Releases:** Preparing release builds, writing deployment notes, coordinating manual setup steps, and executing the actual environment deployments.
    6.  **Other Ad Hoc:** Miscellaneous overhead tasks that do not fit into the above classifications.
*   **Agile Significance:** Invisible Effort quantifies the "meeting tax" and administrative drag on development capacity. It explains why a team might miss direct sprint feature delivery despite being highly active and booking substantial hours. Tracking this helps Scrum Masters protect developer focus time and optimize team meetings.
