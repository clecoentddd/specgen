// specificator.js
export function generateSpecification(interpretation) {
  const spec = {
    // Proposed file structure for Node.js / browser in-memory event-sourced app
    fileStructure: {
      "src": {
        "slices": {}, // Each slice folder will contain commands or projections depending on sliceType
        "events": {}, // Event definitions
        "infrastructure": {
          "bus": { "event-bus.js": "// Event bus logic" },
          "event-store": { "in-memory-event-store.js": "// In-memory event store logic" },
          "mock-db": { "in-memory-db.js": "// Simple in-memory DB for testing" }
        },
        "shared": {} // Utilities, types, or shared logic
      }
    },
    // Developer / architectural notes
    developerNotes: [
      {
        purpose: "Software Architecture Overview",
        description: "This is an in-browser only one-page app. All slices and events are managed via an in-memory event store. The UI displays the event stream from latest to first events, and each projection can be rebuilt independently.",
        recommendations: [
          "Follow CQRS: commands mutate state, events broadcast changes.",
          "Each slice encapsulates its own logic; avoid placing business logic in app.js.",
          "UI logic specific to a slice should reside inside that slice (e.g., ui.js).",
          "Pure UI components (like global event stream view or projection controls) can be outside slices."
        ]
      }
    ]
  };

  // Add slices
  interpretation.slices.forEach(slice => {
    const isStateChange = slice.sliceType === "STATE_CHANGE";
    const folderName = slice.title
      .replace("slice:", "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();

    if (!spec.fileStructure.src.slices[folderName]) {
      spec.fileStructure.src.slices[folderName] = {};
    }

    if (isStateChange) {
      // State change slice: has commands and commandHandlers
      spec.fileStructure.src.slices[folderName] = {
        "command.js": "// Defines command structure",
        "commandHandler.js": "// Handles command logic",
        "ui.js": "// Optional UI specific to this slice"
      };
    } else {
      // View slice: projections and event handlers
      spec.fileStructure.src.slices[folderName] = {
        "eventHandler.js": "// Reacts to domain events",
        "projection.js": "// Builds a view projection",
        "ui.js": "// Optional UI specific to this slice"
      };
    }

    // Developer notes per slice
    spec.developerNotes.push({
      slice: slice.title,
      type: slice.sliceType,
      summary: `Implements ${isStateChange ? "business command/event logic" : "read model projection"}.`,
      recommendations: [
        "Use the in-memory event store for testing event replay.",
        "Tag each event with projections that consume it to simplify replay.",
        "Keep slice self-contained: command/event handling and slice-specific UI.",
        "Implement BDD tests per slice: start with provided specifications and expand coverage with additional scenarios, including edge cases, invalid inputs, and multi-event sequences."
  
      ]
    });
  });

  return spec;
}
