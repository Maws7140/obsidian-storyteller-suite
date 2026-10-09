---
# Fixture copied from the Lorelog spec (section 9.2) by Roberto Bisceglie, Loreseed Workshop.
# CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
title: The Cistern Cities
method: bottom-up, curiosity-first
genre: Low fantasy, urban
pitch: A drought-stricken city where water is law and the law is for sale
start_date: 2026-09-25
---

# The Cistern Cities

## Build 1
*Date: 2026-09-25 | Duration: 45m | Phase: Sketch | Cycles: C1-C3*

### C1 *Sketch: Power*

```
C1.1 ? Who rules? =? The Cistern Guild
C1.2 ? How? =? Water pricing
C1.3 ? Who resists? =? Temple of the Rain
```

### C2 *Enforcement* (§Politics)

```
? How does the Guild police unlicensed practitioners?
via: decide
= District wardens, paid per arrest
~ Wardens profit from arrests. False accusations are common.
~ Outer districts hide their healers.
>> [F:Guild|+wardens] [Tension:False arrests|open]
? Who protects people from the wardens?
? What does an arrest cost a family?
[Q:Warden oversight|open|p1] [Q:Arrest cost|open|p2]
```

The wardens feel right: an institution that keeps order by producing disorder.

### C3 *Checkpoint*

```
t: Question count [C1-C2] -> 2 cycles, 4 new questions
t: Pitch [60 seconds] -> Pass
(note: the sketch holds)
=== Phase 2: Structure ===
```

## Build 2
*Date: 2026-09-27 | Duration: 1h | Phase: Structure | Cycles: C4-C5*

### C4 *Day in the life*

```
t: Day in the life [dockworker, outer district]
  Wakes: = tenement by the dry canal
  Eats: Gap
  Friction before noon: = water queue at the Guild well
  Depends on: = the foreman who holds his work token
  Fears: = a warden raid
-> Gap
[Q:Outer district food|open|p1]
```

### C5 *Outer district food* (§Economy)

```
? Where does the outer district get its food?
via: tbl Food Source d4=3
= Marsh fishers sell eels at the canal market at dawn
~ The Guild taxes the canal water the fishers use to keep eels alive
>> [L:Canal Market|dawn only] [F:Marsh Fishers|new]
[Q:Outer district food|answered→C5]
? Why don't the fishers simply stop coming?
```
