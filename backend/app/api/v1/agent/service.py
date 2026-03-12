"""
agent/service.py — Autonomous agent loop.

Plan → Act (tool) → Observe → Remember → Replan → Stop

Stop conditions (all checked before every iteration):
  • max_steps reached
  • max_tool_calls reached
  • Repeating loop detected (same tool + args ≥ 3 times)

The loop produces SSE-compatible dict events so the router can stream them
directly to the frontend — same pattern as chat/service.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator

from sqlmodel import Session

from app.api.v1.agent.context import (
    build_agent_messages,
    build_agent_system_prompt,
    parse_agent_decision,
)
from app.api.v1.agent.schemas import AgentRunRequest, ScreenContext, UIAction
from app.api.v1.agent.tools import PLATFORM_TOOL_SCHEMAS, execute_agent_tool
from app.api.v1.llms.engine import engine

logger = logging.getLogger(__name__)

_STREAM_WORD_DELAY = 0.01   # seconds between streamed tokens


def _token_overlap(a: str, b: str) -> float:
    """Jaccard token overlap — used for loop detection."""
    sa, sb = set(a.lower().split()), set(b.lower().split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / max(1, len(sa | sb))


def _is_looping(last_actions: list[str], threshold: float = 0.85) -> bool:
    if len(last_actions) < 3:
        return False
    a, b, c = last_actions[-3], last_actions[-2], last_actions[-1]
    return _token_overlap(a, b) >= threshold and _token_overlap(b, c) >= threshold


async def run_agent_streaming(
    request: AgentRunRequest,
    session: Session,
) -> AsyncGenerator[dict, None]:
    """
    Core agent loop. Yields SSE-compatible dicts:

      {"type": "plan",        "plan": [...], "next_step": "..."}
      {"type": "tool_call",   "tool_name": "...", "tool_args": {...}}
      {"type": "tool_result", "tool_name": "...", "tool_result_preview": "..."}
      {"type": "thinking",    "content": "..."}
      {"type": "token",       "content": "word "}
      {"type": "ui_action",   "ui_action": {...}}
      {"type": "done",        "steps_taken": N, "tool_calls_made": M, "ui_actions": [...]}
      {"type": "error",       "error": "..."}
    """
    if not engine.is_ready:
        yield {"type": "error", "error": "No model loaded. Call POST /llms/load first."}
        return

    from app.api.v1.chat.llm_config import get_model_config

    model_id = engine.current_model_id or ""
    model_cfg = get_model_config(model_id)

    system_prompt = build_agent_system_prompt(
        request.screen_context,
        PLATFORM_TOOL_SCHEMAS,
    )

    history: list[dict] = []  # grows as turns accumulate
    last_actions: list[str] = []
    step = 0
    tool_calls_made = 0
    collected_ui_actions: list[UIAction] = []

    logger.info(
        "agent_run_start — model=%s max_steps=%d max_tool_calls=%d screen=%s",
        model_id, request.max_steps, request.max_tool_calls,
        request.screen_context.summary or request.screen_context.active_module,
    )

    while step < request.max_steps:
        # ── Stop condition: tool quota ────────────────────────────────────────
        if tool_calls_made >= request.max_tool_calls:
            logger.warning("agent_stop — max_tool_calls=%d reached", request.max_tool_calls)
            history.append({
                "role": "user",
                "content": (
                    "You have reached the tool call limit. "
                    "Summarise what you found so far and provide a final answer."
                ),
            })

        # ── Stop condition: loop detection ────────────────────────────────────
        if _is_looping(last_actions):
            logger.warning("agent_stop — loop detected after %d steps", step)
            history.append({
                "role": "user",
                "content": (
                    "It looks like you are repeating the same actions. "
                    "Summarise what you found and provide a final answer now."
                ),
            })

        step += 1
        messages = build_agent_messages(system_prompt, history)

        # ── LLM call ─────────────────────────────────────────────────────────
        try:
            raw = await engine.generate(
                messages,
                max_new_tokens=1024,
                temperature=0.2,
                tools=None,  # agent uses text-format tool calls for broad model compat
            )
        except Exception as exc:
            logger.error("agent_generate_error — step=%d", step, exc_info=True)
            yield {"type": "error", "error": f"Generation failed: {exc}"}
            return

        decision = parse_agent_decision(raw)
        if decision is None:
            # Model produced non-JSON — treat as final answer
            logger.warning("agent_non_json — treating as final: %s", raw[:120])
            decision = {"type": "final", "answer": raw.strip()}

        dtype = decision.get("type", "").strip()

        # ── PLAN ─────────────────────────────────────────────────────────────
        if dtype == "plan":
            plan = [str(s)[:200] for s in (decision.get("plan") or [])[:6]]
            next_step = str(decision.get("next") or "").strip()
            last_actions.append("plan:" + next_step)
            history.append({"role": "assistant", "content": json.dumps(decision)})
            yield {"type": "plan", "plan": plan, "next_step": next_step}
            continue

        # ── TOOL_CALL ─────────────────────────────────────────────────────────
        if dtype == "tool_call":
            tool_name = str(decision.get("tool") or "").strip()
            tool_args = decision.get("args") or {}
            if not isinstance(tool_args, dict):
                tool_args = {}

            thinking = str(decision.get("thinking") or "").strip()
            if thinking:
                yield {"type": "thinking", "content": thinking}

            action_sig = f"tool:{tool_name} args:{json.dumps(tool_args, sort_keys=True)}"
            last_actions.append(action_sig)

            yield {"type": "tool_call", "tool_name": tool_name, "tool_args": tool_args}

            tool_calls_made += 1
            try:
                result = await execute_agent_tool(
                    tool_name, tool_args, request.screen_context, session
                )
            except Exception as exc:
                logger.error("agent_tool_error — tool=%s", tool_name, exc_info=True)
                result = json.dumps({"error": str(exc)})

            preview = result[:160] + ("…" if len(result) > 160 else "")
            yield {"type": "tool_result", "tool_name": tool_name, "tool_result_preview": preview}

            # Append turn to history
            history.append({"role": "assistant", "content": json.dumps(decision)})
            formatted = model_cfg.tool_result_formatter(tool_name, result)
            history.append({"role": model_cfg.tool_result_role, "content": formatted})
            continue

        # ── FINAL (also the fallback for any unknown type) ────────────────────
        answer = str(decision.get("answer") or raw).strip()
        if not answer:
            answer = "Done."

        # Parse and stream any UI actions the agent wants to execute
        raw_ui_actions: list[dict] = decision.get("ui_actions") or []
        for raw_action in raw_ui_actions:
            try:
                action = UIAction(**raw_action)
                collected_ui_actions.append(action)
                yield {"type": "ui_action", "ui_action": action.model_dump()}
            except Exception:
                logger.warning("agent_invalid_ui_action — %s", raw_action)

        # Stream answer token by token (same UX as chat streaming)
        words = answer.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield {"type": "token", "content": chunk}
            await asyncio.sleep(_STREAM_WORD_DELAY)

        logger.info("agent_done — steps=%d tool_calls=%d", step, tool_calls_made)
        yield {
            "type": "done",
            "steps_taken": step,
            "tool_calls_made": tool_calls_made,
            "ui_actions": [a.model_dump() for a in collected_ui_actions],
        }
        return

    # ── Max steps exhausted without a final ──────────────────────────────────
    logger.warning("agent_stop — max_steps=%d exhausted", request.max_steps)
    fallback = "I reached the maximum number of reasoning steps. Here is what I found so far."
    for i, word in enumerate(fallback.split(" ")):
        yield {"type": "token", "content": word + (" " if i < len(fallback.split(" ")) - 1 else "")}
        await asyncio.sleep(_STREAM_WORD_DELAY)
    yield {
        "type": "done",
        "steps_taken": step,
        "tool_calls_made": tool_calls_made,
        "ui_actions": [a.model_dump() for a in collected_ui_actions],
    }
