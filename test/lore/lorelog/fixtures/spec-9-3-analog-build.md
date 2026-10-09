<!-- Copied from the Lorelog spec section 9.3 by Roberto Bisceglie (Loreseed Workshop), CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ -->

=== Build 2 ===
[Date]     2026-09-27
[Phase]    Structure

C4 *Day in the life*
t: Day in the life [dockworker, outer district]
  Wakes: = tenement by the dry canal
  Eats: Gap
  Friction: = water queue
  Depends: = foreman
  Fears: = warden raid
-> Gap  [Q:Outer district food|open|p1]

C5 *Outer district food* (§Economy)
? Where does the outer district get its food?
= Marsh fishers sell eels at the canal market at dawn
~ Guild taxes the canal water for the eels
>> [L:Canal Market] [F:Marsh Fishers]
[Q:Outer district food|answered→C5]
? Why don't the fishers stop coming?     [ ]
