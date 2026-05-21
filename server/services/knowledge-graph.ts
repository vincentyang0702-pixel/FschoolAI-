/**
 * Knowledge Graph Engine
 * 
 * Manages the student's knowledge graph:
 * - Concept tracking and mastery levels
 * - Concept relationships and connections
 * - Gap detection
 * - Learning opportunity identification
 * - Graph algorithms for concept relationships
 */

import { createClient } from '@supabase/supabase-js';

interface Concept {
  id: string;
  name: string;
  masteryLevel: number; // 0-1
  courseId?: string;
  lastReviewed?: Date;
  reviewCount: number;
}

interface ConceptConnection {
  sourceConceptId: string;
  targetConceptId: string;
  type: 'prerequisite' | 'related' | 'builds_on' | 'opposite';
  strength: number; // 0-1
}

interface KnowledgeGap {
  conceptId: string;
  conceptName: string;
  masteryLevel: number;
  prerequisites: Concept[];
  relatedConcepts: Concept[];
}

interface LearningOpportunity {
  conceptId: string;
  conceptName: string;
  reason: string;
  confidence: number;
  prerequisites: Concept[];
}

export class KnowledgeGraphEngine {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  /**
   * Add or update a concept in the knowledge graph
   */
  async addConcept(
    userId: string,
    conceptName: string,
    courseId?: string,
    masteryLevel: number = 0
  ): Promise<Concept> {
    try {
      const { data, error } = await this.supabase
        .from('concept_progress')
        .upsert(
          {
            user_id: userId,
            course_id: courseId,
            concept_name: conceptName,
            mastery_level: masteryLevel,
            review_count: 0,
            created_at: new Date(),
          },
          {
            onConflict: 'user_id,course_id,concept_name',
          }
        )
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.concept_name,
        masteryLevel: data.mastery_level,
        courseId: data.course_id,
        reviewCount: data.review_count,
      };
    } catch (error) {
      console.error('Error adding concept:', error);
      throw error;
    }
  }

  /**
   * Update concept mastery level
   */
  async updateConceptMastery(
    userId: string,
    conceptId: string,
    newMasteryLevel: number
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('concept_progress')
        .update({
          mastery_level: Math.min(1, Math.max(0, newMasteryLevel)),
          last_reviewed: new Date(),
          review_count: this.supabase.rpc('increment_review_count', {
            concept_id: conceptId,
          }),
        })
        .eq('id', conceptId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating concept mastery:', error);
      throw error;
    }
  }

  /**
   * Create a connection between two concepts
   */
  async createConnection(
    userId: string,
    sourceConceptId: string,
    targetConceptId: string,
    type: ConceptConnection['type'],
    strength: number = 0.5
  ): Promise<ConceptConnection> {
    try {
      const { data, error } = await this.supabase
        .from('concept_connections')
        .insert({
          user_id: userId,
          source_concept_id: sourceConceptId,
          target_concept_id: targetConceptId,
          connection_type: type,
          strength: Math.min(1, Math.max(0, strength)),
        })
        .select()
        .single();

      if (error) throw error;

      return {
        sourceConceptId: data.source_concept_id,
        targetConceptId: data.target_concept_id,
        type: data.connection_type,
        strength: data.strength,
      };
    } catch (error) {
      console.error('Error creating connection:', error);
      throw error;
    }
  }

  /**
   * Strengthen a connection between concepts
   */
  async strengthenConnection(
    userId: string,
    sourceConceptId: string,
    targetConceptId: string,
    strengthIncrease: number = 0.1
  ): Promise<void> {
    try {
      // Get current connection strength
      const { data: connection } = await this.supabase
        .from('concept_connections')
        .select('strength')
        .eq('user_id', userId)
        .eq('source_concept_id', sourceConceptId)
        .eq('target_concept_id', targetConceptId)
        .single();

      if (!connection) {
        // Connection doesn't exist, create it
        await this.createConnection(
          userId,
          sourceConceptId,
          targetConceptId,
          'related',
          strengthIncrease
        );
        return;
      }

      // Update strength
      const newStrength = Math.min(1, connection.strength + strengthIncrease);
      const { error } = await this.supabase
        .from('concept_connections')
        .update({ strength: newStrength })
        .eq('user_id', userId)
        .eq('source_concept_id', sourceConceptId)
        .eq('target_concept_id', targetConceptId);

      if (error) throw error;
    } catch (error) {
      console.error('Error strengthening connection:', error);
      throw error;
    }
  }

  /**
   * Detect knowledge gaps (concepts with low mastery)
   */
  async detectKnowledgeGaps(
    userId: string,
    courseId?: string,
    masteryThreshold: number = 0.7
  ): Promise<KnowledgeGap[]> {
    try {
      // Get all concepts below threshold
      let query = this.supabase
        .from('concept_progress')
        .select('*')
        .eq('user_id', userId)
        .lt('mastery_level', masteryThreshold);

      if (courseId) {
        query = query.eq('course_id', courseId);
      }

      const { data: gaps, error } = await query;

      if (error) throw error;

      // For each gap, find prerequisites and related concepts
      const enrichedGaps: KnowledgeGap[] = [];
      for (const gap of (gaps || [])) {
        const prerequisites = await this.getPrerequisiteConcepts(userId, gap.id);
        const relatedConcepts = await this.getRelatedConcepts(userId, gap.id);

        enrichedGaps.push({
          conceptId: gap.id,
          conceptName: gap.concept_name,
          masteryLevel: gap.mastery_level,
          prerequisites,
          relatedConcepts,
        });
      }

      return enrichedGaps;
    } catch (error) {
      console.error('Error detecting knowledge gaps:', error);
      throw error;
    }
  }

  /**
   * Get prerequisite concepts for a given concept
   */
  async getPrerequisiteConcepts(userId: string, conceptId: string): Promise<Concept[]> {
    try {
      const { data, error } = await this.supabase
        .from('concept_connections')
        .select(
          `
          target_concept_id,
          concept_progress!concept_connections_target_concept_id_fkey (
            id,
            concept_name,
            mastery_level,
            review_count
          )
        `
        )
        .eq('user_id', userId)
        .eq('source_concept_id', conceptId)
        .eq('connection_type', 'prerequisite');

      if (error) throw error;

      return data.map((conn: any) => ({
        id: conn.concept_progress.id,
        name: conn.concept_progress.concept_name,
        masteryLevel: conn.concept_progress.mastery_level,
        reviewCount: conn.concept_progress.review_count,
      }));
    } catch (error) {
      console.error('Error getting prerequisite concepts:', error);
      return [];
    }
  }

  /**
   * Get related concepts for a given concept
   */
  async getRelatedConcepts(userId: string, conceptId: string): Promise<Concept[]> {
    try {
      const { data, error } = await this.supabase
        .from('concept_connections')
        .select(
          `
          target_concept_id,
          concept_progress!concept_connections_target_concept_id_fkey (
            id,
            concept_name,
            mastery_level,
            review_count
          )
        `
        )
        .eq('user_id', userId)
        .eq('source_concept_id', conceptId)
        .in('connection_type', ['related', 'builds_on']);

      if (error) throw error;

      return data.map((conn: any) => ({
        id: conn.concept_progress.id,
        name: conn.concept_progress.concept_name,
        masteryLevel: conn.concept_progress.mastery_level,
        reviewCount: conn.concept_progress.review_count,
      }));
    } catch (error) {
      console.error('Error getting related concepts:', error);
      return [];
    }
  }

  /**
   * Identify learning opportunities (concepts to learn next)
   */
  async identifyLearningOpportunities(
    userId: string,
    courseId?: string,
    minConfidence: number = 0.7
  ): Promise<LearningOpportunity[]> {
    try {
      // Get all concepts the student knows well (mastery > 0.7)
      let query = this.supabase
        .from('concept_progress')
        .select('*')
        .eq('user_id', userId)
        .gt('mastery_level', 0.7);

      if (courseId) {
        query = query.eq('course_id', courseId);
      }

      const { data: knownConcepts, error } = await query;

      if (error) throw error;

      const opportunities: LearningOpportunity[] = [];

      // For each known concept, find related concepts that could be learned next
      for (const known of (knownConcepts || [])) {
        const { data: connections } = await this.supabase
          .from('concept_connections')
          .select(
            `
            target_concept_id,
            strength,
            concept_progress!concept_connections_target_concept_id_fkey (
              id,
              concept_name,
              mastery_level
            )
          `
          )
          .eq('user_id', userId)
          .eq('source_concept_id', known.id)
          .in('connection_type', ['builds_on', 'related']);

        if (connections && connections.length > 0) {
          for (const conn of connections) {
            const targetConcept = (conn as any).concept_progress;
            // Only suggest if mastery is low and confidence is high
            if (targetConcept && targetConcept.mastery_level < 0.7 && conn.strength >= minConfidence) {
              const prerequisites = await this.getPrerequisiteConcepts(
                userId,
                targetConcept.id
              );

              opportunities.push({
                conceptId: targetConcept.id,
                conceptName: targetConcept.concept_name,
                reason: `Builds on ${(known as any).concept_name} which you know well`,
                confidence: conn.strength,
                prerequisites,
              });
            }
          }
        }
      }

      // Sort by confidence
      return opportunities.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Error identifying learning opportunities:', error);
      throw error;
    }
  }

  /**
   * Get complete knowledge graph for a user
   */
  async getKnowledgeGraph(userId: string, courseId?: string): Promise<{
    concepts: Concept[];
    connections: ConceptConnection[];
  }> {
    try {
      let conceptQuery = this.supabase
        .from('concept_progress')
        .select('*')
        .eq('user_id', userId);

      if (courseId) {
        conceptQuery = conceptQuery.eq('course_id', courseId);
      }

      const { data: conceptsData, error: conceptError } = await conceptQuery;

      if (conceptError) throw conceptError;

      let connectionQuery = this.supabase
        .from('concept_connections')
        .select('*')
        .eq('user_id', userId);

      const { data: connectionsData, error: connectionError } = await connectionQuery;

      if (connectionError) throw connectionError;

      const concepts = (conceptsData || []).map((c: any) => ({
        id: c.id,
        name: c.concept_name,
        masteryLevel: c.mastery_level,
        courseId: c.course_id,
        reviewCount: c.review_count,
      }));

      const connections = (connectionsData || []).map((c: any) => ({
        sourceConceptId: c.source_concept_id,
        targetConceptId: c.target_concept_id,
        type: c.connection_type,
        strength: c.strength,
      }));

      return { concepts, connections };
    } catch (error) {
      console.error('Error getting knowledge graph:', error);
      throw error;
    }
  }
}

export default KnowledgeGraphEngine;
