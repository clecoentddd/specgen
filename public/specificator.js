export function generateSpecification(interpretation) {
    console.log("generateSpecification - Start");

    // Containers for all unique event data
    const eventFileContent = {};
    const allEventsData = {};
    // New container for all unique external event data
    const allExternalEvents = new Set(); 

    // Fix: Prioritize 'interpretation.slices' as the main array of slice objects.
    const safeSlices = interpretation.slices || interpretation.sliceDetails || []; 

    // --- 1. PRE-PROCESS: Collect and De-duplicate All Events (Internal and External) ---
    safeSlices.forEach(slice => {
        console.log(`Specificator - Processing Slice: ${slice.title || 'Untitled Slice'}`);
        
        // Process Internal Events
        (slice.events || []).forEach(event => {
            const rawTitle = event.title;
            const eventTitle = rawTitle
                .replace(/\*\*EXTERNAL:\*\* /g, '')
                .replace(/\*\*/g, '') // Ensure any remaining markdown is stripped
                .trim()
                .replace(/\s+/g, '-').toLowerCase(); 
                
            const fileName = `${eventTitle}.js`;
            
            if (!allEventsData[eventTitle]) {
                allEventsData[eventTitle] = {
                    file: fileName,
                    description: event.description || `Definition for the ${rawTitle} event.`
                };
                eventFileContent[fileName] = `// Schema and definition for ${rawTitle}`;
            }
        });
        
        // Process External Events (added in interpreter.js update)
        (slice.externalEvents || []).forEach(event => {
             // The title in slice.externalEvents is already the cleaned title without annotation
             const cleanTitle = event.title.replace(/\*\*EXTERNAL:\*\* /g, '').trim();
             allExternalEvents.add(cleanTitle);
        });

    });
    
    console.log(`generateSpecification - End. Processed ${safeSlices.length} slices. Found ${allExternalEvents.size} unique external events.`);
    // --- END PRE-PROCESS ---


    // FINAL FIX: If no events were collected, inject a single placeholder file.
    if (Object.keys(eventFileContent).length === 0) {
        eventFileContent['no-events-defined.js'] = '// No events found in interpretation data. This is a placeholder.';
        allEventsData['no-events-defined'] = { 
            file: 'no-events-defined.js',
            description: 'Placeholder event definition because interpretation data was empty.' 
        };
    }


    const spec = {
        // The list of all unique events
        events: allEventsData, 

        fileStructure: {
            "src": {
                "slices": {}, 
                "events": {}, // This will be populated by Object.assign below
                "infrastructure": {
                    "bus": { "event-bus.js": "// Event bus logic" },
                    "event-store": { "in-memory-event-store.js": "// In-memory event store logic" },
                    "mock-db": { "in-memory-db.js": "// Simple in-memory DB for testing" }
                },
                "shared": {}
            }
        },
        // Developer notes structure remains the same
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

    // 2. EXPLICITLY ASSIGN THE COLLECTED FILES: This populates the 'events' object in the file structure.
    Object.assign(spec.fileStructure.src.events, eventFileContent);
    
    // --- 3. ADD EXTERNAL EVENT SIMULATOR SLICE (The new logic) ---
    const externalEventsList = Array.from(allExternalEvents);
    if (externalEventsList.length > 0) {
        const simulatorFolderName = "external-event-simulator";
        const simulatorSliceIndex = safeSlices.length + 1;
        const simulatorSliceTitle = `Slice ${simulatorSliceIndex} - SIMULATION OF EXTERNAL EVENTS`;
        
        // Build the structure for the simulator slice, including the external events folder
        const externalEventsFolder = externalEventsList.reduce((acc, eventTitle) => {
            const fileName = `${eventTitle.replace(/\s+/g, '-').toLowerCase()}.js`;
            acc[fileName] = `// Structure of the external message for: ${eventTitle}`;
            return acc;
        }, {});

        spec.fileStructure.src.slices[simulatorFolderName] = {
            "commands": {
                "simulate-external-event-command.js": "// Command to trigger the external event, will contain the simulated external payload."
            },
            "external-events": externalEventsFolder, // New folder listing the external event definitions
            "commandHandler.js": "// Handles the simulate command: TRANSLATES the external payload into a DOMAIN command and dispatches it.",
            "ui.js": "// **SIMULATION CONSOLE SCREEN**: UI with input fields (one per unique external event) to mimic the external system and dispatch the 'SimulateExternalEventCommand'."
        };

        spec.developerNotes.push({
            slice: simulatorSliceTitle,
            type: "STATE_CHANGE (Automation Pattern)",
            summary: "This slice provides a UI to simulate the arrival of raw messages from external systems. It acts as the **Gateway/Anti-Corruption Layer** by translating the external event into an internal **Domain Command**.",
            recommendations: [
                "Implement a dedicated **External Event Simulator Screen** (`ui.js`) with one button/input per unique external event.",
                `**Unique External Events to Simulate:** ${externalEventsList.join(", ")}`,
                "The **CommandHandler** must contain the **translation logic** (mapping/copy-paste) that converts the raw *simulated* external payload (as defined in the `external-events` folder) into the structure of an internal **Domain Command** (which in turn generates a domain event).",
                "**AI Translation Service:** Use the BDD tests (`Given` steps, if available) associated with the automation slice to derive the necessary data and translation rules."
            ]
        });
    }

    // 4. PROCESS EXISTING SLICES (Using the safeSlices array)
    safeSlices.forEach(slice => {
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
            spec.fileStructure.src.slices[folderName] = {
                "command.js": "// Defines command structure",
                "commandHandler.js": "// Handles command logic",
                "ui.js": "// Optional UI specific to this slice"
            };
        } else {
            // View slice (Read Model): projections and event handlers
            // CRITICAL UPDATE: Add files for projection control and rebuild logic
            spec.fileStructure.src.slices[folderName] = {
                "handlers": {
                    "event-handler-registrar.js": "// Subscribes all specific handlers to the event bus.",
                    "handleEventName.js": "// Separate handler for each event consumed by the projection." 
                },
                "projection.js": "// Builds and queries the view projection (the list itself)",
                "projectionRebuilder.js": "// CORE LOGIC: Contains the clear/reset and event replay logic for this specific projection.",
                "ui": {
                    "projectionControls.js": "// UI MODULE: Implements the 'Empty Projection' and 'Rebuild Projection' buttons and their event listeners.",
                    "viewUI.js": "// Renders the primary view/list from the projection data."
                }
            };
            
            // Add specific recommendations for Projection Rebuild feature
            sliceNotes.recommendations.push(
                "**Projection Control:** The `ui/projectionControls.js` must implement buttons to **'Empty Projection'** (clear the `mock-db` tables used by this projection) and **'Rebuild Projection'** (clear the DB, then call `projectionRebuilder.js` to replay all necessary events from the event store).",
                "**Rebuild Logic:** The `projectionRebuilder.js` should leverage the global event store and re-run the `handleEventName.js` handlers sequentially."
            );

            // Add specific To-Do Pattern recommendation for VIEW slices
            if (slice.title.toLowerCase().includes('list of')) {
                sliceNotes.recommendations.push(
                    "**To-Do List Pattern:** This Read Model must subscribe to **at least two** event types: one that marks the item as 'to-do' (ADD) and one that marks it as 'done' (REMOVE). The list state is keyed by a **unique ID** (e.g., `orderId` or `itemId`) found in both event payloads to reconcile the item's state."
                );
            }
        }

        spec.developerNotes.push(sliceNotes);
    });

    return spec;
}