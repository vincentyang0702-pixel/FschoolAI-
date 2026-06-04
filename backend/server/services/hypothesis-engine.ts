/**
 * NeuroAGI Hypothesis Engine
 * 
 * The brain forms theories about a person. Not just observations — theories.
 * 
 * A hypothesis is a specific, testable claim about why a person behaves a certain way.
 * It is different from a pattern (observed behavior) and different from memory (known facts).
 * 
 * Examples:
 * - "Vincent avoids starting tasks when sleep-deprived, not when stressed"
 * - "Vincent performs better academically when he has a social anchor (friend studying nearby)"
 * - "Vincent's procrastination is driven by perfectionism, not laziness"
 * 
 * The engine:
 * 1. Forms hypotheses from reflections and patterns
 * 2. Tracks evidence for and against each hypothesis
 * 3. Confirms or rejects hypotheses based on accumulated evidence
 * 4. Uses confirmed hypotheses to improve interventions
 * 5. Surfaces rejected hypotheses to prevent the brain from being wrong in the same way twice
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HypothesisFormInput {
  person_id: string;
  hypothesis_text: string;
  domain: 'behavioral' | 'academic' | 'emotional' | 'social' | 'cognitive' | 'motivational';
  initial_evidence?: string;
  confidence_initial?: number;
  source?: 'reflection' | 'pattern' | 'signal' | 'manual';
}

export interface EvidenceInput {
  hypothesis_id: string;
  evidence_text: string;
  supports: boolean; // true = supports hypothesis, false = challenges it
  signal_id?: string;
  reflection_id?: string;
  weight?: number; // 0.0–1.0, how strong is this evidence
}

// ─────────────────────────────────────────────────────────────────────────────
// Hypothesis Engine
// ─────────────────────────────────────────────────────────────────────────────

export class HypothesisEngine {

  /**
   * Form a new hypothesis about a person
   */
  async form(input: HypothesisFormInput): Promise<{ success: boolean; hypothesis_id?: string; error?: string }> {
    try {
      // Check if a similar hypothesis already exists
      const { data: existing } = await supabase
        .schema('brain')
        .from('hypotheses')
        .select('id, hypothesis, status')
        .eq('person_id', input.person_id)
        .in('status', ['forming', 'testing'])
        .limit(20);

      // Simple dedup check — don't form if very similar hypothesis exists
      if (existing && existing.length > 0) {
        const similar = existing.find(h => 
          this.textSimilarity(h.hypothesis, input.hypothesis_text) > 0.7
        );
        if (similar) {
          return { success: true, hypothesis_id: similar.id }; // Return existing
        }
      }

      const { data, error } = await supabase
        .schema('brain')
        .from('hypotheses')
        .insert({
          person_id: input.person_id,
          hypothesis: input.hypothesis_text,
          domain: input.domain,
          status: 'forming',
          confidence: input.confidence_initial || 0.3,
          evidence_for: 0,
          evidence_against: 0,
          initial_evidence: input.initial_evidence || null,
          source: input.source || 'reflection',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;
      return { success: true, hypothesis_id: data.id };

    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Add evidence to a hypothesis and update its status
   */
  async addEvidence(input: EvidenceInput): Promise<{ success: boolean; new_status?: string; new_confidence?: number }> {
    try {
      // Get current hypothesis
      const { data: hypothesis, error: fetchError } = await supabase
        .schema('brain')
        .from('hypotheses')
        .select('*')
        .eq('id', input.hypothesis_id)
        .single();

      if (fetchError || !hypothesis) throw new Error('Hypothesis not found');
      if (hypothesis.status === 'confirmed' || hypothesis.status === 'rejected') {
        return { success: true, new_status: hypothesis.status }; // Already decided
      }

      // Update evidence counts
      const weight = input.weight || 1.0;
      const newEvidenceFor = hypothesis.evidence_for + (input.supports ? weight : 0);
      const newEvidenceAgainst = hypothesis.evidence_against + (!input.supports ? weight : 0);
      const totalEvidence = newEvidenceFor + newEvidenceAgainst;

      // Calculate new confidence
      let newConfidence = totalEvidence > 0 
        ? newEvidenceFor / totalEvidence 
        : hypothesis.confidence;

      // Determine new status
      let newStatus = hypothesis.status;
      if (totalEvidence >= 5) {
        if (newConfidence >= 0.75) newStatus = 'confirmed';
        else if (newConfidence <= 0.25) newStatus = 'rejected';
        else newStatus = 'testing';
      } else if (totalEvidence >= 2) {
        newStatus = 'testing';
      }

      // Update hypothesis
      await supabase
        .schema('brain')
        .from('hypotheses')
        .update({
          evidence_for: newEvidenceFor,
          evidence_against: newEvidenceAgainst,
          confidence: newConfidence,
          status: newStatus,
          last_evidence_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Store evidence log in metadata
          evidence_log: [
            ...(hypothesis.evidence_log || []),
            {
              text: input.evidence_text,
              supports: input.supports,
              weight,
              at: new Date().toISOString(),
            }
          ],
        })
        .eq('id', input.hypothesis_id);

      return { success: true, new_status: newStatus, new_confidence: newConfidence };

    } catch (err: any) {
      return { success: false };
    }
  }

  /**
   * Run hypothesis evaluation against recent signals
   * Called after each reflection to check if signals confirm/challenge hypotheses
   */
  async evaluateAgainstSignals(personId: string): Promise<{
    evaluated: number;
    confirmed: number;
    rejected: number;
  }> {
    try {
      // Get active hypotheses
      const { data: hypotheses } = await supabase
        .schema('brain')
        .from('hypotheses')
        .select('*')
        .eq('person_id', personId)
        .in('status', ['forming', 'testing'])
        .limit(10);

      if (!hypotheses || hypotheses.length === 0) return { evaluated: 0, confirmed: 0, rejected: 0 };

      // Get recent signals (last 24h)
      const { data: signals } = await supabase
        .schema('brain')
        .from('signals')
        .select('*')
        .eq('person_id', personId)
        .gte('occurred_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(50);

      if (!signals || signals.length === 0) return { evaluated: 0, confirmed: 0, rejected: 0 };

      // Ask Claude to evaluate each hypothesis against signals
      const evaluationPrompt = `You are evaluating hypotheses about a person against recent behavioral signals.

HYPOTHESES TO EVALUATE:
${hypotheses.map((h, i) => `${i + 1}. [${h.id}] "${h.hypothesis}" (domain: ${h.domain}, current confidence: ${h.confidence})`).join('\n')}

RECENT SIGNALS (last 24h):
${signals.map(s => `- ${s.signal_type}${s.subtype ? '/' + s.subtype : ''}: ${s.value_text || s.value || JSON.stringify(s.value_json || {})}`).join('\n')}

For each hypothesis, determine if the signals provide evidence for or against it.
Only include hypotheses where the signals are actually relevant.

Respond with JSON array:
[
  {
    "hypothesis_id": "uuid",
    "relevant": true/false,
    "supports": true/false,
    "evidence_text": "Why this signal supports/challenges the hypothesis",
    "weight": 0.0-1.0
  }
]`;

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: evaluationPrompt }],
        system: 'You evaluate hypotheses against evidence. Respond with valid JSON only.',
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return { evaluated: 0, confirmed: 0, rejected: 0 };

      const evaluations = JSON.parse(jsonMatch[0]);
      let confirmed = 0;
      let rejected = 0;

      for (const eval_ of evaluations) {
        if (!eval_.relevant) continue;
        const result = await this.addEvidence({
          hypothesis_id: eval_.hypothesis_id,
          evidence_text: eval_.evidence_text,
          supports: eval_.supports,
          weight: eval_.weight || 0.5,
        });
        if (result.new_status === 'confirmed') confirmed++;
        if (result.new_status === 'rejected') rejected++;
      }

      return { evaluated: evaluations.filter((e: any) => e.relevant).length, confirmed, rejected };

    } catch (err: any) {
      console.error('[HypothesisEngine] Evaluation error:', err);
      return { evaluated: 0, confirmed: 0, rejected: 0 };
    }
  }

  /**
   * Get all confirmed hypotheses for a person — used by the intervention engine
   */
  async getConfirmed(personId: string): Promise<any[]> {
    const { data } = await supabase
      .schema('brain')
      .from('hypotheses')
      .select('*')
      .eq('person_id', personId)
      .eq('status', 'confirmed')
      .order('confidence', { ascending: false });

    return data || [];
  }

  /**
   * Get active hypotheses being tested
   */
  async getActive(personId: string): Promise<any[]> {
    const { data } = await supabase
      .schema('brain')
      .from('hypotheses')
      .select('*')
      .eq('person_id', personId)
      .in('status', ['forming', 'testing'])
      .order('updated_at', { ascending: false });

    return data || [];
  }

  /**
   * Seed initial hypotheses from existing patterns
   * Run once when a person is onboarded to the new brain
   */
  async seedFromPatterns(personId: string): Promise<{ seeded: number }> {
    const { data: patterns } = await supabase
      .schema('neuro')
      .from('patterns')
      .select('*')
      .eq('person_id', personId)
      .gte('confidence', 0.6)
      .order('confidence', { ascending: false })
      .limit(10);

    if (!patterns || patterns.length === 0) return { seeded: 0 };

    // Ask Claude to convert patterns into hypotheses
    const prompt = `Convert these behavioral patterns into testable hypotheses.

PATTERNS:
${patterns.map(p => `- "${p.pattern_text}" (confidence: ${p.confidence})`).join('\n')}

For each pattern, form a deeper "why" hypothesis — not just what the behavior is, but why it happens.

Respond with JSON array:
[
  {
    "hypothesis": "Specific testable claim about why this behavior occurs",
    "domain": "behavioral|academic|emotional|social|cognitive|motivational",
    "initial_evidence": "The pattern that suggested this hypothesis",
    "confidence_initial": 0.2-0.5
  }
]

Only include hypotheses that are genuinely testable and non-obvious. Maximum 5.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
      system: 'Convert behavioral patterns into testable hypotheses. Respond with valid JSON only.',
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { seeded: 0 };

    const hypotheses = JSON.parse(jsonMatch[0]);
    let seeded = 0;

    for (const h of hypotheses.slice(0, 5)) {
      const result = await this.form({
        person_id: personId,
        hypothesis_text: h.hypothesis,
        domain: h.domain,
        initial_evidence: h.initial_evidence,
        confidence_initial: h.confidence_initial,
        source: 'pattern',
      });
      if (result.success) seeded++;
    }

    return { seeded };
  }

  // Simple text similarity (Jaccard on words)
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }
}

export const hypothesisEngine = new HypothesisEngine();
