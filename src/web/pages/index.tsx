import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get user ID from Telegram Web App
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((sdk) => {
        try {
          const initData = sdk.initData;
          if (initData?.user?.id) {
            setUserId(initData.user.id.toString());
          }
        } catch (error) {
          console.log('Telegram SDK not available (running outside Telegram)');
        }
      });
    }
  }, []);

  useEffect(() => {
    if (userId) {
      router.push(`/profile?userId=${userId}`);
    }
  }, [userId, router]);

  return (
    <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>
  );
}

