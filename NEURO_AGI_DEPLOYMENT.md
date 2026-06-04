# NeuroAGI Unified Brain Platform - Deployment Guide

## Overview

NeuroAGI is the **brain operating system** for every company. Each user gets **ONE brain** that learns from all products they use (FschoolAI, and future products).

**Key Principle:** Data from one product improves the brain for all products.

---

## Architecture

### Unified Database

All products (FschoolAI, future products) connect to the **NeuroAGI Brain database**:

```
Supabase Project: vanzrpqmkmqgsbjdnfvj
├── 57 tables (complete NeuroOS brain)
├── Product context (fschoolai, etc.)
├── User brains (one per user)
└── Cross-product insights
```

### Data Flow

```
FschoolAI (with Reggie AI tutor)
(Student Academic Platform)
    ↓                            ↓
    └────────────┬───────────────┘
                 ↓
        Unified Supabase Database
                 ↓
        NeuroAGI Platform Service
                 ↓
        User Brain (Vincent's Brain)
                 ↓
        Cross-Product Insights
```

### Product Context

Each signal includes a `product` column:

```sql
-- Behavioral signal from FschoolAI
INSERT INTO brain.signals (
  person_id, signal_type, value, product
) VALUES (
  'vincent-id', 'typing_speed', 75.5, 'fschoolai'
);

-- Behavioral signal from FschoolAI
INSERT INTO behavioral_signals (
  student_id, signal_type, value, product
) VALUES (
  'vincent-id', 'grading_speed', 120, 'fschoolai'
);

-- Query all signals (unified brain)
SELECT * FROM behavioral_signals WHERE student_id = 'vincent-id';
-- Returns signals from BOTH products
```

---

## Database Schema

### 57 Tables Across 8 Layers

| Layer | Purpose | Tables | Example |
|-------|---------|--------|---------|
| 1 | Core Identity | users, universities, courses | User profiles |
| 2 | Canvas Integration | assignments, grades, submissions | Assignment data |
| 3 | Behavioral Signals | 8 signal types | Typing speed, focus |
| 4 | Emotional Intelligence | 3 tables | Stress, confidence |
| 5 | Biometric Integration | 2 tables | Heart rate, sleep |
| 6 | Knowledge Graph | 4 tables | Concepts, relationships |
| 7 | Synthesis & Predictions | 5 tables | Predictions, recommendations |
| 8 | Operations | 3 tables | Agent outputs, logs |

### Product Context Columns

All signal tables have a `product` column:

```sql
ALTER TABLE behavioral_signals ADD COLUMN product VARCHAR(50) DEFAULT 'fschoolai';
ALTER TABLE emotional_signals ADD COLUMN product VARCHAR(50) DEFAULT 'fschoolai';
ALTER TABLE knowledge_signals ADD COLUMN product VARCHAR(50) DEFAULT 'fschoolai';
-- ... etc
```

### Views for Easy Access

```sql
-- Unified brain (all products)
SELECT * FROM unified_brain_signals;

-- FschoolAI-only data
SELECT * FROM fschoolai_brain_signals;

-- FschoolAI-only data
SELECT * FROM brain.signals WHERE product = 'fschoolai';

-- Cross-product insights
SELECT * FROM cross_product_insights;
```

---

## Backend Services

### 1. NeuroAGI Service (`server/services/neuro-agi.ts`)

**Purpose:** Manage user brains across all products

**Key Methods:**

```typescript
// Get complete user brain (all products)
const brain = await neuroAGI.getUserBrain(userId);

// Get brain for specific product
const fschoolBrain = await neuroAGI.getProductBrain(userId, 'fschoolai');

// Generate cross-product insights
const insights = await neuroAGI.generateCrossProductInsights(userId);

// Switch product context
const context = await neuroAGI.switchProductContext(userId, 'fschoolai');

// Get brain health metrics
const health = await neuroAGI.getBrainHealthMetrics(userId);

// Export brain data (portability)
const data = await neuroAGI.exportBrainData(userId);

// Delete brain data (privacy)
await neuroAGI.deleteBrainData(userId);
```

### 2. Canvas Sync Service (`server/services/canvas-sync.ts`)

**Purpose:** Sync Canvas data with product context

**Key Methods:**

```typescript
// Sync all Canvas data (with product context)
await canvasSync.syncCanvasData(userId, 'fschoolai');

// Get last sync time
const lastSync = await canvasSync.getLastSyncTime(userId, 'fschoolai');

// Schedule periodic sync
await canvasSync.scheduleSyncJob(userId, 'fschoolai', 60); // Every 60 minutes
```

### 3. Brain Compounding Engine (`server/services/brain-compounding.ts`)

**Purpose:** Process signals and update brain

**Key Methods:**

```typescript
// Process any signal type
const result = await brainEngine.processSignal({
  type: 'outcome',
  userId,
  courseId,
  data: { assignmentId, score, maxScore, product: 'fschoolai' }
});

// Process feedback
await brainEngine.processFeedback(userId, actionId, 'effectiveness', 0.8);
```

### 4. Knowledge Graph Engine (`server/services/knowledge-graph.ts`)

**Purpose:** Manage concepts and relationships

**Key Methods:**

```typescript
// Add concept
await kg.addConcept(userId, 'Recursion', courseId, 0.75);

// Create relationship
await kg.createConnection(userId, conceptA, conceptB, 'builds_on', 0.8);

// Detect gaps
const gaps = await kg.detectKnowledgeGaps(userId, courseId);

// Find opportunities
const opportunities = await kg.identifyLearningOpportunities(userId, courseId);
```

### 5. Agent Coordinator (`server/services/agent-coordinator.ts`)

**Purpose:** Route messages to specialized agents

**Key Methods:**

```typescript
// Coordinate message
const result = await coordinator.coordinate({
  userId,
  text: 'Help me understand recursion',
  context: { courseId }
});

// Get agent status
const status = await coordinator.getAgentStatus(userId);
```

---

## API Endpoints

### NeuroAGI Brain API

```typescript
// Get user brain
GET /api/brain/:userId
Response: { userId, identity, signals, knowledgeGraph, synthesis, productContexts }

// Get product-specific brain
GET /api/brain/:userId/:product
Response: { userId, identity, signals (filtered by product), ... }

// Get cross-product insights
GET /api/brain/:userId/insights/cross-product
Response: [{ title, description, sourceProducts, confidence, recommendation }]

// Switch product
POST /api/brain/:userId/switch-product
Body: { product: 'fschoolai' }
Response: { product, role, signals, insights, lastActive }

// Get brain health
GET /api/brain/:userId/health
Response: { totalSignals, conceptsTracked, avgMastery, emotionalState, products }

// Export brain
GET /api/brain/:userId/export
Response: Complete brain data (JSON)

// Delete brain
DELETE /api/brain/:userId
Response: { success: true }
```

### Canvas Sync API

```typescript
// Sync Canvas data
POST /api/canvas/sync
Body: { userId, product: 'fschoolai' }
Response: { status: 'success', synced_at }

// Get last sync
GET /api/canvas/sync/:userId/:product
Response: { lastSyncTime: '2026-05-20T10:30:00Z' }

// Schedule sync
POST /api/canvas/sync/:userId/schedule
Body: { product: 'fschoolai', intervalMinutes: 60 }
Response: { scheduled: true }
```

### Signal Recording API

```typescript
// Record signal (with product context)
POST /api/signals/record
Body: {
  userId,
  type: 'outcome',
  courseId,
  data: { assignmentId, score, maxScore },
  product: 'fschoolai'
}
Response: { signalId, processed: true }

// Record feedback
POST /api/signals/feedback
Body: { userId, actionId, feedbackType, feedbackValue, product: 'fschoolai' }
Response: { feedbackId, processed: true }
```

---

## Implementation Steps

### Phase 1: Database Setup

1. **Deploy migrations to Supabase**
   ```bash
   # Migrations are in database/migrations/
   # Auto-deployed via GitHub Actions
   ```

2. **Verify schema**
   ```sql
   SELECT COUNT(*) as table_count FROM information_schema.tables 
   WHERE table_schema = 'public';
   -- Should return 57 tables
   ```

3. **Verify product context columns**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'behavioral_signals' AND column_name = 'product';
   -- Should return 'product'
   ```

### Phase 2: Backend Services

1. **Initialize NeuroAGI service**
   ```typescript
   const neuroAGI = new NeuroAGIService();
   ```

2. **Initialize Canvas sync**
   ```typescript
   const canvasSync = new CanvasSyncService();
   ```

3. **Set up API routes**
   ```typescript
   app.get('/api/brain/:userId', async (req, res) => {
     const brain = await neuroAGI.getUserBrain(req.params.userId);
     res.json(brain);
   });
   ```

### Phase 3: Product Integration

1. **FschoolAI writes signals with product context**
   ```typescript
   await brainEngine.processSignal({
     type: 'outcome',
     userId,
     courseId,
     data: { assignmentId, score, maxScore, product: 'fschoolai' }
   });
   ```

2. **FschoolAI writes signals with product context**
   ```typescript
   await brainEngine.processSignal({
     type: 'outcome',
     userId,
     courseId,
     data: { assignmentId, score, maxScore, product: 'fschoolai' }
   });
   ```

3. **Both products read from unified brain**
   ```typescript
   const brain = await neuroAGI.getUserBrain(userId);
   // Contains all FschoolAI brain data
   ```

### Phase 4: Cross-Product Insights

1. **Generate insights**
   ```typescript
   const insights = await neuroAGI.generateCrossProductInsights(userId);
   // Returns insights using data from all products
   ```

2. **Display in UI**
   ```typescript
   // Show insights to user
   // "You teach better when you understand the concept yourself"
   ```

---

## Data Examples

### Example 1: Vincent's Unified Brain

**Vincent is a student in FschoolAI (Reggie is the AI tutor)**

```json
{
  "userId": "vincent-id",
  "identity": {
    "name": "Vincent Yang",
    "email": "vincent@example.com",
    "role": "teacher",
    "products": ["fschoolai"]
  },
  "signals": {
    "behavioral": [
      {
        "id": 1,
        "student_id": "vincent-id",
        "signal_type": "typing_speed",
        "value": 75.5,
        "product": "fschoolai",
        "timestamp": "2026-05-20T10:30:00Z"
      },
      {
        "id": 2,
        "student_id": "vincent-id",
        "signal_type": "grading_speed",
        "value": 120,
        "product": "fschoolai",
        "timestamp": "2026-05-20T11:00:00Z"
      }
    ],
    "emotional": [
      {
        "id": 1,
        "student_id": "vincent-id",
        "emotion_type": "stress",
        "intensity": 0.8,
        "product": "fschoolai",
        "timestamp": "2026-05-20T11:05:00Z"
      },
      {
        "id": 2,
        "student_id": "vincent-id",
        "emotion_type": "confidence",
        "intensity": 0.7,
        "product": "fschoolai",
        "timestamp": "2026-05-20T10:45:00Z"
      }
    ]
  },
  "productContexts": {
    "fschoolai": {
      "product": "fschoolai",
      "role": "teacher",
      "lastActive": "2026-05-20T11:05:00Z"
    },
    "fschoolai": {
      "product": "fschoolai",
      "role": "student",
      "lastActive": "2026-05-20T10:45:00Z"
    }
  }
}
```

### Example 2: Cross-Product Insight

```json
{
  "title": "Teaching Stress Detected",
  "description": "You experience more stress while teaching than learning",
  "sourceProducts": ["fschoolai"],
  "confidence": 0.8,
  "actionable": true,
  "recommendation": "Try stress management techniques between classes"
}
```

---

## Deployment Checklist

- [ ] All 57 tables deployed to Supabase
- [ ] Product context columns added to signal tables
- [ ] Views created (unified, product-specific, cross-product)
- [ ] NeuroAGI service implemented
- [ ] Canvas sync service implemented
- [ ] Brain compounding service updated
- [ ] Knowledge graph service updated
- [ ] Agent coordinator updated
- [ ] API routes implemented
- [ ] FschoolAI writes signals with product context
- [ ] FschoolAI reads from unified brain
- [ ] Cross-product insights working
- [ ] Testing completed
- [ ] Documentation updated
- [ ] Deployed to production

---

## Monitoring

### Brain Health Metrics

```sql
-- Total signals per user
SELECT student_id, COUNT(*) as signal_count
FROM behavioral_signals
GROUP BY student_id;

-- Signals per product
SELECT product, COUNT(*) as signal_count
FROM behavioral_signals
GROUP BY product;

-- Cross-product users
SELECT student_id, COUNT(DISTINCT product) as product_count
FROM behavioral_signals
GROUP BY student_id
HAVING COUNT(DISTINCT product) > 1;
```

### Sync Status

```sql
-- Last sync time per product
SELECT user_id, product, MAX(synced_at) as last_sync
FROM canvas_sync_logs
WHERE status = 'success'
GROUP BY user_id, product;

-- Sync errors
SELECT user_id, product, error_message, COUNT(*) as error_count
FROM canvas_sync_logs
WHERE status = 'error'
GROUP BY user_id, product, error_message;
```

---

## Future Enhancements

1. **Real-time sync** — WebSocket for instant brain updates
2. **Mobile brain** — Offline brain on mobile devices
3. **Brain marketplace** — Share insights across users
4. **Brain templates** — Pre-built brains for different roles
5. **Brain AI** — AI that learns how to improve brains
6. **Brain security** — Encrypted brain storage
7. **Brain portability** — Export/import brain to other platforms

---

## Support

For issues or questions:
1. Check the logs in `.manus-logs/`
2. Review the database schema in `database/migrations/`
3. Test individual services in isolation
4. Check environment variables are set correctly
5. Verify Supabase connection is working
