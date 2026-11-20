---
# Fixture copied from the Lorelog spec (sections 3 to 8, code examples) by Roberto Bisceglie,
# Loreseed Workshop. CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
---

## 3.5 Curiosity cycle

```
? How does the Guild police unlicensed practitioners?
= District wardens, paid per arrest
~ Wardens profit from arrests. False accusations are common.
>> [F:Guild|+wardens] [Tension:False arrests|open]
? Who protects people from the wardens?
```

## 3.5 Story cycle

```
! Ch3 needs a reason for the hero to be stopped at the gate
= Every traveler must show a Guild license or a warden's pass
~ Passes are sold on the black market. Forgeries are everywhere.
>> [L:North Gate|checkpoint] [Tension:Forged passes|open]
```

## 3.5 A second attempt

```
? What happens to people who cannot pay for a license?
= The Guild waives the fee for the poor
(note: I want the temples involved. Try again.)
= The Guild waives the fee for anyone a temple vouches for
~ Temples sell their vouchers. Faith becomes a fee.
```

## 4.1 Provisional facts

```
=? The capital sits on a river delta
... later ...
! Ch5 needs a flood that isolates the lower city
= The capital sits on a river delta (confirmed)
```

## 4.2 Retractions

```
x= Magic is free to practice
(why: Ch7 needs a black market for spells)
= Magic requires a Guild license, renewed yearly
~ Unlicensed casters trade services at night markets
>> [Rule:Magic|free→licensed] [L:Night Market|new]
```

## 4.3 Method

```
? What sits at the crossroads north of the capital?
via: tbl Landmark d8=6
= A ruined toll tower, half-swallowed by ivy
~ The Guild claims the tower. The local lord claims the road.
```

## 4.3 Random tables

```
tbl: Landmark (d8)
  1-2: Shrine
  3-4: Well
  5-6: Ruined toll tower
  7: Standing stones
  8: Nothing, and that is strange

gen: Faction
  Wants: d6=2 -> Control of trade
  Fears: d6=5 -> Exposure of its founder
  Method: d6=1 -> Debt
= [F:Ledger House|creditor to half the nobility]
```

## 4.4 Tests

```
t: Day in the life [guild practitioner, capital] -> Pass
t: Day in the life [dockworker, outer district] -> Gap: where does the food come from?
t: Scene [Ch3 gate check, 500 words] -> Pass
t: Pitch [60 seconds] -> Fail: too many factions to explain
```

## 4.4 Gap follow-up

```
t: Day in the life [dockworker, outer district] -> Gap: food source
? Where does the outer district get its food?
```

## 4.5 Notes

```
(why: the reason for a decision or retraction)
(note: a comment, doubt, or reminder)
(parked: an idea you do not want to lose, not yet part of the world)
```

## 5.1 Tag grammar

```
[Type:Name|tag|tag]           first mention
[#Type:Name]                  reference to an earlier mention
[Type:Name|old→new]           explicit change
[Type:Name|+tag] [Type:Name|-tag]   add or remove a tag
[Type:Name|cat:value,value|cat:value]   categories
```

## 5.1 Multi-line tags

```
[F:Cistern Guild
  | wants: monopoly, legitimacy
  | fears: drought ending, rival wells
  | method: pricing, wardens
]
```

## 5.4 Section references

```
? Who guards the gates? (§Politics)
>> §Society: common people fear the wardens more than bandits
>> §2.3: add the warden ranks
```

## 6.3 Cycle

```
C7 *Guild enforcement* (§Politics)
? How does the Guild police unlicensed practitioners?
= District wardens, paid per arrest
~ Wardens profit from arrests. False accusations are common.
>> [F:Guild|+wardens] [Tension:False arrests|open]
? Who protects people from the wardens?
```

## 6.3 Sub-cycles

```
C1 *Sketch: Power*
C1.1 ? Who rules? =? The Cistern Guild
C1.2 ? How? =? Water pricing
C1.3 ? Who resists? =? Temple of the Rain
```

## 6.3 Branches

```
C7a *Guild enforcement, option A*
= The Guild hires mercenaries
~ Mercenaries switch sides when pay is late

C7b *Guild enforcement, option B* (kept)
= District wardens, paid per arrest
~ Wardens profit from arrests
```

## 6.4 Modules

```
modules: M1 The City, M2 The Marshes, M3 The Rain Faith
```

## 6.5 Phase markers

```
t: Pitch [60 seconds] -> Pass
(note: the sketch holds, moving to Structure)
=== Phase 2: Structure ===
```

## 7.1 Story-first

```
C21 *Gate checks* (§Politics, §Magic)
! Ch3 needs a reason for the hero to be stopped at the gate
= Every traveler must show a Guild license or a warden's pass
~ Passes are sold on the black market
>> [L:North Gate|checkpoint] [Need:Ch3 gate stop|answered]
t: Scene [Ch3 gate check, 500 words] -> Pass
```

## 7.2 Backlog snapshot

```
(backlog snapshot, Build 4)
[Q:Warden oversight|open|p1]
[Q:Arrest cost|open|p2]
[Q:Outer district food|open|p1]
[Q:Rain Temple doctrine|open|p3]
```

## 7.2 Pruning

```
[Q:Rain Temple doctrine|open→dropped]
(why: open for 3 months, nothing depends on it)
```

## 7.2 Counting questions

```
t: Question count [C1-C6] -> 6 cycles, 11 new questions
```

## 7.4 Multi-line test

```
t: Day in the life [dockworker, outer district]
  Wakes: = tenement by the dry canal
  Eats: Gap
  Friction before noon: = the water queue at the Guild well
  Depends on: = the foreman who holds his work token
  Fears: = a warden raid on the tenement
-> Gap
? Where does the outer district get its food?
[Q:Outer district food|open|p1]
```

## 8.1 Generative game

```
C4 *Spring, week 3*
? (prompt) A stranger arrives with news of a far-off danger. What is it?
via: game card draw
= Traders report that the upriver dam is cracking
~ The Guild denies it. Denial protects its prices.
>> [Tension:Dam collapse|latent] [Clock:Dam 1/6]
```

## 8.2 Collaborative

```
?(Anna) Is there a religion that opposes the Guild?
=(Roberto) The Temple of the Rain teaches that water is a gift, not a good
~(Anna) The Temple buys its own wells in secret
>> [F:Temple of the Rain|+secret wells]
```

## 8.3 Campaign prep

```
! Session 4 needs a reason for the party to enter the marshes
= The only doctor who can treat the fever lives in the marsh village
~ The marsh village refuses entry to anyone with a Guild license
>> [L:Marsh Village|closed to Guild] [N:Doctor Helve|exiled]
```

## 8.4 History

```
? Why are the roads north abandoned?
= The empire stopped maintaining them after a plague
~ The Guild owes its power to the collapse of overland trade
>> [Hist:Fall of the Roads|year:-212] [F:Cistern Guild|origin:road collapse]
```

## 8.5 Languages

```
? How does the city's language form the word for a guild member?
= Suffix -ren on the craft noun: cistern-ren, ward-ren
~ Old families use the archaic -reth, and resent the new form
>> [Term:-ren|agent suffix] [Term:-reth|archaic, prestige]
```

