/**
 * User Testing Infrastructure — Define tasks, evaluate completion, generate reports.
 *
 * Enables dealerships to create structured user testing scenarios (e.g., "Find a
 * vehicle under $30k", "Schedule a test drive") and measure success rates,
 * completion times, and drop-off points.
 */

import type { ReplayEvent } from "./session-replay";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "abandoned";

export interface TestTask {
  id: string;
  title: string;
  description: string;
  /** URL pattern the user must visit to complete the task */
  success_url_pattern: string;
  /** CSS selector the user must click (optional) */
  success_selector?: string;
  /** Maximum seconds before task is considered failed */
  max_duration_seconds: number;
  /** Display order */
  order: number;
}

export interface UserTest {
  id: string;
  dealer_id: string;
  title: string;
  description: string;
  tasks: TestTask[];
  created_at: string;
  updated_at: string;
  active: boolean;
  total_participants: number;
}

export interface TaskResult {
  task_id: string;
  status: TaskStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  /** Pages visited during this task */
  pages_visited: string[];
  /** Number of clicks during this task */
  click_count: number;
  /** Number of errors encountered */
  error_count: number;
}

export interface TestRecording {
  id: string;
  test_id: string;
  session_id: string;
  participant_id: string;
  started_at: string;
  completed_at: string | null;
  task_results: TaskResult[];
  user_agent: string;
}

export interface TestReport {
  test_id: string;
  test_title: string;
  total_participants: number;
  overall_completion_rate: number;
  avg_total_duration_ms: number;
  task_reports: TaskReport[];
  drop_off_points: DropOffPoint[];
}

export interface TaskReport {
  task_id: string;
  task_title: string;
  completion_rate: number;
  avg_duration_ms: number;
  median_duration_ms: number;
  success_count: number;
  fail_count: number;
  abandon_count: number;
  avg_clicks: number;
}

export interface DropOffPoint {
  task_id: string;
  task_title: string;
  /** Most common page where users dropped off */
  page: string;
  drop_off_count: number;
  /** Percentage of participants who dropped off here */
  percentage: number;
}

/* -------------------------------------------------------------------------- */
/*  Test creation                                                              */
/* -------------------------------------------------------------------------- */

export interface CreateTestConfig {
  dealer_id: string;
  title: string;
  description: string;
  tasks: Omit<TestTask, "id">[];
}

/**
 * Create a new user test from a configuration object.
 */
export function createTest(config: CreateTestConfig): UserTest {
  const now = new Date().toISOString();
  const testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const tasks: TestTask[] = config.tasks.map((t, i) => ({
    ...t,
    id: `task-${testId}-${i}`,
    order: t.order ?? i,
  }));

  return {
    id: testId,
    dealer_id: config.dealer_id,
    title: config.title,
    description: config.description,
    tasks,
    created_at: now,
    updated_at: now,
    active: true,
    total_participants: 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Task completion evaluation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate whether a user completed a task based on their session events.
 *
 * Checks:
 *  - Did they visit a URL matching the success pattern?
 *  - Did they click the success selector (if specified)?
 *  - Did they complete within the time limit?
 */
export function evaluateTaskCompletion(
  task: TestTask,
  events: ReplayEvent[],
  startTs: number,
): TaskResult {
  const pages: Set<string> = new Set();
  let clickCount = 0;
  let errorCount = 0;
  let completedAt: string | null = null;
  let completionTs: number | null = null;

  // Build success pattern regex
  const urlPattern = task.success_url_pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, ".*");
  const urlRegex = new RegExp(`^${urlPattern}$`);

  let urlMatched = false;
  let selectorMatched = !task.success_selector; // true if no selector required

  for (const event of events) {
    // Track pages
    if (event.type === "page_navigation") {
      const pathname = String(event.data.pathname ?? "");
      if (pathname) pages.add(pathname);

      if (urlRegex.test(pathname)) {
        urlMatched = true;
        if (!completionTs) completionTs = event.ts;
      }
    }

    // Track clicks
    if (event.type === "click") {
      clickCount++;

      if (task.success_selector) {
        const targetId = String(event.data.target_id ?? "");
        const targetClass = String(event.data.target_class ?? "");
        // Simple selector matching: #id or .class
        if (
          (task.success_selector.startsWith("#") && `#${targetId}` === task.success_selector) ||
          (task.success_selector.startsWith(".") &&
            targetClass.split(" ").some((c) => `.${c}` === task.success_selector))
        ) {
          selectorMatched = true;
          if (!completionTs) completionTs = event.ts;
        }
      }
    }

    // Track errors
    if (event.type === "error") {
      errorCount++;
    }
  }

  const taskCompleted = urlMatched && selectorMatched;
  const durationMs = completionTs ? completionTs - startTs : null;
  const exceededTime =
    durationMs !== null && durationMs > task.max_duration_seconds * 1000;

  let status: TaskStatus;
  if (taskCompleted && !exceededTime) {
    status = "completed";
    completedAt = completionTs ? new Date(completionTs).toISOString() : null;
  } else if (taskCompleted && exceededTime) {
    status = "failed"; // completed but too slow
  } else if (events.length === 0) {
    status = "pending";
  } else {
    status = "abandoned";
  }

  return {
    task_id: task.id,
    status,
    started_at: new Date(startTs).toISOString(),
    completed_at: completedAt,
    duration_ms: durationMs,
    pages_visited: [...pages],
    click_count: clickCount,
    error_count: errorCount,
  };
}

/* -------------------------------------------------------------------------- */
/*  Report generation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generate a comprehensive test report from all recordings.
 */
export function generateTestReport(
  test: UserTest,
  recordings: TestRecording[],
): TestReport {
  const taskReports: TaskReport[] = test.tasks.map((task) => {
    const results = recordings
      .flatMap((r) => r.task_results)
      .filter((tr) => tr.task_id === task.id);

    const completed = results.filter((r) => r.status === "completed");
    const failed = results.filter((r) => r.status === "failed");
    const abandoned = results.filter((r) => r.status === "abandoned");

    const durations = completed
      .map((r) => r.duration_ms)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);

    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : 0;

    const medianDuration =
      durations.length > 0
        ? durations[Math.floor(durations.length / 2)]
        : 0;

    const avgClicks =
      results.length > 0
        ? Math.round(
            (results.reduce((s, r) => s + r.click_count, 0) / results.length) * 10,
          ) / 10
        : 0;

    return {
      task_id: task.id,
      task_title: task.title,
      completion_rate:
        results.length > 0
          ? Math.round((completed.length / results.length) * 100)
          : 0,
      avg_duration_ms: avgDuration,
      median_duration_ms: medianDuration,
      success_count: completed.length,
      fail_count: failed.length,
      abandon_count: abandoned.length,
      avg_clicks: avgClicks,
    };
  });

  // Calculate drop-off points
  const dropOffPoints: DropOffPoint[] = test.tasks
    .map((task) => {
      const abandonedResults = recordings
        .flatMap((r) => r.task_results)
        .filter((tr) => tr.task_id === task.id && tr.status === "abandoned");

      if (abandonedResults.length === 0) return null;

      // Find most common last page
      const pageCounts: Record<string, number> = {};
      for (const result of abandonedResults) {
        const lastPage =
          result.pages_visited[result.pages_visited.length - 1] ?? "/unknown";
        pageCounts[lastPage] = (pageCounts[lastPage] ?? 0) + 1;
      }

      const topPage = Object.entries(pageCounts).sort(
        ([, a], [, b]) => b - a,
      )[0];

      const totalForTask = recordings
        .flatMap((r) => r.task_results)
        .filter((tr) => tr.task_id === task.id).length;

      return {
        task_id: task.id,
        task_title: task.title,
        page: topPage[0],
        drop_off_count: abandonedResults.length,
        percentage:
          totalForTask > 0
            ? Math.round((abandonedResults.length / totalForTask) * 100)
            : 0,
      };
    })
    .filter((d): d is DropOffPoint => d !== null);

  // Overall stats
  const allResults = recordings.flatMap((r) => r.task_results);
  const allCompleted = allResults.filter((r) => r.status === "completed");
  const overallCompletionRate =
    allResults.length > 0
      ? Math.round((allCompleted.length / allResults.length) * 100)
      : 0;

  // Average total duration per participant (sum of completed task durations)
  const participantDurations = recordings.map((r) =>
    r.task_results
      .filter((tr) => tr.duration_ms !== null)
      .reduce((s, tr) => s + (tr.duration_ms ?? 0), 0),
  );
  const avgTotalDuration =
    participantDurations.length > 0
      ? Math.round(
          participantDurations.reduce((s, d) => s + d, 0) /
            participantDurations.length,
        )
      : 0;

  return {
    test_id: test.id,
    test_title: test.title,
    total_participants: recordings.length,
    overall_completion_rate: overallCompletionRate,
    avg_total_duration_ms: avgTotalDuration,
    task_reports: taskReports,
    drop_off_points: dropOffPoints,
  };
}
