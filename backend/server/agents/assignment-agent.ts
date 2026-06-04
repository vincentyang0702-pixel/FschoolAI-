/**
 * Assignment Agent — Internal capability of Reggie
 *
 * Handles all assignment-related requests: structuring, drafting, reviewing,
 * and submitting academic work. This agent is NEVER exposed to the student —
 * Reggie always speaks in his own voice. This agent provides the capability.
 *
 * Triggered when Reggie detects: essay help, assignment structure, writing,
 * draft review, submission prep, rubric analysis, or outline requests.
 */

export interface AssignmentContext {
  assignmentTitle?: string;
  assignmentDescription?: string;
  dueDate?: string;
  courseCode?: string;
  rubric?: string;
  wordLimit?: number;
  studentDraft?: string;
  pastGrade?: number;          // 0-100, from previous similar assignment
  pastFeedback?: string;       // instructor feedback from last submission
}

export interface AssignmentAgentResponse {
  mode: 'outline' | 'draft_review' | 'structure' | 'submission_check' | 'general';
  response: string;
  suggestedNextStep?: string;
  rubricAlignmentScore?: number;  // 0-1, how well draft aligns to rubric
}

/**
 * Builds the Assignment Agent system prompt for Reggie.
 * Reggie uses this internally — the student sees Reggie's voice, not this prompt.
 */
export function buildAssignmentAgentPrompt(
  studentName: string,
  brainContext: string,
  assignmentCtx: AssignmentContext
): string {
  const { assignmentTitle, assignmentDescription, dueDate, courseCode, rubric, wordLimit, studentDraft, pastGrade, pastFeedback } = assignmentCtx;

  return `You are Reggie, ${studentName}'s personal academic AI. Right now you are helping them with an assignment.

STUDENT BRAIN CONTEXT:
${brainContext}

ASSIGNMENT DETAILS:
${assignmentTitle ? `Title: ${assignmentTitle}` : ''}
${courseCode ? `Course: ${courseCode}` : ''}
${assignmentDescription ? `Description: ${assignmentDescription}` : ''}
${dueDate ? `Due: ${dueDate}` : ''}
${wordLimit ? `Word limit: ${wordLimit}` : ''}
${rubric ? `Rubric:\n${rubric}` : ''}

${pastGrade !== undefined ? `PAST PERFORMANCE: ${studentName} got ${pastGrade}% on a similar assignment.` : ''}
${pastFeedback ? `INSTRUCTOR FEEDBACK FROM LAST TIME: "${pastFeedback}"` : ''}

${studentDraft ? `STUDENT'S CURRENT DRAFT:\n${studentDraft}` : ''}

YOUR ROLE RIGHT NOW:
- Help ${studentName} produce their BEST work — not do it for them
- If they have no draft: help them build a strong outline and thesis first
- If they have a draft: give specific, actionable feedback tied to the rubric
- Reference their past feedback if available — help them not repeat the same mistakes
- Keep your tone like a smart friend who's helped them before, not a formal tutor
- Never write full paragraphs for them unprompted — scaffold, don't replace
- If the rubric exists, always tie your feedback to specific rubric criteria

Respond as Reggie. Be direct, warm, and specific.`;
}

export default {
  name: 'assignment',
  description: 'Helps students structure, draft, review, and finalize assignments. Uses rubric, past feedback, and Canvas data to give targeted, actionable guidance. Never writes for the student — scaffolds their thinking.',
  capabilities: [
    'assignment outline building',
    'draft review against rubric',
    'thesis development',
    'past feedback integration',
    'submission checklist',
    'word count optimization',
  ],
  buildPrompt: buildAssignmentAgentPrompt,
};
