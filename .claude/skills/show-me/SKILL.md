---
name: show-me
description: Explains the current topic in Slack with concise text diagrams, code-shape sketches, and small diffs. Use when the user says "show me", asks for a visual explanation, or a compact visual would replace long prose.
---

<!--
Adapted for Slack from HumanLayer's show-me skill (MIT):
https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md
@ref LLP 0068#show-me [implements] — provide compact visual explanations to the mayor
-->

Help the user understand the current topic of conversation visually inside a
Slack message. Skip the preamble and keep prose brief. Pick the smallest view
that makes the key point clear.

Use Slack-native output:

- Put trees, flows, pseudocode, and diffs in fenced code blocks so spacing is
  preserved.
- Use `<url|label>` for links outside code blocks.
- Use short headings and bullets only when they make the visual easier to scan.
- Keep each visual narrow enough to read in Slack on a phone.

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

- Show UI structure as a component tree. Include only the state and module
  boundaries that matter.

- Show file responsibility or a broad refactor as a shallow file tree. Give
  each entry one short responsibility.

- Show component interaction, control flow, or data flow as a text diagram:

```text
User       UI             Daemon
 │         │                │
 ├─choose─>│                │
 │         ├─send command──>│
 │         │<──stream result┤
 │<─show───┤                │
```

- Use `diff` when the point is what changes and the surrounding shape already
  exists. Match the diff shape to the topic:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

- Show the whole block when most of it is new, omitted context would hide
  ownership or order, or the user needs a copyable target shape.

For concrete component-tree, file-tree, and diff shapes, read
[EXAMPLES.md](EXAMPLES.md) when one of those branches matches the topic.

### guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these or several, but it is unlikely you will use all of
them. Prefer one clear visual. When the topic cannot fit clearly in a Slack
message, show the most important slice and ask which part to expand.
