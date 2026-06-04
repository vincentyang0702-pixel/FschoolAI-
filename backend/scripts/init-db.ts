import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function runMigrations() {
  console.log('🚀 Starting database initialization...');

  try {
    // Read all migration files
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📋 Found ${files.length} migration files`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`⏳ Running migration: ${file}`);

      try {
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
          console.warn(`⚠️  Migration ${file} warning:`, error.message);
        } else {
          console.log(`✅ Migration ${file} completed`);
        }
      } catch (err: any) {
        console.error(`❌ Migration ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log('✨ Database initialization complete!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

runMigrations();
