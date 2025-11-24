import type { NextApiRequest, NextApiResponse } from 'next';

let prisma: any = null;
let getTwitterOAuthClient: any = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, userId } = req.query;

    if (!code || !userId) {
      return res.status(400).send('Missing code or userId');
    }

    if (!prisma) {
      const prismaModule = await import('../../../bot/src/utils/prisma.js');
      prisma = prismaModule.prisma;
    }

    if (!getTwitterOAuthClient) {
      const twitterModule = await import('../../../bot/src/utils/twitter.js');
      getTwitterOAuthClient = twitterModule.getTwitterOAuthClient;
    }

    const vercelUrl = process.env.VERCEL_URL || 'http://localhost:3000';
    const callbackUrl = `${vercelUrl}/api/x-callback`;

    const oauthClient = getTwitterOAuthClient();
    const { client: loggedClient } = await oauthClient.loginWithOAuth2({
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
  } catch (error: any) {
    console.error('X callback error:', error);
    res.status(500).send('Error connecting X account');
  }
}

