---
'@elek-io/core': minor
---

**Every string length Core bounds is counted in Unicode code points.** Zod counts that way from 4.5.0 on, and Core follows it instead of keeping a count of its own. A smiling face emoji counts as one where it used to count as two, and a flag counts as two where it used to count as four.

What that lets through, and what it now refuses:

- A report `message`, capped at 5000, takes 5000 emoji where it used to take 2500.
- An account password of 12 to 128 now needs 12 emoji. Six used to be enough and are refused with `BadRequest`.
- A User's `name`, capped at 256, takes the same way more astral characters.
- A string Field's `min` and `max` and the `defaultValue` checked against them agree again, so a definition whose default is two emoji inside `min: 2, max: 2` is accepted where it used to be refused.

Nothing stored changes, and no limit moved. A counter in your own interface has to count the same way, for example with `[...value].length`, or it disagrees with what Core accepts. elek.io Cloud holds limits of its own, so a value Core accepts can still be refused there.
