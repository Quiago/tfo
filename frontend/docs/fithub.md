# Fithub Component

GitHub-inspired industrial knowledge sharing platform for cross-facility learning and anomaly management.

## Purpose

Fithub combines two milestones into a unified interface:
1. **Anomaly Detection Center** — View AI-detected anomalies with recommended workflows, approve/reject actions
2. **Cross-Facility Learning** — Share solutions across factories; when one solves a problem, all learn

## Architecture

Three-column layout inspired by GitHub:
- **Left (240px)**: Factory selector + workflow repos sidebar
- **Center (flex-1)**: Input bar + Feed (Reddit/StackOverflow style)
- **Right (280px)**: Changelog timeline

## Components

| Component | Purpose |
|-----------|---------|
| `FithubLayout` | Main 3-column layout wrapper |
| `FactoryReposSidebar` | Factory dropdown + repos list with stars/forks |
| `FithubFeed` | Filter bar + anomalies + posts list |
| `FithubInput` | Ask AI, Create Ticket, Issue, PR actions |
| `FeedPost` | Individual post with author badges, upvotes |
| `AnomalyCard` | Pending anomaly with approve/reject/investigate |
| `ChangelogPanel` | Timeline of recent updates |

## Data Types

```typescript
interface Factory {
  id: string
  name: string           // "factory-1"
  displayName: string    // "Munich Plant"
  metrics: { efficiency, uptime, activeWorkflows, resolvedAnomalies }
}

interface WorkflowRepo {
  id: string
  factoryId: string
  name: string           // "motor-vibration-fix"
  stars: number
  forks: number
}

interface FithubPost {
  type: 'insight' | 'question' | 'issue' | 'pull_request' | 'announcement' | 'anomaly_alert'
  authorType: 'human' | 'ai_agent' | 'system'
  title: string
  content: string
  upvotes: number
}

interface DetectedAnomaly {
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'approved' | 'rejected' | 'investigating'
  suggestedWorkflowName?: string
  confidence: number
}
```

## Usage

```tsx
import { FithubLayout } from '@/components/fithub'

export default function Page() {
  return <FithubLayout />
}
```

## Mock Data

`useFithubMockData` hook provides:
- 5 factories (Munich, Shanghai, Detroit, Tokyo, São Paulo)
- 12 workflow repos
- 8 feed posts (AI insights, questions, PRs)
- 4 pending anomalies
- 8 changelog entries

## Playground

Visit `/playground/fithub` to test the component.
