/**
 * NeuroAGI Platform Service
 * 
 * Unified brain management system for all products:
 * - Manages user brains across FschoolAI, Reggie, and future products
 * - Provides unified API for brain access
 * - Handles product switching and context
 * - Generates cross-product insights
 * - Ensures data consistency and privacy
 */

import { createClient } from '@supabase/supabase-js';

interface UserBrain {
  userId: string;
  identity: {
    name: string;
    email: string;
    role: string; // 'student', 'teacher', 'admin', etc.
    products: string[]; // ['fschoolai', 'reggie']
  };
  signals: {
    behavioral: any[];
    emotional: any[];
    knowledge: any[];
    context: any[];
    outcome: any[];
    biometric: any[];
  };
  knowledgeGraph: {
    concepts: any[];
    relationships: any[];
    insights: any[];
  };
  synthesis: {
    predictions: any[];
    recommendations: any[];
    autonomousActions: any[];
  };
  productContexts: {
    [product: string]: ProductContext;
  };
}

interface ProductContext {
  product: string;
  role: string;
  signals: any[];
  insights: any[];
  recentActivity: any[];
  lastActive: Date;
}

interface CrossProductInsight {
  title: string;
  description: string;
  sourceProducts: string[];
  confidence: number;
  actionable: boolean;
  recommendation: string;
}

export class NeuroAGIService {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  /**
   * Get complete user brain (all products)
   */
  async getUserBrain(userId: string): Promise<UserBrain> {
    try {
      // Get user identity
      const { data: user } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!user) {
        throw new Error('User not found');
      }

      // Get all signals (unified)
      const signals = await this.getAllSignals(userId);

      // Get knowledge graph
      const knowledgeGraph = await this.getKnowledgeGraph(userId);

      // Get synthesis data
      const synthesis = await this.getSynthesis(userId);

      // Get product contexts
      const productContexts = await this.getProductContexts(userId);

      return {
        userId,
        identity: {
          name: user.name,
          email: user.email,
          role: user.role || 'student',
          products: Object.keys(productContexts),
        },
        signals,
        knowledgeGraph,
        synthesis,
        productContexts,
      };
    } catch (error) {
      console.error('Error getting user brain:', error);
      throw error;
    }
  }

  /**
   * Get brain data for specific product
   */
  async getProductBrain(userId: string, product: string): Promise<UserBrain> {
    try {
      const fullBrain = await this.getUserBrain(userId);

      // Filter signals by product
      const filteredBrain: UserBrain = {
        ...fullBrain,
        signals: {
          behavioral: fullBrain.signals.behavioral.filter(
            (s: any) => s.product === product
          ),
          emotional: fullBrain.signals.emotional.filter(
            (s: any) => s.product === product
          ),
          knowledge: fullBrain.signals.knowledge.filter(
            (s: any) => s.product === product
          ),
          context: fullBrain.signals.context.filter(
            (s: any) => s.product === product
          ),
          outcome: fullBrain.signals.outcome.filter(
            (s: any) => s.product === product
          ),
          biometric: fullBrain.signals.biometric.filter(
            (s: any) => s.product === product
          ),
        },
        productContexts: {
          [product]: fullBrain.productContexts[product],
        },
      };

      return filteredBrain;
    } catch (error) {
      console.error(`Error getting product brain for ${product}:`, error);
      throw error;
    }
  }

  /**
   * Get all signals for user (unified from all products)
   */
  private async getAllSignals(userId: string): Promise<UserBrain['signals']> {
    try {
      const [behavioral, emotional, knowledge, context, outcome, biometric] =
        await Promise.all([
          this.supabase
            .from('behavioral_signals')
            .select('*')
            .eq('student_id', userId),
          this.supabase
            .from('emotional_signals')
            .select('*')
            .eq('student_id', userId),
          this.supabase
            .from('knowledge_signals')
            .select('*')
            .eq('student_id', userId),
          this.supabase
            .from('context_signals')
            .select('*')
            .eq('student_id', userId),
          this.supabase
            .from('outcome_signals')
            .select('*')
            .eq('student_id', userId),
          this.supabase
            .from('biometric_signals')
            .select('*')
            .eq('student_id', userId),
        ]);

      return {
        behavioral: behavioral.data || [],
        emotional: emotional.data || [],
        knowledge: knowledge.data || [],
        context: context.data || [],
        outcome: outcome.data || [],
        biometric: biometric.data || [],
      };
    } catch (error) {
      console.error('Error getting all signals:', error);
      return {
        behavioral: [],
        emotional: [],
        knowledge: [],
        context: [],
        outcome: [],
        biometric: [],
      };
    }
  }

  /**
   * Get knowledge graph for user
   */
  private async getKnowledgeGraph(userId: string): Promise<UserBrain['knowledgeGraph']> {
    try {
      const [concepts, relationships, insights] = await Promise.all([
        this.supabase
          .from('concept_progress')
          .select('*')
          .eq('student_id', userId),
        this.supabase
          .from('concept_connections')
          .select('*')
          .eq('student_id', userId),
        this.supabase
          .from('insights')
          .select('*')
          .eq('student_id', userId),
      ]);

      return {
        concepts: concepts.data || [],
        relationships: relationships.data || [],
        insights: insights.data || [],
      };
    } catch (error) {
      console.error('Error getting knowledge graph:', error);
      return {
        concepts: [],
        relationships: [],
        insights: [],
      };
    }
  }

  /**
   * Get synthesis data for user
   */
  private async getSynthesis(userId: string): Promise<UserBrain['synthesis']> {
    try {
      const [predictions, recommendations, autonomousActions] = await Promise.all([
        this.supabase
          .from('predictions')
          .select('*')
          .eq('student_id', userId),
        this.supabase
          .from('recommendations')
          .select('*')
          .eq('student_id', userId),
        this.supabase
          .from('autonomous_actions')
          .select('*')
          .eq('student_id', userId),
      ]);

      return {
        predictions: predictions.data || [],
        recommendations: recommendations.data || [],
        autonomousActions: autonomousActions.data || [],
      };
    } catch (error) {
      console.error('Error getting synthesis:', error);
      return {
        predictions: [],
        recommendations: [],
        autonomousActions: [],
      };
    }
  }

  /**
   * Get product-specific contexts
   */
  private async getProductContexts(userId: string): Promise<Record<string, ProductContext>> {
    try {
      const products = ['fschoolai', 'reggie'];
      const contexts: Record<string, ProductContext> = {};

      for (const product of products) {
        const { data: signals } = await this.supabase
          .from('behavioral_signals')
          .select('*')
          .eq('student_id', userId)
          .eq('product', product)
          .order('timestamp', { ascending: false })
          .limit(10);

        const { data: insights } = await this.supabase
          .from('insights')
          .select('*')
          .eq('student_id', userId)
          .eq('product', product)
          .order('created_at', { ascending: false })
          .limit(5);

        contexts[product] = {
          product,
          role: product === 'fschoolai' ? 'teacher' : 'student',
          signals: signals || [],
          insights: insights || [],
          recentActivity: signals || [],
          lastActive: signals?.[0]?.timestamp ? new Date(signals[0].timestamp) : new Date(),
        };
      }

      return contexts;
    } catch (error) {
      console.error('Error getting product contexts:', error);
      return {};
    }
  }

  /**
   * Generate cross-product insights
   */
  async generateCrossProductInsights(userId: string): Promise<CrossProductInsight[]> {
    try {
      const brain = await this.getUserBrain(userId);
      const insights: CrossProductInsight[] = [];

      // Insight 1: Learning from teaching
      const fschoolaiEmotional = brain.signals.emotional.filter(
        (s: any) => s.product === 'fschoolai'
      );
      const reggieEmotional = brain.signals.emotional.filter(
        (s: any) => s.product === 'reggie'
      );

      if (fschoolaiEmotional.length > 0 && reggieEmotional.length > 0) {
        const fschoolaiStress = fschoolaiEmotional.filter(
          (s: any) => s.emotion_type === 'stress'
        ).length;
        const reggieStress = reggieEmotional.filter(
          (s: any) => s.emotion_type === 'stress'
        ).length;

        if (fschoolaiStress > reggieStress) {
          insights.push({
            title: 'Teaching Stress Detected',
            description: 'You experience more stress while teaching than learning. Consider stress management techniques.',
            sourceProducts: ['fschoolai', 'reggie'],
            confidence: 0.8,
            actionable: true,
            recommendation: 'Try the "Take a Break" coping strategy between classes.',
          });
        }
      }

      // Insight 2: Knowledge transfer
      const reggieKnowledge = brain.signals.knowledge.filter(
        (s: any) => s.product === 'reggie'
      );
      if (reggieKnowledge.length > 0) {
        const avgMastery =
          reggieKnowledge.reduce((sum: number, k: any) => sum + k.mastery_level, 0) /
          reggieKnowledge.length;

        if (avgMastery > 0.8) {
          insights.push({
            title: 'Strong Learning Progress',
            description: 'Your learning mastery is above 80%. You could help other students.',
            sourceProducts: ['reggie'],
            confidence: 0.9,
            actionable: true,
            recommendation: 'Consider becoming a tutor or study group leader.',
          });
        }
      }

      // Insight 3: Behavioral patterns
      const fschoolaiActivity = brain.productContexts['fschoolai']?.recentActivity || [];
      const reggieActivity = brain.productContexts['reggie']?.recentActivity || [];

      if (fschoolaiActivity.length > reggieActivity.length) {
        insights.push({
          title: 'Teaching-Focused Activity',
          description: 'You spend more time on teaching (FschoolAI) than learning (Reggie).',
          sourceProducts: ['fschoolai', 'reggie'],
          confidence: 0.85,
          actionable: true,
          recommendation: 'Allocate more time to your own learning to stay sharp.',
        });
      }

      return insights;
    } catch (error) {
      console.error('Error generating cross-product insights:', error);
      return [];
    }
  }

  /**
   * Switch product context
   */
  async switchProductContext(userId: string, product: string): Promise<ProductContext> {
    try {
      const brain = await this.getUserBrain(userId);
      const context = brain.productContexts[product];

      if (!context) {
        throw new Error(`Product ${product} not found for user`);
      }

      // Log product switch
      await this.supabase.from('changelog').insert({
        user_id: userId,
        change_type: 'product_switch',
        change_description: `User switched to ${product}`,
        changed_by: 'neuro_agi_service',
        metadata: { from_product: 'unknown', to_product: product },
      });

      return context;
    } catch (error) {
      console.error('Error switching product context:', error);
      throw error;
    }
  }

  /**
   * Get brain health metrics
   */
  async getBrainHealthMetrics(userId: string): Promise<Record<string, any>> {
    try {
      const brain = await this.getUserBrain(userId);

      return {
        totalSignals:
          brain.signals.behavioral.length +
          brain.signals.emotional.length +
          brain.signals.knowledge.length,
        conceptsTracked: brain.knowledgeGraph.concepts.length,
        avgMastery:
          brain.signals.knowledge.length > 0
            ? brain.signals.knowledge.reduce(
                (sum: number, k: any) => sum + k.mastery_level,
                0
              ) / brain.signals.knowledge.length
            : 0,
        emotionalState:
          brain.signals.emotional.length > 0
            ? brain.signals.emotional[brain.signals.emotional.length - 1]
            : null,
        lastActivity: Math.max(
          ...Object.values(brain.productContexts).map((ctx: any) =>
            new Date(ctx.lastActive).getTime()
          )
        ),
        products: brain.identity.products,
      };
    } catch (error) {
      console.error('Error getting brain health metrics:', error);
      return {};
    }
  }

  /**
   * Export brain data (for user portability)
   */
  async exportBrainData(userId: string): Promise<UserBrain> {
    try {
      return await this.getUserBrain(userId);
    } catch (error) {
      console.error('Error exporting brain data:', error);
      throw error;
    }
  }

  /**
   * Delete brain data (user privacy)
   */
  async deleteBrainData(userId: string): Promise<void> {
    try {
      // Delete all signals
      await Promise.all([
        this.supabase.from('behavioral_signals').delete().eq('student_id', userId),
        this.supabase.from('emotional_signals').delete().eq('student_id', userId),
        this.supabase.from('knowledge_signals').delete().eq('student_id', userId),
        this.supabase.from('context_signals').delete().eq('student_id', userId),
        this.supabase.from('outcome_signals').delete().eq('student_id', userId),
        this.supabase.from('biometric_signals').delete().eq('student_id', userId),
      ]);

      // Delete knowledge graph
      await Promise.all([
        this.supabase.from('concept_progress').delete().eq('student_id', userId),
        this.supabase.from('concept_connections').delete().eq('student_id', userId),
        this.supabase.from('insights').delete().eq('student_id', userId),
      ]);

      // Log deletion
      await this.supabase.from('changelog').insert({
        user_id: userId,
        change_type: 'brain_deleted',
        change_description: 'User deleted all brain data',
        changed_by: 'neuro_agi_service',
      });
    } catch (error) {
      console.error('Error deleting brain data:', error);
      throw error;
    }
  }

  /**
   * Update brain with a new interaction signal.
   * Called by the orchestrator after every user interaction.
   */
  async updateBrainSignal(userId: string, signal: {
    type: string;
    product: string;
    agentUsed?: string;
    message?: string;
    response?: string;
    courseId?: string;
    assignmentId?: string;
    timestamp: Date;
    [key: string]: any;
  }): Promise<void> {
    try {
      await this.supabase.from('brain_signals').insert({
        user_id: userId,
        signal_type: signal.type,
        product: signal.product,
        agent_used: signal.agentUsed || null,
        message_content: signal.message ? signal.message.slice(0, 1000) : null,
        response_content: signal.response ? signal.response.slice(0, 2000) : null,
        course_id: signal.courseId || null,
        assignment_id: signal.assignmentId || null,
        created_at: signal.timestamp.toISOString(),
        metadata: JSON.stringify({ ...signal, message: undefined, response: undefined }),
      });
    } catch (err) {
      console.warn('[NeuroAGI] Brain signal update failed (non-fatal):', err);
    }
  }

}

export default NeuroAGIService;
