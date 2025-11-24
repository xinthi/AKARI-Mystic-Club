import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { webhookHandler } from '../bot/src/index.js';
import { prisma } from '../bot/src/utils/prisma.js';
import { getTwitterOAuthClient } from '../bot/src/utils/twitter.js';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

/**
 * Webhook endpoint for Telegram
 */
app.post('/api/webhook', webhookHandler);

/**
 * Get user profile
 */
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Try to find by ID first, then by telegramId
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        reviewsReceived: true,
        createdCampaigns: {
          where: { isActive: true },
          take: 5
        }
      }
    });

    // If not found by ID, try telegramId
    if (!user && /^\d+$/.test(userId)) {
      user = await prisma.user.findUnique({
        where: { telegramId: BigInt(userId) },
        include: {
          reviewsReceived: true,
          createdCampaigns: {
            where: { isActive: true },
            take: 5
          }
        }
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get tier config
    const tierConfig = user.tier ? await prisma.tier.findFirst({
      where: {
        name: user.tier.split('_')[0],
        level: parseInt(user.tier.split('_L')[1] || '1', 10)
      }
    }) : null;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        points: user.points,
        tier: user.tier,
        tierConfig,
        credibilityScore: user.credibilityScore || 0,
        positiveReviews: user.positiveReviews,
        interests: user.interests,
        joinedAt: user.joinedAt,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('Profile API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * X OAuth callback
 */
app.get('/api/x-callback', async (req, res) => {
  try {
    const { code, state, userId } = req.query;

    if (!code || !userId) {
      return res.status(400).send('Missing code or userId');
    }

    const vercelUrl = process.env.VERCEL_URL || 'http://localhost:3000';
    const callbackUrl = `${vercelUrl}/api/x-callback`;

    const oauthClient = getTwitterOAuthClient();
    const { client: loggedClient, accessToken } = await oauthClient.loginWithOAuth2({
      code: code as string,
      codeVerifier: state as string,
      redirectUri: callbackUrl
    });

    const user = await loggedClient.v2.me();

    // Update user in database
    await prisma.user.update({
      where: { id: userId as string },
      data: {
        xUserId: user.data.id,
        xUsername: user.data.username
      }
    });

    res.send(`
      <html>
        <body>
          <h1>✅ X Account Connected!</h1>
          <p>You can close this window and return to Telegram.</p>
          <script>
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('X callback error:', error);
    res.status(500).send('Error connecting X account');
  }
});

/**
 * Get survey questions
 */
app.get('/api/survey/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const survey = await prisma.survey.findUnique({
      where: { id }
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
  } catch (error) {
    console.error('Survey API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Submit survey response
 */
app.post('/api/survey/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, responses } = req.body;

    if (!userId || !responses) {
      return res.status(400).json({ error: 'Missing userId or responses' });
    }

    const survey = await prisma.survey.findUnique({
      where: { id }
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
          .map(r => r.responses[question.id])
          .filter(r => r !== undefined);
        const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
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
        const total = Object.values(choices).reduce((sum, c) => sum + c, 0);
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
      where: { id },
      data: {
        responses: allResponses as any,
        report: report as any
      }
    });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Survey response error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get campaigns
 */
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        endsAt: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ campaigns });
  } catch (error) {
    console.error('Campaigns API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get leaderboard
 */
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { tier } = req.query;
    const tierPattern = tier && tier !== 'all' ? (tier as string) : null;

    // Import leaderboard utils
    const { getOverallLeaderboard } = await import('../bot/src/utils/leaderboard.js');
    const leaderboard = await getOverallLeaderboard(tierPattern);

    res.json({ leaderboard });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Catch-all for Next.js
app.get('*', (req, res, next) => {
  // Let Next.js handle other routes
  next();
});

export default app;

