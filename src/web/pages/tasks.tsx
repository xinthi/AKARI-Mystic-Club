import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle, Clock, Trophy } from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  rewards: string;
  tasks: any[];
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export default function Tasks() {
  const router = useRouter();
  const { userId } = router.query;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch campaigns from API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    fetch(`${apiUrl}/campaigns`)
      .then((res) => res.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err);
        setLoading(false);
      });
  }, []);

  const handleVerify = (taskId: string, taskType: string, taskData: any) => {
    // Create Telegram deep link for verification
    const deepLink = `https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME}/verify?task=${taskId}&type=${taskType}`;
    window.open(deepLink, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-white text-xl">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-mystic text-white p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">📋 Tasks</h1>

        {campaigns.length === 0 ? (
          <div className="text-center text-gray-400">
            No active campaigns at the moment.
          </div>
        ) : (
          <div className="space-y-6">
            {campaigns.map((campaign) => {
              const tasks = campaign.tasks || [];
              const isActive = new Date(campaign.endsAt) > new Date();

              return (
                <div
                  key={campaign.id}
                  className="bg-mystic-dark/50 rounded-lg p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">
                        {campaign.name}
                      </h2>
                      {campaign.description && (
                        <p className="text-gray-400 text-sm mb-2">
                          {campaign.description}
                        </p>
                      )}
                    </div>
                    {isActive ? (
                      <Clock className="w-5 h-5 text-green-400" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-gray-500" />
                    )}
                  </div>

                  <div className="mb-4">
                    <p className="text-sm text-gray-400 mb-2">
                      Rewards: {campaign.rewards}
                    </p>
                    <p className="text-sm text-gray-400">
                      Ends: {new Date(campaign.endsAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold mb-2">Tasks:</h3>
                    {tasks.map((task: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-mystic-dark/30 rounded p-3"
                      >
                        <div>
                          <p className="font-medium">{task.title || `Task ${index + 1}`}</p>
                          {task.description && (
                            <p className="text-sm text-gray-400">{task.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleVerify(task.id, task.type, task.data)}
                          className="px-4 py-2 bg-mystic-purple rounded-lg hover:bg-mystic-purple/80 transition"
                        >
                          Verify
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

