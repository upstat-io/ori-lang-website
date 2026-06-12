---
title: "The Double-Free That Rebuilt AIMS"
date: 2026-06-12
description: "Status report: Ori's compile-time memory system has been rebuilt on burden tracking. Emit every ownership obligation explicitly, then delete only what a machine-checked calculus proves redundant. The new path is the default emitter, the proof corpus holds 382 Lean-verified theorems, and the legacy predicate machinery is scheduled for deletion."
---

Ori's memory system is in the final stretch of a ground-up rebuild. As of this week, the new architecture is the compiler's default emitter. It is called *burden tracking*: every ownership obligation in a program is emitted as an explicit instruction, generated from per-type data, and the only operations that get removed are the ones a machine-checked calculus proves redundant. Behind it sits a formal proof corpus: 173 proof artifacts, each discharged by two independent checkers, backed by 382 theorems and lemmas in Lean 4. The migration plan is a little over three-quarters complete, and the section that deletes the old machinery is in progress.

Two months ago, none of that existed. This report covers the whole arc, starting from where things stand today.

## Where things stand

AIMS is the compile-time layer that sits on top of Ori's reference counting. Its job is to make reference-count operations rare in compiled output: analyze the program, prove most counter traffic unnecessary, and delete it before code generation. Ori programmers never write ownership annotations, lifetime markers, or borrow syntax. Placement and elimination are entirely the compiler's problem, and the compiler's stated mission is that the result should compete with hand-written C.

The rebuild's status, concretely:

- The burden path is the default. Every reference-count operation in compiled output now comes from the new pipeline, not the legacy predicate stack.
- The internal verification ledger reads zero discrepancies. Every emitted operation traces back to a recorded ownership obligation; every deletion traces to a proof. A probe reconciles the two on every run.
- The proof corpus holds: 173 proof artifacts across ten rule families, each discharged twice, once by Ori's own checker (25,000 lines of Rust) and once by the Lean 4 kernel, which carries the full calculus as 382 theorems and lemmas. Checker disagreement is a hard CI failure.
- The legacy predicates are scheduled for deletion, named individually in the migration plan, with the equivalence theorems kept permanently as the safety certificate. Three known bugs block that section and get fixed first.
- All twenty code journeys score 10/10. These trace real programs through every compiler phase and grade the output, instruction counts and reference-count traffic included. The leak checker reports clean across the suites.

## Background: what AIMS has to do

Ori is a value-semantics language. There is no in-place mutation at the surface; reassignment replaces values. The natural implementation of that model is reference counting with copy-on-write, and the naive version of that implementation is slow. Every assignment bumps a counter. Every scope exit decrements one. Every mutation of a possibly-shared structure copies it.

AIMS exists to delete almost all of that. The design center, stated in the spec, is to make reference-count operations rare in emitted code, not to make individual operations faster. Functional-looking code is supposed to compile to the same in-place mutation a C programmer would write by hand, and every counter operation that survives to the final binary is supposed to point at a specific, explainable analysis limitation.

That goal puts the system in a narrow corridor. Place a decrement too late, or twice, and the program frees memory that is still alive. Place it too early or not at all and the program leaks. The first failure corrupts a heap quietly and crashes three functions away from the cause. Everything that follows in this story is about who gets to decide where those operations go, and on what evidence.

## The predicate era

The old design decided placement at the end of the pipeline. After the main analysis ran, a set of predicates inspected the results and decided, for every value in every block, whether a decrement should fire at that point.

One predicate checked whether a value's alias class was still alive after a block. Another checked whether any ancestor value's cleanup would already cover this one. Another deduplicated decrements within an equivalence class of aliases. They had names like `class_alive_after`, `pin4_class_emits_dec_set`, and `pin6_any_ancestor_will_cover`, and by the end there were six of them, layered over a shared graph of alias classes, each added to plug a hole the previous ones could not see. Alongside them, four separate code paths could each emit a decrement: one for ordinary last uses, one for branch edges, one for call edges, one for values dead on entry to a block. The rationale for any given operation was spread across all of them; there was no one place to inspect it.

The record of how that structure grew is unusually well documented, because Ori's development process runs every bug fix through adversarial third-party review. One memory bug's fix plan went through 23 review rounds. Round 3 added a predicate. Round 4 added another. Rounds 18 and 19 introduced a sixth and then revised it. The final sign-off described one of the heuristics, in writing, as "conservative, capped." Each addition was a correct answer to the specific counterexample in front of it. The cumulative result was a system whose correctness depended on six overlapping judgments agreeing with each other, with no mechanism to check that they did.

The bugs followed the structure. A fix would land with a new predicate; the new predicate would not cover closures, so a closure bug would surface; the closure fix would over-suppress decrements somewhere else; the over-suppression fix would introduce a new equivalence-class subtlety. The bug tracker from that period reads like a conversation between the predicates.

## The double-free

The failure that settled the argument arrived in April, and it arrived as a cleanup.

Inside `class_alive_after` lived a fallback: a syntactic liveness check that ran when the primary alias-class data was inconclusive. It looked like a harmless conservative default. It was actually load-bearing. The fallback had been quietly masking a defect in how alias containment edges were recorded; the population logic wrote edges asserting that one class was contained in another's transitive-drop payload without checking whether the contained class had an aliased member that outlived the container's destructuring.

Removing the fallback, as a cleanup, regressed 16 of 25 alias tests and exposed the real bug. The anatomy: a destructuring walk decremented a value's slot as part of tearing down its container. The value's own canonical decrement then fired later anyway, because the predicate that should have suppressed it hit a defensive fallthrough and answered wrong. Two locally-reasonable mechanisms disagreed about who owned a cleanup, and the tiebreaker was heap corruption.

The diagnosis that mattered was not about the specific edge-recording defect. It was structural. Six predicates, four emission paths, one shared mutable graph, and the system's safety property (every allocation decremented exactly once on every path) emerged from their interaction rather than being enforced anywhere. No patch fixes that. The placement rule needed a single source of truth, and the predicate stack was structurally incapable of providing one.

## The decision

The replacement proposal was written in early May, reviewed four times, rewritten once on the reviewers' findings, and approved on May 8.

The core idea is burden tracking, and it is Ori's own design: record every ownership obligation a program creates as an explicit instruction in the IR, generated from per-type data, and make elimination a separate step that has to prove its deletions. The name reflects the framing. An owned heap value is a burden; whoever holds it owes a release on every path; the compiler's job is to first write every IOU down and only then argue about which ones cancel.

On prior art, the honest position is the one the spec takes. The field has well-known precise reference-counting work: Perceus, published by Reinking and colleagues at PLDI 2021 and shipped in Koka, and the ARC optimizer in Swift's compiler. The spec cites these as historical influences, and the proof corpus README states the operative fact plainly: the calculus, its soundness proofs, and the proof checker are Ori's own, and the calculus inherits no rule, proof, or law from any prior system. The mechanism is, in the end, nearly inverted from Perceus. Perceus inserts precise counts up front, derived from a syntax-directed ownership discipline over a functional core calculus, and then specializes them. Ori emits deliberately *maximal* counts over a control-flow graph in SSA form, with no analysis at all, and then deletes them under proof. Where Perceus's correctness lives in its insertion discipline, Ori's lives in its elimination theorems.

That inversion is the architectural bet. The compiler stopped trying to be clever about where operations go and got clever about which ones it can remove. A placement bug corrupts heaps. A removal bug, when the proof gate holds, is a missed optimization. The system bets that the second failure mode is the tolerable one.

## Layer one: write everything down

The first layer runs during lowering, in Phase 5 of the compiler's pipeline. It walks each function's SSA form, instruction by instruction, and emits a *burden increment* before every transfer point that consumes an owned value and a *burden decrement* after every last use, on every reachable path. The module documentation states the constraint as a design rule: pure per-instruction emission driven by SSA def-use, no global flow analysis, no fixpoint, no lattice consultation.

What each type owes is data, not code. Every type has a `BurdenSpec` describing its ownership behavior: whether values of the type carry a reference-count obligation at all, how the obligation distributes over fields and enum variants, what the drop walk looks like. Builtin specs live in a registry crate as pure constant data with a purity contract enforced by test (zero heap allocation, every field a static slice or scalar, the whole spec capped at 64 bytes). User-defined types get their specs built once during type checking. This is the same registry pattern Ori already uses for builtin methods and derived traits: behavior as data that one walker consumes, instead of behavior as branches scattered through analysis code.

Layer one deliberately avoids global flow analysis, and real control flow still makes the emission job substantial. Around the core walker sits a family of ownership scans that classify the hard shapes before emission: which call arguments transfer ownership versus borrow, which stores into structures consume their operand, which fields of a value have been moved out (a small forward dataflow handles partial moves), which values are copy-on-write aliases of each other, how ownership threads through extraction chains when a match destructures a payload and rebuilds it into a new aggregate. The scans feed the emitter; the emitter stays a single uniform surface.

The output of layer one is correct but wasteful, and both properties come from the same place. Because the emission rule is purely mechanical, the balance property (every allocation released exactly once, on every path) holds automatically; there is no analysis step that could get it wrong. The cost is a program littered with retains and releases that a human would never write. That waste is deliberate. Removing it is the next layer's entire job.

## Layer two: proven deletion

The second layer is the AIMS lattice, and it survived the rebuild intact. What changed is its job description. It used to share responsibility for constructing placement decisions. Now its only power is deletion.

The lattice tracks every SSA value through a product of seven dimensions:

- **Access**: is this value owned here, or a borrowed view someone else manages?
- **Consumption**: how does the future use it: dead, consumed exactly once, droppable without use, or unrestricted?
- **Cardinality**: how many uses remain: none, exactly one, or many?
- **Uniqueness**: is the reference count provably 1, provably greater, or unknown?
- **Locality**: does the value escape its block, its function, its caller's frame, or the stack entirely?
- **Shape**: is the allocation a reuse candidate: a constructor cell, a collection buffer, a constructor-context hole for tail-recursion-modulo-cons, or not reusable?
- **Effect**: what may the surrounding code do: allocate, share, throw?

Transfer functions push these states through every instruction, forward and backward. Canonicalization rules keep the product internally consistent; they encode cross-dimensional facts like "a dead value has no remaining uses" and "a value that escaped to the heap can no longer be assumed unique," so impossible state combinations cannot survive a join. Interprocedural contracts summarize each function's behavior (per-parameter ownership expectations, return-value freshness, effect flags) and a fixpoint over the call graph's strongly-connected components propagates them, so the analysis crosses function boundaries without re-deriving callees.

Elimination itself is almost anticlimactic. A walker visits every burden operation and asks one of two questions, and both answers come from proven truth tables in the calculus. A decrement is unnecessary exactly when the value's state shows no future demand (its cardinality is absent or its consumption is dead). An increment is elidable exactly when the value has exactly one remaining use and that use consumes it without duplication. True means delete; anything unproven stays. The conservative direction is always safe: an unproven deletion is a missed optimization, never a memory error.

## Layer three: realization

What survives elimination reaches Phase 7, realization, which is now mechanical in the way the proposal promised. Burden increments become reference-count increments. Burden decrements become decrements, or something better when the lattice annotated one: a provably unique dead value whose shape matches an upcoming allocation becomes in-place reuse instead of a free-and-reallocate pair; a provably unique mutation skips the is-shared runtime check entirely; a provably shared one skips the check in the other direction and copies unconditionally; a non-escaping fixed-size unique allocation drops off the heap altogether and becomes a stack slot with no counter header at all.

The division of labor is strict. Layer one knows types but not flow. Layer two knows flow but never creates an obligation. Layer three translates and is forbidden to decide.

## Edges of the model

Two boundary cases show how far the data-driven framing carries.

The first is foreign memory. Ori's memory safety claim extends across FFI, and the burden system encodes the boundary as data rather than as special cases in the walker: a value owned by foreign code gets an exclusion contract in its spec, so the emitter never writes an obligation the Ori runtime does not actually hold. Unsafe code in Ori relaxes type-level guarantees, but it never licenses the memory system to miscount; the spec is explicit that no escape hatch permits memory unsafety, and the burden layer is where that promise becomes mechanical.

The second is user-defined destructors. A type with a custom `Drop` implementation cannot have its releases reordered or elided as freely as a plain buffer, because dropping it runs observable code. The bridge between the burden walker and the drop machinery threads that constraint through the same spec data: the drop walk for a type is part of what its `BurdenSpec` describes, variant by variant and field by field, so a custom destructor changes what a decrement means without changing where the obligations sit. The effect dimension of the lattice carries the other half (a drop that may allocate or throw blocks certain optimizations), and both facts travel through the standard machinery instead of through exceptions to it.

Neither case needed a new subsystem. Both route through the same spec data; no walker grew a branch.

## A sketch

An illustrative example (simplified, not literal compiler output). Consider a function that builds a list, hands it to a validation function that only reads it, and returns its first element:

```ori
@first_valid (n: int) -> int = {
    let xs = build_items(n);
    check(items: xs);
    xs.first().unwrap()
}
```

Layer one, refusing to think, emits the full obligation set: an increment before the `check` call (in case the call consumes its argument), a decrement after it (the call site's matching release), and a final decrement at `xs`'s last use after `.first()`.

Layer two then consults what it knows. The interprocedural contract for `check` says the parameter is borrowed, never consumed, so the increment-decrement pair around the call cancels: the increment fails the elidability test's inverse and the pair is removed together under the pair-elimination rule. The final decrement stays; `xs` really does die there and someone must release the buffer. But the lattice also knows `build_items` returns a fresh value (uniqueness: provably 1) that never escapes (locality: function-local), so realization is free to do better than a counted heap release. In the good case the whole allocation becomes stack-resident and the surviving decrement costs nothing at all.

One increment and two decrements emitted; zero increments and one decrement survive; the survivor may not even be a counter operation by the time codegen sees it. Across a real program, the same pattern repeats at every call site and allocation.

## The proof corpus

The riskiest part of the rebuild was the part that stayed: the lattice. Its transfer functions, canonicalization rules, decision predicates, and contract algebra were all retained as the elimination engine, and none of their core properties (transfer monotonicity, predicate soundness, fixpoint convergence) had ever been checked beyond tests and belief. Unchecked belief had just cost a double-free, so before the new architecture went default, the calculus was written down from first principles and proved.

The corpus that came out of that effort is larger than the phrase "we formalized it" usually implies:

- **The calculus is the Lean code.** Ten modules under `aims-proof/lean/` define the seven-dimension state model and prove the rule families against it: lattice algebra (commutativity, associativity, idempotence, partial order, finite height), canonicalization feasibility, transfer-function monotonicity, decision-predicate truth tables, interprocedural contract algebra and fixpoint convergence, pipeline-ordering laws, realization rules including reference-count balance, the verification-stack coverage rules, and the coexistence results. The repository documentation is explicit about authority: when any other artifact disagrees with the compiled Lean, the Lean wins.
- **Two checkers, one verdict.** Each of the 173 proof artifacts exists twice: as a human-readable proof text validated by Ori's own checker, and as a Lean theorem checked by Lean's kernel. A dual-discharge gate compares statements and verdicts per theorem; any disagreement fails CI. A separate lint bans `sorry` and other placeholder discharges from the compiled corpus, so a proof cannot be quietly stubbed out.
- **The counterexamples are kept.** Alongside the theorems lives a directory of machine-encoded failure shapes, including the cross-class use-after-free pattern from the April double-free and known over-elimination and under-elimination shapes, in both Lean and SMT form. The corpus does not just record what is true; it records what was false, in a form a machine can re-check against future versions of the rules.

Two outcomes justified the cost. The first was immediate: formalization caught design mistakes while they were still cheap. Several rules that read as obviously correct in prose refused to discharge as stated, and each refusal was a design conversation that happened weeks earlier than it otherwise would have, against a proof state instead of against a crash dump. The monotonicity obligations were the strictest teachers; a transfer function that quietly lost information on a join surfaced immediately, because the lattice algebra proofs downstream of it stopped composing. The second outcome is structural and pays out below.

## The calculus, on one page

The formal object at the center of all of this is small enough to state. What follows is the skeleton of the AIMS calculus as it exists in the Lean corpus, with each piece translated back into plain language, because the ideas are simpler than the notation suggests.

**The state space.** Every value in a program, at every point in that program, carries a state drawn from a product of seven finite lattices:

> 𝒮  =  Access × Consumption × Cardinality × Uniqueness × Locality × Shape × Effect

In plain terms: the compiler keeps a chart on every value, and the chart has seven questions on it. Do you own this or are you borrowing it? Will it be used again, and how? How many uses are left? Is anyone else holding a reference? How far can it escape? Could its memory be recycled in place? And what side effects might the surrounding code have? The carriers are the allowed answers to each question:

> Access = {Borrowed, Owned}  
> Consumption = {Dead, Linear, Affine, Unrestricted}  
> Cardinality = {Absent, Once, Many}  
> Uniqueness = {Unique, MaybeShared, Shared}  
> Locality = {BlockLocal, FunctionLocal, ArgEscaping, HeapEscaping, Unknown}  
> Shape = {NonReusable, ReusableCtor, CollectionBuffer, ContextHole}  
> Effect ⊆ {may_alloc, may_share, may_throw, ...}

Each answer set is ordered from most useful to least: "exactly one reference" is a stronger fact than "maybe shared," and "never used again" is stronger than "used many times." Strong answers unlock optimizations; weak ones forbid them.

**Join and order.** Programs branch, and the two sides of a branch can learn different things about the same value. When the paths meet again, the compiler merges the two charts:

> s ⊔ t  =  canon(⟨ s.d ⊔ᵈ t.d ⟩ for each dimension d)  
> s ⊑ t  ⟺  s ⊔ t = t

The merge operator ⊔ (read "join") takes the weaker answer for every question, because at a merge point only what was true on *both* paths can be trusted. The order ⊑ just formalizes "everything this state claims, that one also allows." The L-family theorems prove the merge behaves like a merge should: order does not matter, grouping does not matter, merging a chart with itself changes nothing. They also prove the structure has *finite height*: an answer can only weaken a bounded number of times, so the iterative analysis must converge. Finite height is the termination argument for the entire system.

**Canonicalization.** After every merge, a repair pass keeps the seven answers from contradicting each other:

> CN-1:  consumption = Dead ⟺ cardinality = Absent  
> CN-3:  uniqueness = Shared ∧ shape ≠ NonReusable ⟹ shape := NonReusable  
> CN-6:  locality ≥ HeapEscaping ∧ uniqueness = Unique ⟹ uniqueness := MaybeShared

Read them as sanity rules. A value that is dead has no uses remaining, and a value with no uses remaining is dead (CN-1). Memory that someone else can still see must not be recycled in place (CN-3). A value that may have escaped to the heap can no longer be sworn unique, because some other reference might now exist (CN-6). The CN-family theorems prove the repair pass is idempotent (running it twice changes nothing) and compatible with merging, so the repairs can never oscillate or fight the merge.

**Transfer.** Each kind of instruction updates the chart. Formally, every instruction induces a transfer function F : 𝒮 → 𝒮, and the TF family proves each one monotone:

> s ⊑ t  ⟹  F(s) ⊑ F(t)

In words: giving the compiler better information about an input can never make it conclude something weaker about the output. No instruction is allowed to turn improved knowledge into a worse verdict. During formalization this family caught the most real mistakes; transfer rules that quietly lost information were exactly the ones whose proofs refused to compose.

**Decision.** Elimination consults two predicates, proven as truth tables in the DP family:

> DP-2:  dec_unnecessary(s) ⟺ cardinality(s) = Absent ∨ consumption(s) = Dead  
> DP-3:  inc_elidable(s) ⟺ cardinality(s) = Once ∧ consumption(s) ∈ {Linear, Affine}

In words: a release can be deleted only when the chart proves the value has no future at all, either no uses remaining or already dead. A retain can be deleted only when the chart proves exactly one consumer remains and that consumer takes the value without duplicating it, so handing it over is a move, not a copy. The full deletion verdict is one guarded formula:

> eliminate(s)  =  burden_emitted(s) ∧ (DP-2(s) ∨ DP-3(s))

This is the only delete switch in the system. The guard at the front matters as much as the tests: an operation must have been explicitly written down by layer one before the lattice may remove it. The optimizer can cancel debts; it cannot decide which debts exist.

**Coexistence.** The CH family relates the new verdict to the legacy one, and the central statement is exactly the one-liner you would hope for:

> CH-2:  ∀ s ∈ 𝒮:  eliminate(s) = eliminate_lattice_only(s)

For every possible chart, the combined system's deletion decision equals the lattice-only decision. In the Lean source the proof is a single `rfl`, reflexivity: once the definitions are stated precisely, the two sides are the same function by definition. Its companion theorems prove the verdict does not depend on the order operations were emitted in, and that the runtime handoff between old and new paths is observably equivalent on every covered value. Those few lines are the legal basis for deleting the predicate stack.

## The theorem that deletes code

The CH-family coexistence theorems prove the new and old verdicts equivalent wherever the two systems overlap. Those proofs are the safety certificate for deleting the predicate stack. The migration plan's deletion section, the one currently in progress, names each legacy predicate and cites the coexistence proofs as the certificate that removing them preserves observable behavior. Not "the tests still pass." Proven equivalent, then deleted. The proofs stay in the repository permanently after the deleted code is gone, the way a building keeps its load calculations after the scaffolding comes down.

There is a discipline lesson in the contrast with April. The old fallback was also load-bearing, and nobody knew, because nothing recorded what it was holding up. The new system's load-bearing claims are theorems with names.

## Verifying the verifier

Proofs constrain the rules; separate machinery checks that the implementation follows them. The verification stack is layered, and the layers are themselves part of the specified calculus:

- A structural layer checks the IR after realization: no use before definition, no dangling block references, no counter operation on a scalar, no decrement on a borrowed parameter. The late-May milestone was this layer reading zero across the corpus with the burden path as the sole emitter.
- A ledger reconciles per-value burdens against realized reference counts, so an operation cannot appear in the output without an obligation that justifies it.
- An oracle layer re-derives each function's memory contract from the realized IR and compares it against the contract the analysis inferred, catching drift between what the compiler believed and what it emitted.
- Above those sit the leak checker, which runs the test suites under allocation tracking, and the twenty code journeys, which trace real programs through every phase and grade the emitted code. All twenty currently score 10/10, and the journeys grade harshly: instruction counts, reference-count traffic, and control-flow quality are all scored.

None of this proves the system is finished. It does mean a regression in the memory system now has to slip past a proof gate, a structural validator, a ledger, an oracle, a leak tracker, and twenty graded end-to-end traces before it reaches a user.

## The grind

Between the May 8 approval and now sits the part of the work that resists summary, visible in the commit log as a long sequence of small, named conquests. "Extend retained lineage through apply-result passthroughs." "Loop-exit death-point mode for loop-invariant borrowed collection lineages." "Variant-tag-aware extract-transfer attribution for match-handoff payload rebuilds."

The pattern behind those titles: real programs produce ownership shapes that textbook descriptions of reference counting do not mention, and each one needed its burden coverage, its elimination rule, and its tests. A value that dies on one branch of a conditional but lives on the other needs its release placed on the dead edge, not after the join. A collection passed to a call that borrows it, inside a loop, wants its release hoisted to the loop exit rather than re-evaluated every iteration. A match arm that destructures a payload and rebuilds some of its fields into a new value needs the analysis to understand which parts of the old allocation transferred into the new one and which became garbage at the arm boundary. Closures that capture owned values need their environments torn down with the same per-field precision as any struct.

Each of these was a week or a few days of work: identify the shape in a failing or pessimal test, decide which layer owns it (usually a new ownership scan in layer one or a lineage rule in the elimination walk), implement, pin with tests, and run the whole verification stack. The four legacy emission paths collapsed into the single burden path over the course of it. It is the least quotable phase of the project and the one where most of the two months actually went.

## What remains

Three items stand between here and done.

First, the three bugs blocking the retirement section get fixed. Deleting a fallback before fixing what it masks is the mistake that started this story, so the blockers go first.

Second, the predicate stack gets deleted: the six predicates, the per-class deduplication machinery, and the coexistence handshake itself, which is written to remove its own dispatch once every value class is covered by the burden path. The coexistence theorems are the certificate. After that, the answer to "why does this reference-count operation exist" has exactly one form: here is the burden that demanded it, and here is why no rule could prove it away.

Third, measurement. The metric this system exists to drive down is reference-count operations remaining in real compiled workloads, and the honest version of that number can only be collected once the old path is gone and the burden path is the only emitter. Those numbers get published when they exist, not projected while two systems coexist.

The foundation is rebuilt and the proofs hold. Two months ago, memory safety in this subsystem depended on six heuristics agreeing with each other; today it rests on a correct-by-construction baseline plus proven eliminations, re-verified by two independent checkers on every change. What remains is deleting the predicate stack under the coexistence proofs, fixing the three blockers first, and then publishing the reference-count numbers from real workloads.
