/** Offline sensitivity model, not an AWS quote or deployment approval. USD only. */
export interface CostInputs {
  requests: number;
  reads: number;
  writes: number;
  databaseGb: number;
  logsGb: number;
  users: number;
  evidenceGb: number;
  staticAndAssetsGb: number;
  s3Gets: number;
  s3Lists: number;
}

export function estimatePartialCost(input: CostInputs): Record<string, number> {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid cost input: ${name}`);
  }
  return {
    httpApi: input.requests / 1_000_000,
    lambda: input.requests * (0.5 * 0.5 * 0.0000133334 + 0.20 / 1_000_000),
    dynamoReads: input.reads * 2 * 0.125 / 1_000_000,
    dynamoWrites: input.writes * 10 * 0.625 / 1_000_000,
    dynamoStorage: input.databaseGb * 3 * 0.25,
    pitr: input.databaseGb * 0.20,
    logsIngest: input.logsGb * 0.50,
    logsStorage: input.logsGb * 14 / 30 * 0.03,
    cognito: input.users * 0.0055,
    s3Storage: (input.evidenceGb + input.staticAndAssetsGb) * 0.023,
    s3Gets: input.s3Gets / 1_000 * 0.0004,
    s3Lists: input.s3Lists / 1_000 * 0.005,
  };
}
