---
mapmarkers:
  - loc: [45.520, -122.680]
    label: "Town Square"
    color: "#4ecdc4"
  - loc: [45.525, -122.675]
    label: "Old Mill"
    color: "#ff6b6b"
  - loc: [45.518, -122.678]
    label: "Forest Path"
    color: "#95e1d3"
tags: [location, multiple-markers]
---

# Multiple Markers Example

This note demonstrates multiple markers on a single map using the `mapmarkers` array.

## Features
- Uses `mapmarkers` frontmatter array
- Each marker has:
  - `loc`: [lat, lng] coordinates
  - `label`: Display name
  - `color`: Hex color code

## Marker Types
- **Town Square**: Central gathering point (teal)
- **Old Mill**: Historic building (red)
- **Forest Path**: Nature trail entrance (mint green)
