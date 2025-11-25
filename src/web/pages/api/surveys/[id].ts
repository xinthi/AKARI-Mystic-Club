/**
 * Survey Detail API
 * 
 * GET: Get survey details and questions
 * POST: Submit survey responses
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getTelegramUserFromRequest } from '../../../lib/telegram-auth';
import { z } from 'zod';

const submitSurveySchema = z.object({
  responses: z.array(z.any()) // Array of question responses
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Survey ID is required' });
    }

    if (req.method === 'GET') {
      // Get survey details
      const survey = await prisma.survey.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              tier: true
            }
          }
        }
      });

      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }

      if (!survey.active) {
        return res.status(400).json({ error: 'Survey is not active' });
      }

      return res.status(200).json({
        survey: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          questions: survey.questions,
          campaignId: survey.campaignId,
          projectTgHandle: survey.projectTgHandle,
          createdAt: survey.createdAt,
          creator: survey.createdBy,
          responseCount: (survey.responses as any[]).length
        }
      });
    }

    if (req.method === 'POST') {
      // Submit survey responses
      const telegramUser = getTelegramUserFromRequest(req);
      
      if (!telegramUser) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const validation = submitSurveySchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }

      const telegramId = BigInt(telegramUser.id);
      const user = await prisma.user.findUnique({
        where: { telegramId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get survey
      const survey = await prisma.survey.findUnique({
        where: { id }
      });

      if (!survey) {
        return res.status(404).json({ error: 'Survey not found' });
      }

      if (!survey.active) {
        return res.status(400).json({ error: 'Survey is not active' });
      }

      // Check if user already submitted
      const responses = (survey.responses as any[]) || [];
      const existingResponse = responses.find((r: any) => r.userId === user.id);

      if (existingResponse) {
        return res.status(400).json({ error: 'You have already submitted this survey' });
      }

      // Validate response count matches questions
      const questions = survey.questions as any[];
      if (validation.data.responses.length !== questions.length) {
        return res.status(400).json({ error: 'Response count does not match question count' });
      }

      // Add new response
      const newResponse = {
        userId: user.id,
        responses: validation.data.responses,
        submittedAt: new Date().toISOString()
      };

      const updatedResponses = [...responses, newResponse];

      // Compute report if needed (simple analytics)
      const report = computeSurveyReport(questions, updatedResponses);

      await prisma.survey.update({
        where: { id },
        data: {
          responses: updatedResponses,
          report
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Survey submitted successfully'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Survey API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}

/**
 * Compute survey report/analytics
 */
function computeSurveyReport(questions: any[], responses: any[]): any {
  const report: any = {
    totalResponses: responses.length,
    questionStats: []
  };

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const questionResponses = responses.map(r => r.responses[i]);

    if (question.type === 'rating') {
      // Calculate average rating
      const ratings = questionResponses.filter(r => typeof r === 'number');
      const avg = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : 0;
      
      report.questionStats.push({
        questionIndex: i,
        type: 'rating',
        average: avg.toFixed(2),
        count: ratings.length
      });
    } else if (question.type === 'multiple') {
      // Count choices
      const choiceCounts: Record<string, number> = {};
      questionResponses.forEach(choice => {
        if (typeof choice === 'string') {
          choiceCounts[choice] = (choiceCounts[choice] || 0) + 1;
        }
      });

      report.questionStats.push({
        questionIndex: i,
        type: 'multiple',
        choiceCounts,
        total: questionResponses.length
      });
    } else {
      // Text responses - just count
      report.questionStats.push({
        questionIndex: i,
        type: 'text',
        count: questionResponses.filter(r => r && r.trim()).length
      });
    }
  }

  return report;
}

