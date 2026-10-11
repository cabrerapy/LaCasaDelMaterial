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
  s3Puts: number;
  s3DirectDownloadGb: number;
  cloudFrontViewerGb: number;
  cloudFrontToOriginGb: number;
  cloudFrontHttpsRequests: number;
  cloudFrontFunctionInvocations: number;
}

export function estimatePartialCost(input: CostInputs): Record<string, number> {
  for (const key of ['requests', 'reads', 'writes', 'users', 's3Gets', 's3Lists', 's3Puts', 'cloudFrontHttpsRequests', 'cloudFrontFunctionInvocations'] as const) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0) throw new Error(`Invalid monthly count: ${key}`);
  }
  for (const key of ['cloudFrontViewerGb', 'cloudFrontToOriginGb', 's3DirectDownloadGb'] as const) {
    if (!Number.isFinite(input[key]) || input[key] < 0) throw new Error(`Invalid traffic volume: ${key}`);
  }
  // Gross South America sensitivity without free allowances, only first paid tier.
  if (input.cloudFrontViewerGb > 10_000) throw new Error('CloudFront tier calculation required above 10 TB');
  if (input.s3DirectDownloadGb > 10_000) throw new Error('S3 transfer tier calculation required above 10 TB');
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid cost input: ${name}`);
  }
  return {
    httpApi: input.requests / 1_000_000,
    // Candidate is x86_64, 512 MB; assumes 500 ms per request, not measured latency.
    lambda: input.requests * (0.5 * 0.5 * 0.0000166667 + 0.20 / 1_000_000),
    dynamoReads: input.reads * 2 * 0.125 / 1_000_000,
    dynamoWrites: input.writes * 10 * 0.625 / 1_000_000,
    dynamoStorage: input.databaseGb * 3 * 0.25,
    pitr: input.databaseGb * 0.20,
    logsIngest: input.logsGb * 0.50,
    logsStorage: input.logsGb * 7 / 30 * 0.03,
    cognito: input.users * 0.0055,
    s3Storage: (input.evidenceGb + input.staticAndAssetsGb) * 0.023,
    s3Gets: input.s3Gets / 1_000 * 0.0004,
    s3Lists: input.s3Lists / 1_000 * 0.005,
    // Count billable PUT/COPY/POST operations, including retries and publication.
    s3Puts: input.s3Puts / 1_000 * 0.005,
    // Direct signed downloads only, excluding origin-to-CloudFront traffic and free allowances.
    s3DirectTransfer: input.s3DirectDownloadGb * 0.09,
    cloudFrontViewerTransfer: input.cloudFrontViewerGb * 0.110,
    cloudFrontToOriginTransfer: input.cloudFrontToOriginGb * 0.125,
    cloudFrontHttpsRequests: input.cloudFrontHttpsRequests / 10_000 * 0.022,
    cloudFrontFunctions: input.cloudFrontFunctionInvocations / 1_000_000 * 0.10,
  };
}
