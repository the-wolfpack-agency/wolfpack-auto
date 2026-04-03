/**
 * ML Propensity Scoring — Logistic Regression in TypeScript
 *
 * Predicts purchase probability from behavioral features without
 * any external ML service. Trains from historical lead->purchase
 * outcomes, evaluates with precision/recall/AUC.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PropensityFeatures {
  customerId: string;
  visitFrequency: number;       // visits in last 30 days
  recencyDays: number;          // days since last visit
  pagesViewed: number;          // total pages viewed
  vehiclesViewed: number;       // distinct vehicles viewed
  timeOnSiteMinutes: number;    // total time on site
  chatUsed: boolean;
  formInteractions: number;     // form starts/submits
  emailOpens: number;           // email opens in last 30 days
  pastPurchases: number;        // historical purchase count
}

export interface PropensityPrediction {
  customerId: string;
  probability: number;          // 0-1
  tier: "hot" | "warm" | "cold";
  topFactors: FeatureImportance[];
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;
  confusionMatrix: {
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  };
  trainedAt: string;
  trainingSize: number;
}

export interface FeatureImportance {
  feature: string;
  weight: number;
  direction: "positive" | "negative";
}

export interface TrainingDataPoint {
  features: PropensityFeatures;
  purchased: boolean;
}

/* ------------------------------------------------------------------ */
/*  Model state                                                        */
/* ------------------------------------------------------------------ */

interface ModelWeights {
  bias: number;
  weights: number[];
  featureNames: string[];
  trained: boolean;
  trainedAt: string | null;
  trainingSize: number;
}

// Default weights — reasonable priors before training
let model: ModelWeights = {
  bias: -2.0,
  weights: [
    0.3,   // visitFrequency
    -0.05, // recencyDays (lower = better)
    0.02,  // pagesViewed
    0.15,  // vehiclesViewed
    0.01,  // timeOnSiteMinutes
    0.8,   // chatUsed
    0.25,  // formInteractions
    0.1,   // emailOpens
    0.5,   // pastPurchases
  ],
  featureNames: [
    "visitFrequency",
    "recencyDays",
    "pagesViewed",
    "vehiclesViewed",
    "timeOnSiteMinutes",
    "chatUsed",
    "formInteractions",
    "emailOpens",
    "pastPurchases",
  ],
  trained: false,
  trainedAt: null,
  trainingSize: 0,
};

/* ------------------------------------------------------------------ */
/*  Math helpers                                                       */
/* ------------------------------------------------------------------ */

function sigmoid(z: number): number {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1 / (1 + Math.exp(-z));
}

function featuresToVector(f: PropensityFeatures): number[] {
  return [
    f.visitFrequency,
    f.recencyDays,
    f.pagesViewed,
    f.vehiclesViewed,
    f.timeOnSiteMinutes,
    f.chatUsed ? 1 : 0,
    f.formInteractions,
    f.emailOpens,
    f.pastPurchases,
  ];
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Extract a feature vector from a customer's behavioral data.
 */
export function extractFeatures(
  customerId: string,
  data: Partial<Omit<PropensityFeatures, "customerId">> = {},
): PropensityFeatures {
  return {
    customerId,
    visitFrequency: data.visitFrequency ?? 0,
    recencyDays: data.recencyDays ?? 999,
    pagesViewed: data.pagesViewed ?? 0,
    vehiclesViewed: data.vehiclesViewed ?? 0,
    timeOnSiteMinutes: data.timeOnSiteMinutes ?? 0,
    chatUsed: data.chatUsed ?? false,
    formInteractions: data.formInteractions ?? 0,
    emailOpens: data.emailOpens ?? 0,
    pastPurchases: data.pastPurchases ?? 0,
  };
}

/**
 * Predict purchase probability using logistic regression.
 */
export function predictPurchaseProbability(
  features: PropensityFeatures,
): PropensityPrediction {
  const x = featuresToVector(features);
  const z = model.bias + dotProduct(model.weights, x);
  const probability = sigmoid(z);

  const tier: "hot" | "warm" | "cold" =
    probability > 0.7 ? "hot" : probability > 0.3 ? "warm" : "cold";

  // Compute per-feature contributions
  const contributions = model.weights.map((w, i) => ({
    feature: model.featureNames[i],
    weight: Math.abs(w * x[i]),
    direction: (w * x[i] >= 0 ? "positive" : "negative") as "positive" | "negative",
  }));

  const topFactors = contributions
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  return {
    customerId: features.customerId,
    probability: Math.round(probability * 1000) / 1000,
    tier,
    topFactors,
  };
}

/**
 * Train model weights using gradient descent on historical data.
 */
export function trainModel(
  data: TrainingDataPoint[],
  learningRate: number = 0.01,
  epochs: number = 100,
): ModelMetrics {
  if (data.length === 0) {
    return emptyMetrics();
  }

  const weights = [...model.weights];
  let bias = model.bias;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let biasGrad = 0;
    const weightGrads = new Array(weights.length).fill(0);

    for (const point of data) {
      const x = featuresToVector(point.features);
      const z = bias + dotProduct(weights, x);
      const predicted = sigmoid(z);
      const error = predicted - (point.purchased ? 1 : 0);

      biasGrad += error;
      for (let j = 0; j < weights.length; j++) {
        weightGrads[j] += error * x[j];
      }
    }

    // Update
    bias -= (learningRate * biasGrad) / data.length;
    for (let j = 0; j < weights.length; j++) {
      weights[j] -= (learningRate * weightGrads[j]) / data.length;
    }
  }

  model = {
    ...model,
    bias,
    weights,
    trained: true,
    trainedAt: new Date().toISOString(),
    trainingSize: data.length,
  };

  return evaluateModel(data);
}

/**
 * Evaluate model performance on a test set.
 */
export function evaluateModel(testData: TrainingDataPoint[]): ModelMetrics {
  if (testData.length === 0) return emptyMetrics();

  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const point of testData) {
    const prediction = predictPurchaseProbability(point.features);
    const predictedPositive = prediction.probability >= 0.5;
    const actualPositive = point.purchased;

    if (predictedPositive && actualPositive) tp++;
    else if (predictedPositive && !actualPositive) fp++;
    else if (!predictedPositive && !actualPositive) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / testData.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  // Simplified AUC estimation using sorted predictions
  const scored = testData.map((d) => ({
    prob: predictPurchaseProbability(d.features).probability,
    actual: d.purchased,
  }));
  scored.sort((a, b) => b.prob - a.prob);

  const positives = scored.filter((s) => s.actual).length;
  const negatives = scored.length - positives;
  let auc = 0.5;

  if (positives > 0 && negatives > 0) {
    let sumRanks = 0;
    for (let i = 0; i < scored.length; i++) {
      if (scored[i].actual) {
        sumRanks += scored.length - i;
      }
    }
    auc = (sumRanks - (positives * (positives + 1)) / 2) / (positives * negatives);
    auc = Math.max(0, Math.min(1, auc));
  }

  return {
    accuracy: Math.round(accuracy * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1Score: Math.round(f1Score * 1000) / 1000,
    auc: Math.round(auc * 1000) / 1000,
    confusionMatrix: {
      truePositive: tp,
      falsePositive: fp,
      trueNegative: tn,
      falseNegative: fn,
    },
    trainedAt: model.trainedAt ?? new Date().toISOString(),
    trainingSize: model.trainingSize,
  };
}

/**
 * Get feature importance from the current model weights.
 */
export function getFeatureImportance(): FeatureImportance[] {
  return model.featureNames.map((name, i) => ({
    feature: name,
    weight: Math.round(Math.abs(model.weights[i]) * 1000) / 1000,
    direction: model.weights[i] >= 0 ? "positive" as const : "negative" as const,
  })).sort((a, b) => b.weight - a.weight);
}

/**
 * Score all customers and return a ranked list.
 */
export function rankCustomersByPropensity(
  customers: PropensityFeatures[],
): PropensityPrediction[] {
  return customers
    .map((c) => predictPurchaseProbability(c))
    .sort((a, b) => b.probability - a.probability);
}

/**
 * Check if the model has been trained.
 */
export function isModelTrained(): boolean {
  return model.trained;
}

/**
 * Reset model to defaults (for testing).
 */
export function _resetForTesting(): void {
  model = {
    bias: -2.0,
    weights: [0.3, -0.05, 0.02, 0.15, 0.01, 0.8, 0.25, 0.1, 0.5],
    featureNames: [
      "visitFrequency", "recencyDays", "pagesViewed", "vehiclesViewed",
      "timeOnSiteMinutes", "chatUsed", "formInteractions", "emailOpens",
      "pastPurchases",
    ],
    trained: false,
    trainedAt: null,
    trainingSize: 0,
  };
}

function emptyMetrics(): ModelMetrics {
  return {
    accuracy: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    auc: 0.5,
    confusionMatrix: { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 },
    trainedAt: new Date().toISOString(),
    trainingSize: 0,
  };
}
