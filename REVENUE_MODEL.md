# AKARI Mystic Club - Revenue Model & Distribution

## 📊 Overview

AKARI Mystic Club operates a prediction market platform with a token-based economy using MYST tokens. This document outlines all revenue sources, fee structures, and how revenue is distributed across different pools and user rewards.

---

## 💰 Revenue Sources

### 1. **Prediction Market Fees** (Primary Revenue)
- **Fee Structure**: 10% of the **losing side** only (not total pool)
- **When Applied**: On prediction resolution
- **Example**: 
  - Total pool: 1,000 MYST (500 YES, 500 NO)
  - Losing side: 500 MYST
  - Platform fee: 50 MYST (10% of 500)
  - Winners share: 950 MYST (1,000 - 50)

### 2. **Withdrawal Fees**
- **Fee Rate**: 2% of withdrawal amount
- **Minimum Withdrawal**: $50 USD net
- **Destination**: Treasury pool
- **Example**:
  - User withdraws 1,000 MYST = $20 USD
  - Fee: $0.40 USD (2%)
  - User receives: $19.60 USD

### 3. **MYST Token Purchases**
- Users buy MYST with TON (via TON deposits)
- 1 USD = 50 MYST (fixed rate)
- TON price fetched live from Binance
- Revenue: Full deposit amount (minus operational costs)

---

## 🎯 Revenue Distribution Model

### **Platform Fee Distribution** (from prediction market fees)

When a prediction is resolved and platform fee is collected, it's distributed as follows:

| Destination | Percentage | Purpose |
|------------|-----------|---------|
| **Referral Leaderboard** | 10% | Weekly distribution to top referrers (ranked by referral spending) |
| **Leaderboard Pool** | 15% | Weekly recognition prizes for top players |
| **Wheel of Fortune Pool** | 5% | Funds MYST prizes for daily wheel spins |
| **Platform Treasury** | 70% | Platform profit, operational costs, future development |

**Example Calculation:**
- Platform fee collected: 50 MYST
- Referral Leaderboard: 5 MYST (10%)
- Leaderboard Pool: 7.5 MYST (15%)
- Wheel Pool: 2.5 MYST (5%)
- Treasury: 35 MYST (70%)

---

## 🏆 Pool System

### 1. **Referral Leaderboard Pool**
- **Source**: 10% of platform fees from predictions
- **Distribution**: Weekly (to be implemented)
- **Eligibility**: Users ranked by their referred users' MYST spending
- **Purpose**: Reward top referrers for bringing active users

### 2. **Leaderboard Pool**
- **Source**: 15% of platform fees from predictions
- **Distribution**: Weekly recognition prizes
- **Eligibility**: Top players by MYST spent, referrals, or aXP
- **Purpose**: Weekly recognition (MYST rewards, no TON shown in UI)

### 3. **Wheel of Fortune Pool**
- **Source**: 5% of platform fees from predictions
- **Usage**: Funds MYST prizes for daily wheel spins
- **Rules**:
  - 2 free spins per day per user
  - Prizes: MYST or aXP
  - When pool is 0, only aXP prizes are awarded

### 4. **Platform Treasury**
- **Source**: 
  - 70% of platform fees from predictions
  - 100% of withdrawal fees
  - TON deposits (minus MYST minted)
- **Purpose**: 
  - Platform profit
  - Operational costs
  - Future development
  - Can be partially burned later if desired

---

## 📈 MYST Token Economics

### **Token Emission Sources** (Limited)
1. **TON Deposits**: External watcher credits MYST when TON is received
2. **Admin Grants**: Manual grants via `/admin/myst` panel
3. **Onboarding Bonus**: 5 MYST per new user (until Jan 1, 2026)
4. **Referral Milestone**: 10 MYST when user reaches 5 referrals (until Jan 1, 2026)

### **Token Burning**
- **Withdrawals**: Full MYST amount is burned when user withdraws
- **Purpose**: Maintain token scarcity and value

### **Token Value**
- **Fixed Rate**: 1 USD = 50 MYST (0.02 USD per MYST)
- **TON Conversion**: Live TON price × 50 = MYST per TON
  - Example: If TON = $5.00, then 1 TON = 250 MYST

---

## 🔄 User Spending Flow

### **When User Places a Bet:**
1. Full bet amount goes into prediction pool
2. No fees taken at bet time
3. Pool grows with all bets

### **When Prediction Resolves:**
1. Calculate platform fee: 10% of losing side
2. Winners receive: (Total pool - fee) distributed proportionally
3. Platform fee is split:
   - 10% → Referral Leaderboard
   - 15% → Leaderboard Pool
   - 5% → Wheel Pool
   - 70% → Treasury

---

## 📊 Revenue Calculation Example

### **Scenario: Weekly Prediction Market Activity**

**Assumptions:**
- 10 predictions resolved
- Average losing side per prediction: 1,000 MYST
- Total platform fees: 1,000 MYST (10% × 1,000 × 10)

**Distribution:**
```
Platform Fee Collected: 1,000 MYST
├── Referral Leaderboard: 100 MYST (10%)
├── Leaderboard Pool: 150 MYST (15%)
├── Wheel Pool: 50 MYST (5%)
└── Treasury: 700 MYST (70%)
```

**Additional Revenue:**
- Withdrawals: 500 MYST withdrawn × 2% = 10 MYST → Treasury
- **Total Treasury Revenue**: 710 MYST

---

## 🎯 Competitive Positioning

### **Why This Model is Competitive:**

1. **Low Entry Barrier**: No upfront fees when betting
2. **Fair Fee Structure**: Only 10% of losing side (not total pool)
3. **User Rewards**: 30% of fees shared back with users (10% referral + 15% leaderboard + 5% wheel)
4. **Transparent**: All fees clearly visible on resolution

### **Comparison to Traditional Markets:**
- Traditional: 5-10% of total pool
- AKARI: 10% of losing side only
- **Result**: More competitive, especially for winning bets

---

## 🔐 Security & Transparency

- All transactions recorded in `MystTransaction` table
- Pool balances tracked in `PoolBalance` table
- Withdrawal requests require manual admin approval
- Treasury balance visible in admin panel

---

## 📝 Notes

- **Referral Leaderboard**: Currently accumulates funds, weekly distribution to be implemented
- **Promotional MYST**: Onboarding and referral milestone bonuses expire Jan 1, 2026
- **Withdrawal Fee**: Currently 2% (configurable, can be updated to 5% if needed)
- **Minimum Bet**: 2 MYST per prediction

---

## 🔄 Future Considerations

1. **Weekly Distribution Automation**: Implement automated weekly payouts for referral and leaderboard pools
2. **Treasury Management**: Options for burning excess treasury or reinvesting
3. **Fee Optimization**: Monitor market conditions and adjust if needed
4. **Additional Revenue Streams**: Campaign fees, premium features, etc.

---

*Last Updated: Based on current implementation as of latest commit*

