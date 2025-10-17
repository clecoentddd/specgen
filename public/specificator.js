// specificator.js
export function generateSpecification(interpretation) {
    console.log("generateSpecification - Start");

    // Containers for all unique event data
    const eventFileContent = {};
    const allEventsData = {};

    // Fix: Prioritize 'interpretation.slices' as the main array of slice objects.
    const safeSlices = interpretation.slices || interpretation.sliceDetails || []; 

    // --- 1. PRE-PROCESS: Collect and De-duplicate All Events ---
    safeSlices.forEach(slice => {
        // Log the slice title to see which slice we're processing
        console.log(`Specificator - Processing Slice: ${slice.title || 'Untitled Slice'}`);
        
        // Ensure slice.events is an array before accessing
        const safeEvents = slice.events || []; 

        console.log("Specificator - Events - Start");

        // Iterate over the events array for the current slice
        safeEvents.forEach(event => {
            // Logging the raw event object from the interpreter output
            console.log("Specificator - Event : ", event);

            // --- Event Collection Logic (Added/Moved Here) ---
            const rawTitle = event.title;
            // 1. Clean the title: remove annotations (like '**EXTERNAL:** ')
            const eventTitle = rawTitle
                .replace(/\*\*EXTERNAL:\*\* /g, '')
                .trim()
                // 2. Convert to file-safe name (lowercase, kebab-case)
                .replace(/\s+/g, '-').toLowerCase(); 
                
            const fileName = `${eventTitle}.js`;
            
            // 3. Add to our collection only if it's a new, unique event
            if (!allEventsData[eventTitle]) {
                allEventsData[eventTitle] = {
                    file: fileName,
                    description: event.description || `Definition for the ${rawTitle} event.`
                };
                // Use the cleaned title for the file content placeholder
                eventFileContent[fileName] = `// Schema and definition for ${rawTitle}`;
            }
        });

        console.log("Specificator - Events - End");
    });
    
    // Log the count of slices processed to confirm the loop ran
    console.log(`generateSpecification - End. Processed ${safeSlices.length} slices.`);
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
                // Initialize as a literal empty object to guarantee key existence.
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

    // 3. PROCESS SLICES (Using the safeSlices array) - Slice-specific logic remains below
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
        
        // EXTERNAL EVENT SIMULATION LOGIC (Alert Raised)
        if (slice.title.includes("Alert Raised") && isStateChange) {
            
            // 1. SET UP FILES WITH SIMULATION UI
            spec.fileStructure.src.slices[folderName] = {
                "command.js": "// Defines command structure for Raise Alert",
                "commandHandler.js": "// Handles command logic (the copy/paste translation logic)",
                "ui.js": "// SIMULATION SCREEN: Input fields to generate the external alert payload."
            };
            
            // 2. ADD INSTRUCTION FOR SIMULATION (to the sliceNotes)
            sliceNotes.recommendations.push(
                "**External Event Simulation:** Since this is an in-browser app, the `ui.js` file MUST implement a basic screen (e.g., a text area and a button) that simulates receiving the raw external alert payload.",
                "**Translation Logic (Copy/Paste):** Clicking the button dispatches the **Raise Alert Command** using a simple translation (map/copy-paste) from the simulated external payload to the internal command structure. No external APIs or server calls are permitted."
            );
            
            spec.developerNotes.push(sliceNotes);
            return; 
        }
        
        if (isStateChange) {
            spec.fileStructure.src.slices[folderName] = {
                "command.js": "// Defines command structure",
                "commandHandler.js": "// Handles command logic",
                "ui.js": "// Optional UI specific to this slice"
            };
        } else {
            // View slice (Read Model): projections and event handlers
            spec.fileStructure.src.slices[folderName] = {
                "handlers": {
                    "event-handler-registrar.js": "// Subscribes all specific handlers to the event bus.",
                    // This logic would need to dynamically create 'handleEventName.js' files based on consumed events
                    "handleEventName.js": "// Separate handler for each event consumed by the projection." 
                },
                "projection.js": "// Builds a view projection (the list itself)",
                "ui.js": "// Optional UI specific to this slice"
            };

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