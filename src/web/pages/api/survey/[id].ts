import type { NextApiRequest, NextApiResponse } from 'next';

let prisma: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  try {
    if (!prisma) {
      const prismaModule = await import('../../../../bot/src/utils/prisma.js');
      prisma = prismaModule.prisma;
    }

    if (req.method === 'GET') {
      const survey = await prisma.survey.findUnique({
        where: { id: id as string }
      });

      if (!survey || !survey.active) {
        return res.status(404).json({ error: 'Survey not found' });
      }

      res.json({
        id: survey.id,
        title: survey.title,
        description: survey.description,
        questions: survey.questions
      });
    } else if (req.method === 'POST') {
      const { userId, responses } = req.body;

      if (!userId || !responses) {
        return res.status(400).json({ error: 'Missing userId or responses' });
      }

      const survey = await prisma.survey.findUnique({
        where: { id: id as string }
      });

      if (!survey || !survey.active) {
        return res.status(404).json({ error: 'Survey not found' });
      }

      // Add response
      const allResponses = (survey.responses as any[]) || [];
      allResponses.push({
        userId,
        responses,
        submittedAt: new Date().toISOString()
      });

      // Compute report
      const questions = survey.questions as any[];
      const report: any = {
        totalResponses: allResponses.length,
        questions: []
      };

      for (const question of questions) {
        if (question.type === 'rating') {
          const ratings = allResponses
            .map((r: any) => r.responses[question.id])
            .filter((r: any) => r !== undefined);
          const avg = ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length;
          report.questions.push({
            id: question.id,
            type: 'rating',
            average: avg,
            count: ratings.length
          });
        } else if (question.type === 'multiple') {
          const choices: Record<string, number> = {};
          for (const response of allResponses) {
            const choice = response.responses[question.id];
            if (choice) {
              choices[choice] = (choices[choice] || 0) + 1;
            }
          }
          const total = Object.values(choices).reduce((sum: number, c: number) => sum + c, 0);
          report.questions.push({
            id: question.id,
            type: 'multiple',
            choices: Object.entries(choices).map(([choice, count]) => ({
              choice,
              count,
              percentage: (count / total) * 100
            }))
          });
        }
      }

      // Update survey
      await prisma.survey.update({
        where: { id: id as string },
        data: {
          responses: allResponses as any,
          report: report as any
        }
      });

      res.json({ success: true, report });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Survey API error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

