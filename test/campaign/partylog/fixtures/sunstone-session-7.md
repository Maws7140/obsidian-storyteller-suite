---
# Fixture: Partylog spec section 6.4 (Complete Session Log, Digital).
# Partylog by Roberto Bisceglie (Loreseed Workshop), CC BY-SA 4.0:
# https://creativecommons.org/licenses/by-sa/4.0/ (copied verbatim, markdown source only)
title: The Sunstone Conspiracy
ruleset: D&D 5e
gm: Roberto
players: Alex (Kael), Jordan (Sable), Sam (Mira)
---

# The Sunstone Conspiracy

## Session 7
*Date: 2025-11-15 | Duration: 3h30 | Scribe: Jordan*
*Players: Alex (Kael), Jordan (Sable), Sam (Mira)*

**Recap:** Infiltrated Baron Holt's estate. Discovered in the study.
Escaped through the sewers. Mira took a crossbow bolt.

**Goals:** Regroup, heal Mira, follow up on the Sunstone lead.

### S18 *Sewer tunnels beneath the estate*

```
@(Kael) Navigate the tunnels toward the docks
d: Survival d20+2=14 vs DC 12 -> Success
=> Finds the old drainage route. Moving quickly.

! The tunnel forks — one passage smells of salt, the other of rot
@(Sable) Use Prestidigitation to test the air
=> Salt passage leads to the docks. They take it.

@(Mira) Keep moving despite the wound
d: CON save d20+3=11 vs DC 10 -> Success
=> Gritting teeth, she keeps pace. [PC:Mira|HP 12/34|wounded]
```

### S19 *Docks District — Sable's contact*

```
@(Sable) Find the healer, Tomas
d: Investigation d20+1=15 vs DC 12 -> Success
=> A cramped room above a fishmonger's. Tomas is in.
[N:Tomas|healer|underground|owes Sable]

N(Tomas): "You look terrible. All of you."
PC(Sable): "Mira needs patching. Crossbow bolt, maybe three hours ago."
N(Tomas): "That'll cost."
PC(Kael): "Name your price."
```

```
@(Kael) Negotiate the fee
d: Persuasion d20+3=9 vs DC 14 -> Fail
=> Tomas won't budge. Full price.
[Party:Gold-25]

! Tomas treats the wound
=> [PC:Mira|HP+15|HP 27/34|-wounded|bandaged]
```

### S20 *Safe house in the Docks District, dawn*

```
@(Kael) Set up watches and secure the room
=> [L:Safe House|hidden|cramped|secure for now]
```

The party takes stock. They got what they came for — the documents
from Holt's study — but the Baron knows someone broke in.

```
@(Sable) Examine the stolen documents
d: Investigation d20+1=18 vs DC 14 -> Success
=> The documents reference a "Sunstone shipment" arriving by sea
   in four days. Destination: an abandoned temple north of the city.
[Thread:Sunstone Shipment|Open]
[Timer:Shipment Arrives 4]
```

```
PC(Sable): "Four days. A shipment coming by sea to a temple."
PC(Mira): "What's a Sunstone?"
PC(Sable): "I've been researching that. Pre-war texts mention it as
             a source of immense power. Holt wants it badly."
PC(Kael): "Then we get there first."
```

```
[Thread:Baron Holt's Retaliation|Open]
[Clock:Holt's Search 1/6]
```

(note: great session — the escape was tense, and the Sunstone reveal
gives us a clear objective. next session: prep for the temple)

