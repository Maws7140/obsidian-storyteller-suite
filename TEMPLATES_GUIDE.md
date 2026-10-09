# Templates guide

Two ways to build a template:

- **In the UI** — Dashboard → Templates → New template. Best for templates that
  create several linked entities at once.
- **As a markdown note** — write the note, drop it in the templates folder, done.
  Best for a single-entity template you want to version-control, edit outside
  Obsidian, or share as a file.

Both produce the same thing. This guide covers the note format and the bulk
variable importer.

## Note-based templates

### Where the file goes

The templates folder defaults to `StorytellerSuite/Templates`, and note-based
templates live under its `Notes` subfolder. If you changed **Template storage
folder** in settings, substitute that path.

```
StorytellerSuite/Templates/Notes/
  Characters/
    Grizzled Mentor.md
  Locations/
    Coastal Village.md
  Items/
  Events/
  ...
```

The entity-type subfolders are created for you on first run. You can also drop a
note directly in `Notes/` as long as its frontmatter declares the entity type.

Folder names per entity type: `Characters`, `Locations`, `Events`, `Items`,
`Groups`, `Maps`, `Cultures`, `Economies`, `MagicSystems`, `Chapters`, `Scenes`,
`References`, `CompendiumEntries`, `Books`, `CampaignSessions`.

Templates are picked up when the plugin loads and when the file is modified. Use
**Reload custom templates** from the command palette to rescan without
restarting.

### Frontmatter

Only the entity type is required, and it can come from the folder instead.

| Key | Required | Meaning |
|---|---|---|
| `templateEntityType` | yes* | Which entity this template creates, e.g. `character`. Also read from `type` or `entityType`. *Optional if the note sits in a recognised entity-type subfolder. |
| `templateName` | no | Display name. Defaults to the file name. |
| `templateDescription` | no | Shown in the template gallery. |
| `templateGenre` | no | Gallery filter, e.g. `fantasy`, `sci-fi`. |
| `templateCategory` | no | Gallery grouping. |
| `templateTags` | no | List of tags for search. |
| `templateVariables` | no | Explicit variable definitions (see below). |

Every other frontmatter key becomes a field on the entity the template creates.

### Variables

Write `{{variableName}}` anywhere in the frontmatter values or the note body.
Variable names match `\w+` — letters, numbers and underscores, not starting with
a number.

Any `{{placeholder}}` found in the note is registered automatically as a text
variable. You only need `templateVariables` when you want a type other than
text, a default, a dropdown, or a nicer label.

```markdown
---
templateEntityType: character
templateName: Grizzled Mentor
templateDescription: An older mentor figure with a past they do not discuss
templateGenre: fantasy
templateTags: [mentor, npc]
templateVariables:
  - name: mentorName
    label: Mentor name
    type: text
  - name: mentorAge
    label: Age
    type: number
    defaultValue: 58
  - name: discipline
    label: Discipline
    type: select
    options: [blade, arcane, wilderness]
    defaultValue: blade
name: "{{mentorName}}"
age: "{{mentorAge}}"
occupation: "{{discipline}} instructor"
status: alive
---

## Description

{{mentorName}} has taught the {{discipline}} arts for longer than most students
have been alive.

## Backstory

Something happened. {{mentorName}} does not talk about it.
```

Explicit definitions and auto-detected placeholders are merged, so you can
declare only the two variables that need a type and let the rest be inferred.

### Variable types

`text`, `number`, `boolean`, `select`, `date`.

`select` requires `options`. `date` defaults must be `yyyy-mm-dd`. A `defaultValue`
is optional for every type.

## Bulk adding variables

The template editor's **Variables** tab has a **Bulk add variables** panel that
takes a pasted list, shows you exactly what it parsed, and only commits when you
press the button. It reads three formats and detects which one you pasted.

### Delimited

One variable per line. Columns separated by a tab, `|`, `:` or a comma — the
first of those found in your text wins, so pick whichever does not collide with
your values. Blank lines and lines starting with `#` are ignored.

```
name
name | type
name | type | default
name | type | default | label
name | type | default | label | description
```

`select` shifts the columns along, because its options need a home:

```
name | select | option1;option2;option3 | default | label | description
```

Worked example:

```
characterName
characterAge  | number  | 25
isVillain     | boolean | false | Is a villain
faction       | select  | rebels;empire;neutral | neutral | Faction
foundingDate  | date    | 1247-03-02
```

Type defaults to `text` when the column is omitted. Label defaults to the
variable name.

### JSON

An array of objects, or a single object. `default` and `defaultValue` are both
accepted.

```json
[
  { "name": "characterAge", "type": "number", "default": 25, "label": "Age" },
  { "name": "faction", "type": "select", "options": ["rebels", "empire"], "default": "rebels" }
]
```

### YAML

A list of mappings — the same shape you would write in `templateVariables`.

```yaml
- name: characterAge
  type: number
  default: 25
  label: Age
- name: faction
  type: select
  options:
    - rebels
    - empire
  default: rebels
```

### Preview, duplicates and export

The preview lists every row with its parsed type, options, default and label.
Rows that cannot be read are marked with the reason and are never committed —
the good rows around them still are.

**When a variable already exists** controls duplicates: *Append only* keeps what
you have, *Overwrite existing* replaces the definition while keeping the
template's record of where that variable is used.

**Export existing variables** writes the template's current variables into the
box in the delimited format. It round-trips, so it is the quickest way to copy a
variable set from one template into another.
