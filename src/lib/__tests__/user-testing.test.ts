/**
 * Unit tests for src/lib/user-testing.ts
 *
 * Tests task evaluation, completion rates, and report generation.
 *
 * Run with: npx jest src/lib/__tests__/user-testing.test.ts
 */

import {
  createTest,
  evaluateTaskCompletion,
  generateTestReport,
  type TestTask,
  type UserTest,
  type TestRecording,
} from "../user-testing";
import type { ReplayEvent } from "../session-replay";

const DEALER_ID = "00000000-0000-4000-a000-000000000001";

/* -------------------------------------------------------------------------- */
/*  createTest                                                                 */
/* -------------------------------------------------------------------------- */

describe("createTest", () => {
  it("creates a test with generated IDs", () => {
    const test = createTest({
      dealer_id: DEALER_ID,
      title: "Vehicle Search Test",
      description: "Can users find vehicles?",
      tasks: [
        {
          title: "Navigate to inventory",
          description: "Find the inventory page",
          success_url_pattern: "/inventory*",
          max_duration_seconds: 30,
          order: 0,
        },
      ],
    });

    expect(test.id).toMatch(/^test-/);
    expect(test.dealer_id).toBe(DEALER_ID);
    expect(test.title).toBe("Vehicle Search Test");
    expect(test.tasks).toHaveLength(1);
    expect(test.tasks[0].id).toMatch(/^task-/);
    expect(test.active).toBe(true);
    expect(test.total_participants).toBe(0);
  });

  it("preserves task order", () => {
    const test = createTest({
      dealer_id: DEALER_ID,
      title: "Multi-task",
      description: "",
      tasks: [
        { title: "Step 1", description: "", success_url_pattern: "/a", max_duration_seconds: 30, order: 0 },
        { title: "Step 2", description: "", success_url_pattern: "/b", max_duration_seconds: 30, order: 1 },
        { title: "Step 3", description: "", success_url_pattern: "/c", max_duration_seconds: 30, order: 2 },
      ],
    });

    expect(test.tasks).toHaveLength(3);
    expect(test.tasks[0].order).toBe(0);
    expect(test.tasks[1].order).toBe(1);
    expect(test.tasks[2].order).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  evaluateTaskCompletion                                                     */
/* -------------------------------------------------------------------------- */

describe("evaluateTaskCompletion", () => {
  const task: TestTask = {
    id: "task-001",
    title: "Find inventory",
    description: "Navigate to inventory page",
    success_url_pattern: "/inventory",
    max_duration_seconds: 30,
    order: 0,
  };

  const startTs = 1000;

  it("marks task as completed when URL matches", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 2000, type: "page_navigation", data: { pathname: "/", url: "/" } },
      { seq: 1, ts: 5000, type: "page_navigation", data: { pathname: "/inventory", url: "/inventory" } },
    ];

    const result = evaluateTaskCompletion(task, events, startTs);
    expect(result.status).toBe("completed");
    expect(result.task_id).toBe("task-001");
    expect(result.duration_ms).toBe(4000); // 5000 - 1000
    expect(result.completed_at).not.toBeNull();
  });

  it("marks task as abandoned when URL never matches", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 2000, type: "page_navigation", data: { pathname: "/", url: "/" } },
      { seq: 1, ts: 5000, type: "click", data: { target_tag: "A", x: 100, y: 200 } },
    ];

    const result = evaluateTaskCompletion(task, events, startTs);
    expect(result.status).toBe("abandoned");
    expect(result.completed_at).toBeNull();
  });

  it("marks task as pending when no events", () => {
    const result = evaluateTaskCompletion(task, [], startTs);
    expect(result.status).toBe("pending");
  });

  it("marks task as failed when completed but exceeded time limit", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 1000, type: "page_navigation", data: { pathname: "/" } },
      // 31 seconds after start (31000ms > 30000ms max)
      { seq: 1, ts: 32000, type: "page_navigation", data: { pathname: "/inventory" } },
    ];

    const result = evaluateTaskCompletion(task, events, startTs);
    expect(result.status).toBe("failed");
  });

  it("counts clicks and errors", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 2000, type: "click", data: { target_tag: "A", x: 10, y: 10 } },
      { seq: 1, ts: 3000, type: "click", data: { target_tag: "BUTTON", x: 20, y: 20 } },
      { seq: 2, ts: 4000, type: "error", data: { message: "oops" } },
      { seq: 3, ts: 5000, type: "page_navigation", data: { pathname: "/inventory" } },
    ];

    const result = evaluateTaskCompletion(task, events, startTs);
    expect(result.click_count).toBe(2);
    expect(result.error_count).toBe(1);
  });

  it("tracks pages visited", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 2000, type: "page_navigation", data: { pathname: "/" } },
      { seq: 1, ts: 3000, type: "page_navigation", data: { pathname: "/about" } },
      { seq: 2, ts: 4000, type: "page_navigation", data: { pathname: "/inventory" } },
    ];

    const result = evaluateTaskCompletion(task, events, startTs);
    expect(result.pages_visited).toContain("/");
    expect(result.pages_visited).toContain("/about");
    expect(result.pages_visited).toContain("/inventory");
  });

  it("evaluates selector-based completion", () => {
    const selectorTask: TestTask = {
      id: "task-002",
      title: "Click CTA",
      description: "Click the CTA button",
      success_url_pattern: "/inventory",
      success_selector: "#buy-now",
      max_duration_seconds: 60,
      order: 0,
    };

    // URL matches but selector does not
    const eventsNoSelector: ReplayEvent[] = [
      { seq: 0, ts: 2000, type: "page_navigation", data: { pathname: "/inventory" } },
      { seq: 1, ts: 3000, type: "click", data: { target_tag: "BUTTON", target_id: "other", target_class: "" } },
    ];
    const result1 = evaluateTaskCompletion(selectorTask, eventsNoSelector, startTs);
    expect(result1.status).toBe("abandoned"); // URL matched but selector didn't

    // Both URL and selector match
    const eventsBoth: ReplayEvent[] = [
      { seq: 0, ts: 2000, type: "page_navigation", data: { pathname: "/inventory" } },
      { seq: 1, ts: 3000, type: "click", data: { target_tag: "BUTTON", target_id: "buy-now", target_class: "" } },
    ];
    const result2 = evaluateTaskCompletion(selectorTask, eventsBoth, startTs);
    expect(result2.status).toBe("completed");
  });
});

/* -------------------------------------------------------------------------- */
/*  generateTestReport                                                         */
/* -------------------------------------------------------------------------- */

describe("generateTestReport", () => {
  const test: UserTest = createTest({
    dealer_id: DEALER_ID,
    title: "Search Test",
    description: "",
    tasks: [
      { title: "Find inventory", description: "", success_url_pattern: "/inventory", max_duration_seconds: 30, order: 0 },
      { title: "View vehicle", description: "", success_url_pattern: "/inventory/*", max_duration_seconds: 45, order: 1 },
    ],
  });

  it("generates report with completion rates", () => {
    const recordings: TestRecording[] = [
      {
        id: "rec-1",
        test_id: test.id,
        session_id: "s1",
        participant_id: "p1",
        started_at: "2026-04-01T10:00:00Z",
        completed_at: "2026-04-01T10:05:00Z",
        user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "completed", started_at: "", completed_at: "", duration_ms: 5000, pages_visited: ["/", "/inventory"], click_count: 3, error_count: 0 },
          { task_id: test.tasks[1].id, status: "completed", started_at: "", completed_at: "", duration_ms: 8000, pages_visited: ["/inventory", "/inventory/123"], click_count: 2, error_count: 0 },
        ],
      },
      {
        id: "rec-2",
        test_id: test.id,
        session_id: "s2",
        participant_id: "p2",
        started_at: "2026-04-01T11:00:00Z",
        completed_at: null,
        user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "completed", started_at: "", completed_at: "", duration_ms: 7000, pages_visited: ["/", "/about", "/inventory"], click_count: 5, error_count: 0 },
          { task_id: test.tasks[1].id, status: "abandoned", started_at: "", completed_at: null, duration_ms: null, pages_visited: ["/inventory"], click_count: 4, error_count: 1 },
        ],
      },
    ];

    const report = generateTestReport(test, recordings);

    expect(report.test_id).toBe(test.id);
    expect(report.total_participants).toBe(2);
    expect(report.task_reports).toHaveLength(2);

    // Task 0: 2/2 completed = 100%
    expect(report.task_reports[0].completion_rate).toBe(100);
    expect(report.task_reports[0].success_count).toBe(2);

    // Task 1: 1/2 completed = 50%
    expect(report.task_reports[1].completion_rate).toBe(50);
    expect(report.task_reports[1].success_count).toBe(1);
    expect(report.task_reports[1].abandon_count).toBe(1);
  });

  it("calculates average duration for completed tasks", () => {
    const recordings: TestRecording[] = [
      {
        id: "rec-1", test_id: test.id, session_id: "s1", participant_id: "p1",
        started_at: "", completed_at: "", user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "completed", started_at: "", completed_at: "", duration_ms: 4000, pages_visited: [], click_count: 2, error_count: 0 },
          { task_id: test.tasks[1].id, status: "completed", started_at: "", completed_at: "", duration_ms: 6000, pages_visited: [], click_count: 1, error_count: 0 },
        ],
      },
      {
        id: "rec-2", test_id: test.id, session_id: "s2", participant_id: "p2",
        started_at: "", completed_at: "", user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "completed", started_at: "", completed_at: "", duration_ms: 6000, pages_visited: [], click_count: 4, error_count: 0 },
          { task_id: test.tasks[1].id, status: "completed", started_at: "", completed_at: "", duration_ms: 10000, pages_visited: [], click_count: 3, error_count: 0 },
        ],
      },
    ];

    const report = generateTestReport(test, recordings);

    // Task 0: avg of 4000 and 6000 = 5000
    expect(report.task_reports[0].avg_duration_ms).toBe(5000);
    // Task 1: avg of 6000 and 10000 = 8000
    expect(report.task_reports[1].avg_duration_ms).toBe(8000);
  });

  it("identifies drop-off points", () => {
    const recordings: TestRecording[] = [
      {
        id: "rec-1", test_id: test.id, session_id: "s1", participant_id: "p1",
        started_at: "", completed_at: null, user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "abandoned", started_at: "", completed_at: null, duration_ms: null, pages_visited: ["/", "/about"], click_count: 3, error_count: 0 },
          { task_id: test.tasks[1].id, status: "abandoned", started_at: "", completed_at: null, duration_ms: null, pages_visited: ["/inventory"], click_count: 1, error_count: 0 },
        ],
      },
      {
        id: "rec-2", test_id: test.id, session_id: "s2", participant_id: "p2",
        started_at: "", completed_at: null, user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "abandoned", started_at: "", completed_at: null, duration_ms: null, pages_visited: ["/", "/about"], click_count: 2, error_count: 0 },
          { task_id: test.tasks[1].id, status: "completed", started_at: "", completed_at: "", duration_ms: 5000, pages_visited: ["/inventory/456"], click_count: 1, error_count: 0 },
        ],
      },
    ];

    const report = generateTestReport(test, recordings);

    // Task 0: both abandoned on /about
    const dropOff0 = report.drop_off_points.find((d) => d.task_id === test.tasks[0].id);
    expect(dropOff0).toBeDefined();
    expect(dropOff0!.page).toBe("/about");
    expect(dropOff0!.drop_off_count).toBe(2);
  });

  it("handles empty recordings", () => {
    const report = generateTestReport(test, []);
    expect(report.total_participants).toBe(0);
    expect(report.overall_completion_rate).toBe(0);
    expect(report.avg_total_duration_ms).toBe(0);
    expect(report.drop_off_points).toHaveLength(0);
  });

  it("calculates overall completion rate across all tasks", () => {
    const recordings: TestRecording[] = [
      {
        id: "rec-1", test_id: test.id, session_id: "s1", participant_id: "p1",
        started_at: "", completed_at: "", user_agent: "",
        task_results: [
          { task_id: test.tasks[0].id, status: "completed", started_at: "", completed_at: "", duration_ms: 3000, pages_visited: [], click_count: 1, error_count: 0 },
          { task_id: test.tasks[1].id, status: "failed", started_at: "", completed_at: null, duration_ms: null, pages_visited: [], click_count: 2, error_count: 0 },
        ],
      },
    ];

    const report = generateTestReport(test, recordings);
    // 1 completed out of 2 total results = 50%
    expect(report.overall_completion_rate).toBe(50);
  });
});
