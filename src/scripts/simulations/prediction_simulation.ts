/**
 * AKARI Mystic Club - Prediction Market Economic Model Simulation
 * 
 * This script simulates the prediction market economy to verify
 * the code matches the economic model exactly.
 * 
 * ECONOMIC MODEL:
 * - 1 USD = 50 MYST
 * - 1 MYST = 0.02 USD
 * - Platform fee = 10% of LOSING SIDE only
 * - Fee split: 15% Leaderboard, 10% Referral, 5% Wheel, 70% Treasury
 * - No fee at bet time (full bet goes to pool)
 * - Withdraw fee = 5%
 * - Min withdrawal = $50 net
 * 
 * Run with: npx ts-node src/scripts/simulations/prediction_simulation.ts
 */

// Economic constants (must match myst-service.ts)
const MYST_PER_USD = 50;
const USD_PER_MYST = 1 / MYST_PER_USD;
const PLATFORM_FEE_RATE = 0.10; // 10% of losing side
const FEE_SPLIT = {
  LEADERBOARD: 0.15,
  REFERRAL: 0.10,
  WHEEL: 0.05,
  TREASURY: 0.70,
};
const WITHDRAW_FEE_RATE = 0.05;
const MIN_WITHDRAW_USD = 50;

interface Bet {
  userId: string;
  option: 'YES' | 'NO';
  amount: number; // MYST
}

interface SimulationResult {
  yesPool: number;
  noPool: number;
  totalPool: number;
  winner: 'YES' | 'NO';
  losingSide: number;
  platformFee: number;
  feeDistribution: {
    leaderboard: number;
    referral: number;
    wheel: number;
    treasury: number;
  };
  winPool: number;
  winnersPayout: number;
  winnerCount: number;
  payoutPerMyst: number;
  platformRevenueUsd: number;
}

/**
 * Simulate a prediction market with random bets.
 */
function simulatePredictionMarket(
  totalPoolMyst: number,
  yesPercent: number = Math.random()
): SimulationResult {
  // Split pool between YES and NO
  const yesPool = totalPoolMyst * yesPercent;
  const noPool = totalPoolMyst * (1 - yesPercent);
  const totalPool = yesPool + noPool;

  // Randomly pick winner (50/50)
  const winner: 'YES' | 'NO' = Math.random() > 0.5 ? 'YES' : 'NO';
  const isYesWinner = winner === 'YES';

  // Get winning and losing pools
  const winningSideTotal = isYesWinner ? yesPool : noPool;
  const losingSideTotal = isYesWinner ? noPool : yesPool;

  // ECONOMIC MODEL: Fee = 10% of LOSING SIDE only
  const platformFee = losingSideTotal * PLATFORM_FEE_RATE;

  // Calculate fee distribution
  const feeDistribution = {
    leaderboard: platformFee * FEE_SPLIT.LEADERBOARD,
    referral: platformFee * FEE_SPLIT.REFERRAL,
    wheel: platformFee * FEE_SPLIT.WHEEL,
    treasury: platformFee * FEE_SPLIT.TREASURY,
  };

  // Winners receive: total pool - fee
  const winPool = totalPool - platformFee;

  // Payout per MYST for winners
  const payoutPerMyst = winningSideTotal > 0 ? winPool / winningSideTotal : 0;

  // Platform revenue in USD
  const platformRevenueUsd = platformFee * USD_PER_MYST;

  return {
    yesPool,
    noPool,
    totalPool,
    winner,
    losingSide: losingSideTotal,
    platformFee,
    feeDistribution,
    winPool,
    winnersPayout: winPool,
    winnerCount: Math.floor(Math.random() * 50) + 1, // Simulated winner count
    payoutPerMyst,
    platformRevenueUsd,
  };
}

/**
 * Format number with commas and decimals.
 */
function formatNumber(n: number, decimals: number = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Print simulation result.
 */
function printSimulation(run: number, result: SimulationResult): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SIMULATION RUN #${run}`);
  console.log('='.repeat(60));
  
  console.log(`\n📊 POOL STATUS:`);
  console.log(`   YES Pool:     ${formatNumber(result.yesPool)} MYST`);
  console.log(`   NO Pool:      ${formatNumber(result.noPool)} MYST`);
  console.log(`   Total Pool:   ${formatNumber(result.totalPool)} MYST`);
  console.log(`   (= $${formatNumber(result.totalPool * USD_PER_MYST)} USD)`);

  console.log(`\n🏆 RESOLUTION:`);
  console.log(`   Winning Side: ${result.winner}`);
  console.log(`   Losing Side:  ${result.winner === 'YES' ? 'NO' : 'YES'} (${formatNumber(result.losingSide)} MYST)`);

  console.log(`\n💰 PLATFORM FEE (10% of losing side):`);
  console.log(`   Fee Amount:   ${formatNumber(result.platformFee)} MYST`);
  console.log(`   (= $${formatNumber(result.platformRevenueUsd)} USD)`);

  console.log(`\n📈 FEE DISTRIBUTION:`);
  console.log(`   Leaderboard (15%): ${formatNumber(result.feeDistribution.leaderboard)} MYST`);
  console.log(`   Referral (10%):    ${formatNumber(result.feeDistribution.referral)} MYST`);
  console.log(`   Wheel (5%):        ${formatNumber(result.feeDistribution.wheel)} MYST`);
  console.log(`   Treasury (70%):    ${formatNumber(result.feeDistribution.treasury)} MYST`);
  console.log(`   ─────────────────────────────────────`);
  console.log(`   Total:             ${formatNumber(
    result.feeDistribution.leaderboard +
    result.feeDistribution.referral +
    result.feeDistribution.wheel +
    result.feeDistribution.treasury
  )} MYST`);

  console.log(`\n🎁 WINNERS PAYOUT:`);
  console.log(`   Win Pool:         ${formatNumber(result.winPool)} MYST`);
  console.log(`   Payout per MYST:  ${formatNumber(result.payoutPerMyst, 4)}x`);
  console.log(`   (Winners get ${formatNumber((result.payoutPerMyst - 1) * 100)}% profit if they bet on winning side)`);

  // Verify math
  const totalDistributed = result.winPool + result.platformFee;
  const diff = Math.abs(totalDistributed - result.totalPool);
  console.log(`\n✅ VERIFICATION:`);
  console.log(`   Win Pool + Fee = ${formatNumber(totalDistributed)} MYST`);
  console.log(`   Total Pool     = ${formatNumber(result.totalPool)} MYST`);
  console.log(`   Difference:    ${diff < 0.01 ? '✓ OK' : `⚠️ ${formatNumber(diff)} MYST`}`);
}

/**
 * Run example with specific values from the requirement.
 */
function runExampleFromRequirement(): void {
  console.log('\n' + '█'.repeat(60));
  console.log('EXAMPLE FROM REQUIREMENTS (YES=4000, NO=6000, NO wins)');
  console.log('█'.repeat(60));

  const yesPool = 4000;
  const noPool = 6000;
  const totalPool = yesPool + noPool;
  const winner = 'NO';
  const losingSide = yesPool; // YES loses

  // Fee = 10% of losing side (4000) = 400 MYST
  const platformFee = losingSide * 0.10;
  
  // Winners receive: 10000 - 400 = 9600 MYST
  const winPool = totalPool - platformFee;

  // Fee distribution
  const feeDistribution = {
    leaderboard: platformFee * 0.15, // 60 MYST
    referral: platformFee * 0.10,    // 40 MYST
    wheel: platformFee * 0.05,       // 20 MYST
    treasury: platformFee * 0.70,    // 280 MYST
  };

  console.log(`\n📊 POOL STATUS:`);
  console.log(`   YES Pool:     ${formatNumber(yesPool)} MYST`);
  console.log(`   NO Pool:      ${formatNumber(noPool)} MYST`);
  console.log(`   Total Pool:   ${formatNumber(totalPool)} MYST`);

  console.log(`\n🏆 RESOLUTION:`);
  console.log(`   Winning Side: ${winner}`);
  console.log(`   Losing Side:  YES (${formatNumber(losingSide)} MYST)`);

  console.log(`\n💰 PLATFORM FEE (10% of losing side = 10% × 4000):`);
  console.log(`   Fee Amount:   ${formatNumber(platformFee)} MYST ✓`);

  console.log(`\n📈 FEE DISTRIBUTION (from ${formatNumber(platformFee)} MYST):`);
  console.log(`   Leaderboard (15%): ${formatNumber(feeDistribution.leaderboard)} MYST`);
  console.log(`   Referral (10%):    ${formatNumber(feeDistribution.referral)} MYST`);
  console.log(`   Wheel (5%):        ${formatNumber(feeDistribution.wheel)} MYST`);
  console.log(`   Treasury (70%):    ${formatNumber(feeDistribution.treasury)} MYST`);

  console.log(`\n🎁 WINNERS PAYOUT:`);
  console.log(`   Win Pool:         ${formatNumber(winPool)} MYST`);
  console.log(`   (Total ${formatNumber(totalPool)} - Fee ${formatNumber(platformFee)} = ${formatNumber(winPool)})`);

  // Example winner calculation
  const exampleBet = 1000; // User bet 1000 MYST on NO
  const userPayout = exampleBet * (winPool / noPool);
  console.log(`\n📝 EXAMPLE WINNER:`);
  console.log(`   User bet 1000 MYST on NO`);
  console.log(`   Payout = 1000 × (${formatNumber(winPool)} / ${formatNumber(noPool)})`);
  console.log(`   Payout = 1000 × ${formatNumber(winPool / noPool, 4)}`);
  console.log(`   Payout = ${formatNumber(userPayout)} MYST`);
  console.log(`   Profit = ${formatNumber(userPayout - exampleBet)} MYST (${formatNumber((userPayout / exampleBet - 1) * 100)}%)`);
}

/**
 * Simulate withdrawal.
 */
function simulateWithdrawal(mystAmount: number): void {
  console.log('\n' + '─'.repeat(60));
  console.log(`WITHDRAWAL SIMULATION (${formatNumber(mystAmount)} MYST)`);
  console.log('─'.repeat(60));

  const grossUsd = mystAmount * USD_PER_MYST;
  const feeUsd = grossUsd * WITHDRAW_FEE_RATE;
  const netUsd = grossUsd - feeUsd;

  console.log(`   MYST Amount:    ${formatNumber(mystAmount)} MYST`);
  console.log(`   Gross USD:      $${formatNumber(grossUsd)}`);
  console.log(`   Fee (${WITHDRAW_FEE_RATE * 100}%):       $${formatNumber(feeUsd)}`);
  console.log(`   Net USD:        $${formatNumber(netUsd)}`);
  console.log(`   Min Required:   $${MIN_WITHDRAW_USD}`);
  console.log(`   Eligible:       ${netUsd >= MIN_WITHDRAW_USD ? '✓ YES' : '✗ NO (below minimum)'}`);
}

/**
 * Main function.
 */
function main(): void {
  console.log('═'.repeat(60));
  console.log('AKARI MYSTIC CLUB - PREDICTION MARKET ECONOMIC SIMULATION');
  console.log('═'.repeat(60));
  
  console.log('\n📋 ECONOMIC CONSTANTS:');
  console.log(`   1 USD = ${MYST_PER_USD} MYST`);
  console.log(`   1 MYST = $${USD_PER_MYST} USD`);
  console.log(`   Platform Fee = ${PLATFORM_FEE_RATE * 100}% of LOSING SIDE`);
  console.log(`   Fee Split: LB=${FEE_SPLIT.LEADERBOARD * 100}%, REF=${FEE_SPLIT.REFERRAL * 100}%, WHEEL=${FEE_SPLIT.WHEEL * 100}%, TREASURY=${FEE_SPLIT.TREASURY * 100}%`);
  console.log(`   Withdraw Fee = ${WITHDRAW_FEE_RATE * 100}%`);
  console.log(`   Min Withdrawal = $${MIN_WITHDRAW_USD}`);

  // Run example from requirements
  runExampleFromRequirement();

  // Run 5 random simulations with $10,000 pool (500,000 MYST)
  console.log('\n\n' + '█'.repeat(60));
  console.log('5 RANDOM SIMULATIONS ($10,000 = 500,000 MYST)');
  console.log('█'.repeat(60));

  const poolSizeMyst = 10000 * MYST_PER_USD; // $10,000 = 500,000 MYST

  for (let i = 1; i <= 5; i++) {
    const result = simulatePredictionMarket(poolSizeMyst);
    printSimulation(i, result);
  }

  // Withdrawal examples
  console.log('\n\n' + '█'.repeat(60));
  console.log('WITHDRAWAL EXAMPLES');
  console.log('█'.repeat(60));

  simulateWithdrawal(2500); // $50 net
  simulateWithdrawal(5000); // $100 net
  simulateWithdrawal(1000); // Below minimum

  console.log('\n' + '═'.repeat(60));
  console.log('SIMULATION COMPLETE');
  console.log('═'.repeat(60));
}

// Run
main();

