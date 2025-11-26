/**
 * Tasks Page - Redirects to Campaigns
 * 
 * The tasks feature is now integrated into the campaigns flow.
 * This page redirects users to /campaigns.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const TasksRedirectPage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/campaigns');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <p className="text-sm text-gray-300">
        Redirecting to campaigns…
      </p>
    </div>
  );
};

export default TasksRedirectPage;
