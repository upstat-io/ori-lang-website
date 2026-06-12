---
title: "Too Clever to Be Right"
date: 2026-06-12
description: "Ori's memory system spent the spring collecting bugs faster than I could fix them. So we proved the design was wrong, rebuilt it on dumber foundations, and started deleting the clever parts. Two months of work, and it's getting close."
---

In April I fixed a double-free. The fix plan went through 23 rounds of review. Round 3 added a predicate to decide where reference-count decrements go. Round 4 added another. Rounds 18 and 19 added a sixth and then revised it. By the end, the reviewers signed off on a comment that literally described one of the heuristics as "conservative, capped."

That was the moment I admitted the architecture was wrong. Not buggy — wrong. The last two months have been about replacing it, and this post is the story: what broke, what we built instead, why there's now a Lean proof corpus in the repo, and what "almost done" actually looks like from inside.

## Some background

Ori manages memory with reference counting — no garbage collector, no borrow checker, nothing for the programmer to annotate. On its own, naive RC is slow: every assignment increments a counter, every scope exit decrements one. The whole point of AIMS, the compile-time layer that sits on top, is to make those operations *rare*. It analyzes the program, proves most counter traffic unnecessary, and deletes it before code generation. When AIMS works, functional-looking code compiles to the same in-place mutation a C programmer would have written by hand.

The interesting question is where the remaining RC operations go. Get a decrement wrong in one direction and you leak. Get it wrong in the other direction and you free memory that's still alive, which is the kind of bug that corrupts a heap quietly and crashes three functions later.

## How it got clever

The old design answered the placement question at the end of the pipeline. After the analysis ran, a set of predicates inspected the results and decided, for every value in every block, whether a decrement should fire here. One predicate checked whether a value's alias class was still alive after a block. Another checked whether any "ancestor" value's cleanup would already cover this one. Another deduplicated decrements within an equivalence class. They had names like `class_alive_after` and `pin6_any_ancestor_will_cover`, and there were eventually six of them, layered, each one added to plug a hole the previous ones couldn't see.

None of this was stupid. Each predicate was a correct answer to the specific bug in front of us. The problem was the shape: six overlapping judgments, four separate code paths that could each emit a decrement, and no single place where you could point and say "this is why that operation exists."

The failure that finally made it undeniable: one of the predicates relied on a fallback — a syntactic liveness check that had been quietly masking a defect in how alias containment edges got recorded. When we removed the fallback as a cleanup, 16 of 25 alias tests regressed. Investigating those regressions surfaced the double-free: a destructuring walk decremented a value's slot, and then the value's own "canonical" decrement fired later anyway, because the predicate that should have suppressed it hit a defensive fallthrough and returned the wrong answer. Two clever mechanisms, each locally reasonable, disagreeing about who owned a cleanup.

You can patch that. We did patch that. But every patch was a seventh predicate waiting to happen.

## The dumber design

In early May I wrote a proposal to throw the placement machinery out. It got reviewed four times, rewritten once, and approved on May 8th.

The honest framing, straight from the proposal: this is Perceus, the reference-counting algorithm Reinking and colleagues published in 2021 and Koka ships. Roc adopted it too. We didn't invent the core idea, and pretending otherwise would be silly. What Ori adds is its own packaging — per-type ownership behavior lives in a data registry, the same pattern the compiler already uses for methods and derived traits, instead of being hardcoded into analysis walks.

The new shape has two layers, and the division of labor is the entire point:

**Layer one is deliberately dumb.** During lowering, the compiler emits a counter increment before every transfer that consumes a value and a decrement after every last use, on every path. No flow analysis. No fixpoint. No cleverness. The output is correct and embarrassingly inefficient — we call these markers *burdens*, because that's what they are.

**Layer two only deletes.** The existing analysis — a seven-dimension lattice that tracks ownership, uniqueness, locality, and friends across function boundaries — runs over the burden-laden code and proves operations redundant. Provably paired increment and decrement? Gone. Value provably unique and dead? The decrement becomes an in-place reuse. Anything it can't prove stays, safely.

The old system constructed ownership decisions with predicates and hoped they composed. The new system starts from a baseline that is correct by construction and treats every deleted operation as a small proof. If the optimizer has a bug, you get a slow program, not a corrupted heap. The failure mode moved from "exploitable" to "embarrassing," which is the correct direction.

## The proof detour

There was a real risk of rebuilding on the same sand. The lattice — the part we kept — had its own folklore: transfer functions everyone believed were monotone, decision predicates everyone believed were sound, an interprocedural contract system everyone believed composed. "Everyone believed" had just cost us a double-free.

So before finishing the rebuild, we wrote the calculus down properly and proved it. That turned into its own sub-project: the memory model stated from first principles, a proof checker written in Rust (a few thousand lines, built specifically for this domain), and the whole corpus re-proved independently in Lean 4 so the home-grown checker has a kernel-grade second opinion. Both have to agree on every proof before anything counts — 173 theorems at last count. Transfer functions, the decision predicates, the cross-function contract rules, all of it.

The theorems I care most about are the boring-sounding ones: the *coexistence* results. They prove that on the new burden baseline, the lattice's deletion verdict is exactly equivalent to what the old predicate stack would have decided on the cases where the old stack was right. That equivalence is not academic. It's the license to delete the old code — not "the tests still pass," but "removing this path is proven to preserve behavior." The proofs stay in the repo permanently as the retirement certificate.

I expected the proof work to be a tax. It wasn't. Writing the rules down formally caught design mistakes while they were still cheap — a rule that looked obviously right until the proof obligation refused to discharge. Cheaper than finding it in a heap corruption six weeks later.

## The grind

The middle of this story is two months of commits with titles like "extend retained lineage through apply-result passthroughs" and "loop-exit death-point mode for loop-invariant borrowed collection lineages." There's no way to make that glamorous, and I'm not going to try.

The work splits into a few veins. First, making the dumb layer genuinely complete: every value that crosses a branch, escapes through a closure, gets rebuilt out of a match payload, or rides through a chain of field projections needs its burden pair, and real programs are full of shapes the textbook version doesn't mention. Second, teaching the eliminator to handle each shape: values that die on one branch but live on the other, collections borrowed across a call that never consumes them, allocations whose last use is inside a loop and whose release belongs at the loop exit. Third, verification probes that run inside the compiler itself — a ledger that reconciles every emitted counter operation against the burden that justified it. The milestone commit in late May got that ledger to zero discrepancies on the test corpus: every RC operation in the output now traces to a burden, and every elimination traces to a proof.

A detail I didn't appreciate going in: how much of this was *deleting* code. Four uncoordinated emission paths collapse into one. The plan tracking the migration has a whole section titled "predicate retirement" — `class_alive_after`, the pin predicates, the per-class deduplication sets, all scheduled for removal with the equivalence theorems as the safety certificate. Some of that code took weeks to write. It was some of the smartest code in the compiler. That was the problem with it.

## Where it stands

Concretely, as of this week:

The burden path is the default emitter. The migration plan is a little over three-quarters complete. The old predicates are still in the tree but they're on death row, and the section that deletes them is in progress — blocked, at the moment, by three known bugs that have to die first, because deleting a fallback before fixing what it masks is exactly the mistake we already made once.

The compiler's code journeys — twenty real programs traced end to end through every phase, scored on the quality of what comes out, instruction efficiency and RC behavior included — all pass at 10/10. The leak checker runs across the test suites and reports clean. None of that proves the system is done. It does mean the rebuilt foundation is carrying the full weight of the language while the old machinery gets dismantled above it.

What's left is the unglamorous tail: finish the retirement section, fix the three blockers, and then run the numbers on real workloads to see how many counter operations survive in practice — that count, "RC operations remaining in emitted code," is the metric this entire system exists to drive down, and I'll publish it when the deletion is finished rather than while the two systems still coexist.

## What I'd tell past me

Cleverness accretes. Nobody designs six overlapping predicates; you design one, and the bug tracker designs the other five. The fix isn't better predicates, it's an architecture where correctness doesn't depend on predicates agreeing.

And formal proofs, for this kind of system, are not the expensive option. The expensive option is the double-free. I spent more time on that one bug and its relatives than it took to formalize the entire calculus. The proofs now sit in the repo, checked twice on every change, and the next time something in the memory system looks obviously right, there's a machine whose job is to disagree.

It's getting close. The dumb layer is done, the proofs hold, and the smart code is almost gone.
