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
        purpose: "AI Constraints & Self-Verification",
        description: "The following items represent the strict architectural constraints applied to this specification. The LLM confirms compliance with these points.",
        recommendations: [
          "Is the proposed architecture and data flow **completely confined to the browser** (i.e., no server, no database, only in-memory structures)? **(Y/N)**",
          "Does the solution strictly follow the **Event-Command-ReadModel** pattern (a form of CQRS/Event Sourcing)? **(Y/N)**",
          "Are there **NO** references to backend/server-side code (e.g., Express, databases, REST APIs, etc.) that contradict the in-browser constraint? **(Y/N)**",
          "Have all slices been correctly categorized as either 'STATE_CHANGE' (Command/Event) or 'VIEW' (Projection/Read Model)? **(Y/N)**"
        ]
      },
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

    const sliceNotes = {
      slice: slice.title,
      type: slice.sliceType,
      summary: `Implements ${isStateChange ? "business command/event logic" : "read model projection"}.`,
      recommendations: [
        "Use the in-memory event store for testing event replay.",
        "Tag each event with projections that consume it to simplify replay.",
        "Keep slice self-contained: command/event handling and slice-specific UI.",
        "Implement BDD tests per slice: start with provided specifications and expand coverage with additional scenarios, including edge cases, invalid inputs, and multi-event sequences."
      ]
    };

    if (isStateChange) {
      // State change slice: has commands and commandHandlers
      spec.fileStructure.src.slices[folderName] = {
        "command.js": "// Defines command structure",
        "commandHandler.js": "// Handles command logic",
        "ui.js": "// Optional UI specific to this slice"
      };
    } else {
      // View slice (Read Model): projections and event handlers
      // UPDATED: Use a handlers folder for multi-event projections (To-Do List Pattern)
      spec.fileStructure.src.slices[folderName] = {
        "handlers": {
          "event-handler-registrar.js": "// Subscribes all specific handlers to the event bus.",
          "handleEventName.js": "// Separate handler for each event consumed by the projection."
        },
        "projection.js": "// Builds a view projection (the list itself)",
        "ui.js": "// Optional UI specific to this slice"
      };

      // UPDATED: Add specific To-Do Pattern recommendation for VIEW slices
      if (slice.title.toLowerCase().includes('list of')) {
        sliceNotes.recommendations.push(
          "**To-Do List Pattern:** This Read Model must subscribe to **at least two** event types: one that marks the item as 'to-do' (ADD) and one that marks it as 'done' (REMOVE). The list state is keyed by a **unique ID** (e.g., `orderId` or `itemId`) found in both event payloads to reconcile the item's state."
        );
      }
    }

    // Add the notes for the current slice
    spec.developerNotes.push(sliceNotes);
  });

  return spec;
}