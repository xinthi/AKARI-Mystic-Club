#!/bin/bash

# AKARI Mystic Bot Setup Script
# This script sets up the project for development

set -e

echo "🔮 AKARI Mystic Bot Setup"
echo "========================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

echo "✅ pnpm $(pnpm -v)"

# Check PostgreSQL connection (optional)
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client found"
else
    echo "⚠️  PostgreSQL client not found. Make sure PostgreSQL is installed and running."
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Check .env file
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your credentials."
    echo ""
    echo "Required variables:"
    echo "  - TELEGRAM_BOT_TOKEN"
    echo "  - DATABASE_URL"
    echo "  - VERCEL_URL"
    echo "  - ADMIN_TELEGRAM_ID"
    echo ""
    read -p "Press Enter to continue after editing .env..."
fi

# Setup Prisma
echo ""
echo "🗄️  Setting up database..."

# Check if DATABASE_URL is set
if grep -q "your_bot_token_here" .env 2>/dev/null; then
    echo "⚠️  Please configure your .env file first!"
    exit 1
fi

echo "Pushing Prisma schema..."
pnpm prisma:push

echo "Generating Prisma Client..."
pnpm prisma:generate

echo "Seeding database..."
pnpm prisma:seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Make sure your .env file is configured"
echo "  2. Run 'pnpm dev' to start development"
echo "  3. Test the bot with /start command"
echo ""
echo "For production deployment, see README.md"
echo ""

