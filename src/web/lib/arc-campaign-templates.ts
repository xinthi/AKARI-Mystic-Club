/**
 * ARC Campaign Templates
 * 
 * Predefined campaign templates for founders to quickly set up campaigns.
 * Templates include quest suggestions, point values, and schedule text.
 */

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  quests: Array<{
    mission_id: string;
    title: string;
    description: string;
    points: number;
    recommended_content?: string;
  }>;
  schedule_text?: string;
  brief_objective?: string;
}

export const CAMPAIGN_TEMPLATES: Record<string, CampaignTemplate> = {
  'launch-week-blitz': {
    id: 'launch-week-blitz',
    name: 'Launch Week Blitz',
    description: 'Intense 7-day launch campaign to maximize visibility and engagement',
    quests: [
      {
        mission_id: 'intro-thread',
        title: 'Intro Thread',
        description: 'Create a compelling introduction thread about the project',
        points: 500,
        recommended_content: 'Project overview, team, vision, and key milestones',
      },
      {
        mission_id: 'meme-drop',
        title: 'Meme Drop',
        description: 'Share viral memes related to the project',
        points: 300,
        recommended_content: 'On-brand memes that highlight project features or community',
      },
      {
        mission_id: 'signal-boost',
        title: 'Signal Boost',
        description: 'Retweet and amplify official project announcements',
        points: 200,
        recommended_content: 'Key announcements, partnerships, and milestone updates',
      },
      {
        mission_id: 'deep-dive',
        title: 'Deep Dive',
        description: 'Write in-depth analysis or tutorials about the project',
        points: 800,
        recommended_content: 'Technical deep dives, use cases, or educational content',
      },
    ],
    schedule_text: '7-day intensive campaign. Daily quests unlock each morning. Winners announced at end of week.',
    brief_objective: 'Maximize visibility and engagement during launch week. Build strong community momentum.',
  },
  'partnership-push': {
    id: 'partnership-push',
    name: 'Partnership Push',
    description: 'Promote strategic partnerships and collaborations',
    quests: [
      {
        mission_id: 'intro-thread',
        title: 'Partnership Announcement',
        description: 'Create a thread announcing the partnership',
        points: 600,
        recommended_content: 'Partnership details, mutual benefits, and future plans',
      },
      {
        mission_id: 'signal-boost',
        title: 'Cross-Promote',
        description: 'Amplify partner content and announcements',
        points: 400,
        recommended_content: 'Partner announcements, joint initiatives, and collaborations',
      },
      {
        mission_id: 'deep-dive',
        title: 'Partnership Analysis',
        description: 'Analyze the strategic value of the partnership',
        points: 700,
        recommended_content: 'Strategic implications, synergies, and market impact',
      },
    ],
    schedule_text: '2-week campaign focused on partnership promotion. Top performers get featured in partnership spotlight.',
    brief_objective: 'Drive awareness and engagement around strategic partnerships. Build cross-community bridges.',
  },
  'listing-hype': {
    id: 'listing-hype',
    name: 'Listing Hype',
    description: 'Generate excitement around exchange listings or major milestones',
    quests: [
      {
        mission_id: 'intro-thread',
        title: 'Listing Celebration Thread',
        description: 'Create a celebratory thread about the listing',
        points: 400,
        recommended_content: 'Listing details, importance, and what it means for the community',
      },
      {
        mission_id: 'meme-drop',
        title: 'Listing Memes',
        description: 'Create memes celebrating the listing milestone',
        points: 250,
        recommended_content: 'Celebratory memes, moon memes, and community hype',
      },
      {
        mission_id: 'signal-boost',
        title: 'Listing Announcements',
        description: 'Retweet and amplify listing announcements',
        points: 300,
        recommended_content: 'Official listing announcements, exchange tweets, and milestone updates',
      },
      {
        mission_id: 'deep-dive',
        title: 'Market Impact Analysis',
        description: 'Analyze the market impact of the listing',
        points: 900,
        recommended_content: 'Market analysis, price implications, and trading strategy insights',
      },
    ],
    schedule_text: '3-day pre-listing hype campaign. Activities peak on listing day. Rewards distributed within 24 hours post-listing.',
    brief_objective: 'Generate maximum visibility and excitement around exchange listings. Reward active community members.',
  },
};

export function getTemplate(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES[id];
}

export function getAllTemplates(): CampaignTemplate[] {
  return Object.values(CAMPAIGN_TEMPLATES);
}

