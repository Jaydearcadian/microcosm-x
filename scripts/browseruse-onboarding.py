import asyncio
import os
import sys

from browser_use import Agent, ChatBrowserUse, ChatOpenAI

TASK = """Open http://127.0.0.1:3010/app/onboarding and validate the Microcosm onboarding experience in the real browser. Do not click any Work settlement action and do not submit a real payment. Verify that the Connect step loads, click Check API and identity, confirm the API and chain status, continue through the visible Space and Roster prechecks when safe, and confirm the six-step wizard is present. Report the final URL, steps observed, and any console or page errors. Do not invent a successful API result."""


async def main():
    if os.environ.get("BROWSER_USE_API_KEY"):
        llm = ChatBrowserUse(model=os.environ.get("BROWSER_USE_MODEL", "bu-2-0"))
    elif os.environ.get("OPENAI_API_KEY"):
        llm = ChatOpenAI(model=os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"))
    else:
        raise SystemExit("BrowserUse requires BROWSER_USE_API_KEY or OPENAI_API_KEY")

    agent = Agent(task=TASK, llm=llm, use_vision=True, max_failures=2)
    history = await agent.run()
    print(f"BrowserUse steps: {len(history)}")
    print(history.final_result() if hasattr(history, "final_result") else history)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(130)
