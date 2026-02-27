# CSS Customization

Community-contributed CSS snippet that slims down the dashboard visuals and exposes every dimension, color, and spacing value through the [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin — so you can dial things in without editing the snippet directly.

> Shared by **rk-kontur** in [#107](https://github.com/Maws7140/obsidian-storyteller-suite/issues/107). Not officially maintained — adapt freely.

---

## Requirements

Install the **Style Settings** community plugin. Once the CSS snippet below is active, all the sliders and color pickers will appear under *Style Settings → Storyteller Suite*.

---

## What it covers

| Section | What changes |
|---|---|
| Dashboard Header | Font size, story selector size, new-story button size |
| Tab Buttons | Height, width, font, colors (normal / active / hover), corner radius, hover scale |
| Manuscript View | Chapter bar height/font, scene card height/padding/font, profile circle size |
| Gallery Grid | Column gap, vertical row spacing |
| Filtered Search | Search input size, "Create New" button size, filter label width |
| List Items | Padding, border, button size, name/description font, pill colors and spacing |

---

## Snippet

Paste the entire block into a new `.css` file in your vault's `.obsidian/snippets/` folder, then enable it under *Appearance → CSS Snippets*.

```css
/* @settings

name: Storyteller Suite
id: storyteller-suite
settings:
 -
  id: dashboard-header-heading
  title: Dashboard Header
  type: heading
  level: 2
  collapsed: true
 -
  id: dashboard-header-font-size
  title: Header Font Size
  type: variable-number-slider
  default: 24
  min: 10
  max: 48
  step: 1
  format: px
 -
  id: story-selector-font-size
  title: Story Selector Font Size
  type: variable-number-slider
  default: 14
  min: 10
  max: 20
  step: 1
  format: px
 -
  id: story-selector-height
  title: Story Selector Height
  type: variable-number-slider
  default: 32
  min: 12
  max: 50
  step: 1
  format: px
 -
  id: story-selector-width
  title: Story Selector Width
  type: variable-number-slider
  default: 180
  min: 100
  max: 300
  step: 1
  format: px
 -
  id: new-story-button-height
  title: New Story Button Height
  type: variable-number-slider
  default: 32
  min: 12
  max: 50
  step: 1
  format: px
 -
  id: new-story-button-width
  title: New Story Button Width
  type: variable-number-slider
  default: 120
  min: 60
  max: 200
  step: 1
  format: px
 -
  id: new-story-button-font-size
  title: New Story Button Font Size
  type: variable-number-slider
  default: 14
  min: 10
  max: 18
  step: 1
  format: px
 -
  id: storyteller-tabs-heading
  title: Storyteller Tab Buttons
  type: heading
  level: 2
  collapsed: true
 -
  id: storyteller-tab-ribbon-margin-top
  title: Space Above Tab Ribbon
  description: Vertical space above the tab buttons
  type: variable-number-slider
  default: 0
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: storyteller-tab-ribbon-margin-bottom
  title: Space Below Tab Ribbon
  description: Vertical space below the tab buttons
  type: variable-number-slider
  default: 0
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: storyteller-button-font-size
  title: Button Font Size
  description: Size of text in buttons
  type: variable-number-slider
  default: 12
  min: 10
  max: 24
  step: 1
  format: px
 -
  id: storyteller-button-font-weight
  title: Button Font Weight
  description: Thickness of button text
  type: variable-select
  default: bold
  options:
   -
    label: Normal
    value: normal
   -
    label: Semi-Bold (600)
    value: 600
   -
    label: Bold
    value: bold
   -
    label: Extra Bold (700)
    value: 700
 -
  id: storyteller-button-font-style
  title: Button Font Style
  description: Normal or italic text
  type: variable-select
  default: normal
  options:
   -
    label: Normal
    value: normal
   -
    label: Italic
    value: italic
 -
  id: storyteller-button-height
  title: Button Height
  description: Vertical size of buttons
  type: variable-number-slider
  default: 20
  min: 12
  max: 60
  step: 1
  format: px
 -
  id: storyteller-button-width
  title: Button Width
  description: Horizontal size of buttons
  type: variable-number-slider
  default: 120
  min: 80
  max: 200
  step: 1
  format: px
 -
  id: storyteller-button-min-width
  title: Button Minimum Width
  description: Smallest allowed width
  type: variable-number-slider
  default: 80
  min: 60
  max: 150
  step: 1
  format: px
 -
  id: storyteller-button-border-radius
  title: Button Corner Rounding
  description: Roundness of button corners (0 = sharp corners)
  type: variable-number-slider
  default: 4
  min: 0
  max: 20
  step: 1
  format: px
 -
  id: storyteller-button-padding-horizontal
  title: Button Horizontal Padding
  description: Space between text and left/right button edges
  type: variable-number-slider
  default: 12
  min: 0
  max: 30
  step: 1
  format: px
 -
  id: storyteller-button-padding-vertical
  title: Button Vertical Padding
  description: Space between text and top/bottom button edges
  type: variable-number-slider
  default: 0
  min: 0
  max: 10
  step: 1
  format: px
 -
  id: storyteller-tabs-colors-heading
  title: Tab Button Colors
  type: heading
  level: 3
  collapsed: true
 -
  id: storyteller-button-bg-color
  title: Button Background Color
  description: Normal button background
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(160, 107, 76, 1)'
  default-dark: 'rgba(160, 107, 76, 1)'
 -
  id: storyteller-button-text-color
  title: Button Text Color
  description: Color of text inside buttons
  type: variable-themed-color
  opacity: true
  format: hex
  default-light: '#ffffff'
  default-dark: '#ffffff'
 -
  id: storyteller-button-border-color
  title: Button Border Color
  description: Color of button outline
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(160, 107, 76, 1)'
  default-dark: 'rgba(160, 107, 76, 1)'
 -
  id: storyteller-button-border-width
  title: Button Border Width
  description: Thickness of button border
  type: variable-number-slider
  default: 2
  min: 0
  max: 5
  step: 1
  format: px
 -
  id: storyteller-button-active-bg-color
  title: Active Button Background Color
  description: Background of selected/active button
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(160, 107, 76, 0.6)'
  default-dark: 'rgba(160, 107, 76, 0.6)'
 -
  id: storyteller-button-active-border-color
  title: Active Button Border Color
  description: Border of selected/active button
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(160, 107, 76, 0.8)'
  default-dark: 'rgba(160, 107, 76, 0.8)'
 -
  id: storyteller-button-hover-bg-color
  title: Hover Button Background Color
  description: Background when hovering over button
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(160, 107, 76, 0.7)'
  default-dark: 'rgba(160, 107, 76, 0.7)'
 -
  id: storyteller-button-hover-scale
  title: Hover Scale Effect
  description: Button size increase on hover (1.0 = no change)
  type: variable-number-slider
  default: 1.05
  min: 1.0
  max: 1.2
  step: 0.05
  format: ''
 -
  id: manuscript-view-heading
  title: Manuscript View (Chapters & Scenes)
  type: heading
  level: 2
  collapsed: false
 -
  id: chapter-header-height
  title: Chapter Height
  description: Height of the chapter header bar
  type: variable-number-slider
  default: 40
  min: 20
  max: 100
  step: 1
  format: px
 -
  id: chapter-font-size
  title: Chapter Font Size
  description: Size of chapter text
  type: variable-number-slider
  default: 16
  min: 10
  max: 32
  step: 1
  format: px
 -
  id: chapter-font-weight
  title: Chapter Font Weight
  description: Thickness of chapter text
  type: variable-number-slider
  default: 700
  min: 100
  max: 900
  step: 100
  format: ''
 -
  id: scene-height
  title: Scene Height
  description: Height of the scene cards
  type: variable-number-slider
  default: 60
  min: 20
  max: 200
  step: 1
  format: px
 -
  id: scene-padding
  title: Scene Padding
  description: Inner spacing of scene cards (creates distance from edge)
  type: variable-number-slider
  default: 8
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: scene-font-size
  title: Scene Font Size
  description: Size of scene text
  type: variable-number-slider
  default: 14
  min: 8
  max: 24
  step: 1
  format: px
 -
  id: scene-font-weight
  title: Scene Font Weight
  description: Thickness of scene text
  type: variable-number-slider
  default: 700
  min: 100
  max: 900
  step: 100
  format: ''
 -
  id: scene-pfp-number-size
  title: Scene Profile Number Size
  description: Size of numbers inside scene profile circles
  type: variable-number-slider
  default: 18
  min: 8
  max: 48
  step: 1
  format: px
 -
  id: gallery-view-heading
  title: Gallery View
  type: heading
  level: 2
  collapsed: false
 -
  id: gallery-col-gap
  title: Gallery Horizontal Gap
  description: Space between items left/right
  type: variable-number-slider
  default: 10
  min: 0
  max: 50
  step: 1
  format: px
 -
  id: gallery-vertical-margin
  title: Gallery Vertical Spacing
  description: Space between rows (negative values pull rows closer together)
  type: variable-number-slider
  default: 0
  min: -250
  max: 50
  step: 1
  format: px
 -
  id: filtered-search-heading
  title: Filtered Search
  type: heading
  level: 2
  collapsed: true
 -
  id: create-new-button-height
  title: Create New Button Height
  type: variable-number-slider
  default: 36
  min: 12
  max: 60
  step: 1
  format: px
 -
  id: create-new-button-width
  title: Create New Button Width
  type: variable-number-slider
  default: 150
  min: 60
  max: 250
  step: 1
  format: px
 -
  id: search-input-width
  title: Search Input Width Adjustment
  description: Adjust from neutral (0 = no change, negative = smaller, positive = larger)
  type: variable-number-slider
  default: 0
  min: -50
  max: 50
  step: 1
  format: '%'
 -
  id: search-input-height
  title: Search Input Height
  description: Height of search/filter input fields
  type: variable-number-slider
  default: 32
  min: 20
  max: 60
  step: 1
  format: px
 -
  id: filter-input-width
  title: Filter Input Field Width
  description: Width of the filter input boxes (px or %)
  type: variable-number-slider
  default: 300
  min: 100
  max: 600
  step: 10
  format: px
 -
  id: controls-group-margin-top
  title: Controls Area Margin Top
  description: Space above the filter/search controls area
  type: variable-number-slider
  default: 10
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: controls-group-margin-bottom
  title: Controls Area Margin Bottom
  description: Space below the filter/search controls area
  type: variable-number-slider
  default: 10
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: filter-label-heading
  title: Filter Labels
  type: heading
  level: 3
  collapsed: true
 -
  id: filter-label-font-size
  title: Filter Label Font Size
  type: variable-number-slider
  default: 14
  min: 10
  max: 24
  step: 1
  format: px
 -
  id: filter-label-width
  title: Filter Label Width
  description: Width of filter label elements
  type: variable-number-slider
  default: 200
  min: 100
  max: 400
  step: 10
  format: px
 -
  id: filtered-items-heading
  title: Filtered Items
  type: heading
  level: 2
  collapsed: true
 -
  id: list-item-border-heading
  title: List Item Border
  type: heading
  level: 3
  collapsed: true
 -
  id: list-item-border-width
  title: Border Width
  type: variable-number-slider
  default: 1
  min: 0
  max: 10
  step: 1
  format: px
 -
  id: list-item-border-color-light
  title: Border Color (Light Mode)
  type: variable-themed-color
  opacity: true
  format: rgba
  default-light: 'rgba(0, 0, 0, 0.1)'
  default-dark: 'rgba(0, 0, 0, 0.1)'
 -
  id: list-item-border-color-dark
  title: Border Color (Dark Mode)
  type: variable-themed-color
  opacity: true
  format: rgba
  default-light: 'rgba(255, 255, 255, 0.1)'
  default-dark: 'rgba(255, 255, 255, 0.1)'
 -
  id: list-item-button-heading
  title: List Item Buttons
  type: heading
  level: 3
  collapsed: true
 -
  id: list-item-button-position-x
  title: Button Position X (Horizontal)
  description: Horizontal position adjustment
  type: variable-number-slider
  default: 0
  min: -50
  max: 50
  step: 1
  format: px
 -
  id: list-item-button-position-y
  title: Button Position Y (Vertical)
  description: Vertical position adjustment
  type: variable-number-slider
  default: 0
  min: -50
  max: 50
  step: 1
  format: px
 -
  id: list-item-button-height
  title: Button Height
  type: variable-number-slider
  default: 32
  min: 16
  max: 48
  step: 1
  format: px
 -
  id: list-item-button-width
  title: Button Width
  type: variable-number-slider
  default: 32
  min: 16
  max: 48
  step: 1
  format: px
 -
  id: list-item-name-font-size
  title: Item Name Font Size
  type: variable-number-slider
  default: 16
  min: 8
  max: 32
  step: 1
  format: px
 -
  id: list-item-name-font-weight
  title: Item Name Font Weight
  type: variable-select
  default: bold
  options:
   -
    label: Normal
    value: normal
   -
    label: Semi-Bold (600)
    value: 600
   -
    label: Bold
    value: bold
   -
    label: Extra Bold (700)
    value: 700
 -
  id: list-item-description-font-size
  title: Item Description Font Size
  type: variable-number-slider
  default: 14
  min: 8
  max: 24
  step: 1
  format: px
 -
  id: list-item-description-font-weight
  title: Item Description Font Weight
  type: variable-select
  default: normal
  options:
   -
    label: Normal
    value: normal
   -
    label: Semi-Bold (600)
    value: 600
   -
    label: Bold
    value: bold
 -
  id: list-item-description-lines
  title: Description Visible Lines
  description: How many lines of description to show
  type: variable-number-slider
  default: 2
  min: 1
  max: 8
  step: 1
  format: ''
 -
  id: list-item-pill-font-size
  title: Status/Affiliation Pill Font Size
  type: variable-number-slider
  default: 12
  min: 4
  max: 16
  step: 1
  format: px
 -
  id: list-item-pill-padding
  title: Pill Padding
  type: variable-number-slider
  default: 4
  min: 2
  max: 12
  step: 1
  format: px
 -
  id: list-item-pill-separation
  title: Pill Separation Distance
  description: Space between status and affiliation pills
  type: variable-number-slider
  default: 8
  min: 2
  max: 20
  step: 1
  format: px
 -
  id: list-item-status-color
  title: Status Pill Color
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(100, 150, 255, 0.2)'
  default-dark: 'rgba(100, 150, 255, 0.2)'
 -
  id: list-item-affiliation-color
  title: Affiliation Pill Color
  type: variable-themed-color
  opacity: true
  format: rgb
  default-light: 'rgba(150, 100, 255, 0.2)'
  default-dark: 'rgba(150, 100, 255, 0.2)'
 -
  id: list-item-spacing-heading
  title: List Item Spacing
  type: heading
  level: 3
  collapsed: true
 -
  id: list-item-gap
  title: Gap Between List Items
  description: Vertical space between list items (0 = no gap)
  type: variable-number-slider
  default: 8
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: list-item-title-margin-top
  title: Title to Top Edge
  description: Space from top of item to title
  type: variable-number-slider
  default: 0
  min: 0
  max: 30
  step: 1
  format: px
 -
  id: list-item-title-margin-bottom
  title: Title to Description/Pills
  description: Space from title to description or pills
  type: variable-number-slider
  default: 4
  min: 0
  max: 30
  step: 1
  format: px
 -
  id: list-item-padding-top
  title: Space Top
  type: variable-number-slider
  default: 12
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: list-item-padding-bottom
  title: Space Bottom
  type: variable-number-slider
  default: 12
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: list-item-padding-left
  title: Space Left
  type: variable-number-slider
  default: 16
  min: 0
  max: 40
  step: 1
  format: px
 -
  id: list-item-padding-right
  title: Space Right
  type: variable-number-slider
  default: 16
  min: 0
  max: 80
  step: 1
  format: px

*/

/* ================================================
   CSS VARIABLES
   ================================================ */

body {
  /* Dashboard Header */
  --dashboard-header-font-size: 24px;
  --story-selector-font-size: 14px;
  --story-selector-height: 32px;
  --story-selector-width: 180px;
  --new-story-button-height: 32px;
  --new-story-button-width: 120px;
  --new-story-button-font-size: 14px;

  /* Tab Buttons - Font */
  --storyteller-button-font-size: 12px;
  --storyteller-button-font-weight: bold;
  --storyteller-button-font-style: normal;

  /* Tab Buttons - Spacing */
  --storyteller-tab-ribbon-margin-top: 0px;
  --storyteller-tab-ribbon-margin-bottom: 0px;

  /* Tab Buttons - Size */
  --storyteller-button-height: 20px;
  --storyteller-button-width: 120px;
  --storyteller-button-min-width: 80px;
  --storyteller-button-border-radius: 4px;
  --storyteller-button-padding-horizontal: 12px;
  --storyteller-button-padding-vertical: 0px;

  /* Tab Buttons - Colors Normal */
  --storyteller-button-bg-color: rgba(160, 107, 76, 1);
  --storyteller-button-text-color: #ffffff;
  --storyteller-button-border-color: rgba(160, 107, 76, 1);
  --storyteller-button-border-width: 2px;

  /* Tab Buttons - Colors Active */
  --storyteller-button-active-bg-color: rgba(160, 107, 76, 0.6);
  --storyteller-button-active-border-color: rgba(160, 107, 76, 0.8);

  /* Tab Buttons - Colors Hover */
  --storyteller-button-hover-bg-color: rgba(160, 107, 76, 0.7);
  --storyteller-button-hover-scale: 1.05;

  /* Manuscript View (Chapters & Scenes) */
  --chapter-header-height: 40px;
  --chapter-font-size: 16px;
  --chapter-font-weight: 700;
  --scene-height: 60px;
  --scene-padding: 8px;
  --scene-font-size: 14px;
  --scene-font-weight: 700;
  --scene-pfp-number-size: 18px;

  /* Gallery View */
  --gallery-col-gap: 10px;
  --gallery-vertical-margin: 0px;

  /* Filtered Search */
  --search-input-width: 0%;
  --search-input-height: 32px;
  --filter-input-width: 300px;
  --controls-group-margin-top: 10px;
  --controls-group-margin-bottom: 10px;
  --create-new-button-height: 36px;
  --create-new-button-width: 150px;

  /* Filter Labels */
  --filter-label-font-size: 14px;
  --filter-label-width: 200px;

  /* List Items - Border */
  --list-item-border-width: 1px;
  --list-item-border-color-light: rgba(0, 0, 0, 0.1);
  --list-item-border-color-dark: rgba(255, 255, 255, 0.1);

  /* List Items - Button Position */
  --list-item-button-position-x: 0px;
  --list-item-button-position-y: 0px;

  /* List Items - Buttons */
  --list-item-button-height: 32px;
  --list-item-button-width: 32px;

  /* List Items - Text */
  --list-item-name-font-size: 16px;
  --list-item-name-font-weight: bold;
  --list-item-description-font-size: 14px;
  --list-item-description-font-weight: normal;
  --list-item-description-lines: 2;

  /* List Items - Pills */
  --list-item-pill-font-size: 12px;
  --list-item-pill-padding: 4px;
  --list-item-pill-separation: 8px;
  --list-item-status-color: rgba(100, 150, 255, 0.2);
  --list-item-affiliation-color: rgba(150, 100, 255, 0.2);

  /* List Items - Spacing */
  --list-item-gap: 8px;
  --list-item-title-margin-top: 0px;
  --list-item-title-margin-bottom: 4px;
  --list-item-padding-top: 12px;
  --list-item-padding-bottom: 12px;
  --list-item-padding-left: 16px;
  --list-item-padding-right: 16px;
}

/* ================================================
   DASHBOARD HEADER
   ================================================ */

.storyteller-dashboard-header {
  font-size: var(--dashboard-header-font-size) !important;
  background: var(--background-primary) !important;
}

.storyteller-dashboard-header,
.storyteller-dashboard-header-top {
  background: var(--background-primary) !important;
}

.storyteller-tab-ribbon {
  margin-top: var(--storyteller-tab-ribbon-margin-top) !important;
  margin-bottom: var(--storyteller-tab-ribbon-margin-bottom) !important;
}

#storyteller-story-selector,
.storyteller-story-selector {
  font-size: var(--story-selector-font-size) !important;
  height: var(--story-selector-height) !important;
  min-height: var(--story-selector-height) !important;
  width: var(--story-selector-width) !important;
  min-width: var(--story-selector-width) !important;
}

.storyteller-new-story-btn,
.storyteller-dashboard-header > div > div > button {
  height: var(--new-story-button-height) !important;
  min-height: var(--new-story-button-height) !important;
  width: var(--new-story-button-width) !important;
  min-width: var(--new-story-button-width) !important;
  font-size: var(--new-story-button-font-size) !important;
}

/* ================================================
   TAB BUTTONS
   ================================================ */

.storyteller-tab-header {
  font-size: var(--storyteller-button-font-size) !important;
  font-weight: var(--storyteller-button-font-weight) !important;
  font-style: var(--storyteller-button-font-style) !important;
  height: var(--storyteller-button-height) !important;
  min-height: var(--storyteller-button-height) !important;
  max-height: var(--storyteller-button-height) !important;
  line-height: 1.2 !important;
  padding: var(--storyteller-button-padding-vertical) var(--storyteller-button-padding-horizontal) !important;
  width: var(--storyteller-button-width) !important;
  min-width: var(--storyteller-button-min-width) !important;
  background-color: var(--storyteller-button-bg-color) !important;
  color: var(--storyteller-button-text-color) !important;
  border-radius: var(--storyteller-button-border-radius) !important;
  border: var(--storyteller-button-border-width) solid var(--storyteller-button-border-color) !important;
  transition: all 0.2s ease !important;
}

.storyteller-tab-header.active {
  background-color: var(--storyteller-button-active-bg-color) !important;
  border-color: var(--storyteller-button-active-border-color) !important;
  font-weight: 700 !important;
}

.storyteller-tab-header:hover {
  background-color: var(--storyteller-button-hover-bg-color) !important;
  transform: scale(var(--storyteller-button-hover-scale)) !important;
}

[class*="storyteller-tab-header"] {
  background-color: var(--storyteller-button-bg-color) !important;
  border-color: var(--storyteller-button-border-color) !important;
  color: var(--storyteller-button-text-color) !important;
}

[class*="storyteller-tab-header"].active,
[class*="storyteller-tab-header"][class*="active"] {
  background-color: var(--storyteller-button-active-bg-color) !important;
  border-color: var(--storyteller-button-active-border-color) !important;
}

/* ================================================
   FILTERED SEARCH
   ================================================ */

.storyteller-controls-group {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: flex-start !important;
  gap: 0.75em !important;
  width: 100% !important;
  max-width: 100% !important;
  margin-top: var(--controls-group-margin-top) !important;
  margin-bottom: var(--controls-group-margin-bottom) !important;
  background-color: var(--background-secondary) !important;
  padding: 0.75rem !important;
  border-radius: 8px !important;
  overflow: visible !important;
  box-sizing: border-box !important;
  min-height: fit-content !important;
}

.storyteller-controls-group > .setting-item {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 0.5em !important;
  flex: 0 1 auto !important;
  min-width: fit-content !important;
  margin: 0 !important;
  padding: 0 !important;
  width: auto !important;
}

.storyteller-controls-group .setting-item-info {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  width: auto !important;
  flex: 0 0 auto !important;
}

.storyteller-controls-group .setting-item-control {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 0.5em !important;
  margin: 0 !important;
  padding: 0 !important;
  width: auto !important;
  flex: 0 0 auto !important;
}

.storyteller-controls-group .setting-item-name:empty,
.storyteller-controls-group .setting-item-description:empty {
  display: none !important;
}

.storyteller-controls-group .setting-item-name {
  display: inline-block !important;
  margin: 0 !important;
  padding: 0 !important;
  white-space: nowrap !important;
}

.storyteller-controls-group input[type="text"] {
  width: var(--filter-input-width) !important;
  min-width: var(--filter-input-width) !important;
  max-width: var(--filter-input-width) !important;
  height: var(--search-input-height) !important;
  min-height: var(--search-input-height) !important;
  flex-shrink: 0 !important;
}

.storyteller-controls-group button {
  height: var(--create-new-button-height) !important;
  min-height: var(--create-new-button-height) !important;
  width: var(--create-new-button-width) !important;
  min-width: var(--create-new-button-width) !important;
  flex-shrink: 0 !important;
}

.setting-item-name {
  font-size: var(--filter-label-font-size) !important;
  width: var(--filter-label-width) !important;
  max-width: var(--filter-label-width) !important;
  white-space: nowrap !important;
}

/* ================================================
   LIST ITEMS
   ================================================ */

.storyteller-list-item,
.storyteller-character-item {
  padding-top: var(--list-item-padding-top) !important;
  padding-bottom: var(--list-item-padding-bottom) !important;
  padding-left: var(--list-item-padding-left) !important;
  padding-right: var(--list-item-padding-right) !important;
  border: var(--list-item-border-width) solid var(--list-item-border-color-light) !important;
  border-radius: 4px !important;
  margin-bottom: var(--list-item-gap) !important;
}

.storyteller-list-item:last-child,
.storyteller-character-item:last-child {
  margin-bottom: 0 !important;
}

.theme-dark .storyteller-list-item,
.theme-dark .storyteller-character-item {
  border-color: var(--list-item-border-color-dark) !important;
}

.storyteller-list-item-actions button {
  height: var(--list-item-button-height) !important;
  width: var(--list-item-button-width) !important;
  min-height: var(--list-item-button-height) !important;
  min-width: var(--list-item-button-width) !important;
}

.storyteller-list-item-actions {
  position: relative !important;
  transform: translate(var(--list-item-button-position-x), var(--list-item-button-position-y)) !important;
}

.storyteller-list-item-info {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
}

.storyteller-list-item-info > strong {
  font-size: var(--list-item-name-font-size) !important;
  font-weight: var(--list-item-name-font-weight) !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 8px !important;
  margin-top: var(--list-item-title-margin-top) !important;
  margin-bottom: var(--list-item-title-margin-bottom) !important;
}

.storyteller-list-item-extra {
  display: inline-flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: var(--list-item-pill-separation) !important;
  margin: 0 !important;
  font-size: 0 !important;
}

.storyteller-list-item-extra::before {
  content: none !important;
}

.storyteller-list-item-status,
.storyteller-list-item-affiliation {
  font-size: var(--list-item-pill-font-size) !important;
}

.storyteller-list-item-info > p {
  font-size: var(--list-item-description-font-size) !important;
  font-weight: var(--list-item-description-font-weight) !important;
  display: -webkit-box !important;
  -webkit-line-clamp: var(--list-item-description-lines) !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  margin: 0 !important;
  width: 100% !important;
  line-height: 1.4 !important;
}

.storyteller-list-item-status {
  font-size: var(--list-item-pill-font-size) !important;
  padding: var(--list-item-pill-padding) calc(var(--list-item-pill-padding) * 2) !important;
  background-color: var(--list-item-status-color) !important;
  border-radius: 4px !important;
  display: inline-block !important;
  white-space: nowrap !important;
}

.storyteller-list-item-affiliation {
  font-size: var(--list-item-pill-font-size) !important;
  padding: var(--list-item-pill-padding) calc(var(--list-item-pill-padding) * 2) !important;
  background-color: var(--list-item-affiliation-color) !important;
  border-radius: 4px !important;
  display: inline-block !important;
  white-space: nowrap !important;
}

/* ================================================
   MANUSCRIPT VIEW (CHAPTERS & SCENES)
   ================================================ */

.storyteller-chapter-header {
  height: var(--chapter-header-height) !important;
  min-height: var(--chapter-header-height) !important;
  display: flex !important;
  align-items: center !important;
  font-size: var(--chapter-font-size) !important;
  font-weight: var(--chapter-font-weight) !important;
}

.storyteller-chapter-scenes {
  height: auto !important;
  min-height: unset !important;
  display: block !important;
  overflow: visible !important;
}

.storyteller-chapter-scenes > div {
  height: var(--scene-height) !important;
  min-height: var(--scene-height) !important;
  max-height: var(--scene-height) !important;
  padding: var(--scene-padding) !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  box-sizing: border-box !important;
  gap: 8px !important;
}

.storyteller-chapter-scenes > div strong {
  font-size: var(--scene-font-size) !important;
  font-weight: var(--scene-font-weight) !important;
  line-height: 1 !important;
  margin: 0 !important;
  padding: 0 !important;
}

.storyteller-chapter-scenes .storyteller-list-item-pfp,
.storyteller-chapter-scenes .storyteller-pfp-placeholder {
  width: calc(var(--scene-height) - (var(--scene-padding) * 2)) !important;
  height: calc(var(--scene-height) - (var(--scene-padding) * 2)) !important;
  min-width: calc(var(--scene-height) - (var(--scene-padding) * 2)) !important;
  min-height: calc(var(--scene-height) - (var(--scene-padding) * 2)) !important;
  flex-shrink: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  font-size: var(--scene-pfp-number-size) !important;
}

/* ================================================
   GALLERY GRID
   ================================================ */

.storyteller-gallery-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
  column-gap: var(--gallery-col-gap) !important;
  row-gap: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
}

.storyteller-gallery-item {
  margin: 0 !important;
  position: relative !important;
  z-index: 1 !important;
  transform: translateY(0) !important;
}

/* Vertical offset per row (2-column layout) */
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(3),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(4)  { transform: translateY(calc(var(--gallery-vertical-margin) * 1)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(5),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(6)  { transform: translateY(calc(var(--gallery-vertical-margin) * 2)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(7),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(8)  { transform: translateY(calc(var(--gallery-vertical-margin) * 3)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(9),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(10) { transform: translateY(calc(var(--gallery-vertical-margin) * 4)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(11),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(12) { transform: translateY(calc(var(--gallery-vertical-margin) * 5)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(13),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(14) { transform: translateY(calc(var(--gallery-vertical-margin) * 6)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(15),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(16) { transform: translateY(calc(var(--gallery-vertical-margin) * 7)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(17),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(18) { transform: translateY(calc(var(--gallery-vertical-margin) * 8)) !important; }
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(19),
.storyteller-gallery-grid > .storyteller-gallery-item:nth-child(20) { transform: translateY(calc(var(--gallery-vertical-margin) * 9)) !important; }

.storyteller-gallery-item:hover {
  z-index: 10 !important;
}
```
