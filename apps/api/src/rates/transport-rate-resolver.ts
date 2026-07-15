import { Injectable } from '@nestjs/common';

export interface TransportRateRuleCandidate {
  readonly amount: bigint;
  readonly city: string | null;
  readonly department: string | null;
  readonly id: string;
  readonly priority: number;
  readonly ruleKey: string;
  readonly shopifyProductId: string | null;
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
}

export interface TransportRatePolicyCandidate {
  readonly currency: string;
  readonly id: string;
  readonly rules: readonly TransportRateRuleCandidate[];
  readonly scope: 'global' | 'store';
  readonly version: number;
}

export interface TransportRateResolutionInput {
  readonly city: string | null;
  readonly currency: string;
  readonly department: string | null;
  readonly evaluatedAt: Date;
  readonly policies: readonly TransportRatePolicyCandidate[];
  readonly shopifyProductIds: readonly string[];
}

export interface TransportRateResolution {
  readonly amount: bigint;
  readonly currency: string;
  readonly policyId: string;
  readonly policyScope: 'global' | 'store';
  readonly policyVersion: number;
  readonly priority: number;
  readonly ruleId: string;
  readonly ruleKey: string;
  readonly specificity: number;
}

export class TransportRateResolutionError extends Error {
  public constructor(
    public readonly code: 'AMBIGUOUS_MATCH' | 'INVALID_INPUT' | 'NO_MATCH',
    message: string,
  ) {
    super(message);
    this.name = 'TransportRateResolutionError';
  }
}

interface RankedMatch extends TransportRateResolution {
  readonly scopeRank: number;
}

@Injectable()
export class TransportRateResolver {
  public resolve(input: TransportRateResolutionInput): TransportRateResolution {
    if (
      input.currency !== 'COP' ||
      !Number.isFinite(input.evaluatedAt.getTime()) ||
      input.policies.length === 0
    ) {
      throw new TransportRateResolutionError(
        'INVALID_INPUT',
        'Transport rate input is invalid or unsupported',
      );
    }
    const city = this.normalizeLocation(input.city);
    const department = this.normalizeLocation(input.department);
    const productIds = new Set(input.shopifyProductIds);
    const matches: RankedMatch[] = [];
    for (const policy of input.policies) {
      if (policy.currency !== input.currency) continue;
      for (const rule of policy.rules) {
        if (!this.isActive(rule, input.evaluatedAt)) continue;
        const ruleCity = this.normalizeLocation(rule.city);
        const ruleDepartment = this.normalizeLocation(rule.department);
        if (ruleCity !== null && ruleCity !== city) continue;
        if (ruleDepartment !== null && ruleDepartment !== department) continue;
        if (rule.shopifyProductId !== null && !productIds.has(rule.shopifyProductId)) continue;
        const specificity = [ruleCity, ruleDepartment, rule.shopifyProductId].filter(
          (value) => value !== null,
        ).length;
        matches.push({
          amount: rule.amount,
          currency: policy.currency,
          policyId: policy.id,
          policyScope: policy.scope,
          policyVersion: policy.version,
          priority: rule.priority,
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          scopeRank: policy.scope === 'store' ? 1 : 0,
          specificity,
        });
      }
    }
    if (matches.length === 0) {
      throw new TransportRateResolutionError('NO_MATCH', 'No active transport rate rule matched');
    }
    const ranked = [...matches].sort((left, right) => {
      return (
        right.priority - left.priority ||
        right.specificity - left.specificity ||
        right.scopeRank - left.scopeRank ||
        left.ruleKey.localeCompare(right.ruleKey) ||
        left.ruleId.localeCompare(right.ruleId)
      );
    });
    const first = ranked[0];
    if (first === undefined) throw new Error('Transport rate winner is unexpectedly missing');
    const tied = ranked.filter(
      (candidate) =>
        candidate.priority === first.priority &&
        candidate.specificity === first.specificity &&
        candidate.scopeRank === first.scopeRank,
    );
    if (tied.some((candidate) => candidate.amount !== first.amount)) {
      throw new TransportRateResolutionError(
        'AMBIGUOUS_MATCH',
        'Transport rate rules produced contradictory amounts',
      );
    }
    return {
      amount: first.amount,
      currency: first.currency,
      policyId: first.policyId,
      policyScope: first.policyScope,
      policyVersion: first.policyVersion,
      priority: first.priority,
      ruleId: first.ruleId,
      ruleKey: first.ruleKey,
      specificity: first.specificity,
    };
  }

  private isActive(rule: TransportRateRuleCandidate, evaluatedAt: Date): boolean {
    return (
      (rule.validFrom === null || rule.validFrom <= evaluatedAt) &&
      (rule.validTo === null || evaluatedAt < rule.validTo)
    );
  }

  private normalizeLocation(value: string | null): string | null {
    if (value === null) return null;
    const normalized = value
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('es-CO')
      .replace(/\s+/gu, ' ');
    return normalized === '' ? null : normalized;
  }
}
