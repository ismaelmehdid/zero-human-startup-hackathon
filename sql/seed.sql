-- Development seed: three fictional consultants so hunter can match before bench has loaded real CVs.
-- Their box_file_id values start with 'seed-' (not real Box ids). The demo keeps them as a bench baseline next to
-- the Box CVs; only `reset.mjs --yes --with-seed` (sql/reset_seed.sql) deletes them.
-- skills follow bench's convention: lowercase, trimmed, deduplicated canonical names.
-- Idempotent: rows that already exist (same box_file_id) are left untouched.
-- Apply with: node --env-file=.env scripts/db.mjs apply sql/seed.sql

INSERT INTO consultants
    (box_file_id, full_name, title, skills, years_experience, hourly_rate_usd, location, availability, summary)
VALUES
    ('seed-001',
     'Maya Chen',
     'Senior Data Engineer',
     ARRAY['python', 'sql', 'spark', 'airflow', 'dbt', 'snowflake', 'aws'],
     9, 135.00,
     'Austin, TX (remote)',
     'Available immediately',
     'Data engineer who builds batch and streaming pipelines on AWS. Led two migrations of nightly ETL jobs to Spark on EMR orchestrated by Airflow, and runs dbt models on Snowflake in production.'),
    ('seed-002',
     'Daniel Okafor',
     'Cloud and DevOps Engineer',
     ARRAY['aws', 'terraform', 'kubernetes', 'docker', 'github actions', 'linux', 'python'],
     11, 150.00,
     'Denver, CO (remote)',
     'Available from 2026-10-20',
     'Platform engineer who designs AWS landing zones in Terraform and runs EKS clusters for product teams. Cut CI/CD build times by half at a fintech by moving to GitHub Actions with cached container builds.'),
    ('seed-003',
     'Priya Raman',
     'Full-Stack Engineer',
     ARRAY['typescript', 'react', 'node.js', 'next.js', 'postgresql', 'graphql'],
     7, 120.00,
     'Chicago, IL (remote)',
     'Available immediately, up to 40 hours per week',
     'Full-stack engineer who ships customer-facing web apps in React and Next.js on Node.js and PostgreSQL backends. Built a GraphQL API layer for a healthcare scheduling product used by 200 clinics.')
ON CONFLICT (box_file_id) DO NOTHING;
