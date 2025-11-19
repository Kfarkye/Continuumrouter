# DeepThink User Guide

## What is DeepThink?

DeepThink is an advanced AI reasoning system that breaks down complex problems into structured plans, gathers evidence, generates multiple solutions, and verifies the best answer. Think of it as having three AI experts work on your problem simultaneously, with a fourth expert verifying the quality of their solutions.

## When Should I Use DeepThink?

### ✅ Perfect For:

- **Complex Architecture Decisions**
  - "Design a distributed caching strategy for 50+ microservices"
  - "How should I structure a multi-tenant SaaS application?"

- **Technical Problem-Solving**
  - "Debug this performance issue and suggest optimizations"
  - "Analyze trade-offs between different database approaches"

- **Research Questions**
  - "Explain distributed consensus algorithms with examples"
  - "Compare modern state management patterns in React"

- **Critical Decisions**
  - Questions where accuracy is more important than speed
  - Problems requiring evidence and citations
  - Solutions that need verification

### ❌ Not Ideal For:

- Simple questions ("What is REST?")
- Quick lookups ("How do I sort an array in JavaScript?")
- Creative writing or brainstorming
- Real-time conversational chat

## How to Access DeepThink

1. **Look at the sidebar** (left side of the screen)
2. **Find the DeepThink button** (has a brain icon 🧠)
3. **Click it** to enter DeepThink mode

## What You'll See

### Starting Screen

When you first open DeepThink, you'll see:

- **Explanation** of what DeepThink does
- **Four key features**:
  - Strategic Planning
  - Evidence Gathering
  - Parallel Solving
  - Quality Verification
- **Best use cases** listed
- **Text area** to enter your query
- **"Analyze" button** to start reasoning

### While Processing (30-60 seconds)

You'll see real-time updates as DeepThink works:

#### Phase 1: Planning
- **What happens**: Analyzes your goal and creates a structured approach
- **What you see**: 
  - Goal restatement
  - High-level approach
  - Key considerations (3-8 points)
  - Estimated complexity
  - Whether evidence is needed

#### Phase 2: Evidence Gathering (Optional)
- **What happens**: Searches for relevant information
- **What you see**:
  - Number of sources found
  - Snippets with relevance scores
  - Source URLs
  - Reference IDs like [R1], [R2], [R3]

#### Phase 3: Solving
- **What happens**: 3 AI models work in parallel with different approaches
- **What you see**:
  - "Candidate 1" progress (conservative approach)
  - "Candidate 2" progress (balanced approach)
  - "Candidate 3" progress (creative approach)
  - Confidence levels for each

#### Phase 4: Verification
- **What happens**: Quality checks and validation
- **What you see**:
  - "Verifying candidate X..." messages
  - Deterministic checks (structure, citations, completeness)
  - LLM-based quality assessment

### Final Result

When complete, you'll see:

- ✅ **"Verified Solution" badge**
- **Quality Score**: 0-100% (typically 80%+)
- **Complete Answer**: Markdown-formatted with inline citations [R1], [R2]
- **Citations List**: All references used
- **Limitations**: Honest assessment of constraints or uncertainties
- **Execution Time**: How long it took
- **"Start New DeepThink" button** to ask another question

## Example Query

Try this to test DeepThink:

```
Design a real-time notification system that can handle 100,000 concurrent 
users. Consider scalability, message delivery guarantees, fallback 
mechanisms, and cost optimization. Provide specific technology 
recommendations.
```

**Expected result**: A comprehensive architecture with:
- Strategic plan for the system
- Evidence from documentation and best practices
- Multiple solution candidates evaluated
- Final verified recommendation with:
  - Technology choices (WebSockets, Redis, Kafka, etc.)
  - Architecture diagram description
  - Scalability considerations
  - Cost estimates
  - Trade-offs explained
  - Citations to relevant sources

## Understanding the Results

### Quality Score
- **90-100%**: Excellent - High confidence, thorough, well-verified
- **80-89%**: Good - Solid answer with minor gaps
- **70-79%**: Acceptable - Adequate but review carefully
- **Below 70%**: Review needed - May have issues

### Citations [R1], [R2], etc.
- These reference the evidence gathered in Phase 2
- Click the source URLs to verify information
- More citations generally means better-researched answer

### Residual Risk / Limitations
- Honest assessment of what the answer doesn't cover
- Assumptions made during reasoning
- Areas requiring human judgment
- Known uncertainties or edge cases

## Tips for Best Results

### 1. Be Specific
**Better**: "Design a caching strategy for a React app with 1M users, considering API rate limits and data freshness requirements"

**Worse**: "How do I cache stuff?"

### 2. Provide Context
**Better**: "I'm building a financial dashboard that needs real-time updates. How should I handle WebSocket reconnections to ensure no data loss?"

**Worse**: "WebSocket reconnections?"

### 3. Ask One Thing at a Time
**Better**: Focus on one architectural decision per query

**Worse**: "Help me design my entire system architecture, choose technologies, set up CI/CD, and optimize costs"

### 4. Specify Constraints
**Better**: "Design a solution that works with our existing PostgreSQL database and $500/month budget"

**Worse**: "Design a solution" (too open-ended)

## Cost and Performance

### Typical Costs
- **Simple query**: $0.05 - $0.15
- **Complex query**: $0.25 - $0.75
- **Maximum**: ~$1.50 per query

### Typical Duration
- **Planning**: 3-5 seconds
- **Evidence**: 5-10 seconds (if enabled)
- **Solving**: 15-30 seconds
- **Verification**: 5-10 seconds
- **Total**: 30-60 seconds

### Why It Takes Longer
DeepThink prioritizes quality over speed:
- Multiple AI models work on your problem
- Solutions are verified before being shown
- Evidence is gathered and evaluated
- Trade-offs are carefully considered

**Regular Chat vs DeepThink:**
- Regular Chat: 3-10 seconds, good for most questions
- DeepThink: 30-60 seconds, better for complex decisions

## Returning to Regular Chat

1. **Click "Conversations"** in the sidebar
2. **Or click "New Conversation"** button
3. You'll return to the regular chat interface

## Troubleshooting

### "DeepThink navigation not configured"
- The backend isn't set up yet
- Contact your admin to complete the setup

### "Failed to create space run"
- Database might not be configured
- Try refreshing the page
- Contact support if it persists

### "All candidates failed verification"
- The query might be too ambiguous
- Try being more specific
- Rephrase your question with more context

### Takes too long / timeout
- Complex queries can take 60+ seconds
- This is normal for deep reasoning
- Wait for the full result

## Need Help?

- **Simple questions**: Use regular chat (faster)
- **Complex problems**: Use DeepThink (more thorough)
- **Not sure**: Start with regular chat, switch to DeepThink if needed

---

**Remember**: DeepThink is like consulting three senior engineers + a quality reviewer. It takes time but delivers well-reasoned, verified answers for complex decisions.
