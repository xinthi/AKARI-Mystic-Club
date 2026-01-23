type BrandAliasesInput = {
  brandName?: string | null;
  brandHandle?: string | null;
  aliases?: string[] | null;
};

type QuestScoreInput = {
  text: string;
  objectives?: string | null;
  usedCampaignLink: boolean;
  brandAttribution: boolean;
  platform: string;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
};

type QuestScoreResult = {
  alignmentScore: number;
  complianceScore: number;
  clarityScore: number;
  safetyScore: number;
  postQualityScore: number;
  postFinalScore: number;
  engagementMetric: number;
  engagementBoost: number;
  reason: Record<string, any>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAlias(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeBrandAliases(input: BrandAliasesInput): string[] {
  const set = new Set<string>();
  const name = input.brandName ? normalizeAlias(input.brandName) : '';
  const handleRaw = input.brandHandle ? normalizeAlias(input.brandHandle) : '';
  const handle = handleRaw.startsWith('@') ? handleRaw : handleRaw ? `@${handleRaw}` : '';

  if (name) {
    set.add(name);
    const primaryToken = name.split(' ')[0];
    if (primaryToken && primaryToken.length >= 4) {
      set.add(primaryToken);
    }
    const compact = name.replace(/[^a-z0-9]/g, '');
    if (compact.length >= 4) set.add(compact);
  }
  if (handle) {
    set.add(handle);
    set.add(handle.replace(/^@+/, ''));
  }
  (input.aliases || []).forEach((alias) => {
    const clean = normalizeAlias(alias);
    if (clean) set.add(clean);
  });

  return Array.from(set).filter(Boolean);
}

export function detectBrandAttribution(text: string, aliases: string[], handle?: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const handleClean = handle ? normalizeAlias(handle) : '';
  const handleWithAt = handleClean ? (handleClean.startsWith('@') ? handleClean : `@${handleClean}`) : '';

  if (handleWithAt && lower.includes(handleWithAt)) return true;

  for (const alias of aliases) {
    if (!alias) continue;
    if (alias.startsWith('@')) {
      if (lower.includes(alias)) return true;
      continue;
    }
    const escaped = escapeRegExp(alias);
    if (alias.length <= 5) {
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(text)) return true;
    } else if (lower.includes(alias)) {
      return true;
    }
  }
  return false;
}

export function extractObjectivePhrases(objectives?: string | null): string[] {
  if (!objectives) return [];
  return objectives
    .split(/[.\n;•-]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 6);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeAlignmentScore(text: string, objectives?: string | null, brandAttribution = false) {
  if (!text) return 0;
  const phrases = extractObjectivePhrases(objectives);
  if (phrases.length === 0) {
    return brandAttribution ? 40 : 20;
  }
  const lower = text.toLowerCase();
  const matched = phrases.filter((p) => lower.includes(p.toLowerCase()));
  const ratio = matched.length / phrases.length;
  const base = brandAttribution ? 25 : 10;
  const score = Math.round(base + 45 * ratio);
  return clamp(score, 0, 70);
}

function computeComplianceScore(usedCampaignLink: boolean, brandAttribution: boolean) {
  let score = 0;
  if (usedCampaignLink) score += 8;
  if (brandAttribution) score += 7;
  return clamp(score, 0, 15);
}

function computeClarityScore(text: string) {
  if (!text) return 0;
  const trimmed = text.trim();
  const len = trimmed.length;
  let score = 2;
  if (len >= 120) score = 10;
  else if (len >= 80) score = 8;
  else if (len >= 40) score = 6;
  else if (len >= 20) score = 4;

  const urlCount = (trimmed.match(/https?:\/\/\S+/gi) || []).length;
  if (urlCount > 3) score -= 2;

  const alpha = trimmed.replace(/[^a-zA-Z]/g, '');
  if (alpha.length > 10) {
    const upper = alpha.replace(/[^A-Z]/g, '').length;
    if (upper / alpha.length > 0.6) score -= 2;
  }

  return clamp(score, 0, 10);
}

function computeSafetyScore(text: string) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  const flags = ['guaranteed', 'risk-free', '100%', 'double your', 'get rich', 'no risk'];
  const hit = flags.some((f) => lower.includes(f));
  return hit ? 2 : 5;
}

function computeEngagementBoost(likes = 0, replies = 0, reposts = 0) {
  const metric = Math.max(0, Number(likes) + Number(replies) + 2 * Number(reposts));
  const cap = 200;
  const boost = Math.log1p(metric) / Math.log1p(cap);
  return {
    metric,
    boost: clamp(boost, 0, 1),
  };
}

export function scoreQuestPost(input: QuestScoreInput): QuestScoreResult {
  const alignmentScore = computeAlignmentScore(input.text, input.objectives, input.brandAttribution);
  const complianceScore = computeComplianceScore(input.usedCampaignLink, input.brandAttribution);
  const clarityScore = computeClarityScore(input.text);
  const safetyScore = computeSafetyScore(input.text);
  const postQualityScore = clamp(alignmentScore + complianceScore + clarityScore + safetyScore, 0, 100);

  const engagement = input.platform === 'x'
    ? computeEngagementBoost(input.likes || 0, input.replies || 0, input.reposts || 0)
    : { metric: 0, boost: 0 };

  const postFinalScore = Number((postQualityScore * (1 + 0.1 * engagement.boost)).toFixed(2));

  return {
    alignmentScore,
    complianceScore,
    clarityScore,
    safetyScore,
    postQualityScore,
    postFinalScore,
    engagementMetric: engagement.metric,
    engagementBoost: engagement.boost,
    reason: {
      alignment: { score: alignmentScore },
      compliance: { score: complianceScore, usedCampaignLink: input.usedCampaignLink, brandAttribution: input.brandAttribution },
      clarity: { score: clarityScore },
      safety: { score: safetyScore },
      engagement: { metric: engagement.metric, boost: engagement.boost },
    },
  };
}
