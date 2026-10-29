# 100-point script rubric

The same rubric scores originals and rewrites. It's an **editorial judgement tool**. It
doesn't predict Instagram retention, reach or saves, and no score here is a measurement of
audience behaviour. Only real analytics (3-second hold, average watch time, saves, shares)
can test that. Use the rubric to make decisions consistent and visible.

Score in whole points. For every score, write a one-line justification that quotes the line
it's based on. Mark judgement calls as "(judgement)" and checkable facts as "(fact)".

## 1. Hook specificity and strength: 15

| Band | Points | Anchor |
|---|---|---|
| Low | 0–5 | Generic, could open any video; or misleading; or the opening is a disclaimer |
| Medium | 6–10 | Clear and on-topic, but predictable, or the gap is weak/vague |
| High | 11–15 | Specific to this topic, recognisable to the target viewer within 2 s, creates a real gap the script closes, sayable in one breath |

## 2. Narrative progression and middle-hook quality: 20

| Low | 0–7 | A list of statements; no new reason to stay after the hook; dead zones; repetition |
| Medium | 8–14 | Logical order, a middle hook exists but is weak or artificial, or one dead zone |
| High | 15–20 | Each beat adds something new; the middle hook grows out of the content; earlier gaps are resolved; no dead zones |

## 3. Authentic spoken Egyptian Arabic: 15

| Low | 0–5 | MSA connectors, translated phrasing, sounds read |
| Medium | 6–10 | Mostly natural; some written-register phrases, tics (reflexive contrasts, fragment drumbeat) or awkward lines |
| High | 11–15 | Sounds like a coach talking; varied rhythm; no MSA; English terms used the way gym people use them |

## 4. Audience relevance: 10

| Low | 0–3 | The viewer can't tell why this concerns them |
| Medium | 4–7 | Relevant to a broad group, but the situation is abstract |
| High | 8–10 | A concrete situation the target viewer has lived |

## 5. Originality and differentiation: 10

| Low | 0–3 | A generic fitness take everyone posts |
| Medium | 4–7 | A familiar topic with a sharper angle |
| High | 8–10 | An angle or connection the viewer hasn't heard ("I never understood it that way") |

## 6. Clarity and efficiency: 10

| Low | 0–3 | Over length, unclear sentences, filler |
| Medium | 4–7 | Clear but with removable lines or spoken disclaimers |
| High | 8–10 | Every line earns its place; within target duration |

## 7. Practical value and payoff: 10

| Low | 0–3 | No takeaway, or the takeaway is "see someone" by default |
| Medium | 4–7 | A takeaway exists but is abstract |
| High | 8–10 | The viewer knows what to do, test or ask today; the ending is earned |

## 8. Scientific accuracy and credibility: 10

| Low | 0–3 | Wrong or overstated claims |
| Medium | 4–7 | Mostly right, with an overstatement, a missing qualifier, or a number that doesn't match the source |
| High | 8–10 | Every claim matches its source and evidence label; qualifiers sized correctly |

## Quality bar (definition of "done")

- Total ≥ 80, **and**
- No dimension in its Low band, **and**
- Accuracy ≥ 8, **and**
- `tools/lint_scripts.py` reports 0 FAIL for the script, **and**
- Regression assertions for the script pass.

If a revised script doesn't beat the original on a dimension, the report says so. Then the
script is revised again or the remaining weakness is documented.
