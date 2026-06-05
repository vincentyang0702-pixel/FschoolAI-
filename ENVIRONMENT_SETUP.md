# Environment Setup Guide

**FschoolAI Backend — Two-Database Architecture**

> ⚠️ **Updated June 4, 2026:** FschoolAI now uses TWO separate Supabase databases. `SUPABASE_URL` (single DB) is replaced by `BRAIN_SUPABASE_URL` and `FSCHOOL_SUPABASE_URL`. See below.

---

## Quick Setup

### 1. Copy Template
```bash
cp .env.example .env
```

### 2. Fill Required Variables
```bash
nano .env
```

### 3. Verify Setup
```bash
npm run db:verify
```

---

## Environment Variables

### CTO Setup
```
CTO_EMAIL=johannaresh@gmail.com
```

### Node Environment
```
NODE_ENV=development          # or production
PORT=5000                     # Server port
```

### Supabase Configuration — TWO Databases

**NeuroAGI Brain DB** (intelligence layer — signals, memory, sessions, patterns)
```
BRAIN_SUPABASE_URL=https://qiolhlvqfzujnkwnymft.supabase.co
BRAIN_SUPABASE_SERVICE_KEY=<service_role key — NeuroAGI Brain → Settings → API>
```

**FschoolAI Production DB** (Canvas data — users, courses, assignments, grades)
```
FSCHOOL_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
FSCHOOL_SUPABASE_ANON_KEY=<anon key — FschoolAI Production → Settings → API>
```

**Rule:** Brain services use `BRAIN_SUPABASE_*`. Canvas services use `FSCHOOL_SUPABASE_*`. Never mix them.

**How to get Supabase credentials:**
1. Go to https://app.supabase.com
2. Select the project (NeuroAGI Brain OR FschoolAI Production)
3. Click "Settings" → "API"
4. Copy the URL and the appropriate key

### Frontend Configuration
```
FRONTEND_URL=http://localhost:3000    # Frontend URL
```

### Canvas LMS Configuration
```
CANVAS_API_URL=https://your-canvas-instance.instructure.com
CANVAS_API_TOKEN=your-canvas-api-token
CANVAS_OAUTH_CLIENT_ID=your-oauth-client-id
CANVAS_OAUTH_CLIENT_SECRET=your-oauth-client-secret
CANVAS_OAUTH_REDIRECT_URI=http://localhost:5000/api/canvas/oauth/callback
```

**How to get Canvas credentials:**
1. Go to your Canvas instance
2. Click "Admin" → "Developer Keys"
3. Create new key with scopes:
   - `courses:read`
   - `assignments:read`
   - `submissions:read`
   - `grades:read`
   - `users:read`
4. Copy the key and secret

### JWT Configuration
```
JWT_SECRET=your-jwt-secret-key-min-32-chars
JWT_EXPIRY=7d
```

**Generate secure JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Logging
```
LOG_LEVEL=info    # error, warn, info, debug
```

### Feature Flags
```
ENABLE_CANVAS_SYNC=true
ENABLE_BLOCKCHAIN_LOGGING=true
ENABLE_CAUSAL_INFERENCE=true
ENABLE_PREDICTION_ENGINE=true
```

---

## Development vs Production

### Development (.env)
```
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug
ENABLE_CANVAS_SYNC=true
```

### Production (.env.production)
```
NODE_ENV=production
PORT=5000
LOG_LEVEL=warn
ENABLE_CANVAS_SYNC=true
```

**Switch environments:**
```bash
# Use .env
npm run dev

# Use .env.production
NODE_ENV=production npm start
```

---

## Verify Configuration

### Test Supabase Connection
```bash
npm run db:verify
```

### Test Server Startup
```bash
npm run dev
```

### Test Health Endpoint
```bash
curl http://localhost:5000/health
```

---

## Troubleshooting

### "Cannot find module 'dotenv'"
```bash
npm install
```

### "BRAIN_SUPABASE_URL is not defined" or "FSCHOOL_SUPABASE_URL is not defined"
- Check `.env` file exists
- Check both `BRAIN_SUPABASE_URL` and `FSCHOOL_SUPABASE_URL` are set
- Check no spaces around `=`
- Note: the old `SUPABASE_URL` single-variable approach is no longer used

### "Database connection failed"
```bash
# Verify credentials
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Test connection
# Test Brain DB connection
curl https://qiolhlvqfzujnkwnymft.supabase.co/rest/v1/ -H "apikey: $BRAIN_SUPABASE_SERVICE_KEY"
# Test FschoolAI DB connection
curl https://wqgxpouhbwhwpzudrptp.supabase.co/rest/v1/ -H "apikey: $FSCHOOL_SUPABASE_ANON_KEY"
```

### "Port 5000 already in use"
```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use different port
PORT=5001 npm run dev
```

---

## Security Best Practices

✅ **DO:**
- Keep `.env` file private (never commit)
- Use strong JWT secret (32+ characters)
- Rotate Canvas API tokens regularly
- Use HTTPS in production
- Enable database SSL

❌ **DON'T:**
- Commit `.env` to GitHub
- Share credentials in messages
- Use same secret in dev and prod
- Log sensitive data
- Hardcode credentials in code

---

## Production Deployment

### 1. Create `.env.production`
```bash
cp .env.example .env.production
```

### 2. Set Production Values
```
NODE_ENV=production
SUPABASE_URL=<production-url>
SUPABASE_ANON_KEY=<production-key>
# ... other production values
```

### 3. Deploy
```bash
npm run build
NODE_ENV=production npm start
```

---

## Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
```

### .dockerignore
```
node_modules
.env
.git
dist
```

### Run Docker
```bash
docker build -t fschoolai-backend .
docker run -p 5000:5000 --env-file .env.production fschoolai-backend
```

---

## Environment Variables Checklist

- [ ] `CTO_EMAIL` - Set to johannaresh@gmail.com
- [ ] `NODE_ENV` - Set to development or production
- [ ] `PORT` - Set to 5000 (or custom)
- [ ] `BRAIN_SUPABASE_URL` - NeuroAGI Brain DB URL
- [ ] `BRAIN_SUPABASE_SERVICE_KEY` - NeuroAGI Brain service_role key
- [ ] `FSCHOOL_SUPABASE_URL` - FschoolAI Production DB URL
- [ ] `FSCHOOL_SUPABASE_ANON_KEY` - FschoolAI Production anon key
- [ ] `FRONTEND_URL` - Set to frontend URL
- [ ] `CANVAS_API_URL` - Set to Canvas URL (if using Canvas)
- [ ] `CANVAS_API_TOKEN` - Set to Canvas token (if using Canvas)
- [ ] `JWT_SECRET` - Set to secure random string
- [ ] `LOG_LEVEL` - Set to info or debug

---

**Setup Complete! Ready to run backend.**
