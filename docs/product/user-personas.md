# User Personas

---

## Primary: The AI Engineer

**Name:** Alex  
**Role:** AI/ML Engineer at a mid-size SaaS company  
**Context:** Maintains 3 production AI agents — a customer support bot, a code review agent, and a document Q&A system. Each runs ~500 sessions/day.

**Pain point:** Agent failures come in at all hours. Alex gets paged, opens Langfuse, reads through traces manually, and spends 45–90 minutes per incident just figuring out what went wrong.

**What they want:** "Tell me what failed and why in under a minute."

**How Aethen helps:** Import the failing trace → get a structured AnalysisReport with root cause and remediation in 10 seconds.

---

## Secondary: The Platform Engineer

**Name:** Sam  
**Role:** Platform/DevOps engineer at an AI-first startup  
**Context:** Manages the infrastructure for the company's AI agents. Responsible for reliability, uptime, and escalation routing.

**Pain point:** LLM failures are not like regular software failures — they don't throw exceptions, they give subtly wrong answers. Existing APM tools don't understand LLM failure modes.

**What they want:** Automated classification and alerting for AI agent failures, integrated with their existing on-call workflow.

**How Aethen helps:** API + SDK for programmatic submission; Slack integration (roadmap); confidence-gated alerting via webhooks.

---
