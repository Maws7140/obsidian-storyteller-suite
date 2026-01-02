#!/bin/bash

# List of remaining modals to update
MODALS=(
  "EventModal:event:events:Event"
  "PlotItemModal:item:items:Item"
  "GroupModal:group:groups:Group"
  "CultureModal:culture:cultures:Culture"
  "EconomyModal:economy:economies:Economy"
  "MagicSystemModal:magicSystem:magicSystems:Magic System"
  "ChapterModal:chapter:chapters:Chapter"
  "SceneModal:scene:scenes:Scene"
  "ReferenceModal:reference:references:Reference"
  "MapModal:map:maps:Map"
)

echo "Modals to update: ${#MODALS[@]}"
for modal_info in "${MODALS[@]}"; do
  IFS=: read -r modal_name entity_key entity_plural entity_label <<< "$modal_info"
  echo "- $modal_name (${entity_key})"
done
