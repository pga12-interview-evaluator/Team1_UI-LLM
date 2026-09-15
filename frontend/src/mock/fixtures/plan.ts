/**
 * Synthetic interview plan for the mock engine (FP&A analyst, mid, standard pressure).
 * Mirrors the shape of a frozen blueprint closely enough for the console to render it.
 */
export interface MockProbe {
  technique: string;
  /** Which evidence-quality patterns trigger this probe (mock heuristics use them). */
  triggers: ("collective" | "unanchored_metric" | "generic" | "no_failure" | "adjacent")[];
  text: string;
}

export interface MockPlanItem {
  order: number;
  question_id: string;
  question_type: "warm_up" | "resume_verification" | "case" | "behavioral" | "tradeoff";
  target_competencies: string[];
  time_budget_minutes: number;
  anchors: string | null;
  question: string;
  rephrase: string;
  probes: MockProbe[];
  scenario: { setup: string; facts: { topic: RegExp; text: string }[] } | null;
}

export const COMPETENCIES = [
  {
    id: "C1",
    name: "Month-end close ownership",
    weight: 35,
    is_must_have: true,
    start_rung: "L2",
    seniority_bar_rung: "L2",
  },
  {
    id: "C2",
    name: "Variance analysis",
    weight: 30,
    is_must_have: true,
    start_rung: "L2",
    seniority_bar_rung: "L2",
  },
  {
    id: "C3",
    name: "Ownership and impact",
    weight: 20,
    is_must_have: false,
    start_rung: "L2",
    seniority_bar_rung: "L2",
  },
  {
    id: "C4",
    name: "Stakeholder communication",
    weight: 15,
    is_must_have: false,
    start_rung: "L1",
    seniority_bar_rung: "L2",
  },
] as const;

export const PLAN: MockPlanItem[] = [
  {
    order: 1,
    question_id: "Q1",
    question_type: "warm_up",
    target_competencies: [],
    time_budget_minutes: 2,
    anchors: null,
    question:
      "To start, in one or two sentences: what does your current role involve week to week?",
    rephrase: "Briefly, what do you do in a typical week in your current role?",
    probes: [],
    scenario: null,
  },
  {
    order: 2,
    question_id: "Q2",
    question_type: "resume_verification",
    target_competencies: ["C1", "C3"],
    time_budget_minutes: 9,
    anchors:
      "Before the story, three quick facts: your role on the close, how many people submitted inputs by role, and how long the change took? Rough ranges are fine.",
    question:
      "Your resume mentions reducing close reporting time by 30%. Walk me through one month-end where the old process ran late, and what you changed after it?",
    rephrase:
      "Pick one month-end where the old close ran late. What happened that month, and what did you change afterwards?",
    probes: [
      {
        technique: "OWN",
        triggers: ["collective"],
        text: "It is fine to say I here. Within that close, which part was yours to change without asking anyone?",
      },
      {
        technique: "METRIC",
        triggers: ["unanchored_metric"],
        text: "How many business days did close reporting take before the change, and where did that number come from?",
      },
      {
        technique: "DRILL",
        triggers: ["generic"],
        text: "No names or figures needed: which account would not tie that month, and roughly by how much?",
      },
      {
        technique: "FAIL",
        triggers: ["no_failure"],
        text: "In the first close after the change went live, which submission still arrived last?",
      },
    ],
    scenario: null,
  },
  {
    order: 3,
    question_id: "Q3",
    question_type: "case",
    target_competencies: ["C2"],
    time_budget_minutes: 10,
    anchors: null,
    question: "What do you look at first, and why?",
    rephrase: "Where do you start, and what makes that the first place to look?",
    probes: [
      {
        technique: "COMMIT",
        triggers: ["generic"],
        text: "Assume the plant manager needs one answer by tomorrow morning. Which single cause do you investigate first, and what would tell you within a day that you picked wrong?",
      },
      {
        technique: "MUTATE",
        triggers: ["adjacent", "collective", "unanchored_metric"],
        text: "Same situation, one change: the plant controller who owns the cost data is unavailable this week. Which part of what you described breaks first?",
      },
    ],
    scenario: {
      setup:
        "A plant's gross margin came in at 31% against a 35% budget for the month, while revenue is 8% over budget. The plant manager has asked you for an explanation before tomorrow's review. Ask me for anything you would need to know.",
      facts: [
        {
          topic: /mix|product|sku|volume/i,
          text: "Volume is up 12% overall, concentrated in the lowest-margin product line.",
        },
        {
          topic: /freight|shipping|logistics|cost/i,
          text: "Freight cost per unit rose 18% after a carrier change mid-month.",
        },
        {
          topic: /price|discount|rebate/i,
          text: "Average selling price is flat; no new discounts were booked.",
        },
        {
          topic: /accrual|timing|cut.?off|booking/i,
          text: "A shipment worth about 2% of revenue was booked this month while part of its cost hit last month.",
        },
      ],
    },
  },
  {
    order: 4,
    question_id: "Q4",
    question_type: "behavioral",
    target_competencies: ["C4", "C3"],
    time_budget_minutes: 7,
    anchors: null,
    question:
      "Describe one occasion when a plant controller disagreed with a variance explanation you gave. What was their strongest argument, and what did you concede?",
    rephrase:
      "Tell me about one specific time a plant controller pushed back on your variance analysis. What did they argue, and what did you give ground on?",
    probes: [
      {
        technique: "FRICTION",
        triggers: ["generic", "collective"],
        text: "What did you concede to them, specifically?",
      },
      {
        technique: "REFSIM",
        triggers: ["unanchored_metric", "no_failure"],
        text: "If the person you reported to described what you specifically did in that disagreement, what would they describe, and what would they say you could have done better?",
      },
    ],
    scenario: null,
  },
];

export const PLANNED_MAIN_QUESTIONS = PLAN.length;
