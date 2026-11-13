# The task prompt: do every task completely, the first time

Paste the block below at the start of every task session (or say "follow docs/TASK-PROMPT.md"). It is the founder's five steps, made strict, so a task is done once, checked once, and never comes back.

Why this exists (13 Nov 2026): tasks kept coming back from the team's check because

- one line of the task, or of the team's "needs changes" note, was missed;
- a task was called done from reading the code, without looking at the real page;
- a fix in one place broke another, for example a global CSS class hitting another card;
- a push went out with a failing test;
- something that only shows when signed in (Silver or Gold) was never looked at;
- old work from the same task was left half-updated.

Every rule below closes one of these.

---

```
TASK: #<number> <title>

Work on this one task only, until every point is proven done. Follow these steps in order and do not skip any. "Done" means proven with evidence (a test, or a screenshot of the real page), never "the code looks right".

STEP 0. READ EVERYTHING, AND WRITE THE CHECKLIST
- Read the whole task, every comment, every "needs changes" note from the team and every earlier "done" note on it (ws show <n>). Open every screenshot.
- Write a numbered CHECKLIST with one line per requirement. Copy the team's words exactly; do not summarise. Split a sentence that asks for two things into two lines. Include what the screenshots show is wrong, even when the text does not say it.
- For an older task that came back: list what the earlier fix did, and the exact point the team says is still wrong. If it is not clear what looked wrong, ask the founder for a screenshot BEFORE changing anything.
- Add the standing rules that apply to this task:
  - numbers correct and current, and every blank says why;
  - describe, never advise (no buy, sell, hold, target, "best");
  - the disclaimer stays;
  - Silver and Gold see what their plan allows;
  - desktop and phone, light and dark;
  - no job is stopped or weakened.

STEP 1. ANALYSE: see the problem yourself, then find the real cause
- Reproduce every checklist point on the LIVE site first (https://finlitventures.com), signed in as the right plan when the task needs it, at desktop and phone width. Save a "before" screenshot per point. If you cannot see it, say so; do not guess.
- Find the ROOT cause of each point, not the symptom. Write it in one plain sentence per point.
- Look for the same cause elsewhere: search the whole codebase for the same class name, component, helper or pattern, and list every other page it breaks or will break. Those pages join the checklist.
- Look at what the change could break: every place that uses the file, component, CSS class, API field or job you will touch.

STEP 2. PLAN: one line per checklist point
- For each point: the file(s) to change, the exact change, and HOW you will prove it (which test, which screenshot, which view).
- Choose the proper fix, not a patch.
  - CSS is scoped to the component: no new global class names, and check first with grep that a class name is not already used elsewhere.
  - Data shows its source and date.
  - A blank shows its reason.
- List what you will NOT touch. Nothing outside the task changes: no layout, no wording, no feature.
- If two checklist points conflict, or the task is unclear, ask the founder now, in one short question, not after building.

STEP 3. IMPLEMENT
- Work on a new branch from the latest main.
- Make only the planned changes. Update every place the old behaviour lived: old copies, tests, docs, help text, other pages that show the same thing. Nothing is left half-updated.
- Add or update a test for each checklist point that can be tested in code, including a test that would have caught the original bug.

STEP 4. TEST: prove every checklist point, one by one
- Run all of these and fix until every one is clean:
  - the unit tests for every package you touched;
  - the type check;
  - the build;
  - lint and bandit where the CI runs them.
- Only push when everything has passed: `tests && push`, never `tests ; push`.
- Look at the real page in a browser with real data (Playwright with saved live API answers, or the live site after deploy), in all 4 views: desktop light, desktop dark, phone light, phone dark. When the task touches a plan, look at it as Silver and as Gold too.
- For EACH checklist point, take an "after" screenshot (or a test result) that shows it fixed. Compare it with the team's words and the "before" screenshot.
- Check the neighbours: the other sections of the same page, and every page found in Step 1 that shares the cause. Check that nothing moved, overlapped, got cut off or scrolls sideways at phone width, and that there are no console errors.
- Then go through the task once more as the team's checker would:
  - read the task and the team's notes again, word by word, against your screenshots;
  - read your own diff line by line;
  - if any single point is not proven, go back to Step 3.

STEP 5. UPGRADE
- With everything proven, make the improvements that clearly help the same feature: clearer wording, an empty state that explains itself, a sensible default, a small extra the user obviously needs. Keep them in scope, test them like Step 4, and list them separately.

SHIP AND VERIFY LIVE
- Commit (no model names), push, and open the pull request on Yusra-Khan532/Financial-Portfolio.
  - Its body lists every checklist point with its evidence.
- Wait for every check to pass, then squash-merge.
  - Deploys wait for running long jobs by themselves, so you never need to time a merge around a job.
- After it is live (about 10 minutes, or when `/api/health` shows the new version), open the live page and confirm every checklist point once more.
  - If a point needs a sign-in you do not have, the task is NOT done: ask the founder for that exact page, signed in, as a screenshot.
- Only then: ws done "<what changed> | <where> | <PR link> | <how to check>", in plain words.
  - Write the next ideas with ws note.

REPORT (one message per task)
- Cause, in one or two plain sentences.
- A table: checklist point | done? | evidence (screenshot or test).
- Tests run and their results.
- Upgrades added.
- Anything still open, and exactly what is needed from the founder: one step at a time, saying where it runs.
- Links: the pull request, and the live pages to check.

NEVER
- Never call a task done from reading code, or before the live page is checked.
- Never drop, merge or reinterpret a point from the task or the team's notes; if you did not do it, say so.
- Never change anything outside the task.
- Never push with a failing or skipped test.
- Never stop, pause or weaken a background job.
```

---

## For the founder: how to use it

1. Start each task with: `Follow docs/TASK-PROMPT.md for task #<n>.`
2. When the team sends a task back, paste their note and a screenshot. The session puts each line into the checklist word for word.
3. The report always ends with the checklist table. Any line without evidence is not done, and you can send it straight back.
