# Damped oscillator: evidence audit

For the dimensionless equation $x''+2\zeta x'+x=0$, with $x(0)=1$ and $x'(0)=0$, all eight holdout configurations met displacement error $\leq10^{-5}$ and sampled positive energy increment $\leq10^{-6}$. These are practical checks for this unit-amplitude model, not rigorous solver bounds.

## Holdout observations

The time interval was $[0,15]$, with 151 output times, relative tolerance $10^{-7}$ and absolute tolerance $10^{-9}$. The reference was a numerically evaluated matrix exponential.

| Damping | Solver | Maximum displacement error | Function evaluations | Positive energy increment |
| ---: | --- | ---: | ---: | ---: |
| 0.1 | DOP853 | 1.21521e-7 | 332 | 0 |
| 0.1 | Radau | 8.31191e-9 | 2226 | 0 |
| 0.5 | DOP853 | 8.69361e-8 | 341 | 0 |
| 0.5 | Radau | 7.95322e-9 | 1783 | 0 |
| 1.5 | DOP853 | 4.77096e-9 | 299 | 0 |
| 1.5 | Radau | 2.87889e-9 | 1085 | 0 |
| 3 | DOP853 | 1.38098e-8 | 437 | 0 |
| 3 | Radau | 1.07334e-8 | 792 | 0 |

DOP853 used fewer right-hand-side evaluations than Radau in every sampled case. Radau had lower displacement error in these eight cases. Function evaluations alone do not measure total cost: Jacobian evaluations, factorizations and wall time also matter. These observations do not establish a general solver ranking. Energy checks concern sampled outputs, not a continuous-time proof.

## What the audit corrected

The original 12-case exploratory study used error bounds of 10 and 1. Passing those bounds did not establish useful accuracy. A later local audit checked the saved trajectories against separate underdamped, critical and overdamped closed-form formulas. The original protocol remains unchanged.

The agent's eight-case holdout saved CSVs outside the exported artifacts directory. Its chat response incorrectly claimed those files were available. A local audit reran the same calculations with only the CSV destination corrected, preserving the original study. All eight metric dictionaries matched exactly. The recovered trajectories are audit reruns, not eight additional independent observations.

The two replay checks cited in the agent's followup reproduced inspection scripts, not the original verification computations. They establish repeatability of those inspections only. The initial solver replay did reproduce its actual generating computation.

## Independent verification

A separate closed-form implementation checked all 12 original trajectories and all eight recovered holdout trajectories. It required reference discrepancies below $10^{-12}$, displacement error below $10^{-5}$, consistent energy columns, the expected time grids, and positive energy increments below $10^{-6}$. All passed. This is numerical agreement for the sampled linear system, not formal proof or a novelty claim.

## Reproducibility

- Original holdout protocol: 5222449e-128e-44f2-955e-b358a6458a02
- Recovered-data protocol: c1c5bea2-c6db-42be-ae87-756d77cee08a
- Recovered-data results: a73dc1f6-375b-43aa-b422-78c999b6f72a
- Original trajectory checks: 54119e2d-d191-4a58-87fe-3f841c7ac72b, 6924a911-6a39-4913-a53f-a023fac1ae14
- Recovered trajectory checks: 0ad9fd16-a1e4-4023-a860-1ffe19e40045, 227be433-9021-4b0f-9f3e-de09bf3a291f

Execution records preserve source hashes, exact input versions, Docker image identity, outputs and logs. The phase portrait below belongs to the original exploratory study. This audit was assembled locally from recorded results and is separate from the agent's original response.
