/**
 * Study Agent
 * 
 * Helps students understand concepts and explains topics
 * - Breaks down complex topics into digestible parts
 * - Provides examples and analogies
 * - Connects to prior knowledge
 * - Adjusts explanation based on learning style
 */

import { createClient } from '@supabase/supabase-js';

interface StudyRequest {
  userId: string;
  topic: string;
  currentUnderstanding: string;
  learningStyle?: 'visual' | 'audio' | 'kinesthetic' | 'reading';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

interface StudyResponse {
  explanation: string;
  examples: string[];
  analogies: string[];
  relatedConcepts: string[];
  nextSteps: string[];
  confidence: number;
}

export class StudyAgent {
  private supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_ANON_KEY || ''
  );

  /**
   * Process study request and generate explanation
   */
  async process(request: StudyRequest): Promise<StudyResponse> {
    try {
      // 1. Get user's learning profile
      const learningProfile = await this.getUserLearningProfile(request.userId);
      
      // 2. Get related knowledge from brain
      const relatedKnowledge = await this.getRelatedKnowledge(
        request.userId,
        request.topic
      );
      
      // 3. Generate explanation
      const explanation = await this.generateExplanation(
        request.topic,
        request.currentUnderstanding,
        relatedKnowledge,
        request.learningStyle || learningProfile.preferredStyle
      );
      
      // 4. Generate examples
      const examples = await this.generateExamples(
        request.topic,
        request.difficulty || 'intermediate'
      );
      
      // 5. Generate analogies
      const analogies = await this.generateAnalogies(
        request.topic,
        learningProfile.interests
      );
      
      // 6. Identify related concepts
      const relatedConcepts = await this.identifyRelatedConcepts(
        request.topic,
        relatedKnowledge
      );
      
      // 7. Suggest next steps
      const nextSteps = await this.suggestNextSteps(
        request.topic,
        relatedConcepts
      );
      
      // 8. Calculate confidence
      const confidence = this.calculateConfidence(
        explanation,
        examples,
        analogies
      );
      
      // 9. Store interaction in brain
      await this.storeInteraction(request.userId, request.topic, {
        explanation,
        examples,
        analogies,
        confidence,
      });
      
      return {
        explanation,
        examples,
        analogies,
        relatedConcepts,
        nextSteps,
        confidence,
      };
    } catch (error) {
      console.error('Error in Study Agent:', error);
      throw error;
    }
  }

  /**
   * Get user's learning profile
   */
  private async getUserLearningProfile(userId: string): Promise<any> {
    try {
      const { data } = await this.supabase
        .from('user_profiles')
        .select('preferred_learning_style, interests, knowledge_level')
        .eq('user_id', userId)
        .single();
      
      return data || {
        preferredStyle: 'visual',
        interests: [],
        knowledgeLevel: 'beginner',
      };
    } catch (error) {
      console.error('Error getting learning profile:', error);
      return {
        preferredStyle: 'visual',
        interests: [],
        knowledgeLevel: 'beginner',
      };
    }
  }

  /**
   * Get related knowledge from brain's knowledge graph
   */
  private async getRelatedKnowledge(userId: string, topic: string): Promise<any[]> {
    try {
      // Get knowledge graph nodes related to topic
      const { data } = await this.supabase
        .from('knowledge_graph_nodes')
        .select('*')
        .eq('user_id', userId)
        .textSearch('concept_name', topic)
        .limit(10);
      
      return data || [];
    } catch (error) {
      console.error('Error getting related knowledge:', error);
      return [];
    }
  }

  /**
   * Generate explanation for topic
   */
  private async generateExplanation(
    topic: string,
    currentUnderstanding: string,
    relatedKnowledge: any[],
    learningStyle: string
  ): Promise<string> {
    // In production, this would call Claude or another LLM
    // For now, return a structured explanation
    
    let explanation = `Let me explain ${topic} in a way that builds on what you already know.\n\n`;
    
    if (currentUnderstanding) {
      explanation += `You mentioned: "${currentUnderstanding}"\n\n`;
      explanation += `That's a good start! Here's how to expand on that:\n\n`;
    }
    
    // Adjust explanation based on learning style
    switch (learningStyle) {
      case 'visual':
        explanation += `Think of ${topic} as a visual concept where...`;
        break;
      case 'audio':
        explanation += `Imagine explaining ${topic} to a friend...`;
        break;
      case 'kinesthetic':
        explanation += `To understand ${topic}, imagine physically...`;
        break;
      default:
        explanation += `Here's a detailed explanation of ${topic}...`;
    }
    
    return explanation;
  }

  /**
   * Generate examples for topic
   */
  private async generateExamples(topic: string, difficulty: string): Promise<string[]> {
    const examples: string[] = [];
    
    // Generate examples based on difficulty
    if (difficulty === 'beginner') {
      examples.push(`Simple example of ${topic}: ...`);
      examples.push(`Real-world application: ...`);
    } else if (difficulty === 'intermediate') {
      examples.push(`Practical example: ...`);
      examples.push(`Edge case example: ...`);
      examples.push(`Common misconception: ...`);
    } else {
      examples.push(`Advanced example: ...`);
      examples.push(`Complex scenario: ...`);
      examples.push(`Edge case analysis: ...`);
    }
    
    return examples;
  }

  /**
   * Generate analogies for topic
   */
  private async generateAnalogies(topic: string, interests: string[]): Promise<string[]> {
    const analogies: string[] = [];
    
    // Generate analogies based on user interests
    if (interests.includes('sports')) {
      analogies.push(`${topic} is like a sports strategy where...`);
    }
    if (interests.includes('music')) {
      analogies.push(`${topic} is like music composition where...`);
    }
    if (interests.includes('cooking')) {
      analogies.push(`${topic} is like cooking where...`);
    }
    
    // Add default analogies
    if (analogies.length === 0) {
      analogies.push(`${topic} is like building a house where...`);
      analogies.push(`${topic} is like a journey where...`);
    }
    
    return analogies;
  }

  /**
   * Identify related concepts
   */
  private async identifyRelatedConcepts(
    topic: string,
    relatedKnowledge: any[]
  ): Promise<string[]> {
    const concepts: string[] = [];
    
    // Extract concepts from related knowledge
    relatedKnowledge.forEach(item => {
      if (item.concept_name !== topic) {
        concepts.push(item.concept_name);
      }
    });
    
    return concepts.slice(0, 5); // Return top 5
  }

  /**
   * Suggest next steps
   */
  private async suggestNextSteps(
    topic: string,
    relatedConcepts: string[]
  ): Promise<string[]> {
    const steps: string[] = [];
    
    steps.push(`Practice problems on ${topic}`);
    steps.push(`Teach someone else about ${topic}`);
    
    if (relatedConcepts.length > 0) {
      steps.push(`Explore how ${topic} relates to ${relatedConcepts[0]}`);
    }
    
    steps.push(`Review ${topic} in 24 hours`);
    
    return steps;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    explanation: string,
    examples: string[],
    analogies: string[]
  ): number {
    // Confidence based on quality of explanation
    let confidence = 0.7; // Base confidence
    
    if (explanation.length > 200) confidence += 0.1;
    if (examples.length >= 3) confidence += 0.1;
    if (analogies.length >= 2) confidence += 0.1;
    
    return Math.min(confidence, 1);
  }

  /**
   * Store interaction in brain
   */
  private async storeInteraction(
    userId: string,
    topic: string,
    data: any
  ): Promise<void> {
    try {
      await this.supabase.from('agent_interactions').insert({
        user_id: userId,
        agent_type: 'study',
        topic,
        interaction_data: data,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Error storing interaction:', error);
    }
  }
}

export default StudyAgent;
