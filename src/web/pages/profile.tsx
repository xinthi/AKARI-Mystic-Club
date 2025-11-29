/**
 * Profile Page
 *
 * Shows user profile, MYST balance, TON wallet, withdrawals, referral sharing, X connection, and stats
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface User {
  id: string;
  username?: string;
  firstName?: string;
  points: number;
  tier?: string;
  credibilityScore: number;
  positiveReviews: number;
  negativeReviews: number;
  mystBalance?: number;
  referralCode?: string;
  referralLink?: string;
  referralCount?: number;
  xConnected?: boolean;
  xHandle?: string;
  tonAddress?: string;
  recentBets?: Array<{
    id: string;
    predictionTitle: string;
    option: string;
    starsBet: number;
    pointsBet: number;
    mystBet?: number;
  }>;
}

type ProfileResponse =
  | { ok: true; user: User }
  | { ok: false; user: null; message: string };

interface WithdrawSummary {
  mystBurned: number;
  tonPriceUsd: number;
  usdGross: number;
  usdFee: number;
  usdNet: number;
  tonAmount: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingX, setConnectingX] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // TON Wallet state
  const [tonInput, setTonInput] = useState('');
  const [showTonInput, setShowTonInput] = useState(false);
  const [savingTon, setSavingTon] = useState(false);
  const [tonMessage, setTonMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Withdrawal state
  const [mystAmountInput, setMystAmountInput] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [withdrawSummary, setWithdrawSummary] = useState<WithdrawSummary | null>(null);

  // Buy MYST state
  const [buyTonAmount, setBuyTonAmount] = useState('');
  const [tonPriceUsd, setTonPriceUsd] = useState<number | null>(null);
  const [buyingMyst, setBuyingMyst] = useState(false);
  const [buyMessage, setBuyMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [depositInfo, setDepositInfo] = useState<{
    treasuryAddress: string;
    memo: string;
    mystEstimate: number;
  } | null>(null);

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Get initData helper
  const getInitData = (): string => {
    if (typeof window === 'undefined') return '';
    const tg = (window as any).Telegram?.WebApp;
    return tg?.initData || '';
  };

  // Telegram BackButton - navigate to home
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    tg.BackButton.onClick(() => {
      router.push('/');
    });

    return () => {
      try {
        tg.BackButton.hide();
        tg.BackButton.onClick(() => {});
      } catch (_) {
        // ignore
      }
    };
  }, [router]);

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {
        console.error('Telegram WebApp SDK not available', e);
      }
    }
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const initData = getInitData();

      const response = await fetch('/api/profile', {
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
      });

      const data: ProfileResponse = await response.json();

      if (data.ok && data.user) {
        setUser(data.user);
        setError(null);
      } else {
        setUser(null);
        setError(data.message || 'Failed to load profile');
      }

      setLoading(false);
    } catch (err: any) {
      console.error('[Profile] Error loading profile:', err);
      setError(err.message || 'Failed to load data');
      setUser(null);
      setLoading(false);
    }
  };

  // Copy referral link to clipboard
  const copyReferralLink = async () => {
    if (!user?.referralLink) return;

    try {
      await navigator.clipboard.writeText(user.referralLink);
      showToast('Referral link copied!', 'success');
    } catch (err) {
      console.error('[Profile] Failed to copy:', err);
      showToast('Failed to copy link', 'error');
    }
  };

  // Share referral link via Telegram
  const shareReferralLink = () => {
    if (!user?.referralLink) return;

    const text = `Join AKARI Mystic Club and earn MYST rewards! 🔮`;
    const tg = (window as any).Telegram?.WebApp;

    try {
      if (tg?.openTelegramLink) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(user.referralLink)}&text=${encodeURIComponent(text)}`;
        tg.openTelegramLink(shareUrl);
      } else {
        // Fallback for non-Telegram browsers
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(user.referralLink)}&text=${encodeURIComponent(text)}`;
        window.open(shareUrl, '_blank');
      }
    } catch (err) {
      console.error('[Profile] Failed to share:', err);
      showToast('Failed to open share dialog', 'error');
    }
  };

  const connectXAccount = async () => {
    setConnectingX(true);

    try {
      const tg = (window as any).Telegram?.WebApp;
      const initData = tg?.initData || '';

      if (!initData) {
        alert('Please open this app from Telegram to connect your X account.');
        setConnectingX(false);
        return;
      }

      const encodedInitData = encodeURIComponent(initData);
      const url = `/api/auth/x/start?initData=${encodedInitData}`;
      const authWindow = window.open(url, '_blank');

      if (!authWindow) {
        window.location.href = url;
        return;
      }

      const checkInterval = setInterval(() => {
        try {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            setConnectingX(false);
            loadProfile();
          }
        } catch {
          // Cross-origin access
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(checkInterval);
        setConnectingX(false);
      }, 300000);
    } catch (err: any) {
      console.error('Error connecting X:', err);
      alert(err.message || 'Failed to connect X account');
      setConnectingX(false);
    }
  };

  // ========================================
  // TON Wallet Functions
  // ========================================

  const saveTonWallet = async () => {
    if (!tonInput.trim()) {
      setTonMessage({ text: 'Please enter a TON address', type: 'error' });
      return;
    }

    setSavingTon(true);
    setTonMessage(null);

    try {
      const initData = getInitData();

      const response = await fetch('/api/ton/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({ tonAddress: tonInput.trim() }),
      });

      const data = await response.json();

      if (data.ok) {
        setTonMessage({ text: 'TON wallet linked successfully!', type: 'success' });
        setShowTonInput(false);
        setTonInput('');
        // Reload profile to get updated tonAddress
        loadProfile();
      } else {
        setTonMessage({ text: data.message || 'Failed to link wallet', type: 'error' });
      }
    } catch (err: any) {
      console.error('[Profile] TON link error:', err);
      setTonMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setSavingTon(false);
    }
  };

  const maskTonAddress = (address: string): string => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // ========================================
  // Withdrawal Functions
  // ========================================

  // Fetch TON price on load
  useEffect(() => {
    fetch('/api/price/ton')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.priceUsd) {
          setTonPriceUsd(data.priceUsd);
        }
      })
      .catch(() => {});
  }, []);

  // Calculate MYST estimate for buy section
  const buyTonNum = parseFloat(buyTonAmount) || 0;
  const buyUsdEstimate = buyTonNum * (tonPriceUsd || 0);
  const buyMystEstimate = buyUsdEstimate * 50; // MYST_PER_USD

  const submitDepositIntent = async () => {
    const tonAmount = parseFloat(buyTonAmount);
    if (isNaN(tonAmount) || tonAmount < 0.1) {
      setBuyMessage({ text: 'Minimum deposit is 0.1 TON', type: 'error' });
      return;
    }

    setBuyingMyst(true);
    setBuyMessage(null);

    try {
      const initData = getInitData();
      const response = await fetch('/api/ton/deposit-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({ tonAmount }),
      });

      const data = await response.json();

      if (data.ok && data.deposit) {
        setDepositInfo({
          treasuryAddress: data.deposit.treasuryAddress,
          memo: data.deposit.memo,
          mystEstimate: data.deposit.mystEstimate,
        });
        setBuyMessage({ text: 'Deposit intent recorded!', type: 'success' });
        setBuyTonAmount('');
      } else {
        setBuyMessage({ text: data.message || 'Failed to create deposit', type: 'error' });
      }
    } catch (err) {
      setBuyMessage({ text: 'Network error', type: 'error' });
    } finally {
      setBuyingMyst(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied!`, 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const requestWithdrawal = async () => {
    const mystAmount = parseFloat(mystAmountInput);

    if (isNaN(mystAmount) || mystAmount <= 0) {
      setWithdrawMessage({ text: 'Please enter a valid MYST amount', type: 'error' });
      return;
    }

    setWithdrawing(true);
    setWithdrawMessage(null);
    setWithdrawSummary(null);

    try {
      const initData = getInitData();

      const response = await fetch('/api/myst/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({ mystAmount }),
      });

      const data = await response.json();

      if (data.ok && data.summary) {
        setWithdrawSummary(data.summary);
        setWithdrawMessage({ text: 'Withdrawal request submitted!', type: 'success' });
        setMystAmountInput('');
        // Reload profile to update balance
        loadProfile();
      } else {
        setWithdrawMessage({ text: data.message || 'Withdrawal failed', type: 'error' });
      }
    } catch (err: any) {
      console.error('[Profile] Withdrawal error:', err);
      setWithdrawMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  // Show error state when no user
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
        <header className="p-6 pb-4">
          <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
        </header>
        <div className="px-6 pb-6">
          <div className="bg-red-900/30 backdrop-blur-lg rounded-xl p-8 text-center border border-red-500/20">
            <div className="text-4xl mb-4">🔮</div>
            <div className="text-lg mb-2">{error || 'User not found'}</div>
            <div className="text-sm text-purple-300 mb-4">
              Please open this app from Telegram to view your profile
            </div>
            <button
              onClick={loadProfile}
              className="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasTonWallet = !!user.tonAddress;
  const mystBalance = user.mystBalance ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
        <p className="text-purple-300">@{user.username || user.firstName || 'mystic'}</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {/* MYST Balance Card */}
        <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/30 backdrop-blur-lg rounded-xl p-5 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-amber-300 mb-1">MYST Balance</div>
              <div className="text-3xl font-bold text-amber-100">
                {mystBalance.toLocaleString()} <span className="text-lg">MYST</span>
              </div>
            </div>
            <div className="text-4xl">💎</div>
          </div>
          <div className="mt-3 pt-3 border-t border-amber-500/20">
            <p className="text-xs text-amber-200/70">
              Earn MYST by winning predictions, referring friends, and spinning the wheel daily
            </p>
          </div>
        </div>

        {/* ========================================
            TON Wallet Section
        ======================================== */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💰</span>
            <h2 className="text-lg font-semibold">TON Wallet</h2>
          </div>

          {/* Message */}
          {tonMessage && (
            <div className={`mb-3 p-2 rounded-lg text-sm ${
              tonMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}>
              {tonMessage.text}
            </div>
          )}

          {!hasTonWallet || showTonInput ? (
            // Show input form
            <div className="space-y-3">
              <p className="text-sm text-purple-300">
                Link your TON wallet to receive withdrawals.
              </p>
              <input
                type="text"
                value={tonInput}
                onChange={(e) => setTonInput(e.target.value)}
                placeholder="Paste your TON address (e.g. EQB...)"
                className="w-full bg-purple-800/30 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-400 focus:outline-none focus:border-purple-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveTonWallet}
                  disabled={savingTon}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 rounded-lg font-semibold text-sm transition-colors"
                >
                  {savingTon ? 'Saving...' : 'Save'}
                </button>
                {hasTonWallet && (
                  <button
                    onClick={() => {
                      setShowTonInput(false);
                      setTonInput('');
                      setTonMessage(null);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Show connected wallet
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-purple-400 mb-1">Connected TON wallet</div>
                  <div className="font-mono text-sm text-white">
                    {maskTonAddress(user.tonAddress!)}
                  </div>
                </div>
                <span className="text-green-400 text-sm">✓</span>
              </div>
              <button
                onClick={() => {
                  setShowTonInput(true);
                  setTonInput(user.tonAddress || '');
                }}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              >
                Change wallet
              </button>
            </div>
          )}
        </div>

        {/* ========================================
            Withdraw MYST Section
        ======================================== */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🏧</span>
            <h2 className="text-lg font-semibold">Withdraw MYST</h2>
          </div>

          <p className="text-sm text-purple-300 mb-2">
            Minimum withdrawal is 50 USD. A 5% fee applies.
          </p>
          <p className="text-sm text-amber-300 mb-4">
            You have <strong>{mystBalance.toLocaleString()}</strong> MYST
          </p>

          {/* Warning if no TON wallet */}
          {!hasTonWallet && (
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-200">
                ⚠️ Please connect your TON wallet first to enable withdrawals.
              </p>
            </div>
          )}

          {/* Withdraw Message */}
          {withdrawMessage && (
            <div className={`mb-3 p-2 rounded-lg text-sm ${
              withdrawMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}>
              {withdrawMessage.text}
            </div>
          )}

          {/* Withdraw Summary */}
          {withdrawSummary && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg space-y-1 text-sm">
              <div className="text-green-200 font-semibold mb-2">✅ Withdrawal Request Submitted</div>
              <div className="text-green-300">You burned: <strong>{withdrawSummary.mystBurned.toFixed(2)}</strong> MYST</div>
              <div className="text-green-300">Approx value: <strong>${withdrawSummary.usdGross.toFixed(2)}</strong> USD</div>
              <div className="text-green-300">Fee (5%): <strong>${withdrawSummary.usdFee.toFixed(2)}</strong> USD</div>
              <div className="text-green-300">
                You will receive: <strong>{withdrawSummary.tonAmount.toFixed(4)}</strong> TON @ ${withdrawSummary.tonPriceUsd.toFixed(2)}/TON
              </div>
              <div className="mt-2 pt-2 border-t border-green-500/30 text-green-200 text-xs">
                Admin will send TON to your linked wallet soon.
              </div>
            </div>
          )}

          {/* Withdraw Form */}
          <div className="space-y-3">
            <input
              type="number"
              value={mystAmountInput}
              onChange={(e) => setMystAmountInput(e.target.value)}
              placeholder="Enter MYST amount"
              disabled={!hasTonWallet || mystBalance === 0}
              className="w-full bg-purple-800/30 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-400 focus:outline-none focus:border-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={requestWithdrawal}
              disabled={!hasTonWallet || mystBalance === 0 || withdrawing}
              title={
                !hasTonWallet 
                  ? 'Connect your TON wallet first' 
                  : mystBalance === 0 
                    ? 'You need MYST to withdraw' 
                    : ''
              }
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-all"
            >
              {withdrawing ? 'Processing...' : 'Request Withdrawal'}
            </button>
          </div>
        </div>

        {/* ========================================
            Buy MYST with TON Section
        ======================================== */}
        <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 backdrop-blur-lg rounded-xl p-5 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💎</span>
            <h2 className="text-lg font-semibold">Buy MYST with TON</h2>
          </div>

          {buyMessage && (
            <div className={`mb-3 p-2 rounded-lg text-sm ${
              buyMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}>
              {buyMessage.text}
            </div>
          )}

          {depositInfo ? (
            // Show deposit instructions
            <div className="space-y-4">
              <div className="bg-gray-900/50 p-4 rounded-lg space-y-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Treasury TON Address</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-blue-300 break-all">{depositInfo.treasuryAddress}</code>
                    <button
                      onClick={() => copyToClipboard(depositInfo.treasuryAddress, 'Address')}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Your Deposit Memo (REQUIRED)</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-amber-300 font-bold">{depositInfo.memo}</code>
                    <button
                      onClick={() => copyToClipboard(depositInfo.memo, 'Memo')}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-700">
                  <div className="text-green-300">
                    You will receive: <strong>{depositInfo.mystEstimate.toFixed(0)} MYST</strong>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                ⚠️ Include the memo when sending! MYST will be credited after on-chain confirmation.
              </p>
              <button
                onClick={() => setDepositInfo(null)}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Create New Deposit
              </button>
            </div>
          ) : (
            // Show input form
            <div className="space-y-3">
              <p className="text-sm text-purple-300">
                Send TON to our treasury and receive MYST tokens. Rate: 1 USD = 50 MYST
              </p>
              
              <div>
                <input
                  type="number"
                  value={buyTonAmount}
                  onChange={(e) => setBuyTonAmount(e.target.value)}
                  placeholder="Enter TON amount (min 0.1)"
                  step="0.1"
                  min="0.1"
                  className="w-full bg-purple-800/30 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-400 focus:outline-none focus:border-purple-400"
                />
                {buyTonNum > 0 && tonPriceUsd && (
                  <div className="mt-2 text-sm text-purple-300">
                    ≈ ${buyUsdEstimate.toFixed(2)} USD → <span className="text-amber-300 font-semibold">{buyMystEstimate.toFixed(0)} MYST</span>
                  </div>
                )}
              </div>

              <button
                onClick={submitDepositIntent}
                disabled={buyingMyst || buyTonNum < 0.1}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-600 disabled:opacity-50 rounded-xl font-semibold text-sm transition-all"
              >
                {buyingMyst ? 'Processing...' : "I'm Ready to Send TON"}
              </button>

              {tonPriceUsd && (
                <p className="text-xs text-center text-gray-500">
                  Current TON price: ${tonPriceUsd.toFixed(2)} USD
                </p>
              )}
            </div>
          )}
        </div>

        {/* Credibility & Stats Card */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">📊 Stats & Credibility</h2>
            <button
              onClick={() => router.push(`/profile/${user.id}`)}
              className="text-xs text-purple-300 hover:text-white underline"
            >
              View public profile →
            </button>
          </div>
          
          {/* Credibility Display */}
          <div className="bg-purple-800/30 rounded-lg p-4 mb-4">
            <div className="text-center">
              <div className={`text-4xl font-bold mb-1 ${
                user.credibilityScore > 0 ? 'text-green-400' : 
                user.credibilityScore < 0 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {user.credibilityScore > 0 ? '+' : ''}{user.credibilityScore}
              </div>
              <div className="text-purple-300 text-sm mb-3">Credibility Score</div>
              <div className="flex justify-center gap-6 text-sm">
                <span className="text-green-400">+{user.positiveReviews} positive</span>
                <span className="text-red-400">-{user.negativeReviews} negative</span>
              </div>
            </div>
          </div>
          
          {/* Other Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-purple-300 mb-1">Experience Points</div>
              <div className="text-2xl font-bold">{user.points.toLocaleString()} aXP</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Tier</div>
              <div className="text-xl font-semibold">{user.tier || 'Newcomer'}</div>
            </div>
          </div>
        </div>

        {/* Referral Card */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">👥</span>
            <h2 className="text-lg font-semibold">Invite Friends</h2>
          </div>
          <p className="text-sm text-purple-300 mb-2">
            Earn 10% of your friends&apos; MYST spending as referral rewards!
          </p>
          <p className="text-xs text-amber-400 mb-4">
            🎁 Refer 5 friends and earn 10 MYST bonus! (Limited time)
          </p>

          {/* Referral Link */}
          {user.referralLink && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={user.referralLink}
                  className="flex-1 bg-purple-800/30 border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-purple-200 truncate"
                />
                <button
                  onClick={copyReferralLink}
                  className="p-2 bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors"
                  title="Copy link"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              <button
                onClick={shareReferralLink}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Share on Telegram
              </button>

              {(user.referralCount ?? 0) > 0 && (
                <div className="mt-3 text-center">
                  <span className="text-sm text-purple-300">
                    {user.referralCount} friend{user.referralCount === 1 ? '' : 's'} joined
                  </span>
                  {(user.referralCount ?? 0) >= 5 && (
                    <span className="ml-2 text-xs text-amber-400">🎉 Milestone reached!</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* X Account Connection */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <h2 className="text-lg font-semibold mb-4">Connected Accounts</h2>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold">X (Twitter)</div>
                {user.xConnected ? (
                  <div className="text-sm text-green-400">@{user.xHandle}</div>
                ) : (
                  <div className="text-sm text-purple-300">Not connected</div>
                )}
              </div>
            </div>

            {!user.xConnected && (
              <button
                onClick={connectXAccount}
                disabled={connectingX}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
              >
                {connectingX ? 'Connecting...' : 'Connect'}
              </button>
            )}

            {user.xConnected && (
              <span className="text-green-400 text-sm">✓ Connected</span>
            )}
          </div>
        </div>

        {/* Recent Bets */}
        {user.recentBets && user.recentBets.length > 0 && (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
            <h2 className="text-lg font-semibold mb-4">Recent Bets</h2>
            <div className="space-y-3">
              {user.recentBets.map((bet) => (
                <div key={bet.id} className="text-sm border-b border-purple-500/10 pb-3 last:border-0 last:pb-0">
                  <div className="font-semibold mb-1">{bet.predictionTitle}</div>
                  <div className="flex justify-between text-purple-300">
                    <span>Choice: {bet.option}</span>
                    <span>
                      {(bet.mystBet ?? 0) > 0 
                        ? `${bet.mystBet} MYST` 
                        : bet.starsBet > 0 
                          ? `${bet.starsBet} ⭐` 
                          : `${bet.pointsBet} EP`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
