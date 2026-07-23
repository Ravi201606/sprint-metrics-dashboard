# Dashboard Metrics Definitions

This document provides a clear, up-to-date definition for each of the key metrics displayed on the Engineering Metrics Dashboard.

## 1. First Pass Yield (FPY)
- **Definition**: The percentage of Stories that are successfully completed and pass all QA checks without being reopened or requiring bug-related rework.
- **Formula**: `(Number of Stories completed without linked Bugs / Total Number of completed Stories) * 100`
- **Goal**: Measures the quality of development work and the effectiveness of the initial development and testing process. A high FPY indicates a strong, efficient delivery pipeline.

## 2. Defect Injection Rate (DIR)
- **Definition**: The percentage of completed Stories that have one or more Bugs linked to them. This metric helps quantify the rate at which new defects are being introduced during the development of new features.
- **Formula**: `(Number of completed Stories with linked Bugs / Total Number of completed Stories) * 100`
- **Goal**: Provides insight into code quality and potential gaps in the development or testing phases.

## 3. Average Cycle Time
- **Definition**: Average duration from the first transition into "In Progress" until the first transition into "Done" for all completed Stories.
- **Formula**: `Average of (Timestamp of first "Done" status - Timestamp of first "In Progress" status)`
- **Goal**: Measures the average time it takes for the development team to actively work on and complete a story, providing a gauge of team velocity and efficiency.

## 4. Maintenance Tax %
- **Definition**: The percentage of total engineering hours that are spent on maintenance activities versus new feature development.
- **Formula**: `(Total hours logged on Maintenance-labeled issues / Total hours logged across all issues) * 100`
- **Goal**: Helps understand the balance between innovation and operational upkeep, ensuring the team is not overburdened by technical debt or support tasks.

## 5. Sprint Progress
- **Definition**: The percentage of Stories completed out of the total number of Stories taken into the sprint.
- **Formula**: `(Number of completed Stories / Total number of Stories in sprint) * 100`
- **Goal**: Provides a real-time snapshot of the team's progress against their sprint commitment.

## 6. Work Split by Developer (%)
- **Definition**: A visualization of how work is distributed across developers for completed Stories within the selected sprint.
- **Formula**: `(Developer's completed Story Points / Total completed Story Points) * 100`. If Story Points are unavailable, the calculation falls back to using the count of completed Stories.
- **Goal**: Helps to identify whether the sprint workload is evenly distributed or if there is a concentration of work on a few team members.
- **Developer Attribution**: The developer is identified by analyzing the issue's changelog. The logic finds the first time the story was moved to "In Progress" and attributes the work to the person who was assigned to the story at that time.
- **Sprint Attribution**: Standard sprint boundaries are used. Stories are included in the selected sprint's metric based on their standard sprint assignment in Jira, regardless of when development started, aligning closely with Jira's Sprint Report.
