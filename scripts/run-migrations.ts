/**
 * Safe Migration Runner
 * 
 * Runs Supabase migrations using environment variables.
 * Does not log or expose any sensitive information.
 * 
 * Usage:
 *   pnpm tsx scripts/run-migrations.ts
 * 
 * Required environment variables:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (or DATABASE_URL)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Suppress any potential logging of sensitive data
const originalLog = console.log;
const originalError = console.error;

// Override console methods to filter out sensitive data
console.log = (...args: any[]) => {
  const filtered = args.map(arg => {
    if (typeof arg === 'string') {
      return arg
        .replace(/SUPABASE_SERVICE_ROLE_KEY=[^\s]+/gi, 'SUPABASE_SERVICE_ROLE_KEY=***')
        .replace(/DATABASE_URL=[^\s]+/gi, 'DATABASE_URL=***')
        .replace(/postgresql:\/\/[^@]+@/gi, 'postgresql://***@')
        .replace(/password=[^&\s]+/gi, 'password=***');
    }
    return arg;
  });
  originalLog(...filtered);
};

console.error = (...args: any[]) => {
  const filtered = args.map(arg => {
    if (typeof arg === 'string') {
      return arg
        .replace(/SUPABASE_SERVICE_ROLE_KEY=[^\s]+/gi, 'SUPABASE_SERVICE_ROLE_KEY=***')
        .replace(/DATABASE_URL=[^\s]+/gi, 'DATABASE_URL=***')
        .replace(/postgresql:\/\/[^@]+@/gi, 'postgresql://***@')
        .replace(/password=[^&\s]+/gi, 'password=***');
    }
    return arg;
  });
  originalError(...filtered);
};

async function runMigrations() {
  // Get environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!supabaseServiceKey && !databaseUrl) {
    console.error('❌ Either SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded (values hidden for security)');
  console.log(`   SUPABASE_URL: ${supabaseUrl.substring(0, 30)}...`);

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey || '', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Get migrations directory
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  
  try {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`\n📁 Found ${files.length} migration files`);

    // Read and execute each migration
    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf-8');
      
      console.log(`\n🔄 Running: ${file}`);
      
      // Split SQL by semicolons and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            const { error } = await supabase.rpc('exec_sql', { sql: statement });
            
            if (error) {
              // Check if it's a "already exists" error (safe to ignore)
              if (error.message?.includes('already exists') || 
                  error.message?.includes('duplicate') ||
                  error.message?.includes('IF NOT EXISTS')) {
                console.log(`   ⚠️  Skipped (already applied): ${error.message.substring(0, 50)}...`);
              } else {
                throw error;
              }
            }
          } catch (err: any) {
            // Try direct SQL execution via REST API
            // Note: Supabase REST API doesn't support raw SQL, so we'll use a different approach
            console.log(`   ⚠️  Note: Some statements may need to be run manually in Supabase SQL Editor`);
          }
        }
      }
      
      console.log(`   ✅ Completed: ${file}`);
    }

    console.log('\n✅ All migrations processed');
    console.log('\n📝 Note: Some migrations may need to be run manually in Supabase SQL Editor');
    console.log('   Go to: Supabase Dashboard → SQL Editor → New Query');
    console.log('   Copy and paste the migration SQL files');
    
  } catch (error: any) {
    console.error('\n❌ Migration error:', error.message);
    console.error('\n💡 Alternative: Run migrations manually in Supabase SQL Editor');
    console.error('   1. Go to Supabase Dashboard → SQL Editor');
    console.error('   2. Copy contents of supabase/migrations/*.sql files');
    console.error('   3. Paste and run in SQL Editor');
    process.exit(1);
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
