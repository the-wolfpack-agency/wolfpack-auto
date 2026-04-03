/**
 * Propensity Model — Tests
 *
 * Covers: feature extraction, logistic regression math, model training,
 * evaluation metrics, ranking, feature importance.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackPropensity: jest.fn(),
}));

import {
  extractFeatures,
  predictPurchaseProbability,
  trainModel,
  evaluateModel,
  getFeatureImportance,
  rankCustomersByPropensity,
  isModelTrained,
  _resetForTesting,
  type TrainingDataPoint,
} from "@/lib/propensity-model";

beforeEach(() => {
  _resetForTesting();
});

/* ------------------------------------------------------------------ */
/*  Feature extraction                                                 */
/* ------------------------------------------------------------------ */

describe("extractFeatures", () => {
  it("creates feature vector with defaults", () => {
    const features = extractFeatures("cust-1");
    expect(features.customerId).toBe("cust-1");
    expect(features.visitFrequency).toBe(0);
    expect(features.recencyDays).toBe(999);
    expect(features.chatUsed).toBe(false);
  });

  it("uses provided values", () => {
    const features = extractFeatures("cust-2", {
      visitFrequency: 10,
      chatUsed: true,
      pastPurchases: 2,
    });
    expect(features.visitFrequency).toBe(10);
    expect(features.chatUsed).toBe(true);
    expect(features.pastPurchases).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Prediction                                                         */
/* ------------------------------------------------------------------ */

describe("predictPurchaseProbability", () => {
  it("returns probability between 0 and 1", () => {
    const features = extractFeatures("cust-p1", { visitFrequency: 5 });
    const prediction = predictPurchaseProbability(features);
    expect(prediction.probability).toBeGreaterThanOrEqual(0);
    expect(prediction.probability).toBeLessThanOrEqual(1);
  });

  it("assigns hot tier for high-engagement customers", () => {
    const features = extractFeatures("cust-hot", {
      visitFrequency: 20,
      recencyDays: 0,
      pagesViewed: 50,
      vehiclesViewed: 10,
      timeOnSiteMinutes: 200,
      chatUsed: true,
      formInteractions: 5,
      emailOpens: 10,
      pastPurchases: 3,
    });
    const prediction = predictPurchaseProbability(features);
    expect(prediction.tier).toBe("hot");
    expect(prediction.probability).toBeGreaterThan(0.7);
  });

  it("assigns cold tier for low-engagement customers", () => {
    const features = extractFeatures("cust-cold", {
      visitFrequency: 0,
      recencyDays: 999,
      pagesViewed: 0,
      vehiclesViewed: 0,
    });
    const prediction = predictPurchaseProbability(features);
    expect(prediction.tier).toBe("cold");
  });

  it("includes top factors in prediction", () => {
    const features = extractFeatures("cust-factors", {
      visitFrequency: 10,
      chatUsed: true,
    });
    const prediction = predictPurchaseProbability(features);
    expect(prediction.topFactors.length).toBeLessThanOrEqual(3);
    expect(prediction.topFactors[0]).toHaveProperty("feature");
    expect(prediction.topFactors[0]).toHaveProperty("weight");
    expect(prediction.topFactors[0]).toHaveProperty("direction");
  });
});

/* ------------------------------------------------------------------ */
/*  Model training                                                     */
/* ------------------------------------------------------------------ */

describe("trainModel", () => {
  const trainingData: TrainingDataPoint[] = [
    {
      features: extractFeatures("t1", {
        visitFrequency: 15,
        recencyDays: 1,
        pagesViewed: 40,
        vehiclesViewed: 8,
        chatUsed: true,
        formInteractions: 3,
        pastPurchases: 1,
      }),
      purchased: true,
    },
    {
      features: extractFeatures("t2", {
        visitFrequency: 10,
        recencyDays: 3,
        pagesViewed: 25,
        vehiclesViewed: 5,
        chatUsed: false,
        formInteractions: 1,
      }),
      purchased: true,
    },
    {
      features: extractFeatures("t3", {
        visitFrequency: 1,
        recencyDays: 30,
        pagesViewed: 3,
        vehiclesViewed: 1,
      }),
      purchased: false,
    },
    {
      features: extractFeatures("t4", {
        visitFrequency: 0,
        recencyDays: 60,
        pagesViewed: 1,
      }),
      purchased: false,
    },
  ];

  it("trains and returns metrics", () => {
    const metrics = trainModel(trainingData);
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.accuracy).toBeLessThanOrEqual(1);
    expect(metrics.precision).toBeGreaterThanOrEqual(0);
    expect(metrics.recall).toBeGreaterThanOrEqual(0);
    expect(metrics.auc).toBeGreaterThanOrEqual(0);
    expect(metrics.trainingSize).toBe(4);
    expect(isModelTrained()).toBe(true);
  });

  it("returns empty metrics for empty data", () => {
    const metrics = trainModel([]);
    expect(metrics.accuracy).toBe(0);
    expect(metrics.trainingSize).toBe(0);
  });

  it("confusion matrix sums to training size", () => {
    const metrics = trainModel(trainingData);
    const cm = metrics.confusionMatrix;
    expect(cm.truePositive + cm.falsePositive + cm.trueNegative + cm.falseNegative).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/*  Evaluation                                                         */
/* ------------------------------------------------------------------ */

describe("evaluateModel", () => {
  it("returns valid metrics on test data", () => {
    const testData: TrainingDataPoint[] = [
      { features: extractFeatures("e1", { visitFrequency: 20, chatUsed: true, pastPurchases: 2 }), purchased: true },
      { features: extractFeatures("e2", { visitFrequency: 0, recencyDays: 100 }), purchased: false },
    ];
    const metrics = evaluateModel(testData);
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Feature importance                                                 */
/* ------------------------------------------------------------------ */

describe("getFeatureImportance", () => {
  it("returns all features sorted by absolute weight", () => {
    const importance = getFeatureImportance();
    expect(importance.length).toBe(9);
    // Should be sorted descending by weight
    for (let i = 1; i < importance.length; i++) {
      expect(importance[i].weight).toBeLessThanOrEqual(importance[i - 1].weight);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Ranking                                                            */
/* ------------------------------------------------------------------ */

describe("rankCustomersByPropensity", () => {
  it("ranks customers by probability descending", () => {
    const customers = [
      extractFeatures("low", { visitFrequency: 0, recencyDays: 100, pagesViewed: 1 }),
      extractFeatures("high", { visitFrequency: 20, recencyDays: 0, chatUsed: true, pastPurchases: 3, formInteractions: 5, pagesViewed: 50, vehiclesViewed: 10, timeOnSiteMinutes: 200, emailOpens: 10 }),
      extractFeatures("mid", { visitFrequency: 5, recencyDays: 7, pagesViewed: 10 }),
    ];
    const ranked = rankCustomersByPropensity(customers);
    expect(ranked[0].customerId).toBe("high");
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].probability).toBeLessThanOrEqual(ranked[i - 1].probability);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/propensity/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/propensity/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/propensity");
  });
});
